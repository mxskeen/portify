import http from 'http';
import https from 'https';

class HealthChecker {
  constructor() {
    this.cache = new Map(); // port -> { data, timestamp }
    this.cacheTtlMs = 3000;  // 3s cache
  }

  /**
   * Ping a single port over HTTP (with HTTPS fallback)
   */
  async checkPort(port, timeoutMs = 1200) {
    if (!port || isNaN(port) || port < 1 || port > 65535) {
      return { port, alive: false, error: 'INVALID_PORT' };
    }

    const tryProtocol = (isHttps) => {
      return new Promise((resolve) => {
        const client = isHttps ? https : http;
        const startTime = Date.now();

        const req = client.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/',
            method: 'GET',
            timeout: timeoutMs,
            rejectUnauthorized: false,
            headers: {
              'User-Agent': 'Portify-HealthCheck/1.0',
              'Accept': '*/*'
            }
          },
          (res) => {
            const latencyMs = Date.now() - startTime;
            // Drain data to free memory
            res.resume();
            resolve({
              alive: true,
              type: 'http',
              protocol: isHttps ? 'https' : 'http',
              status: res.statusCode,
              statusText: res.statusMessage || '',
              latencyMs,
              checkedAt: Date.now()
            });
          }
        );

        req.on('timeout', () => {
          req.destroy();
          resolve({
            alive: false,
            type: 'timeout',
            protocol: isHttps ? 'https' : 'http',
            status: null,
            error: 'TIMEOUT',
            latencyMs: timeoutMs,
            checkedAt: Date.now()
          });
        });

        req.on('error', (err) => {
          const code = err.code || err.message || 'ERROR';
          const isRawTcp = ['ECONNRESET', 'EPROTO', 'HPE_INVALID_CONSTANT', 'HPE_INVALID_HEADER_TOKEN', 'HPE_INVALID_METHOD'].includes(code);
          resolve({
            alive: false,
            type: isRawTcp ? 'raw-tcp' : 'error',
            protocol: isHttps ? 'https' : 'http',
            status: null,
            error: code,
            checkedAt: Date.now()
          });
        });

        req.end();
      });
    };

    // 1. Try plain HTTP first
    const httpRes = await tryProtocol(false);
    if (httpRes.alive) {
      const result = { port, ...httpRes };
      this.cache.set(port, { data: result, timestamp: Date.now() });
      return result;
    }

    // 2. If it failed with SSL or proto error, try HTTPS
    const err = httpRes.error || '';
    if (err.includes('EPROTO') || err.includes('SSL') || err.includes('HPE_INVALID')) {
      const httpsRes = await tryProtocol(true);
      if (httpsRes.alive) {
        const result = { port, ...httpsRes };
        this.cache.set(port, { data: result, timestamp: Date.now() });
        return result;
      }
    }

    const finalRes = { port, ...httpRes };
    this.cache.set(port, { data: finalRes, timestamp: Date.now() });
    return finalRes;
  }

  /**
   * Check multiple ports with controlled concurrency (e.g. 6 at a time)
   */
  async checkPorts(ports = [], force = false) {
    const results = {};
    const now = Date.now();
    const portsToQuery = [];

    for (const p of ports) {
      const portNum = Number(p.port !== undefined ? p.port : p);
      if (isNaN(portNum)) continue;

      if (!force && this.cache.has(portNum)) {
        const cached = this.cache.get(portNum);
        if (now - cached.timestamp < this.cacheTtlMs) {
          results[portNum] = cached.data;
          continue;
        }
      }
      portsToQuery.push(portNum);
    }

    if (portsToQuery.length === 0) {
      return results;
    }

    // Limit concurrency to 6 concurrent requests
    const concurrency = 6;
    for (let i = 0; i < portsToQuery.length; i += concurrency) {
      const batch = portsToQuery.slice(i, i + concurrency);
      const batchPromises = batch.map(port => this.checkPort(port));
      const batchResults = await Promise.allSettled(batchPromises);

      for (let j = 0; j < batch.length; j++) {
        const port = batch[j];
        const res = batchResults[j];
        if (res.status === 'fulfilled') {
          results[port] = res.value;
        } else {
          results[port] = { port, alive: false, error: res.reason?.message || 'FAILED' };
        }
      }
    }

    return results;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export const healthChecker = new HealthChecker();
