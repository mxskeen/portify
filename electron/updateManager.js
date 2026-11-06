import { app, ipcMain } from 'electron';
import pkg from 'electron-updater';

const { autoUpdater } = pkg;

class UpdateManager {
  constructor() {
    this.mainWindow = null;
    this.updateReady = false;
    this.latestVersion = null;
    this.status = { state: 'idle', message: '', version: app.getVersion() };
  }

  setWindow(window) {
    this.mainWindow = window;
  }

  broadcast(eventName, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(eventName, data);
    }
  }

  init() {
    // Only run real auto-update checks in packaged production builds
    if (!app.isPackaged) {
      console.log('[Portify Updater] Running in development mode — auto-update checks disabled.');
      this.status = { state: 'dev', message: 'Development mode', version: app.getVersion() };
      return;
    }

    try {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on('checking-for-update', () => {
        this.status = { state: 'checking', message: 'Checking for updates...', version: app.getVersion() };
        this.broadcast('update:status', this.status);
      });

      autoUpdater.on('update-available', (info) => {
        this.latestVersion = info.version;
        this.status = {
          state: 'downloading',
          message: `Update v${info.version} found. Downloading in background...`,
          version: info.version,
          releaseNotes: info.releaseNotes
        };
        this.broadcast('update:status', this.status);
      });

      autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent || 0);
        this.status = {
          state: 'downloading',
          percent,
          message: `Downloading update: ${percent}%`,
          version: this.latestVersion || app.getVersion()
        };
        this.broadcast('update:status', this.status);
      });

      autoUpdater.on('update-downloaded', (info) => {
        this.updateReady = true;
        this.latestVersion = info.version;
        this.status = {
          state: 'ready',
          version: info.version,
          message: `Portify v${info.version} downloaded! Restart to apply.`
        };
        this.broadcast('update:status', this.status);
      });

      autoUpdater.on('update-not-available', () => {
        this.status = {
          state: 'latest',
          message: `Portify is up to date (v${app.getVersion()})`,
          version: app.getVersion()
        };
        this.broadcast('update:status', this.status);
      });

      autoUpdater.on('error', (err) => {
        console.warn('[Portify Updater] Error:', err.message);
        this.status = {
          state: 'error',
          message: err.message || 'Failed to check for updates',
          version: app.getVersion()
        };
        this.broadcast('update:status', this.status);
      });

      // Automatically check for updates 5 seconds after startup
      setTimeout(() => {
        this.checkForUpdates(false);
      }, 5000);

      // Periodically check every 4 hours while app stays running
      setInterval(() => {
        this.checkForUpdates(false);
      }, 4 * 60 * 60 * 1000);

    } catch (err) {
      console.warn('[Portify Updater] Failed to initialize:', err.message);
    }
  }

  async checkForUpdates(manual = false) {
    if (!app.isPackaged) {
      const devStatus = {
        state: 'dev',
        message: 'Running in dev mode. Updates are enabled in packaged release.',
        version: app.getVersion()
      };
      this.broadcast('update:status', devStatus);
      return devStatus;
    }

    try {
      this.status = { state: 'checking', message: 'Checking for updates...', version: app.getVersion() };
      this.broadcast('update:status', this.status);
      const result = await autoUpdater.checkForUpdates();
      return { success: true, result };
    } catch (err) {
      this.status = { state: 'error', message: err.message, version: app.getVersion() };
      this.broadcast('update:status', this.status);
      return { success: false, error: err.message };
    }
  }

  quitAndInstall() {
    if (this.updateReady) {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  getStatus() {
    return {
      ...this.status,
      currentVersion: app.getVersion(),
      updateReady: this.updateReady
    };
  }
}

export const updateManager = new UpdateManager();
