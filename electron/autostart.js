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
 * Ensure Linux desktop integration and icon association
 */
export function ensureLinuxDesktopIntegration() {
  if (process.platform !== 'linux') return;
  try {
    const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
    if (!fs.existsSync(appsDir)) fs.mkdirSync(appsDir, { recursive: true });

    const projectDir = path.resolve(__dirname, '..');
    const iconPath = path.join(__dirname, 'assets', 'icon-512.png');
    let execCmd = '';
    if (process.env.APPIMAGE) {
      execCmd = `${process.env.APPIMAGE} %U`;
    } else if (app.isPackaged) {
      execCmd = `${process.execPath} %U`;
    } else {
      execCmd = `${process.execPath} "${projectDir}" --no-sandbox %U`;
    }

    const content = `[Desktop Entry]
Type=Application
Version=1.0
Name=Portify
GenericName=Local Server & Port Dashboard
Comment=Local Server & Port Dashboard running quietly in system tray
Exec=${execCmd}
Icon=${iconPath}
Terminal=false
Categories=Utility;Development;
StartupNotify=true
StartupWMClass=Portify
`;
    // Clean up legacy/duplicate desktop file if it exists
    const duplicatePath = path.join(appsDir, 'Portify.desktop');
    if (fs.existsSync(duplicatePath)) {
      try { fs.unlinkSync(duplicatePath); } catch (e) {}
    }

    fs.writeFileSync(path.join(appsDir, 'portify.desktop'), content, 'utf8');

    // Run database update asynchronously
    import('child_process').then(({ exec }) => {
      exec(`update-desktop-database "${appsDir}" 2>/dev/null || true`);
      exec(`gtk-update-icon-cache -f -t "${path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor')}" 2>/dev/null || true`);
    });
  } catch (err) {
    console.error('ensureLinuxDesktopIntegration error:', err);
  }
}

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
GenericName=Local Server & Port Dashboard
Comment=Local Server & Port Dashboard running quietly in system tray
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
