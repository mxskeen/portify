import http from 'http';
import https from 'https';

// Known system/infrastructure ports that should never be probed via HTTP
const SYSTEM_INFRA_PORTS = new Set([
  53,   // DNS (systemd-resolved, bind)
  67,   // DHCP
  68,   // DHCP
  123,  // NTP
  137,  // NetBIOS
  138,  // NetBIOS
  139,  // NetBIOS
  445,  // SMB
  631,  // CUPS printing
  1900, // SSDP
  5353, // mDNS
  5355  // LLMNR
]);

class HealthChecker {
  constructor() {
    this.cache = new Map(); // port -> { data, timestamp }
    this.cacheTtlMs = 4000;  // 4s cache
  }

  /**
   * Ping a single port over HTTP (with HTTPS fallback)
   */
  async checkPort(port, timeoutMs = 900, isDevPort = false) {
    if (!port || isNaN(port) || port < 1 || port > 65535) {
      return { port, alive: false, isWeb: false, error: 'INVALID_PORT' };
    }

    const portNum = Number(port);

    // Completely skip system infrastructure ports
    if (SYSTEM_INFRA_PORTS.has(portNum)) {
      return { port: portNum, alive: false, isWeb: false, type: 'system' };
    }

    const tryProtocol = (isHttps) => {
      return new Promise((resolve) => {
        const client = isHttps ? https : http;
        const startTime = Date.now();

        const req = client.request(
          {
            hostname: '127.0.0.1',
            port: portNum,
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
            res.resume(); // drain data
            resolve({
              alive: true,
              isWeb: true,
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
            isWeb: isDevPort,
            type: isDevPort ? 'timeout' : 'non-http',
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
            isWeb: false,
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

    // 1. Try plain HTTP
    const httpRes = await tryProtocol(false);
    if (httpRes.alive) {
      const result = { port: portNum, ...httpRes };
      this.cache.set(portNum, { data: result, timestamp: Date.now() });
      return result;
    }

    // 2. Fall back to HTTPS if SSL / protocol error
    const err = httpRes.error || '';
    if (err.includes('EPROTO') || err.includes('SSL') || err.includes('HPE_INVALID')) {
      const httpsRes = await tryProtocol(true);
      if (httpsRes.alive) {
        const result = { port: portNum, ...httpsRes };
        this.cache.set(portNum, { data: result, timestamp: Date.now() });
        return result;
      }
    }

    const finalRes = { port: portNum, ...httpRes };
    this.cache.set(portNum, { data: finalRes, timestamp: Date.now() });
    return finalRes;
  }

  /**
   * Check multiple ports with safety filtering:
   * - Never check UDP sockets
   * - Skip known system infrastructure ports (< 1024 / DNS / mDNS / SSDP)
   * - Only probe TCP web/dev/app ports
   */
  async checkPorts(ports = [], force = false) {
    const results = {};
    const now = Date.now();
    const portsToQuery = [];

    for (const p of ports) {
      const isObj = typeof p === 'object' && p !== null;
      const portNum = Number(isObj ? p.port : p);
      if (isNaN(portNum)) continue;

      const protocol = isObj && p.protocol ? p.protocol.toLowerCase() : 'tcp';
      const isUdp = protocol.includes('udp');
      const isSystem = (isObj && (p.isSystem || p.user === 'root')) || SYSTEM_INFRA_PORTS.has(portNum);
      const isDev = isObj && (p.tag === 'dev' || p.isDocker || portNum >= 1024 || [80, 443, 3000, 5000, 8000, 8080].includes(portNum));

      // 1. Immediately skip UDP sockets
      if (isUdp) {
        results[portNum] = {
          port: portNum,
          alive: false,
          isWeb: false,
          type: 'udp',
          protocol: 'udp'
        };
        continue;
      }

      // 2. Immediately skip critical system ports
      if (SYSTEM_INFRA_PORTS.has(portNum) || (isSystem && portNum < 1024 && portNum !== 80 && portNum !== 443)) {
        results[portNum] = {
          port: portNum,
          alive: false,
          isWeb: false,
          type: 'system',
          protocol: 'tcp'
        };
        continue;
      }

      // 3. Check cache
      if (!force && this.cache.has(portNum)) {
        const cached = this.cache.get(portNum);
        if (now - cached.timestamp < this.cacheTtlMs) {
          results[portNum] = cached.data;
          continue;
        }
      }

      portsToQuery.push({ port: portNum, isDev });
    }

    if (portsToQuery.length === 0) {
      return results;
    }

    // Limit concurrency to 6 concurrent requests
    const concurrency = 6;
    for (let i = 0; i < portsToQuery.length; i += concurrency) {
      const batch = portsToQuery.slice(i, i + concurrency);
      const batchPromises = batch.map(item => this.checkPort(item.port, 900, item.isDev));
      const batchResults = await Promise.allSettled(batchPromises);

      for (let j = 0; j < batch.length; j++) {
        const port = batch[j].port;
        const res = batchResults[j];
        if (res.status === 'fulfilled') {
          results[port] = res.value;
        } else {
          results[port] = { port, alive: false, isWeb: false, error: 'FAILED' };
        }
      }
    }

    return results;
  }

  clearCache() {
    this.cache.clear();
  }
}

export const healthChecker = new HealthChecker();
