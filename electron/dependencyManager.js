import electronPkg from 'electron';
const app = electronPkg.app || (electronPkg.default && electronPkg.default.app);
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { exec, spawn } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Cache detected paths
let cachedCloudflaredPath = null;
let lastCheckTime = 0;
let cachedDependencies = null;

/**
 * Returns the Portify internal bin directory inside userData
 */
export function getInternalBinDir() {
  let baseDir = '';
  if (app && typeof app.getPath === 'function') {
    try {
      baseDir = app.getPath('userData');
    } catch (e) {}
  }
  if (!baseDir) {
    const home = os.homedir();
    if (process.platform === 'win32') {
      baseDir = process.env.APPDATA || path.join(home, 'AppData', 'Roaming', 'portify');
    } else if (process.platform === 'darwin') {
      baseDir = path.join(home, 'Library', 'Application Support', 'portify');
    } else {
      baseDir = path.join(home, '.local', 'share', 'portify');
    }
  }
  const binDir = path.join(baseDir, 'bin');
  if (!fs.existsSync(binDir)) {
    try {
      fs.mkdirSync(binDir, { recursive: true });
    } catch (e) {
      console.error('Failed to create binDir:', e);
    }
  }
  return binDir;
}

/**
 * Resolve the cloudflared executable path across OSes
 */
export async function getCloudflaredPath() {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'cloudflared.exe' : 'cloudflared';

  // 1. Check internal app bin directory first
  const internalPath = path.join(getInternalBinDir(), binName);
  if (fs.existsSync(internalPath)) {
    try {
      // Ensure execution rights on Unix
      if (!isWin) fs.chmodSync(internalPath, 0o755);
      return internalPath;
    } catch (e) {}
    return internalPath;
  }

  // 2. Check cached path
  if (cachedCloudflaredPath && fs.existsSync(cachedCloudflaredPath)) {
    return cachedCloudflaredPath;
  }

  // 3. Check common OS locations
  const commonPaths = [];
  if (isWin) {
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
    commonPaths.push(
      path.join(progFiles, 'cloudflared', 'cloudflared.exe'),
      path.join(progFilesX86, 'cloudflared', 'cloudflared.exe'),
      path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'Cloudflare.cloudflared', 'cloudflared.exe'),
      path.join(localAppData, 'Programs', 'cloudflared', 'cloudflared.exe')
    );
  } else if (process.platform === 'darwin') {
    commonPaths.push(
      '/opt/homebrew/bin/cloudflared', // Apple Silicon Homebrew
      '/usr/local/bin/cloudflared',    // Intel Homebrew / MacPorts
      path.join(os.homedir(), 'homebrew', 'bin', 'cloudflared'),
      path.join(os.homedir(), '.local', 'bin', 'cloudflared')
    );
  } else {
    // Linux
    commonPaths.push(
      '/usr/local/bin/cloudflared',
      '/usr/bin/cloudflared',
      path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
      path.join(os.homedir(), 'bin', 'cloudflared')
    );
  }

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      cachedCloudflaredPath = p;
      return p;
    }
  }

  // 4. Try PATH lookup via which / where
  try {
    const cmd = isWin ? 'where.exe cloudflared' : 'which cloudflared';
    const { stdout } = await execAsync(cmd, { timeout: 1500 });
    const resolved = stdout.trim().split(/\r?\n/)[0];
    if (resolved && fs.existsSync(resolved)) {
      cachedCloudflaredPath = resolved;
      return resolved;
    }
  } catch (e) {
    // Not in PATH
  }

  return null;
}

/**
 * Check cloudflared status and version
 */
export async function checkCloudflared() {
  const binaryPath = await getCloudflaredPath();
  if (!binaryPath) {
    return {
      installed: false,
      path: null,
      version: null
    };
  }

  try {
    const { stdout } = await execAsync(`"${binaryPath}" --version`, { timeout: 2500 });
    // Match "cloudflared version 2026.10.3"
    const match = stdout.match(/version\s+([^\s,]+)/i);
    const version = match ? match[1] : 'installed';
    return {
      installed: true,
      path: binaryPath,
      version
    };
  } catch (err) {
    return {
      installed: true,
      path: binaryPath,
      version: 'unknown'
    };
  }
}

