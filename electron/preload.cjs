const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Unified fast scan
  scanAll: () => ipcRenderer.invoke('app:scan'),

  // Ports & Processes
  getPorts: () => ipcRenderer.invoke('ports:get'),
  killProcess: (data) => ipcRenderer.invoke('process:kill', data),

  // Docker
  getDockerContainers: () => ipcRenderer.invoke('docker:getContainers'),
  stopDockerContainer: (id) => ipcRenderer.invoke('docker:stop', id),
  killDockerContainer: (id) => ipcRenderer.invoke('docker:kill', id),
  restartDockerContainer: (id) => ipcRenderer.invoke('docker:restart', id),

  // Cloudflare Tunnels
  startTunnel: (port) => ipcRenderer.invoke('tunnel:start', port),
  stopTunnel: (port) => ipcRenderer.invoke('tunnel:stop', port),
  getTunnels: () => ipcRenderer.invoke('tunnel:getList'),
  onTunnelUpdate: (callback) => {
    const handler = (_event, tunnels) => callback(tunnels);
    ipcRenderer.on('tunnel:updated', handler);
    return () => ipcRenderer.removeListener('tunnel:updated', handler);
  },

  // Autostart & Window
  getAutostartStatus: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (enable, startMinimized) => ipcRenderer.invoke('autostart:set', { enable, startMinimized }),
  minimizeToTray: () => ipcRenderer.invoke('window:minimizeToTray'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),

  // Dependencies & Tools
  checkDependencies: (forceFresh) => ipcRenderer.invoke('deps:check', forceFresh),
  installCloudflared: () => ipcRenderer.invoke('deps:installCloudflared'),
  startDockerService: () => ipcRenderer.invoke('deps:startDockerService'),
  onDependencyProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('deps:progress', handler);
    return () => ipcRenderer.removeListener('deps:progress', handler);
  },

  // System
  getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),

  // Live Server Logs
  detectLogSources: (target) => ipcRenderer.invoke('logs:detectSources', target),
  startLogStream: (options) => ipcRenderer.invoke('logs:startStream', options),
  stopLogStream: (streamId) => ipcRenderer.invoke('logs:stopStream', streamId),
  onLogData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('logs:data', handler);
    return () => ipcRenderer.removeListener('logs:data', handler);
  },
  onLogStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('logs:status', handler);
    return () => ipcRenderer.removeListener('logs:status', handler);
  },

  // Live HTTP Health & Latency
  checkPortsHealth: (ports, force) => ipcRenderer.invoke('ports:checkHealth', ports, force),
  pingPort: (port) => ipcRenderer.invoke('ports:ping', port)
});
