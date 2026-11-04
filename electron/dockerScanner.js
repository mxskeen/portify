import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Cache container stats so we don't block port scans with slow `docker stats`
let cachedStats = new Map();
let lastStatsTime = 0;

/**
 * Check if docker is available and running
 */
export async function isDockerRunning() {
  try {
    await execAsync('docker ps -q', { timeout: 1500 });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Parse Docker port string like "127.0.0.1:5432->5432/tcp, :::5432->5432/tcp"
 * returns array of numbers: [5432]
 */
export function parseDockerPorts(portsStr) {
  if (!portsStr) return [];
  const ports = [];
  const parts = portsStr.split(',').map(s => s.trim());
  for (const part of parts) {
    const match = part.match(/:(\d+)->/);
    if (match) {
      const p = parseInt(match[1], 10);
      if (!isNaN(p) && !ports.includes(p)) {
        ports.push(p);
      }
    } else {
      const bareMatch = part.match(/^(\d+)\//);
      if (bareMatch) {
        const p = parseInt(bareMatch[1], 10);
        if (!isNaN(p) && !ports.includes(p)) {
          ports.push(p);
        }
      }
    }
  }
  return ports;
}

/**
 * Background updater for docker stats (runs non-blocking)
 */
async function refreshStatsInBackground() {
  const now = Date.now();
  if (now - lastStatsTime < 3000) return; // cache for 3s
  lastStatsTime = now;

  try {
    const { stdout } = await execAsync("docker stats --no-stream --format '{{json .}}'", { timeout: 2500 });
    const statLines = stdout.trim().split('\n').filter(Boolean);
    const newStats = new Map();
    for (const line of statLines) {
      try {
        const stat = JSON.parse(line);
        if (stat.ID) newStats.set(stat.ID.substring(0, 12), stat);
        if (stat.Container) newStats.set(stat.Container.substring(0, 12), stat);
        if (stat.Name) newStats.set(stat.Name, stat);
      } catch (e) {}
    }
    cachedStats = newStats;
  } catch (e) {
    // ignore
  }
}

/**
 * Get all docker containers (Ultra-fast, uses docker ps + cached stats)
 */
export async function getDockerContainers(includeLiveStats = false) {
  const containers = [];
  const portMap = new Map();

  try {
    // 1. Fast docker ps -a (typically 40ms)
    const { stdout: psOut } = await execAsync("docker ps -a --no-trunc --format '{{json .}}'", { timeout: 2000 });
    const lines = psOut.trim().split('\n').filter(Boolean);

    // Trigger non-blocking stats refresh
    refreshStatsInBackground();

    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        const id = raw.ID ? raw.ID.substring(0, 12) : '';
        const name = raw.Names ? raw.Names.replace(/^\//, '') : '';
        const stat = cachedStats.get(id) || cachedStats.get(name) || {};

        const mappedPorts = parseDockerPorts(raw.Ports);

        const containerData = {
          id,
          fullId: raw.ID,
          name,
          image: raw.Image,
          command: raw.Command,
          state: raw.State,
          status: raw.Status,
          runningFor: raw.RunningFor,
          createdAt: raw.CreatedAt,
          portsRaw: raw.Ports,
          mappedPorts,
          cpuPerc: stat.CPUPerc || '0.0%',
          memUsage: stat.MemUsage || 'Active',
          memPerc: stat.MemPerc || '0.0%',
          netIO: stat.NetIO || '0B / 0B',
          blockIO: stat.BlockIO || '0B / 0B',
          pids: stat.PIDs || '0'
        };

        containers.push(containerData);

        // Map listening host ports to this container
        for (const port of mappedPorts) {
          portMap.set(port, {
            containerId: id,
            containerName: name,
            image: raw.Image,
            status: raw.Status,
            createdAt: raw.CreatedAt,
            uptimeSec: 0,
            uptimeFormatted: raw.RunningFor || raw.Status,
            memoryFormatted: stat.MemUsage ? stat.MemUsage.split('/')[0].trim() : 'Docker',
            cpu: stat.CPUPerc ? parseFloat(stat.CPUPerc.replace('%', '')) : 0,
            memoryBytes: 0
          });
        }
      } catch (e) {
        // ignore parse error
      }
    }

    return {
      available: true,
      containers,
      portMap
    };
  } catch (err) {
    return {
      available: false,
      containers: [],
      portMap: new Map()
    };
  }
}

export async function stopContainer(id) {
  try {
    await execAsync(`docker stop -t 2 ${id}`);
    return { success: true, message: `Container ${id} stopped` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function killContainer(id) {
  try {
    await execAsync(`docker kill ${id}`);
    return { success: true, message: `Container ${id} force killed` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function restartContainer(id) {
  try {
    await execAsync(`docker restart ${id}`);
    return { success: true, message: `Container ${id} restarted` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
