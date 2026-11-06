import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import os from 'os';

const execAsync = util.promisify(exec);

class LogManager {
  constructor() {
    this.activeStreams = new Map(); // streamId -> { process, buffer, source, status }
  }

  /**
   * Detect potential log sources for a port or process target
   */
  async detectSources(target = {}) {
    const sources = [];
    const isLinux = process.platform === 'linux';

    // 1. Docker source
    if (target.isDocker || target.dockerContainer || target.dockerId) {
      const containerRef = target.dockerContainer || target.dockerId || target.name;
      sources.push({
        id: `docker:${containerRef}`,
        type: 'docker',
        name: `Docker Container (${containerRef})`,
        containerRef,
        isDefault: true
      });
    }

    // 2. Linux file descriptors / open log files
    if (isLinux && target.pid) {
      try {
        const fdPath = `/proc/${target.pid}/fd`;
        if (fs.existsSync(fdPath)) {
          const fds = fs.readdirSync(fdPath);
          for (const fd of fds) {
            try {
              const fullFd = path.join(fdPath, fd);
              const link = fs.readlinkSync(fullFd);
              if (link && link.startsWith('/') && !link.startsWith('/dev/') && !link.startsWith('/proc/')) {
                // If standard output/err was redirected to a file
                if (fd === '1' || fd === '2') {
                  const alreadyAdded = sources.some(s => s.path === link);
                  if (!alreadyAdded) {
                    sources.push({
                      id: `file:${link}`,
                      type: 'file',
                      name: `Stdout/Stderr (${path.basename(link)})`,
                      path: link,
                      isDefault: sources.length === 0
                    });
                  }
                } else if (link.endsWith('.log') || link.includes('/log/') || link.endsWith('.txt')) {
                  const alreadyAdded = sources.some(s => s.path === link);
                  if (!alreadyAdded) {
                    sources.push({
                      id: `file:${link}`,
                      type: 'file',
                      name: `Log File (${path.basename(link)})`,
                      path: link,
                      isDefault: sources.length === 0
                    });
                  }
                }
              }
            } catch (e) {
              // Ignore individual fd read permission errors
            }
          }
        }
      } catch (e) {
        // Ignore proc read error
      }
    }

    // 3. Process CWD for local log files
    if (target.cwd && typeof target.cwd === 'string' && fs.existsSync(target.cwd)) {
      try {
        const files = fs.readdirSync(target.cwd);
        const logCandidates = files.filter(f => 
          f.endsWith('.log') || 
          ['server.log', 'app.log', 'dev.log', 'output.log', 'error.log', 'debug.log', 'access.log'].includes(f)
        );
        for (const file of logCandidates.slice(0, 5)) {
          const fullLogPath = path.join(target.cwd, file);
          const alreadyAdded = sources.some(s => s.path === fullLogPath);
          if (!alreadyAdded) {
            sources.push({
              id: `file:${fullLogPath}`,
              type: 'file',
              name: `Directory Log (${file})`,
              path: fullLogPath,
              isDefault: sources.length === 0
            });
          }
        }
      } catch (e) {
        // Ignore cwd read error
      }
    }

    // 4. Linux systemd journalctl
    if (isLinux && target.pid) {
      try {
        const { stdout } = await execAsync(`journalctl _PID=${target.pid} -n 1 --no-pager`, { timeout: 1000 });
        if (stdout && stdout.trim().length > 0 && !stdout.includes('-- No entries --')) {
          sources.push({
            id: `journal:pid:${target.pid}`,
            type: 'journal',
            name: `Systemd Journal (PID ${target.pid})`,
            pid: target.pid,
            isDefault: sources.length === 0
          });
        }
      } catch (e) {
        // Ignore journalctl error
      }
    }

    // 5. Always offer custom file path source
    sources.push({
      id: 'custom:file',
      type: 'custom',
      name: 'Custom Log File...',
      isDefault: sources.length === 0 && !target.isDocker
    });

    return sources;
  }

