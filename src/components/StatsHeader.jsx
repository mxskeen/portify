import React, { useRef, useState, useLayoutEffect } from 'react';
import { 
  RefreshCw, 
  Settings, 
  Minus, 
  Radio,
  Box,
  Globe
} from 'lucide-react';

function GithubIcon({ className = "w-3.5 h-3.5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export default function StatsHeader({ 
  activeTab,
  setActiveTab,
  portsCount = 0, 
  dockerCount = 0, 
  tunnelsCount = 0, 
  refreshRate, 
  setRefreshRate, 
  onRefresh, 
  loading,
  onOpenSettings,
  onMinimizeToTray
}) {
  const containerRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const activeBtn = containerRef.current.querySelector(`[data-tab="${activeTab}"]`);
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        ready: true
      });
    }
  }, [activeTab, portsCount, dockerCount, tunnelsCount]);

  return (
    <header className="h-12 px-4 bg-[#0d0f13] border-b border-white/[0.07] grid grid-cols-[1fr_auto_1fr] items-center select-none shrink-0 relative overflow-hidden">
      {/* Live Green Conduit Line spanning from Portify through tabs to right edge */}
      <div className="absolute left-[82px] right-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400/40 shadow-[0_0_8px_rgba(16,185,129,0.6)] pointer-events-none z-0" />

      {/* Brand (Origin point of the green line) */}
      <div className="justify-self-start flex items-center gap-2.5 z-10 bg-[#0d0f13] pr-2.5">
        <img 
          src="./icon.png" 
          alt="Portify" 
          className="w-5 h-5 rounded-[4px] object-contain shadow-sm" 
        />
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm tracking-tight text-zinc-100">
            Portify
          </span>
          <button
            type="button"
            onClick={() => {
              if (window.api && window.api.openExternal) {
                window.api.openExternal('https://github.com/mxskeen/portify');
              } else {
                window.open('https://github.com/mxskeen/portify', '_blank');
              }
            }}
            title="Created by @mxskeen — View GitHub Repository"
            className="text-[10px] font-mono text-zinc-500 hover:text-emerald-400 transition cursor-pointer"
          >
            by @mxskeen
          </button>
        </div>
        {/* Origin connector bead */}
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] -mr-1" />
      </div>

      {/* Segmented Navigation - with smooth sliding pill */}
      <div 
        ref={containerRef}
        className="justify-self-center relative z-10 flex items-center p-0.5 bg-[#14171d]/90 backdrop-blur-md border border-white/[0.08] rounded-lg shadow-sm"
      >
        {/* Smooth Gliding Indicator Pill */}
        {indicatorStyle.ready && (
          <div 
            className="absolute top-0.5 bottom-0.5 bg-[#222733] border border-white/[0.08] shadow-sm rounded-md transition-all duration-200 ease-out pointer-events-none"
            style={{ 
              left: `${indicatorStyle.left}px`, 
              width: `${indicatorStyle.width}px` 
            }}
          />
        )}

        <button
          data-tab="ports"
          onClick={() => setActiveTab('ports')}
          className={`relative z-10 flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            activeTab === 'ports'
              ? 'text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5 opacity-70" />
          <span>Ports</span>
          <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] transition-colors duration-150 ${
            activeTab === 'ports' ? 'bg-white/10 text-zinc-200' : 'bg-white/5 text-zinc-400'
          }`}>
            {portsCount}
          </span>
        </button>

        <button
          data-tab="docker"
          onClick={() => setActiveTab('docker')}
          className={`relative z-10 flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            activeTab === 'docker'
              ? 'text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Box className="w-3.5 h-3.5 opacity-70" />
          <span>Docker</span>
          <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] transition-colors duration-150 ${
            activeTab === 'docker' ? 'bg-white/10 text-zinc-200' : 'bg-white/5 text-zinc-400'
          }`}>
            {dockerCount}
          </span>
        </button>

        <button
          data-tab="tunnels"
          onClick={() => setActiveTab('tunnels')}
          className={`relative z-10 flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
            activeTab === 'tunnels'
              ? 'text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5 opacity-70" />
          <span>Tunnels</span>
          {tunnelsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {tunnelsCount}
            </span>
          )}
        </button>
      </div>

      {/* Global Actions on right */}
      <div className="justify-self-end flex items-center gap-1.5 z-10 bg-[#0d0f13] pl-2.5">
        {/* Auto Refresh Selector */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#14171d] border border-white/[0.06] text-xs text-zinc-400">
          <span className="text-[11px] font-mono text-zinc-400">Sync:</span>
          <select
            value={refreshRate}
            onChange={(e) => setRefreshRate(Number(e.target.value))}
            className="bg-transparent text-zinc-200 outline-none text-[11px] font-mono cursor-pointer"
          >
            <option value={0} className="bg-[#14171d] text-zinc-200">Manual</option>
            <option value={2000} className="bg-[#14171d] text-zinc-200">2s</option>
            <option value={5000} className="bg-[#14171d] text-zinc-200">5s</option>
            <option value={10000} className="bg-[#14171d] text-zinc-200">10s</option>
          </select>
        </div>

        {/* Manual Refresh button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh (Ctrl+R / ⌘R)"
          className="p-1.5 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-zinc-200' : ''}`} />
        </button>

        {/* GitHub Repo */}
        <button
          type="button"
          onClick={() => {
            if (window.api && window.api.openExternal) {
              window.api.openExternal('https://github.com/mxskeen/portify');
            } else {
              window.open('https://github.com/mxskeen/portify', '_blank');
            }
          }}
          title="GitHub — mxskeen/portify"
          className="p-1.5 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition"
        >
          <GithubIcon className="w-3.5 h-3.5" />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title="Preferences"
          className="p-1.5 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Minimize to Tray */}
        <button
          onClick={onMinimizeToTray}
          title="Minimize to System Tray"
          className="p-1.5 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