/**
 * Check Docker installation and daemon status
 */
export async function checkDocker() {
  let isInstalled = false;
  let version = null;
  let isRunning = false;
  let canStartService = false;

  const isWin = process.platform === 'win32';

  // 1. Check if docker CLI binary is available
  try {
    const cmd = isWin ? 'where.exe docker' : 'which docker';
    const { stdout } = await execAsync(cmd, { timeout: 1500 });
    if (stdout.trim()) {
      isInstalled = true;
    }
  } catch (e) {
    // Check common locations if not in GUI PATH
    if (process.platform === 'darwin') {
      const macDocker = '/usr/local/bin/docker';
      const macDocker2 = '/opt/homebrew/bin/docker';
      if (fs.existsSync(macDocker) || fs.existsSync(macDocker2)) {
        isInstalled = true;
      }
    } else if (isWin) {
      const winDocker = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
      if (fs.existsSync(winDocker)) isInstalled = true;
    }
  }

  // 2. If installed or might be installed, test daemon
  try {
    const { stdout } = await execAsync('docker --version', { timeout: 1500 });
    isInstalled = true;
    const match = stdout.match(/version\s+([^\s,]+)/i);
    if (match) version = match[1];
  } catch (e) {}

  try {
    await execAsync('docker ps -q', { timeout: 1500 });
    isRunning = true;
  } catch (e) {
    isRunning = false;
  }

  // 3. On Linux, check if systemd docker service is present
  if (process.platform === 'linux' && isInstalled && !isRunning) {
    try {
      const { stdout } = await execAsync('systemctl list-unit-files docker.service 2>/dev/null', { timeout: 1000 });
      if (stdout.includes('docker.service')) {
        canStartService = true;
      }
    } catch (e) {}
  }

  return {
    installed: isInstalled,
    running: isRunning,
    version,
    canStartService
  };
}

/**
 * Start Docker service with elevation on Linux
 */
export async function startDockerService() {
  if (process.platform !== 'linux') {
    return { success: false, error: 'Automatic service start is only available on Linux systemd.' };
  }

  try {
    // Use pkexec for graphical polkit authentication dialog
    await execAsync('pkexec systemctl start docker', { timeout: 25000 });
    // Verify it's running
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await execAsync('docker ps -q', { timeout: 2000 });
    return { success: true, message: 'Docker service started successfully.' };
  } catch (err) {
    // If pkexec was cancelled or failed
    return { success: false, error: err.message };
  }
}

/**
 * Download a file following HTTP(S) redirects
 */
function downloadWithRedirects(url, destPath, onProgress, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many HTTP redirects'));
    }

    const request = https.get(url, (response) => {
      // Handle redirect
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        request.destroy();
        return resolve(downloadWithRedirects(response.headers.location, destPath, onProgress, maxRedirects - 1));
      }

      if (response.statusCode !== 200) {
        request.destroy();
        return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;

      const fileStream = fs.createWriteStream(destPath);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes > 0) {
          const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
          onProgress({ percent, downloadedBytes, totalBytes, status: 'downloading' });
        }
      });

      fileStream.on('error', (err) => {
        fileStream.close();
        try { fs.unlinkSync(destPath); } catch (e) {}
        reject(err);
      });

      response.on('error', (err) => {
        fileStream.close();
        try { fs.unlinkSync(destPath); } catch (e) {}
        reject(err);
      });

      fileStream.on('finish', () => {
        fileStream.close(() => resolve(destPath));
      });

      response.pipe(fileStream);
    });

    request.on('error', (err) => {
      try { fs.unlinkSync(destPath); } catch (e) {}
      reject(err);
    });

    request.setTimeout(60000, () => {
      request.destroy(new Error('Download timed out'));
    });
  });
}

