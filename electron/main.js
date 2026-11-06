import { app, BrowserWindow, Tray, Menu, ipcMain, shell, clipboard, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';

import { scanAllPorts } from './portScanner.js';
import { getDockerContainers, stopContainer, killContainer, restartContainer } from './dockerScanner.js';
import { killPortProcess } from './processKiller.js';
import { tunnelManager } from './tunnelManager.js';
import { isAutostartEnabled, setAutostart, ensureLinuxDesktopIntegration } from './autostart.js';
import { checkAllDependencies, installCloudflared, startDockerService } from './dependencyManager.js';
import { logManager } from './logManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Portify] Another instance is already running in the background/tray. Focusing existing instance...');
  app.quit();
  process.exit(0);
}

app.setName('Portify');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.maskeen.portify');
} else if (process.platform === 'linux') {
  if (typeof app.setDesktopName === 'function') {
    app.setDesktopName('portify.desktop');
  }
}

const appIconPath = path.join(__dirname, 'assets', 'icon-512.png');
const appIcon = nativeImage.createFromPath(appIconPath);

let mainWindow = null;
let tray = null;
let isQuitting = false;
let lastPortCount = 0;
let lastDockerCount = 0;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const startMinimized = process.argv.includes('--minimized') || process.argv.includes('--hidden');

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 650,
    title: 'Portify — Local Server & Port Dashboard',
    backgroundColor: '#090a0d',
    show: !startMinimized,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.platform === 'linux') {
    mainWindow.setIcon(appIcon);
  }

  // Hide default menu bar for sleek modern look
  mainWindow.setMenuBarVisibility(false);

  // Always open external links in default OS browser (Chrome, Firefox, etc.) instead of inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  const distPath = path.join(__dirname, '../dist/index.html');
  const hasDist = fs.existsSync(distPath);
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.on('did-fail-load', () => {
      if (hasDist) {
        console.log('[Portify] Dev server not responding on 5173. Falling back to local dist build...');
        mainWindow.loadFile(distPath);
      }
    });
  } else if (hasDist) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  // Intercept window close to minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('ready-to-show', () => {
    if (!startMinimized) {
      mainWindow.show();
    }
  });
}

let lastTraySignature = '';

function updateTrayMenu(force = false) {
  if (!tray) return;

  const tunnels = tunnelManager.getTunnelsList().filter(t => t.status === 'active');
  const autostartActive = isAutostartEnabled();
  const signature = `${lastPortCount}|${lastDockerCount}|${tunnels.length}|${autostartActive}`;

  // Avoid resetting DBus tray context menu if data didn't change
  if (!force && signature === lastTraySignature) {
    return;
  }
  lastTraySignature = signature;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Portify Dashboard',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: `Listening Ports: ${lastPortCount}`,
      enabled: false
    },
    {
      label: `Docker Containers: ${lastDockerCount}`,
      enabled: false
    },
    {
      label: `Active Cloudflare Tunnels: ${tunnels.length}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Start at System Login',
      type: 'checkbox',
      checked: autostartActive,
      click: (item) => {
        setAutostart(item.checked, true);
        updateTrayMenu(true);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Portify',
      click: () => {
        isQuitting = true;
        tunnelManager.stopAllTunnels();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Portify - ${lastPortCount} ports, ${lastDockerCount} containers, ${tunnels.length} tunnels`);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('Portify - System Port & Docker Monitor');

  // On Windows/macOS, left click toggles window
  // On Linux (GNOME/AppIndicator), left-click natively opens the context menu
  if (process.platform !== 'linux') {
    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  }

  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  updateTrayMenu(true);
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    // Bring window to foreground across Linux, Windows and macOS
    try {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setAlwaysOnTop(false);
    } catch (e) {}
  } else {
    createMainWindow();
  }
});

