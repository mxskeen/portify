import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LINUX_AUTOSTART_DIR = path.join(os.homedir(), '.config', 'autostart');
const LINUX_DESKTOP_FILE = path.join(LINUX_AUTOSTART_DIR, 'portify.desktop');
const SYSTEMD_USER_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const SYSTEMD_SERVICE_FILE = path.join(SYSTEMD_USER_DIR, 'portify.service');

/**
 * Check if autostart on system boot is enabled
 */
export function isAutostartEnabled() {
  if (process.platform === 'linux') {
    return fs.existsSync(LINUX_DESKTOP_FILE) || fs.existsSync(SYSTEMD_SERVICE_FILE);
  } else {
    // Windows / macOS
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  }
}

/**
 * Set autostart status
 */
export function setAutostart(enable, startMinimized = true) {
  if (process.platform === 'linux') {
    if (enable) {
      if (!fs.existsSync(LINUX_AUTOSTART_DIR)) {
        fs.mkdirSync(LINUX_AUTOSTART_DIR, { recursive: true });
      }

      // Determine proper executable launch command
      const projectDir = path.resolve(__dirname, '..');
      let execCmd = '';
      if (process.env.APPIMAGE) {
        execCmd = `${process.env.APPIMAGE} --minimized`;
      } else if (app.isPackaged) {
        execCmd = `${process.execPath} --minimized`;
      } else {
        execCmd = `${process.execPath} "${projectDir}" --no-sandbox --minimized`;
      }

      const desktopEntry = `[Desktop Entry]
Type=Application
Version=1.0
Name=Portify
GenericName=Port & Docker Manager
Comment=Port & Process Manager running quietly in system tray
Exec=${execCmd}
Terminal=false
Categories=Utility;Development;
StartupNotify=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=2
`;
      fs.writeFileSync(LINUX_DESKTOP_FILE, desktopEntry, 'utf8');

      // Also setup systemd user service as secondary fallback
      try {
        if (!fs.existsSync(SYSTEMD_USER_DIR)) {
          fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
        }
        const serviceContent = `[Unit]
Description=Portify - Port & Process Manager in Tray
After=graphical-session.target

[Service]
ExecStart=${execCmd}
Restart=on-failure
RestartSec=5
Environment=DISPLAY=:0

[Install]
WantedBy=default.target
`;
        fs.writeFileSync(SYSTEMD_SERVICE_FILE, serviceContent, 'utf8');
      } catch (e) {}

      return true;
    } else {
      if (fs.existsSync(LINUX_DESKTOP_FILE)) {
        try { fs.unlinkSync(LINUX_DESKTOP_FILE); } catch (e) {}
      }
      if (fs.existsSync(SYSTEMD_SERVICE_FILE)) {
        try { fs.unlinkSync(SYSTEMD_SERVICE_FILE); } catch (e) {}
      }
      return false;
    }
  } else {
    // Windows & macOS
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: startMinimized,
      args: startMinimized ? ['--minimized'] : []
    });
    return enable;
  }
}