/**
 * Download and install cloudflared in user-space (no root required)
 */
export async function installCloudflared(progressCallback = () => {}) {
  const platform = process.platform;
  const arch = process.arch; // 'x64', 'arm64', 'ia32'
  const isWin = platform === 'win32';
  const isMac = platform === 'darwin';

  const binDir = getInternalBinDir();
  const finalBinaryName = isWin ? 'cloudflared.exe' : 'cloudflared';
  const finalBinaryPath = path.join(binDir, finalBinaryName);

  progressCallback({ percent: 5, message: 'Determining official Cloudflare package...' });

  let downloadUrl = '';
  let isArchive = false;

  if (isWin) {
    const winArch = arch === 'arm64' ? 'amd64' : (arch === 'ia32' ? '386' : 'amd64');
    downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${winArch}.exe`;
  } else if (isMac) {
    const macArch = arch === 'arm64' ? 'arm64' : 'amd64';
    downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${macArch}.tgz`;
    isArchive = true;
  } else {
    // Linux
    const linuxArch = arch === 'arm64' ? 'arm64' : (arch === 'arm' ? 'arm' : 'amd64');
    downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${linuxArch}`;
  }

  const tempDownloadPath = isArchive 
    ? path.join(binDir, 'cloudflared-temp.tgz') 
    : path.join(binDir, isWin ? 'cloudflared-temp.exe' : 'cloudflared-temp');

  try {
    progressCallback({ percent: 10, message: 'Connecting to Cloudflare release servers...' });

    await downloadWithRedirects(downloadUrl, tempDownloadPath, (prog) => {
      progressCallback({
        percent: Math.min(90, Math.max(10, Math.round(10 + prog.percent * 0.75))),
        downloadedBytes: prog.downloadedBytes,
        totalBytes: prog.totalBytes,
        message: `Downloading cloudflared (${Math.round(prog.downloadedBytes / (1024 * 1024))}MB)...`
      });
    });

    progressCallback({ percent: 90, message: 'Extracting and configuring binary...' });

    if (isArchive) {
      // Extract tarball on macOS
      await execAsync(`tar -xzf "${tempDownloadPath}" -C "${binDir}"`, { timeout: 10000 });
      try { fs.unlinkSync(tempDownloadPath); } catch (e) {}
    } else {
      // Rename temp file to final binary name
      if (fs.existsSync(finalBinaryPath)) {
        try { fs.unlinkSync(finalBinaryPath); } catch (e) {}
      }
      fs.renameSync(tempDownloadPath, finalBinaryPath);
    }

    if (!isWin) {
      fs.chmodSync(finalBinaryPath, 0o755);
    }

    progressCallback({ percent: 96, message: 'Verifying installation...' });

    // Verify it works
    const { stdout } = await execAsync(`"${finalBinaryPath}" --version`, { timeout: 5000 });
    cachedCloudflaredPath = finalBinaryPath;

    const match = stdout.match(/version\s+([^\s,]+)/i);
    const version = match ? match[1] : 'ready';

    progressCallback({ percent: 100, message: `Successfully installed cloudflared (${version})` });

    return {
      success: true,
      path: finalBinaryPath,
      version
    };
  } catch (err) {
    try {
      if (fs.existsSync(tempDownloadPath)) fs.unlinkSync(tempDownloadPath);
    } catch (e) {}
    progressCallback({ percent: 0, error: err.message });
    throw new Error(`Failed to install cloudflared: ${err.message}`);
  }
}

/**
 * Return comprehensive dependency statuses for the UI
 */
export async function checkAllDependencies(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedDependencies && (now - lastCheckTime < 5000)) {
    return cachedDependencies;
  }

  const [cf, doc] = await Promise.all([
    checkCloudflared(),
    checkDocker()
  ]);

  cachedDependencies = {
    cloudflared: cf,
    docker: doc,
    platform: process.platform,
    arch: process.arch
  };
  lastCheckTime = now;

  return cachedDependencies;
}