app.whenReady().then(() => {
  if (process.platform === 'linux') {
    ensureLinuxDesktopIntegration();
  }
  createTray();
  createMainWindow();

  // Connect tunnel manager events to renderer
  tunnelManager.setEventEmitter((event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(event, data);
    }
    updateTrayMenu();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  logManager.stopAll();
  tunnelManager.stopAllTunnels();
});

// ==================== IPC HANDLERS ====================

// Get all ports, docker containers, and tunnels in a single fast call
ipcMain.handle('app:scan', async () => {
  try {
    const dockerResult = await getDockerContainers();
    lastDockerCount = dockerResult.containers.length;

    const ports = await scanAllPorts(dockerResult.portMap);
    lastPortCount = ports.length;

    updateTrayMenu();

    return {
      success: true,
      ports,
      docker: dockerResult,
      tunnels: tunnelManager.getTunnelsList(),
      timestamp: Date.now()
    };
  } catch (err) {
    console.error('IPC app:scan error:', err);
    return {
      success: false,
      error: err.message,
      ports: [],
      docker: { available: false, containers: [] },
      tunnels: []
    };
  }
});

// Get ports and processes, enriched with Docker info
ipcMain.handle('ports:get', async () => {
  try {
    const dockerResult = await getDockerContainers();
    lastDockerCount = dockerResult.containers.length;

    const ports = await scanAllPorts(dockerResult.portMap);
    lastPortCount = ports.length;

    updateTrayMenu();

    return {
      success: true,
      ports,
      timestamp: Date.now()
    };
  } catch (err) {
    console.error('IPC ports:get error:', err);
    return { success: false, error: err.message, ports: [] };
  }
});

// Force kill a port / process
ipcMain.handle('process:kill', async (_event, data) => {
  const result = await killPortProcess(data);
  return result;
});

// Docker handlers
ipcMain.handle('docker:getContainers', async () => {
  const result = await getDockerContainers();
  lastDockerCount = result.containers.length;
  updateTrayMenu();
  return result;
});

ipcMain.handle('docker:stop', async (_event, id) => {
  return await stopContainer(id);
});

ipcMain.handle('docker:kill', async (_event, id) => {
  return await killContainer(id);
});

ipcMain.handle('docker:restart', async (_event, id) => {
  return await restartContainer(id);
});

// Cloudflare Tunnel handlers
ipcMain.handle('tunnel:start', async (_event, port) => {
  const result = await tunnelManager.startTunnel(port);
  updateTrayMenu();
  return result;
});

ipcMain.handle('tunnel:stop', async (_event, port) => {
  const result = tunnelManager.stopTunnel(port);
  updateTrayMenu();
  return result;
});

ipcMain.handle('tunnel:getList', () => {
  return tunnelManager.getTunnelsList();
});

// Autostart handlers
ipcMain.handle('autostart:get', () => {
  return {
    enabled: isAutostartEnabled(),
    platform: process.platform
  };
});

ipcMain.handle('autostart:set', (_event, { enable, startMinimized }) => {
  const status = setAutostart(enable, startMinimized);
  updateTrayMenu();
  return { success: true, enabled: status };
});

// Window controls
ipcMain.handle('window:minimizeToTray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  return true;
});

ipcMain.handle('shell:openExternal', (_event, url) => {
  shell.openExternal(url);
  return true;
});

ipcMain.handle('clipboard:write', (_event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('system:getInfo', () => {
  return {
    platform: process.platform,
    hostname: os.hostname(),
    uptime: os.uptime(),
    totalmem: os.totalmem(),
    freemem: os.freemem(),
    cpus: os.cpus().length
  };
});

// Dependency Management handlers
ipcMain.handle('deps:check', async (_event, forceFresh = false) => {
  return await checkAllDependencies(forceFresh);
});

ipcMain.handle('deps:installCloudflared', async () => {
  try {
    const result = await installCloudflared((progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('deps:progress', { tool: 'cloudflared', ...progress });
      }
    });
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('deps:startDockerService', async () => {
  return await startDockerService();
});

// ==================== LIVE LOGS HANDLERS ====================
ipcMain.handle('logs:detectSources', async (_event, target) => {
  return await logManager.detectSources(target);
});

ipcMain.handle('logs:startStream', async (_event, options) => {
  return await logManager.startStream(
    options,
    (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('logs:data', data);
      }
    },
    (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('logs:status', status);
      }
    }
  );
});

ipcMain.handle('logs:stopStream', (_event, streamId) => {
  return logManager.stopStream(streamId);
});
