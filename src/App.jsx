import React, { useState, useEffect, useCallback } from 'react';
import StatsHeader from './components/StatsHeader';
import PortTable from './components/PortTable';
import DockerView from './components/DockerView';
import TunnelDrawer from './components/TunnelDrawer';
import ProcessModal from './components/ProcessModal';
import SettingsModal from './components/SettingsModal';
import ElevatedKillModal from './components/ElevatedKillModal';
import OnboardingModal from './components/OnboardingModal';
import QuickSearchModal from './components/QuickSearchModal';
import DependencyModal from './components/DependencyModal';
import LogViewerModal from './components/LogViewerModal';
import UpdateNotification from './components/UpdateNotification';
import Toast from './components/Toast';

export default function App() {
  const [activeTab, setActiveTab] = useState('ports'); // 'ports' | 'docker' | 'tunnels'
  const [ports, setPorts] = useState([]);
  const [dockerResult, setDockerResult] = useState({ available: false, containers: [] });
  const [tunnels, setTunnels] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [refreshRate, setRefreshRate] = useState(3000); // 3s default
  const [loading, setLoading] = useState(false);
  const [inspectProcess, setInspectProcess] = useState(null);
  const [logTarget, setLogTarget] = useState(null);
  const [healthMap, setHealthMap] = useState(new Map());
  const [elevatedTarget, setElevatedTarget] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [dependencies, setDependencies] = useState(null);
  const [depModal, setDepModal] = useState({ open: false, type: 'cloudflared', targetPort: null });
  const [initialLoading, setInitialLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('portify_onboarding_v1');
  });
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Unified fast scan
  const fetchData = useCallback(async (showLoading = false) => {
    if (!window.api) return;
    if (showLoading) setLoading(true);

    try {
      let portList = [];
      if (window.api.scanAll) {
        const res = await window.api.scanAll();
        if (res && res.success) {
          portList = res.ports || [];
          setPorts(portList);
          if (res.docker) setDockerResult(res.docker);
          if (res.tunnels) setTunnels(res.tunnels);
        }
      } else {
        const [portsRes, dockerRes, tunnelsRes] = await Promise.all([
          window.api.getPorts(),
          window.api.getDockerContainers(),
          window.api.getTunnels()
        ]);
        if (portsRes && portsRes.success) {
          portList = portsRes.ports || [];
          setPorts(portList);
        }
        if (dockerRes) setDockerResult(dockerRes);
        if (tunnelsRes) setTunnels(tunnelsRes);
      }

      // Non-blocking background HTTP health & latency check
      if (portList.length > 0 && window.api.checkPortsHealth) {
        window.api.checkPortsHealth(portList).then((healthData) => {
          if (healthData) {
            setHealthMap(new Map(Object.entries(healthData)));
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const handlePingPort = useCallback(async (port) => {
    if (!window.api || !window.api.pingPort) return;
    try {
      const res = await window.api.pingPort(port);
      if (res) {
        setHealthMap((prev) => {
          const next = new Map(prev);
          next.set(String(port), res);
          return next;
        });
      }
    } catch (e) {}
  }, []);

  // Initial load & interval polling
  useEffect(() => {
    const startTime = Date.now();
    fetchData(true).finally(() => {
      const elapsed = Date.now() - startTime;
      const minDisplayTime = 500;
      setTimeout(() => {
        setInitialLoading(false);
      }, Math.max(0, minDisplayTime - elapsed));
    });

    if (window.api && window.api.checkDependencies) {
      window.api.checkDependencies().then(setDependencies).catch(() => {});
    }

    let unsubscribeTunnels = () => {};
    if (window.api && window.api.onTunnelUpdate) {
      unsubscribeTunnels = window.api.onTunnelUpdate((updatedTunnels) => {
        setTunnels(updatedTunnels);
      });
    }

    let unsubscribeUpdates = () => {};
    if (window.api && window.api.onUpdateStatus) {
      unsubscribeUpdates = window.api.onUpdateStatus((status) => {
        setUpdateStatus(status);
      });
    }

    return () => {
      unsubscribeTunnels();
      unsubscribeUpdates();
    };
  }, [fetchData]);

  // Global keyboard shortcuts: Ctrl+R / Cmd+R to refresh scan, Ctrl+F / Cmd+F to open search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        fetchData(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchData]);

  // Interval timer (paused when window is hidden/minimized to prevent tray menu flickering)
  useEffect(() => {
    if (refreshRate <= 0) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchData(false);
    }, refreshRate);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshRate, fetchData]);

  const handleCopyText = (text) => {
    if (window.api && window.api.copyToClipboard) {
      window.api.copyToClipboard(text);
    } else {
      navigator.clipboard.writeText(text);
    }
    addToast('success', 'Copied to clipboard', text);
  };

  const handleKillPort = async (portObj) => {
    // If it's a root process and no elevated flag yet, prompt for elevation
    if (portObj.user === 'root' && !portObj.forceElevated) {
      setElevatedTarget(portObj);
      return;
    }

    try {
      const result = await window.api.killProcess({
        port: portObj.port,
        pid: portObj.pid,
        isDocker: portObj.isDocker,
        dockerContainer: portObj.dockerContainer,
        forceElevated: portObj.forceElevated || false,
        sudoPassword: portObj.sudoPassword || ''
      });

      if (result.success) {
        addToast('success', 'Killed', result.message);
        await fetchData(false);
      } else {
        if (result.needsElevation) {
          setElevatedTarget(portObj);
        } else {
          addToast('error', 'Kill Failed', result.error || result.message);
        }
      }
    } catch (err) {
      addToast('error', 'Error', err.message);
    }
  };

  const handleEnableOnboarding = async () => {
    localStorage.setItem('portify_onboarding_v1', 'true');
    setShowOnboarding(false);
    try {
      await window.api.setAutostart(true, true);
      addToast('success', 'Autostart Enabled', 'Portify will launch in background system tray on boot.');
    } catch (e) {}
  };

  const handleDismissOnboarding = () => {
    localStorage.setItem('portify_onboarding_v1', 'true');
    setShowOnboarding(false);
  };

  const handleStartTunnel = async (port) => {
    // If we know cloudflared is not installed, prompt user immediately
    if (dependencies && dependencies.cloudflared && !dependencies.cloudflared.installed) {
      setDepModal({ open: true, type: 'cloudflared', targetPort: port });
      return;
    }

    addToast('info', 'Cloudflare', `Starting tunnel for port ${port}...`);
    try {
      const res = await window.api.startTunnel(port);
      if (res.success && res.url) {
        addToast('success', 'Tunnel active', res.url);
        handleCopyText(res.url);
      } else if (res.notInstalled) {
        setDepModal({ open: true, type: 'cloudflared', targetPort: port });
      } else {
        addToast('error', 'Failed', res.error || 'Could not start tunnel');
      }
      fetchData(false);
    } catch (err) {
      addToast('error', 'Error', err.message);
    }
  };

  const handleDependencyInstalled = async (tool, targetPort) => {
    if (window.api && window.api.checkDependencies) {
      const fresh = await window.api.checkDependencies(true);
      setDependencies(fresh);
    }
    if (tool === 'cloudflared' && targetPort) {
      handleStartTunnel(targetPort);
    } else if (tool === 'docker') {
      fetchData(true);
    }
  };

  const handleStopTunnel = async (port) => {
    try {
      const res = await window.api.stopTunnel(port);
      if (res.success) {
        addToast('info', 'Stopped', `Tunnel for port ${port} stopped.`);
      }
      fetchData(false);
    } catch (err) {
      addToast('error', 'Error', err.message);
    }
  };

  const handleStopContainer = async (id) => {
    const res = await window.api.stopDockerContainer(id);
    if (res.success) {
      addToast('success', 'Stopped', res.message);
      fetchData(false);
    } else {
      addToast('error', 'Stop Failed', res.error);
    }
  };

  const handleKillContainer = async (id) => {
    const res = await window.api.killDockerContainer(id);
    if (res.success) {
      addToast('success', 'Force Killed', res.message);
      fetchData(false);
    } else {
      addToast('error', 'Kill Failed', res.error);
    }
  };

  const handleRestartContainer = async (id) => {
    const res = await window.api.restartDockerContainer(id);
    if (res.success) {
      addToast('success', 'Restarted', res.message);
      fetchData(false);
    } else {
      addToast('error', 'Restart Failed', res.error);
    }
  };

  const handleMinimizeToTray = async () => {
    addToast('info', 'Minimized', 'Portify is running in your system tray.');
    setTimeout(() => {
      if (window.api && window.api.minimizeToTray) {
        window.api.minimizeToTray();
      }
    }, 250);
  };

  const activeTunnelsCount = tunnels.filter((t) => t.status === 'active').length;
  const runningDockerCount = (dockerResult.containers || []).filter((c) => c.state === 'running').length;

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#090a0d] text-zinc-100 select-none animate-in fade-in duration-150">
        <img
          src="./icon.png"
          alt="Portify"
          className="w-24 h-24 object-contain mb-8 drop-shadow-2xl"
        />
        <div className="w-32 h-[2px] bg-white/[0.08] rounded-full overflow-hidden relative">
          <div className="h-full bg-emerald-400 rounded-full w-1/2 animate-indeterminate" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090a0d] text-zinc-100 antialiased font-sans">
      {/* Sleek Top Navigation Bar */}
      <StatsHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        portsCount={ports.length}
        dockerCount={runningDockerCount}
        tunnelsCount={activeTunnelsCount}
        refreshRate={refreshRate}
        setRefreshRate={setRefreshRate}
        onRefresh={() => fetchData(true)}
        loading={loading}
        onOpenSettings={() => setSettingsOpen(true)}
        onMinimizeToTray={handleMinimizeToTray}
      />

      {/* Main View */}
      <main className="flex-1 overflow-hidden relative">
        <div key={activeTab} className="h-full w-full animate-in fade-in duration-150">
          {activeTab === 'ports' && (
            <PortTable
              ports={ports}
              tunnels={tunnels}
              searchQuery={searchQuery}
              onUpdateSearch={setSearchQuery}
              onOpenSearchModal={() => setSearchModalOpen(true)}
              onKillPort={handleKillPort}
              onStartTunnel={handleStartTunnel}
              onStopTunnel={handleStopTunnel}
              onInspectProcess={(p) => setInspectProcess(p)}
              onViewLogs={(p) => setLogTarget(p)}
              healthMap={healthMap}
              onPingPort={handlePingPort}
              onCopyText={handleCopyText}
            />
          )}

          {activeTab === 'docker' && (
            <DockerView
              dockerResult={dockerResult}
              dependencies={dependencies}
              onOpenDockerSetup={() => setDepModal({ open: true, type: 'docker', targetPort: null })}
              onStopContainer={handleStopContainer}
              onKillContainer={handleKillContainer}
              onRestartContainer={handleRestartContainer}
              onStartTunnel={handleStartTunnel}
              onViewLogs={(c) => setLogTarget(c)}
            />
          )}

          {activeTab === 'tunnels' && (
            <TunnelDrawer
              tunnels={tunnels}
              isCloudflaredInstalled={dependencies?.cloudflared?.installed !== false}
              onInstallCloudflared={() => setDepModal({ open: true, type: 'cloudflared', targetPort: null })}
              onStopTunnel={handleStopTunnel}
              onCopyText={handleCopyText}
            />
          )}
        </div>
      </main>

      {/* Quick Search Spotlight Modal with Backdrop */}
      <QuickSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        ports={ports}
        tunnels={tunnels}
        healthMap={healthMap}
        searchQuery={searchQuery}
        onUpdateSearch={setSearchQuery}
        onSelectPort={(port) => {
          setActiveTab('ports');
          setInspectProcess(port);
        }}
      />

      {/* Modals & Overlays */}
      {inspectProcess && (
        <ProcessModal
          processData={inspectProcess}
          onClose={() => setInspectProcess(null)}
          onKillPort={handleKillPort}
          onCopyText={handleCopyText}
          onViewLogs={(p) => setLogTarget(p)}
          health={healthMap.get(String(inspectProcess.port)) || healthMap.get(inspectProcess.port)}
        />
      )}

      {/* Live Server Logs Modal */}
      {logTarget && (
        <LogViewerModal
          target={logTarget}
          onClose={() => setLogTarget(null)}
          onCopyText={handleCopyText}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          dependencies={dependencies}
          onOpenDependencyModal={(type) => setDepModal({ open: true, type, targetPort: null })}
          onClose={() => setSettingsOpen(false)}
          onShowToast={addToast}
        />
      )}

      {/* In-App Dependency Installation / Permission Modal */}
      {depModal.open && (
        <DependencyModal
          type={depModal.type}
          targetPort={depModal.targetPort}
          dependencies={dependencies}
          onClose={() => setDepModal({ open: false, type: 'cloudflared', targetPort: null })}
          onInstalled={handleDependencyInstalled}
          onCopyText={handleCopyText}
          addToast={addToast}
        />
      )}

      {/* Root/Sudo Elevated Kill Modal */}
      {elevatedTarget && (
        <ElevatedKillModal
          target={elevatedTarget}
          onClose={() => setElevatedTarget(null)}
          onExecuteKill={handleKillPort}
        />
      )}

      {/* First-time Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal
          onEnable={handleEnableOnboarding}
          onDismiss={handleDismissOnboarding}
        />
      )}

      {/* In-App Auto-Update Notification */}
      <UpdateNotification
        updateStatus={updateStatus}
        onDismiss={() => setUpdateStatus(null)}
        onRestartAndInstall={() => {
          if (window.api && window.api.restartAndInstallUpdate) {
            window.api.restartAndInstallUpdate();
          }
        }}
      />

      {/* Subtle Toast System */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
