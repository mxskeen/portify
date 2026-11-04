import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LINUX_AUTOSTART_DIR = path.join(os.homedir(), '.config', 'autostart');
const LINUX_DESKTOP_FILE = path.join(LINUX_AUTOSTART_DIR, 'portify.desktop');

/**
 * Check if autostart on system boot is enabled
 */
export function isAutostartEnabled() {
  if (process.platform === 'linux') {
    return fs.existsSync(LINUX_DESKTOP_FILE);
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

      // Determine executable path
      const execPath = process.env.APPIMAGE || process.execPath;
      const args = startMinimized ? ' --minimized' : '';

      const desktopEntry = `[Desktop Entry]
Type=Application
Version=1.0
Name=Portify
GenericName=Port & Docker Manager
Comment=Monitor open ports, Docker containers and manage Cloudflare tunnels from system tray
Exec=${execPath}${args}
Terminal=false
Categories=Utility;Development;
StartupNotify=false
X-GNOME-Autostart-enabled=true
`;
      fs.writeFileSync(LINUX_DESKTOP_FILE, desktopEntry, 'utf8');
      return true;
    } else {
      if (fs.existsSync(LINUX_DESKTOP_FILE)) {
        fs.unlinkSync(LINUX_DESKTOP_FILE);
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
