import { exec } from 'child_process';
import os from 'os';
import util from 'util';
import fs from 'fs';

const execAsync = util.promisify(exec);

// Format bytes into human readable string
export function formatBytes(bytes) {
  if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format duration into readable uptime
export function formatUptime(seconds) {
  if (isNaN(seconds) || seconds < 0) return 'Just started';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return `${h}h ${remM}m`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  if (d < 30) return `${d}d ${remH}h`;
  const mo = Math.floor(d / 30);
  const remD = d % 30;
  return `${mo}mo ${remD}d`;
}

// Convert ps etime format (e.g. "12:34", "01:12:34", "3-04:12:34") to seconds
function parsePsEtime(etime) {
  if (!etime) return 0;
  let days = 0;
  let timeStr = etime;
  if (etime.includes('-')) {
    const parts = etime.split('-');
    days = parseInt(parts[0], 10) || 0;
    timeStr = parts[1];
  }
  const timeParts = timeStr.split(':').map(p => parseInt(p, 10) || 0);
  let seconds = 0;
  if (timeParts.length === 3) {
    seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
  } else if (timeParts.length === 2) {
    seconds = timeParts[0] * 60 + timeParts[1];
  }
  return days * 86400 + seconds;
}

export function resolveProcessMeta({ name, command, cwd, isDocker, dockerContainer, dockerImage, user }) {
  if (isDocker && dockerContainer) {
    return {
      title: dockerContainer,
      origin: dockerImage ? `Docker: ${dockerImage}` : 'Docker Container',
      tag: 'docker'
    };
  }

  const home = os.homedir();
  let cleanCwd = cwd ? cwd.replace(home, '~') : '';

  const lowerCmd = (command || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();

  let title = name || 'Process';
  let tag = 'app';

  if (lowerCmd.includes('next-server') || lowerCmd.includes('next dev')) {
    title = 'Next.js';
    tag = 'dev';
  } else if (lowerCmd.includes('vite')) {
    title = 'Vite';
    tag = 'dev';
  } else if (lowerCmd.includes('react-scripts')) {
    title = 'React';
    tag = 'dev';
  } else if (lowerCmd.includes('fastapi') || lowerCmd.includes('uvicorn')) {
    title = 'FastAPI';
    tag = 'dev';
  } else if (lowerCmd.includes('flask')) {
    title = 'Flask';
    tag = 'dev';
  } else if (lowerCmd.includes('django') || lowerCmd.includes('manage.py runserver')) {
    title = 'Django';
    tag = 'dev';
  } else if (lowerName === 'node' || lowerName === 'bun' || lowerName === 'deno') {
    title = lowerName;
    tag = 'dev';
  } else if (lowerName.includes('syncthing')) {
    title = 'Syncthing';
    tag = 'app';
  } else if (lowerName.includes('aw-server')) {
    title = 'ActivityWatch';
    tag = 'app';
  } else if (lowerName.includes('postgres')) {
    title = 'PostgreSQL';
    tag = 'database';
  } else if (lowerName.includes('mysql')) {
    title = 'MySQL';
    tag = 'database';
  } else if (lowerName.includes('redis')) {
    title = 'Redis';
    tag = 'database';
  }

  // Determine Origin (where it's from)
  let origin = '';
  if (cleanCwd && cleanCwd !== '~' && cleanCwd !== '/') {
    origin = cleanCwd;
  } else if (command) {
    const homePattern = new RegExp(home, 'g');
    const cleanCmd = command.replace(homePattern, '~');
    // Match directory paths like ~/activitywatch or ~/kn/KnowDeck
    const dirMatch = cleanCmd.match(/~[a-zA-Z0-9_\-\.\/]+/);
    if (dirMatch) {
      const parts = dirMatch[0].split('/');
      // Keep up to 3 segments for neatness
      origin = parts.slice(0, 4).join('/');
    } else if (cleanCmd.startsWith('/usr/')) {
      origin = 'System (/usr/bin)';
    } else {
      origin = cleanCmd.slice(0, 32);
    }
  }

  if (user === 'root') {
    tag = 'system';
  }

  return { title, origin, tag, cleanCwd };
}

/**
 * Get process table mapped by PID
 */
async function getProcessTableUnix() {
  const processMap = new Map();
  try {
    // pid, ppid, user, %cpu, %mem, rss (KB), etime, lstart, comm, args
    const { stdout } = await execAsync('ps -eo pid,ppid,user,%cpu,%mem,rss,etime,lstart,comm,args');
    const lines = stdout.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Match pid, ppid, user, cpu, mem, rss, etime, lstart (e.g., Wed Nov  4 14:17:35 2026), comm, args
      const match = line.match(/^(\d+)\s+(\d+)\s+([^\s]+)\s+([\d\.]+)\s+([\d\.]+)\s+(\d+)\s+([^\s]+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d+\s+\d+:\d+:\d+\s+\d{4})\s+([^\s]+)\s+(.+)$/);
      if (match) {
        const pid = parseInt(match[1], 10);
        const ppid = parseInt(match[2], 10);
        const user = match[3];
        const cpu = parseFloat(match[4]);
        const memPercent = parseFloat(match[5]);
        const rssKb = parseInt(match[6], 10);
        const etime = match[7];
        const lstart = match[8];
        const comm = match[9];
        const args = match[10];

        const uptimeSec = parsePsEtime(etime);

        let cwd = '';
        if (process.platform === 'linux') {
          try {
            cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
          } catch (e) {}
        }

        processMap.set(pid, {
          pid,
          ppid,
          user,
          cpu,
          memPercent,
          memoryBytes: rssKb * 1024,
          memoryFormatted: formatBytes(rssKb * 1024),
          uptimeSec,
          uptimeFormatted: formatUptime(uptimeSec),
          startTime: lstart,
          name: comm,
          command: args,
          cwd
        });
      }
    }
  } catch (err) {
    console.warn('getProcessTableUnix error:', err.message);
  }
  return processMap;
}

/**
 * Scan listening ports on Linux
 */
async function scanLinux(processMap, dockerPortMap = new Map()) {
  const ports = [];
  const seenKeys = new Set();

  try {
    // 1. Try ss -tulpn
    const { stdout } = await execAsync('ss -tulpn');
    const lines = stdout.split('\n');

    for (const line of lines) {
      if (!line || line.startsWith('Netid') || line.startsWith('State')) continue;

      // Extract protocol (tcp/udp)
      const isTcp = line.startsWith('tcp');
      const isUdp = line.startsWith('udp');
      if (!isTcp && !isUdp) continue;
      const protocol = isTcp ? 'TCP' : 'UDP';

      // Parse local address and port
      // Example: 127.0.0.1:8000, 0.0.0.0:3000, [::]:8080, *:22000
      const tokens = line.trim().split(/\s+/);
      if (tokens.length < 5) continue;

      const localAddress = tokens[4];
      const lastColon = localAddress.lastIndexOf(':');
      if (lastColon === -1) continue;

      const ip = localAddress.slice(0, lastColon).replace(/\[|\]/g, '');
      const port = parseInt(localAddress.slice(lastColon + 1), 10);
      if (isNaN(port) || port <= 0) continue;

      // Check PID in the process column if available
      let pid = null;
      let processName = '';
      const procInfoMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
      if (procInfoMatch) {
        processName = procInfoMatch[1];
        pid = parseInt(procInfoMatch[2], 10);
      }

      const key = `${protocol}:${port}:${pid || 'nopid'}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      // Check if this port is mapped to a docker container
      const dockerInfo = dockerPortMap.get(port);

      let procDetails = pid && processMap.has(pid) ? processMap.get(pid) : null;

      const meta = resolveProcessMeta({
        name: dockerInfo ? dockerInfo.containerName : (procDetails ? procDetails.name : processName),
        command: procDetails ? procDetails.command : (dockerInfo ? `Docker: ${dockerInfo.image}` : ''),
        cwd: procDetails ? procDetails.cwd : '',
        isDocker: Boolean(dockerInfo),
        dockerContainer: dockerInfo ? dockerInfo.containerName : null,
        dockerImage: dockerInfo ? dockerInfo.image : null,
        user: procDetails ? procDetails.user : (dockerInfo ? 'docker' : 'root/system')
      });

      ports.push({
        port,
        protocol,
        ip: ip || '*',
        pid: pid || (dockerInfo ? dockerInfo.pid : null),
        name: meta.title,
        title: meta.title,
        origin: meta.origin,
        tag: meta.tag,
        cwd: procDetails ? procDetails.cwd : '',
        command: procDetails ? procDetails.command : (dockerInfo ? `Docker: ${dockerInfo.image}` : ''),
        user: procDetails ? procDetails.user : (dockerInfo ? 'docker' : 'root/system'),
        cpu: procDetails ? procDetails.cpu : (dockerInfo ? dockerInfo.cpu : 0),
        memoryBytes: procDetails ? procDetails.memoryBytes : (dockerInfo ? dockerInfo.memoryBytes : 0),
        memoryFormatted: procDetails ? procDetails.memoryFormatted : (dockerInfo ? dockerInfo.memoryFormatted : 'Unknown'),
        uptimeSec: procDetails ? procDetails.uptimeSec : (dockerInfo ? dockerInfo.uptimeSec : 0),
        uptimeFormatted: procDetails ? procDetails.uptimeFormatted : (dockerInfo ? dockerInfo.uptimeFormatted : 'Unknown'),
        startTime: procDetails ? procDetails.startTime : (dockerInfo ? dockerInfo.createdAt : ''),
        isDocker: Boolean(dockerInfo),
        dockerContainer: dockerInfo ? dockerInfo.containerName : null,
        dockerImage: dockerInfo ? dockerInfo.image : null,
        isSystem: !procDetails || procDetails.user === 'root' || (procDetails.uptimeSec > 86400 * 30 && !dockerInfo)
      });
    }
  } catch (err) {
    console.error('ss scan failed, fallback to lsof:', err.message);
  }

  // 2. Also run lsof -iTCP -sTCP:LISTEN -P -n to fill any missing user PIDs
  try {
    const { stdout } = await execAsync('lsof -iTCP -sTCP:LISTEN -P -n');
    const lines = stdout.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 9) {
        const comm = parts[0];
        const pid = parseInt(parts[1], 10);
        const user = parts[2];
        const nodeName = parts[8]; // e.g. *:8000 or 127.0.0.1:3000
        const lastColon = nodeName.lastIndexOf(':');
        if (lastColon === -1) continue;
        const port = parseInt(nodeName.slice(lastColon + 1), 10);
        if (isNaN(port)) continue;

        // If this port already exists in ports array with null/unknown pid, update it!
        const existing = ports.find(p => p.port === port && p.protocol === 'TCP');
        if (existing) {
          if (!existing.pid && pid) {
            existing.pid = pid;
            const proc = processMap.get(pid);
            if (proc) {
              const meta = resolveProcessMeta({
                name: proc.name,
                command: proc.command,
                cwd: proc.cwd,
                isDocker: existing.isDocker,
                dockerContainer: existing.dockerContainer,
                dockerImage: existing.dockerImage,
                user: proc.user
              });
              existing.name = meta.title;
              existing.title = meta.title;
              existing.origin = meta.origin;
              existing.tag = meta.tag;
              existing.cwd = proc.cwd;
              existing.command = proc.command;
              existing.user = proc.user;
              existing.cpu = proc.cpu;
              existing.memoryBytes = proc.memoryBytes;
              existing.memoryFormatted = proc.memoryFormatted;
              existing.uptimeSec = proc.uptimeSec;
              existing.uptimeFormatted = proc.uptimeFormatted;
              existing.startTime = proc.startTime;
              existing.isSystem = proc.user === 'root';
            } else {
              existing.name = comm;
              existing.title = comm;
              existing.user = user;
            }
          }
        } else {
          const proc = processMap.get(pid);
          ports.push({
            port,
            protocol: 'TCP',
            ip: nodeName.slice(0, lastColon),
            pid,
            name: proc ? proc.name : comm,
            command: proc ? proc.command : comm,
            user: proc ? proc.user : user,
            cpu: proc ? proc.cpu : 0,
            memoryBytes: proc ? proc.memoryBytes : 0,
            memoryFormatted: proc ? proc.memoryFormatted : 'Unknown',
            uptimeSec: proc ? proc.uptimeSec : 0,
            uptimeFormatted: proc ? proc.uptimeFormatted : 'Unknown',
            startTime: proc ? proc.startTime : '',
            isDocker: false,
            dockerContainer: null,
            dockerImage: null,
            isSystem: user === 'root'
          });
        }
      }
    }
  } catch (err) {
    // lsof might not find ports or might be absent, ignore
  }

  // Sort by port ascending
  return ports.sort((a, b) => a.port - b.port);
}

/**
 * Scan ports on Windows using netstat & PowerShell
 */
async function scanWindows(dockerPortMap = new Map()) {
  const ports = [];
  try {
    // Run netstat -ano -p tcp
    const { stdout } = await execAsync('netstat -ano -p tcp');
    const lines = stdout.split('\r\n');
    const pidsToQuery = new Set();
    const portEntries = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('TCP') || !line.includes('LISTENING')) continue;

      const tokens = line.split(/\s+/);
      // tokens: ['TCP', '127.0.0.1:8000', '0.0.0.0:0', 'LISTENING', '1234']
      if (tokens.length >= 5) {
        const localAddr = tokens[1];
        const pid = parseInt(tokens[4], 10);
        const lastColon = localAddr.lastIndexOf(':');
        if (lastColon === -1) continue;
        const ip = localAddr.substring(0, lastColon);
        const port = parseInt(localAddr.substring(lastColon + 1), 10);

        if (!isNaN(port)) {
          if (pid && !isNaN(pid)) pidsToQuery.add(pid);
          portEntries.push({ port, protocol: 'TCP', ip, pid });
        }
      }
    }

    // Query process details in batch via PowerShell
    const procInfoMap = new Map();
    if (pidsToQuery.size > 0) {
      try {
        const pidList = Array.from(pidsToQuery).join(',');
        const psCommand = `Get-Process -Id ${pidList} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path, CPU, WorkingSet64, StartTime | ConvertTo-Json -Compress`;
        const { stdout: psOut } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`);
        if (psOut.trim()) {
          const parsed = JSON.parse(psOut);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const now = Date.now();
          for (const item of arr) {
            let uptimeSec = 0;
            let startTimeStr = '';
            if (item.StartTime) {
              const startEpoch = typeof item.StartTime === 'string' && item.StartTime.includes('/Date(')
                ? parseInt(item.StartTime.replace(/\/Date\((\d+)\)\//, '$1'), 10)
                : new Date(item.StartTime).getTime();
              uptimeSec = Math.max(0, Math.floor((now - startEpoch) / 1000));
              startTimeStr = new Date(startEpoch).toLocaleString();
            }
            procInfoMap.set(item.Id, {
              name: item.ProcessName,
              command: item.Path || item.ProcessName,
              memoryBytes: item.WorkingSet64 || 0,
              memoryFormatted: formatBytes(item.WorkingSet64 || 0),
              cpu: item.CPU ? parseFloat(item.CPU.toFixed(1)) : 0,
              uptimeSec,
              uptimeFormatted: formatUptime(uptimeSec),
              startTime: startTimeStr,
              user: 'user'
            });
          }
        }
      } catch (e) {
        console.warn('PowerShell process query error:', e.message);
      }
    }

    for (const entry of portEntries) {
      const dockerInfo = dockerPortMap.get(entry.port);
      const proc = procInfoMap.get(entry.pid);

      ports.push({
        port: entry.port,
        protocol: entry.protocol,
        ip: entry.ip,
        pid: entry.pid,
        name: dockerInfo ? `docker (${dockerInfo.containerName})` : (proc ? proc.name : `PID ${entry.pid}`),
        command: proc ? proc.command : (dockerInfo ? dockerInfo.image : ''),
        user: proc ? proc.user : (dockerInfo ? 'docker' : 'System'),
        cpu: proc ? proc.cpu : 0,
        memoryBytes: proc ? proc.memoryBytes : 0,
        memoryFormatted: proc ? proc.memoryFormatted : 'Unknown',
        uptimeSec: proc ? proc.uptimeSec : 0,
        uptimeFormatted: proc ? proc.uptimeFormatted : 'Unknown',
        startTime: proc ? proc.startTime : '',
        isDocker: Boolean(dockerInfo),
        dockerContainer: dockerInfo ? dockerInfo.containerName : null,
        dockerImage: dockerInfo ? dockerInfo.image : null,
        isSystem: !proc || entry.pid === 4 // PID 4 is System on Windows
      });
    }
  } catch (err) {
    console.error('Windows scan error:', err.message);
  }

  return ports.sort((a, b) => a.port - b.port);
}

/**
 * Scan ports on macOS using lsof & ps
 */
async function scanDarwin(processMap, dockerPortMap = new Map()) {
  const ports = [];
  try {
    const { stdout } = await execAsync('lsof -iTCP -sTCP:LISTEN -P -n');
    const lines = stdout.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 9) {
        const comm = parts[0];
        const pid = parseInt(parts[1], 10);
        const user = parts[2];
        const nodeName = parts[8];
        const lastColon = nodeName.lastIndexOf(':');
        if (lastColon === -1) continue;
        const ip = nodeName.slice(0, lastColon);
        const port = parseInt(nodeName.slice(lastColon + 1), 10);
        if (isNaN(port)) continue;

        const dockerInfo = dockerPortMap.get(port);
        const proc = processMap.get(pid);

        ports.push({
          port,
          protocol: 'TCP',
          ip,
          pid,
          name: dockerInfo ? `docker (${dockerInfo.containerName})` : (proc ? proc.name : comm),
          command: proc ? proc.command : (dockerInfo ? dockerInfo.image : comm),
          user: proc ? proc.user : user,
          cpu: proc ? proc.cpu : 0,
          memoryBytes: proc ? proc.memoryBytes : 0,
          memoryFormatted: proc ? proc.memoryFormatted : 'Unknown',
          uptimeSec: proc ? proc.uptimeSec : 0,
          uptimeFormatted: proc ? proc.uptimeFormatted : 'Unknown',
          startTime: proc ? proc.startTime : '',
          isDocker: Boolean(dockerInfo),
          dockerContainer: dockerInfo ? dockerInfo.containerName : null,
          dockerImage: dockerInfo ? dockerInfo.image : null,
          isSystem: user === 'root'
        });
      }
    }
  } catch (err) {
    console.error('macOS scan error:', err.message);
  }
  return ports.sort((a, b) => a.port - b.port);
}

/**
 * Unified cross-platform port scan
 */
export async function scanAllPorts(dockerPortMap = new Map()) {
  const platform = process.platform;
  if (platform === 'win32') {
    return scanWindows(dockerPortMap);
  }

  // Unix (Linux & macOS)
  const processMap = await getProcessTableUnix();
  if (platform === 'darwin') {
    return scanDarwin(processMap, dockerPortMap);
  }
  return scanLinux(processMap, dockerPortMap);
}
