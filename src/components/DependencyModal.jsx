import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Box, 
  Download, 
  Check, 
  AlertCircle, 
  X, 
  Copy, 
  ExternalLink, 
  Loader2, 
  ShieldCheck, 
  Terminal,
  Play
} from 'lucide-react';

export default function DependencyModal({ 
  type = 'cloudflared', // 'cloudflared' | 'docker'
  targetPort = null,
  dependencies = null,
  onClose,
  onInstalled,
  onCopyText,
  addToast
}) {
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installMessage, setInstallMessage] = useState('');
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [startingService, setStartingService] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [activeTab, setActiveTab] = useState('auto'); // 'auto' | 'manual'

  const platform = dependencies?.platform || (navigator.platform.toLowerCase().includes('mac') ? 'darwin' : navigator.platform.toLowerCase().includes('win') ? 'win32' : 'linux');
  const isMac = platform === 'darwin';
  const isWin = platform === 'win32';
  const isLinux = platform === 'linux';

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !installing && !startingService) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, installing, startingService]);

  // Listen to installation progress
  useEffect(() => {
    if (!window.api?.onDependencyProgress) return;
    const unsubscribe = window.api.onDependencyProgress((data) => {
      if (data.percent !== undefined) setInstallProgress(data.percent);
      if (data.message) setInstallMessage(data.message);
      if (data.error) {
        setInstalling(false);
        if (addToast) addToast('error', 'Installation Failed', data.error);
      }
    });
    return () => unsubscribe();
  }, [addToast]);

  const handleInstallCloudflared = async () => {
    setInstalling(true);
    setInstallProgress(10);
    setInstallMessage('Connecting to Cloudflare release servers...');
    try {
      const res = await window.api.installCloudflared();
      if (res.success) {
        setInstalledSuccess(true);
        setInstallProgress(100);
        setInstallMessage(`Installed cloudflared successfully (${res.version || 'ready'})`);
        if (addToast) addToast('success', 'cloudflared Installed', 'Binary configured and ready.');
        if (onInstalled) {
          onInstalled('cloudflared', targetPort);
        }
      } else {
        setInstalling(false);
        if (addToast) addToast('error', 'Install Error', res.error || 'Failed to install cloudflared');
      }
    } catch (err) {
      setInstalling(false);
      if (addToast) addToast('error', 'Install Error', err.message);
    }
  };

  const handleStartDockerService = async () => {
    setStartingService(true);
    if (addToast) addToast('info', 'Docker Service', 'Requesting system permission to start docker.service...');
    try {
      const res = await window.api.startDockerService();
      if (res.success) {
        if (addToast) addToast('success', 'Docker Running', 'Docker daemon started successfully.');
        if (onInstalled) onInstalled('docker');
        onClose();
      } else {
        if (addToast) addToast('error', 'Failed', res.error || 'Could not start Docker service.');
      }
    } catch (err) {
      if (addToast) addToast('error', 'Error', err.message);
    } finally {
      setStartingService(false);
    }
  };

  const getManualCommand = () => {
    if (type === 'cloudflared') {
      if (isMac) return 'brew install cloudflare/cloudflare/cloudflared';
      if (isWin) return 'winget install --id Cloudflare.cloudflared';
      return 'curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i /tmp/cloudflared.deb';
    } else {
      // Docker
      if (isMac) return 'brew install --cask docker';
      if (isWin) return 'winget install Docker.DockerDesktop';
      return 'sudo apt-get update && sudo apt-get install -y docker.io && sudo systemctl start docker';
    }
  };

  const manualCmd = getManualCommand();

  const handleCopy = (text) => {
    if (onCopyText) onCopyText(text);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-white/[0.1] bg-[#111318] shadow-2xl overflow-hidden flex flex-col cursor-default animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-zinc-200">
              {type === 'cloudflared' ? (
                <Globe className="w-4 h-4 text-sky-400" />
              ) : (
                <Box className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div>
              <span className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
                {type === 'cloudflared' ? 'Cloudflare Tunnel Required' : 'Docker Setup Required'}
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">
                Platform: {isMac ? 'macOS' : isWin ? 'Windows' : 'Linux'} ({dependencies?.arch || 'x64'})
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={installing || startingService}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {type === 'cloudflared' ? (
            <>
              <p className="text-zinc-300 leading-relaxed text-xs">
                To create secure public HTTPS URLs for your local port <span className="font-mono text-zinc-100 font-semibold">{targetPort ? `(${targetPort})` : ''}</span> without modifying router configs or port forwarding, Portify uses Cloudflare’s official tunnel daemon (<span className="font-mono text-zinc-300">cloudflared</span>).
              </p>

              {/* Install Card */}
              {!installedSuccess ? (
                <div className="p-4 rounded-lg bg-black/40 border border-white/[0.07] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="font-medium text-zinc-200">1-Click In-App Install</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">No root/sudo required</span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Downloads the official standalone Cloudflare binary directly into Portify’s user tools directory and marks it executable.
                  </p>

                  {installing ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                          {installMessage || 'Installing...'}
                        </span>
                        <span className="font-semibold text-zinc-200">{installProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                        <div 
                          className="h-full bg-sky-500 transition-all duration-200 ease-out"
                          style={{ width: `${installProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleInstallCloudflared}
                      className="w-full py-2.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-medium text-xs transition flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download & Install cloudflared Automatically</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-zinc-100 text-xs">Ready to Tunnel</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{installMessage}</div>
                  </div>
                </div>
              )}

              {/* Manual package manager alternative */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab(activeTab === 'manual' ? 'auto' : 'manual')}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition"
                >
                  <Terminal className="w-3 h-3" />
                  <span>{activeTab === 'manual' ? 'Hide terminal command' : 'Prefer installing via system package manager?'}</span>
                </button>

                {activeTab === 'manual' && (
                  <div className="mt-2 p-3 rounded-lg bg-black/60 border border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Run in terminal:</span>
                      <button
                        onClick={() => handleCopy(manualCmd)}
                        className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition"
                      >
                        {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCmd ? 'Copied' : 'Copy Command'}</span>
                      </button>
                    </div>
                    <div className="p-2 rounded bg-white/[0.04] font-mono text-[10px] text-zinc-300 break-all select-all border border-white/[0.04]">
                      {manualCmd}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Docker Modal */
            <>
              <p className="text-zinc-300 leading-relaxed text-xs">
                {dependencies?.docker?.installed 
                  ? 'The Docker CLI is detected, but the background Docker daemon service is currently inactive.'
                  : 'Docker is not detected on your system. Docker is optional for Portify, but required to monitor containers, memory & port mappings.'}
              </p>

              {dependencies?.docker?.canStartService && isLinux ? (
                <div className="p-4 rounded-lg bg-black/40 border border-white/[0.07] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-200">Start Systemd Service</span>
                    <span className="text-[10px] text-zinc-500 font-mono">Requires root authorization</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Click below to start <span className="font-mono text-zinc-300">docker.service</span>. Your system will prompt for authentication.
                  </p>
                  <button
                    onClick={handleStartDockerService}
                    disabled={startingService}
                    className="w-full py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-medium text-xs transition flex items-center justify-center gap-2"
                  >
                    {startingService ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Starting Docker daemon...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Start Docker Daemon</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-black/40 border border-white/[0.07] space-y-3">
                  <div className="flex items-center justify-between text-zinc-200 font-medium">
                    <span>Install Docker</span>
                    <button
                      onClick={() => {
                        const url = isMac 
                          ? 'https://docs.docker.com/desktop/install/mac-install/' 
                          : isWin 
                          ? 'https://docs.docker.com/desktop/install/windows-install/' 
                          : 'https://docs.docker.com/engine/install/';
                        if (window.api?.openExternal) window.api.openExternal(url);
                      }}
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      Official Guide <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="p-2.5 rounded bg-white/[0.04] border border-white/[0.04] space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Recommended command:</span>
                      <button
                        onClick={() => handleCopy(manualCmd)}
                        className="flex items-center gap-1 font-mono text-zinc-400 hover:text-zinc-200 transition"
                      >
                        {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="font-mono text-[10px] text-zinc-300 break-all select-all">
                      {manualCmd}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.07] bg-[#0d0f13] flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={installing || startingService}
            className="px-3.5 py-1.5 rounded-md text-zinc-400 hover:text-zinc-200 text-xs font-mono transition disabled:opacity-40"
          >
            {installedSuccess ? 'Close' : 'Cancel'}
          </button>

          {installedSuccess && targetPort && (
            <button
              onClick={() => {
                onClose();
                if (onInstalled) onInstalled('cloudflared', targetPort);
              }}
              className="px-4 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-black font-semibold text-xs transition flex items-center gap-1.5"
            >
              <span>Launch Tunnel for Port {targetPort}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
