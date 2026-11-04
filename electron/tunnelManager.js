import { spawn } from 'child_process';

class TunnelManager {
  constructor() {
    this.tunnels = new Map(); // port -> tunnelObj
    this.eventEmitter = null;
  }

  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  broadcast(eventName, data) {
    if (this.eventEmitter) {
      this.eventEmitter(eventName, data);
    }
  }

  getTunnelsList() {
    const list = [];
    for (const [port, item] of this.tunnels.entries()) {
      list.push({
        port,
        url: item.url,
        status: item.status,
        startTime: item.startTime,
        logs: item.logs.slice(-30),
        error: item.error
      });
    }
    return list;
  }

  async startTunnel(port, customHost = '127.0.0.1') {
    if (this.tunnels.has(port)) {
      const existing = this.tunnels.get(port);
      if (existing.status === 'active' || existing.status === 'starting') {
        return {
          success: true,
          tunnel: {
            port,
            url: existing.url,
            status: existing.status,
            startTime: existing.startTime
          }
        };
      }
    }

    const targetUrl = `http://${customHost}:${port}`;
    const tunnelData = {
      port,
      targetUrl,
      url: null,
      status: 'starting',
      startTime: new Date().toISOString(),
      logs: [],
      error: null,
      process: null
    };

    this.tunnels.set(port, tunnelData);
    this.broadcast('tunnel:updated', this.getTunnelsList());

    return new Promise((resolve) => {
      let resolved = false;

      try {
        const child = spawn('cloudflared', ['tunnel', '--url', targetUrl, '--no-autoupdate'], {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        tunnelData.process = child;

        const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

        const handleData = (chunk) => {
          const text = chunk.toString();
          const lines = text.split('\n').filter(Boolean);
          for (const line of lines) {
            tunnelData.logs.push(line);
            if (tunnelData.logs.length > 100) tunnelData.logs.shift();

            // Look for trycloudflare URL
            const match = line.match(urlRegex);
            if (match && !tunnelData.url) {
              tunnelData.url = match[0];
              tunnelData.status = 'active';
              this.broadcast('tunnel:updated', this.getTunnelsList());
              if (!resolved) {
                resolved = true;
                resolve({ success: true, url: tunnelData.url, port });
              }
            }
          }
        };

        child.stdout.on('data', handleData);
        child.stderr.on('data', handleData);

        child.on('error', (err) => {
          tunnelData.status = 'error';
          tunnelData.error = err.message;
          this.broadcast('tunnel:updated', this.getTunnelsList());
          if (!resolved) {
            resolved = true;
            resolve({ success: false, error: err.message, port });
          }
        });

        child.on('exit', (code, signal) => {
          if (this.tunnels.has(port)) {
            const cur = this.tunnels.get(port);
            cur.status = 'stopped';
            cur.process = null;
            this.broadcast('tunnel:updated', this.getTunnelsList());
          }
          if (!resolved) {
            resolved = true;
            resolve({
              success: false,
              error: `cloudflared exited with code ${code} (${signal}) before establishing tunnel`,
              port
            });
          }
        });

        // Timeout after 15 seconds if no URL detected
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            if (!tunnelData.url) {
              tunnelData.status = 'timeout';
              tunnelData.error = 'Timed out waiting for Cloudflare tunnel URL';
              this.broadcast('tunnel:updated', this.getTunnelsList());
              resolve({
                success: false,
                error: 'Timed out waiting for Cloudflare tunnel URL. Ensure cloudflared is installed and working.',
                port
              });
            }
          }
        }, 15000);

      } catch (err) {
        tunnelData.status = 'error';
        tunnelData.error = err.message;
        this.broadcast('tunnel:updated', this.getTunnelsList());
        resolve({ success: false, error: err.message, port });
      }
    });
  }

  stopTunnel(port) {
    if (!this.tunnels.has(port)) return { success: false, error: 'Tunnel not found' };

    const item = this.tunnels.get(port);
    if (item.process) {
      try {
        item.process.kill('SIGTERM');
        setTimeout(() => {
          if (item.process) {
            try { item.process.kill('SIGKILL'); } catch (e) {}
          }
        }, 1000);
      } catch (e) {}
    }

    item.status = 'stopped';
    item.process = null;
    this.tunnels.delete(port);
    this.broadcast('tunnel:updated', this.getTunnelsList());

    return { success: true, message: `Tunnel for port ${port} stopped.` };
  }

  stopAllTunnels() {
    for (const [port, item] of this.tunnels.entries()) {
      if (item.process) {
        try { item.process.kill('SIGKILL'); } catch (e) {}
      }
    }
    this.tunnels.clear();
  }
}

export const tunnelManager = new TunnelManager();
