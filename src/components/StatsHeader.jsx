import React from 'react';
import { 
  RefreshCw, 
  Settings, 
  Minus, 
  Radio,
  Box,
  Globe,
  SlidersHorizontal
} from 'lucide-react';

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
  return (
    <header className="h-12 px-4 bg-[#0d0f13] border-b border-white/[0.07] flex items-center justify-between select-none shrink-0">
      {/* Brand & Live status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-zinc-200">
            <Radio className="w-3 h-3 text-zinc-300" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-zinc-100">
            Portify
          </span>
        </div>

        <div className="h-3 w-[1px] bg-white/[0.1]" />

        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>live</span>
        </div>
      </div>

      {/* Segmented Navigation (macOS / Agent Orchestrator style) */}
      <div className="flex items-center p-0.5 bg-[#14171d] border border-white/[0.06] rounded-lg">
        <button
          onClick={() => setActiveTab('ports')}
          className={`flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-all ${
            activeTab === 'ports'
              ? 'bg-[#222733] text-zinc-100 shadow-sm border border-white/[0.08]'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
          }`}
        >
          <Radio className="w-3.5 h-3.5 opacity-70" />
          <span>Ports</span>
          <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
            activeTab === 'ports' ? 'bg-white/10 text-zinc-200' : 'bg-white/5 text-zinc-400'
          }`}>
            {portsCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('docker')}
          className={`flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-all ${
            activeTab === 'docker'
              ? 'bg-[#222733] text-zinc-100 shadow-sm border border-white/[0.08]'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
          }`}
        >
          <Box className="w-3.5 h-3.5 opacity-70" />
          <span>Docker</span>
          <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
            activeTab === 'docker' ? 'bg-white/10 text-zinc-200' : 'bg-white/5 text-zinc-400'
          }`}>
            {dockerCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('tunnels')}
          className={`flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-all ${
            activeTab === 'tunnels'
              ? 'bg-[#222733] text-zinc-100 shadow-sm border border-white/[0.08]'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
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

      {/* Global Actions */}
      <div className="flex items-center gap-1.5">
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
          title="Refresh scan (⌘R)"
          className="p-1.5 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-zinc-200' : ''}`} />
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
