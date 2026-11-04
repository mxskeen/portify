import { exec } from 'child_process';
import util from 'util';
import net from 'net';

const execAsync = util.promisify(exec);

/**
 * Check if a TCP port is currently open and accepting connections
 */
function isPortInUse(port, host = '127.0.0.1', timeout = 300) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeout);

    socket.once('connect', () => {
      status = true;
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if process exists by PID
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Find PID(s) listening on a port if not already known
 */
async function findPidsForPort(port) {
  const pids = [];
  const platform = process.platform;

  if (platform === 'win32') {
    try {
      const { stdout } = await execAsync('netstat -ano -p tcp');
      const lines = stdout.split('\r\n');
      for (const line of lines) {
        if (line.includes(`:${port} `) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid && !isNaN(pid) && !pids.includes(pid)) {
            pids.push(pid);
          }
        }
      }
    } catch (e) {}
  } else {
    // Linux / macOS: try lsof then fuser
    try {
      const { stdout } = await execAsync(`lsof -ti :${port}`);
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (const l of lines) {
        const pid = parseInt(l.trim(), 10);
        if (pid && !isNaN(pid) && !pids.includes(pid)) {
          pids.push(pid);
        }
      }
    } catch (e) {}

    if (pids.length === 0 && platform === 'linux') {
      try {
        const { stdout } = await execAsync(`fuser ${port}/tcp 2>/dev/null`);
        const parts = stdout.trim().split(/\s+/).filter(Boolean);
        for (const p of parts) {
          const pid = parseInt(p.trim(), 10);
          if (pid && !isNaN(pid) && !pids.includes(pid)) {
            pids.push(pid);
          }
        }
      } catch (e) {}
    }
  }

  return pids;
}

/**
 * Guaranteed multi-stage tree kill for processes
 */
export async function killPortProcess({ port, pid, isDocker, dockerContainer, forceElevated = false, sudoPassword = '' }) {
  // Case 1: Docker container bound port
  if (isDocker && dockerContainer) {
    try {
      await execAsync(`docker kill ${dockerContainer}`);
      await sleep(300);
      return {
        success: true,
        message: `Docker container '${dockerContainer}' force killed.`
      };
    } catch (err) {
      try {
        await execAsync(`docker stop -t 1 ${dockerContainer}`);
        return {
          success: true,
          message: `Docker container '${dockerContainer}' stopped.`
        };
      } catch (err2) {
        return {
          success: false,
          error: `Failed to stop Docker container: ${err2.message}`
        };
      }
    }
  }

  // Find PID if not provided
  let targetPids = pid ? [pid] : [];
  if (targetPids.length === 0 && port) {
    targetPids = await findPidsForPort(port);
  }

  if (targetPids.length === 0) {
    return {
      success: false,
      error: `No active PID found listening on port ${port}. The port might already be freed or requires root access.`
    };
  }

  const platform = process.platform;

  // Handle explicit sudo / elevated kill immediately if requested or password provided
  if (forceElevated || sudoPassword) {
    for (const targetPid of targetPids) {
      if (platform === 'linux') {
        if (sudoPassword) {
          try {
            // Use sudo -S with password input
            const safePwd = sudoPassword.replace(/"/g, '\\"');
            await execAsync(`echo "${safePwd}" | sudo -S kill -9 ${targetPid}`);
            if (port) {
              try { await execAsync(`echo "${safePwd}" | sudo -S fuser -k -9 ${port}/tcp`); } catch (e) {}
            }
          } catch (sudoErr) {
            return {
              success: false,
              needsElevation: true,
              error: `Incorrect sudo password or elevation failed: ${sudoErr.message}`
            };
          }
        } else {
          // Try pkexec graphical dialog
          try {
            await execAsync(`pkexec kill -9 ${targetPid}`);
            if (port) {
              try { await execAsync(`pkexec fuser -k -9 ${port}/tcp`); } catch (e) {}
            }
          } catch (pkErr) {
            return {
              success: false,
              needsElevation: true,
              error: `Root authorization cancelled or failed: ${pkErr.message}`
            };
          }
        }
      } else if (platform === 'darwin') {
        try {
          await execAsync(`osascript -e 'do shell script "kill -9 ${targetPid}" with administrator privileges'`);
        } catch (macErr) {
          return { success: false, needsElevation: true, error: macErr.message };
        }
      } else if (platform === 'win32') {
        try {
          await execAsync(`powershell -Command "Start-Process taskkill -ArgumentList '/F /T /PID ${targetPid}' -Verb RunAs -Wait"`);
        } catch (winErr) {
          return { success: false, needsElevation: true, error: winErr.message };
        }
      }
    }

    await sleep(250);
    return {
      success: true,
      message: `Port ${port || targetPids[0]} force-killed with administrative privileges.`
    };
  }

  for (const targetPid of targetPids) {
    if (platform === 'win32') {
      try {
        // Force tree kill on Windows
        await execAsync(`taskkill /F /T /PID ${targetPid}`);
      } catch (err) {
        return {
          success: false,
          needsElevation: true,
          targetPid,
          port,
          error: `Permission denied killing PID ${targetPid}. Administrator privileges required.`
        };
      }
    } else {
      // Unix: Linux / macOS
      // Phase 1: Graceful SIGTERM with child tree kill
      try {
        try {
          const { stdout: childOut } = await execAsync(`pgrep -P ${targetPid}`);
          const childPids = childOut.trim().split('\n').filter(Boolean);
          for (const cPid of childPids) {
            try { process.kill(parseInt(cPid, 10), 'SIGTERM'); } catch (e) {}
          }
        } catch (e) {}

        process.kill(targetPid, 'SIGTERM');
      } catch (e) {}

      await sleep(250);

      // Phase 2: If still alive, FORCE SIGKILL
      if (isProcessAlive(targetPid)) {
        try {
          try { await execAsync(`pkill -9 -P ${targetPid}`); } catch (e) {}
          process.kill(targetPid, 'SIGKILL');
        } catch (err) {
          if (err.code === 'EPERM') {
            return {
              success: false,
              needsElevation: true,
              targetPid,
              port,
              error: `Permission denied. PID ${targetPid} is owned by root/system.`
            };
          }
        }
      }

      // Phase 3: Port socket sweep
      if (port) {
        try {
          await execAsync(`fuser -k -9 ${port}/tcp 2>/dev/null`);
        } catch (e) {}
      }
    }
  }

  await sleep(250);

  if (port) {
    const stillActive = await isPortInUse(port);
    if (stillActive) {
      return {
        success: false,
        needsElevation: true,
        targetPid: targetPids[0],
        port,
        message: `Port ${port} is still occupied. It is likely protected by root or a system daemon.`
      };
    }
  }

  return {
    success: true,
    message: `Port ${port || targetPids[0]} killed successfully and freed!`
  };
}
