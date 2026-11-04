import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Terminal, 
  Trash2, 
  Globe, 
  Copy, 
  ExternalLink, 
  Square, 
  Check, 
  Clock, 
  Info,
  Server,
  Box,
  Flame,
  Database,
  Layers,
  ArrowUpDown
} from 'lucide-react';

export default function PortTable({ 
  ports = [], 
  tunnels = [], 
  onKillPort, 
  onStartTunnel, 
  onStopTunnel, 
  onInspectProcess,
  onCopyText
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortField, setSortField] = useState('port');
  const [sortAsc, setSortAsc] = useState(true);
  const [killingPort, setKillingPort] = useState(null);
  const [copiedPort, setCopiedPort] = useState(null);

  const tunnelMap = useMemo(() => {
    const map = new Map();
    for (const t of tunnels) {
      map.set(Number(t.port), t);
    }
    return map;
  }, [tunnels]);

  const getCategory = (p) => {
    if (p.isDocker) return 'docker';
    const name = (p.name || '').toLowerCase();
    const cmd = (p.command || '').toLowerCase();

    if (name.includes('postgres') || name.includes('mysql') || name.includes('redis') || name.includes('mongo')) {
      return 'database';
    }
    if (
      name.includes('node') || name.includes('vite') || name.includes('next') || 
      name.includes('python') || name.includes('flask') || name.includes('uvicorn') ||
      name.includes('go') || name.includes('cargo') || name.includes('bun') || name.includes('deno') ||
      cmd.includes('dev') || cmd.includes('serve')
    ) {
      return 'dev';
    }
    if (p.isSystem || p.user === 'root' || p.port < 1024) {
      return 'system';
    }
    return 'other';
  };

  const filteredPorts = useMemo(() => {
    return ports
      .filter((p) => {
        const s = search.trim().toLowerCase();
        if (s) {
          const match = 
            p.port.toString().includes(s) ||
            (p.name && p.name.toLowerCase().includes(s)) ||
            (p.command && p.command.toLowerCase().includes(s)) ||
            (p.pid && p.pid.toString().includes(s)) ||
            (p.user && p.user.toLowerCase().includes(s));
          if (!match) return false;
        }

        const cat = getCategory(p);
        if (category === 'dev') return cat === 'dev';
        if (category === 'docker') return cat === 'docker';
        if (category === 'database') return cat === 'database';
        if (category === 'system') return cat === 'system';
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (sortField === 'memory') {
          valA = a.memoryBytes || 0;
          valB = b.memoryBytes || 0;
        } else if (sortField === 'uptime') {
          valA = a.uptimeSec || 0;
          valB = b.uptimeSec || 0;
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [ports, search, category, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleCopy = (text, port) => {
    onCopyText(text);
    setCopiedPort(port);
    setTimeout(() => setCopiedPort(null), 1800);
  };

  const handleKill = async (portObj) => {
    setKillingPort(portObj.port);
    try {
      await onKillPort(portObj);
    } finally {
      setKillingPort(null);
    }
  };

  // Compute total memory of filtered items
  const totalMemBytes = filteredPorts.reduce((acc, p) => acc + (p.memoryBytes || 0), 0);
  const totalMemFormatted = totalMemBytes > 0
    ? (totalMemBytes / (1024 * 1024)).toFixed(1) + ' MB'
    : '0 MB';

  return (
    <div className="flex flex-col h-full bg-[#090a0d]">
      {/* Sub-toolbar: Search & Category Pills */}
      <div className="px-4 py-2.5 bg-[#0e1014] border-b border-white/[0.06] flex items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search port (e.g. 8000), process, or PID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#14171d] border border-white/[0.07] rounded-md pl-8 pr-3 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/20 transition font-mono"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1 text-xs">
          {[
            { id: 'all', label: 'All' },
            { id: 'dev', label: 'Dev' },
            { id: 'docker', label: 'Docker' },
            { id: 'database', label: 'Databases' },
            { id: 'system', label: 'System' }
          ].map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCategory(item.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-white/10 text-zinc-100 border border-white/[0.12]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Inline summary count */}
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-zinc-500 shrink-0">
          <span>{filteredPorts.length} {filteredPorts.length === 1 ? 'port' : 'ports'}</span>
          <span>·</span>
          <span>{totalMemFormatted} RSS</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-[#0d0f13] border-b border-white/[0.06] text-zinc-400 text-[11px] font-mono select-none">
            <tr>
              <th 
                className="py-2.5 px-4 cursor-pointer hover:text-zinc-200"
                onClick={() => handleSort('port')}
              >
                <div className="flex items-center gap-1">
                  <span>PORT</span>
                  {sortField === 'port' && (
                    <span className="text-zinc-300">{sortAsc ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>

              <th 
                className="py-2.5 px-4 cursor-pointer hover:text-zinc-200"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  <span>PROCESS</span>
                  {sortField === 'name' && (
                    <span className="text-zinc-300">{sortAsc ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>

              <th className="py-2.5 px-4">PID · USER</th>

              <th 
                className="py-2.5 px-4 cursor-pointer hover:text-zinc-200"
                onClick={() => handleSort('uptime')}
              >
                <div className="flex items-center gap-1">
                  <span>UPTIME</span>
                  {sortField === 'uptime' && (
                    <span className="text-zinc-300">{sortAsc ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>

              <th 
                className="py-2.5 px-4 cursor-pointer hover:text-zinc-200"
                onClick={() => handleSort('memory')}
              >
                <div className="flex items-center gap-1">
                  <span>RAM · CPU</span>
                  {sortField === 'memory' && (
                    <span className="text-zinc-300">{sortAsc ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>

              <th className="py-2.5 px-4 text-center">TUNNEL</th>
              <th className="py-2.5 px-4 text-right">ACTION</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/[0.04]">
            {filteredPorts.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-20 text-zinc-500">
                  <div className="w-8 h-8 rounded-lg border border-white/[0.08] flex items-center justify-center mx-auto mb-2 text-zinc-600">
                    <Server className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-zinc-400 font-medium">No active listening ports found.</p>
                  <p className="text-[11px] text-zinc-600 mt-0.5">Start a local server or clear the filter query.</p>
                </td>
              </tr>
            ) : (
              filteredPorts.map((p) => {
                const tunnel = tunnelMap.get(p.port);
                const isTunnelActive = tunnel && tunnel.status === 'active';
                const isTunnelStarting = tunnel && tunnel.status === 'starting';
                const isKilling = killingPort === p.port;
                const cat = getCategory(p);

                return (
                  <tr 
                    key={`${p.protocol}-${p.port}-${p.pid || 'x'}`}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Port & Address */}
                    <td className="py-2.5 px-4 font-mono">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-zinc-100 text-sm">
                          {p.port}
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase">
                          {p.protocol}
                        </span>
                        <span className="text-[10px] text-zinc-600 truncate max-w-[100px]" title={p.ip}>
                          {p.ip}
                        </span>
                      </div>
                    </td>

                    {/* Process */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 max-w-[240px]">
                        <span className="font-medium text-zinc-200 truncate" title={p.name}>
                          {p.name || 'Unknown'}
                        </span>
                        {p.isDocker ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                            docker
                          </span>
                        ) : cat === 'dev' ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
                            dev
                          </span>
                        ) : null}
                      </div>
                      {p.command && (
                        <div className="text-[11px] font-mono text-zinc-500 truncate max-w-[260px] mt-0.5" title={p.command}>
                          {p.command}
                        </div>
                      )}
                    </td>

                    {/* PID · User */}
                    <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-400">
                      <div>
                        {p.pid ? `PID ${p.pid}` : (p.isDocker ? 'docker' : 'system')}
                      </div>
                      <div className="text-zinc-600 text-[10px]">
                        {p.user || '—'}
                      </div>
                    </td>

                    {/* Uptime */}
                    <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-300">
                      <div>{p.uptimeFormatted || '—'}</div>
                      {p.startTime && (
                        <div className="text-[10px] text-zinc-600 truncate max-w-[130px]" title={p.startTime}>
                          {p.startTime}
                        </div>
                      )}
                    </td>

                    {/* RAM · CPU */}
                    <td className="py-2.5 px-4 font-mono text-[11px] tabular-nums">
                      <span className="text-zinc-200">{p.memoryFormatted}</span>
                      {p.cpu > 0 && (
                        <span className="text-zinc-500 ml-1.5 text-[10px]">{p.cpu}% CPU</span>
                      )}
                    </td>

                    {/* Cloudflare Tunnel */}
                    <td className="py-2.5 px-4 text-center">
                      {isTunnelActive ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#12151b] border border-emerald-500/30 text-emerald-300 text-[11px] font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="truncate max-w-[110px]" title={tunnel.url}>
                            {tunnel.url.replace('https://', '')}
                          </span>
                          <button
                            onClick={() => handleCopy(tunnel.url, p.port)}
                            title="Copy Tunnel URL"
                            className="p-0.5 hover:text-white transition"
                          >
                            {copiedPort === p.port ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                          </button>
                          <button
                            onClick={() => window.api.openExternal(tunnel.url)}
                            title="Open in Browser"
                            className="p-0.5 hover:text-white transition"
                          >
                            <ExternalLink className="w-3 h-3 text-zinc-400" />
                          </button>
                          <button
                            onClick={() => onStopTunnel(p.port)}
                            title="Stop Tunnel"
                            className="p-0.5 hover:text-red-400 transition ml-0.5"
                          >
                            <Square className="w-3 h-3 text-zinc-500" />
                          </button>
                        </div>
                      ) : isTunnelStarting ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-zinc-400">
                          <Globe className="w-3 h-3 animate-spin text-zinc-400" />
                          <span>connecting...</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => onStartTunnel(p.port)}
                          title="Expose via Cloudflare Tunnel"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] text-zinc-300 hover:text-zinc-100 text-[11px] font-mono transition"
                        >
                          <Globe className="w-3 h-3 text-zinc-400" />
                          <span>Tunnel</span>
                        </button>
                      )}
                    </td>

                    {/* Actions: Info & Kill */}
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onInspectProcess(p)}
                          title="Process details"
                          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleKill(p)}
                          disabled={isKilling}
                          title={p.isDocker ? "Kill container" : "Force kill process"}
                          className="px-2 py-1 rounded text-[11px] font-mono text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                        >
                          {isKilling ? 'Killing...' : 'Kill'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