  /**
   * Start streaming logs for a given target and source
   */
  async startStream(options = {}, onData, onStatus) {
    const { streamId, target = {}, sourceId, customFilePath } = options;

    // Stop existing stream with this id if running
    this.stopStream(streamId);

    const sources = await this.detectSources(target);
    let activeSource = null;

    if (sourceId) {
      activeSource = sources.find(s => s.id === sourceId);
    }
    if (!activeSource) {
      if (customFilePath) {
        activeSource = {
          id: `file:${customFilePath}`,
          type: 'file',
          name: `Custom (${path.basename(customFilePath)})`,
          path: customFilePath
        };
      } else {
        activeSource = sources.find(s => s.isDefault) || sources[0];
      }
    }

    const streamData = {
      streamId,
      process: null,
      fileWatcher: null,
      source: activeSource,
      buffer: [],
      maxBuffer: 1000,
      active: true
    };

    this.activeStreams.set(streamId, streamData);

    const emitLines = (lines) => {
      if (!streamData.active || !lines || lines.length === 0) return;
      for (const line of lines) {
        streamData.buffer.push(line);
        if (streamData.buffer.length > streamData.maxBuffer) {
          streamData.buffer.shift();
        }
      }
      if (onData) {
        onData({ streamId, lines });
      }
    };

    const emitStatus = (status, message = '') => {
      if (!streamData.active) return;
      if (onStatus) {
        onStatus({ streamId, status, message, source: activeSource });
      }
    };

    try {
      if (activeSource.type === 'docker') {
        const containerRef = activeSource.containerRef || target.dockerContainer || target.dockerId || target.name;
        emitStatus('connecting', `Connecting to Docker logs for ${containerRef}...`);

        let leftover = '';
        const child = spawn('docker', ['logs', '-f', '--tail', '250', '-t', containerRef], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        streamData.process = child;

        const handleChunk = (chunk) => {
          const text = leftover + chunk.toString();
          const split = text.split('\n');
          leftover = split.pop(); // keep last incomplete line
          if (split.length > 0) {
            emitLines(split);
          }
        };

        child.stdout.on('data', handleChunk);
        child.stderr.on('data', handleChunk);

        child.on('error', (err) => {
          emitStatus('error', `Docker process error: ${err.message}`);
        });

        child.on('close', (code) => {
          if (leftover) {
            emitLines([leftover]);
            leftover = '';
          }
          if (streamData.active) {
            emitStatus('stopped', `Docker log process ended (exit code ${code})`);
          }
        });

        emitStatus('streaming', `Streaming logs from Docker (${containerRef})`);

      } else if (activeSource.type === 'journal') {
        const pid = activeSource.pid || target.pid;
        emitStatus('connecting', `Connecting to systemd journal for PID ${pid}...`);

        let leftover = '';
        const child = spawn('journalctl', ['_PID=' + pid, '-f', '-n', '250', '-o', 'cat'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        streamData.process = child;

        const handleChunk = (chunk) => {
          const text = leftover + chunk.toString();
          const split = text.split('\n');
          leftover = split.pop();
          if (split.length > 0) {
            emitLines(split);
          }
        };

        child.stdout.on('data', handleChunk);
        child.stderr.on('data', handleChunk);

        child.on('error', (err) => {
          emitStatus('error', `journalctl error: ${err.message}`);
        });

        child.on('close', (code) => {
          if (leftover) {
            emitLines([leftover]);
            leftover = '';
          }
          if (streamData.active) {
            emitStatus('stopped', `Journal stream ended (exit code ${code})`);
          }
        });

        emitStatus('streaming', `Streaming logs from systemd journal (PID ${pid})`);

      } else if (activeSource.type === 'file' || customFilePath) {
        const filePath = activeSource.path || customFilePath;
        if (!fs.existsSync(filePath)) {
          emitStatus('error', `Log file does not exist: ${filePath}`);
          return {
            streamId,
            sources,
            activeSource,
            initialLogs: []
          };
        }

        emitStatus('connecting', `Opening log file ${path.basename(filePath)}...`);

        // Use tail -n 250 -F on Unix platforms for reliable log following
        if (process.platform !== 'win32') {
          let leftover = '';
          const child = spawn('tail', ['-n', '250', '-F', filePath], {
            stdio: ['ignore', 'pipe', 'pipe']
          });

          streamData.process = child;

          const handleChunk = (chunk) => {
            const text = leftover + chunk.toString();
            const split = text.split('\n');
            leftover = split.pop();
            if (split.length > 0) {
              emitLines(split);
            }
          };

          child.stdout.on('data', handleChunk);
          child.stderr.on('data', handleChunk);

          child.on('error', (err) => {
            emitStatus('error', `tail error: ${err.message}`);
          });

          child.on('close', (code) => {
            if (leftover) {
              emitLines([leftover]);
              leftover = '';
            }
            if (streamData.active) {
              emitStatus('stopped', `Log file stream ended (code ${code})`);
            }
          });

          emitStatus('streaming', `Tailing log file: ${path.basename(filePath)}`);
        } else {
          // Windows native file tail
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            emitLines(lines.slice(-250));
            emitStatus('streaming', `Watching log file: ${path.basename(filePath)}`);

            let currentSize = fs.statSync(filePath).size;
            const watcher = fs.watch(filePath, (eventType) => {
              if (eventType === 'change') {
                try {
                  const stat = fs.statSync(filePath);
                  if (stat.size > currentSize) {
                    const stream = fs.createReadStream(filePath, {
                      start: currentSize,
                      end: stat.size,
                      encoding: 'utf8'
                    });
                    currentSize = stat.size;
                    let chunkLeftover = '';
                    stream.on('data', chunk => {
                      const text = chunkLeftover + chunk;
                      const split = text.split('\n');
                      chunkLeftover = split.pop();
                      if (split.length > 0) emitLines(split);
                    });
                  } else if (stat.size < currentSize) {
                    // File truncated
                    currentSize = stat.size;
                  }
                } catch (e) {}
              }
            });
            streamData.fileWatcher = watcher;
          } catch (err) {
            emitStatus('error', `Could not read log file: ${err.message}`);
          }
        }
      } else {
        // Informative source (e.g. terminal process without redirect)
        emitStatus('info', 'Process running directly in interactive terminal without stdout file redirection.');
        emitLines([
          `[Portify] Target Process: ${target.name || 'Server'} (PID ${target.pid || '—'})`,
          `[Portify] Listening Port: :${target.port || '—'}`,
          `[Portify] Command: ${target.command || '—'}`,
          `[Portify] Notice: This process is running interactively in an OS terminal or pty without redirecting stdout to a file or running under Docker/systemd.`,
          `[Portify] Tip: To capture streaming logs for local scripts, either run them with stdout redirection (e.g. 'node server.js > server.log 2>&1') or select 'Custom Log File...' above to watch an existing application log file.`
        ]);
      }
    } catch (err) {
      emitStatus('error', `Failed to start log stream: ${err.message}`);
    }

    return {
      streamId,
      sources,
      activeSource,
      initialLogs: streamData.buffer
    };
  }

  /**
   * Stop an active stream
   */
  stopStream(streamId) {
    if (!streamId) return false;
    const stream = this.activeStreams.get(streamId);
    if (!stream) return false;

    stream.active = false;

    if (stream.process) {
      try {
        stream.process.kill('SIGTERM');
      } catch (e) {}
      stream.process = null;
    }

    if (stream.fileWatcher) {
      try {
        stream.fileWatcher.close();
      } catch (e) {}
      stream.fileWatcher = null;
    }

    this.activeStreams.delete(streamId);
    return true;
  }

  /**
   * Stop all running streams
   */
  stopAll() {
    for (const streamId of this.activeStreams.keys()) {
      this.stopStream(streamId);
    }
  }
}

export const logManager = new LogManager();
