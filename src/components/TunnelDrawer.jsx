import React, { useState } from 'react';
import { 
  Globe, 
  Copy, 
  ExternalLink, 
  Square, 
  Check, 
  Terminal, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';

export default function TunnelDrawer({ tunnels = [], onStopTunnel, onCopyText }) {
  const [copiedPort, setCopiedPort] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState({});

  const handleCopy = (text, port) => {
    onCopyText(text);
    setCopiedPort(port);
    setTimeout(() => setCopiedPort(null), 1800);
  };

  const toggleLogs = (port) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [port]: !prev[port]
    }));
  };

  return (
    <div className="flex-1 overflow-auto p-5 bg-[#090a0d]">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Globe className="w-4 h-4 text-zinc-400" />
            Cloudflare Tunnels
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Public HTTPS URLs created instantly via <span className="font-mono text-zinc-400">cloudflared</span>.
          </p>
        </div>

        <div className="text-[11px] font-mono text-zinc-400">
          {tunnels.filter((t) => t.status === 'active').length} active
        </div>
      </div>

      {tunnels.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] p-12 text-center bg-[#0d0f13]">
          <Globe className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-xs font-semibold text-zinc-300">No Active Tunnels</h3>
          <p className="text-[11px] text-zinc-500 max-w-sm mx-auto mt-1">
            Click the <span className="font-mono text-zinc-300">Tunnel</span> button next to any listening port or container to expose it to the internet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tunnels.map((tunnel) => {
            const isActive = tunnel.status === 'active';
            const isStarting = tunnel.status === 'starting';
            const showLogs = expandedLogs[tunnel.port];

            return (
              <div 
                key={tunnel.port}
                className="rounded-lg border border-white/[0.07] bg-[#0e1014] overflow-hidden"
              >
                <div className="p-3 flex items-center justify-between gap-4">
                  {/* Left */}
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-zinc-200 bg-white/[0.05] px-2 py-0.5 rounded border border-white/[0.08]">
                      Port {tunnel.port}
                    </span>

                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? 'bg-emerald-500' : isStarting ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
                    }`} />

                    {tunnel.url ? (
                      <a 
                        href={tunnel.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-zinc-300 hover:text-white hover:underline truncate max-w-md"
                      >
                        {tunnel.url}
                      </a>
                    ) : (
                      <span className="text-[11px] font-mono text-zinc-500">
                        {tunnel.error || 'Initializing quick tunnel...'}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {tunnel.url && (
                      <>
                        <button
                          onClick={() => handleCopy(tunnel.url, tunnel.port)}
                          className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-mono text-zinc-300 hover:text-white transition flex items-center gap-1"
                        >
                          {copiedPort === tunnel.port ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                          <span>{copiedPort === tunnel.port ? 'Copied' : 'Copy'}</span>
                        </button>

                        <button
                          onClick={() => window.api.openExternal(tunnel.url)}
                          className="p-1 rounded hover:bg-white/[0.05] text-zinc-400 hover:text-white transition"
                          title="Open URL in Browser"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => toggleLogs(tunnel.port)}
                      className="p-1 rounded hover:bg-white/[0.05] text-zinc-500 hover:text-zinc-300 transition"
                      title="Logs"
                    >
                      {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => onStopTunnel(tunnel.port)}
                      className="px-2 py-1 rounded text-[11px] font-mono text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition"
                    >
                      Stop
                    </button>
                  </div>
                </div>

                {/* Logs */}
                {showLogs && (
                  <div className="border-t border-white/[0.06] bg-black/50 p-3 font-mono text-[10px] text-zinc-400 max-h-40 overflow-auto select-text">
                    <div className="text-zinc-600 mb-1 flex items-center gap-1">
                      <Terminal className="w-2.5 h-2.5" />
                      <span>cloudflared output:</span>
                    </div>
                    {tunnel.logs && tunnel.logs.length > 0 ? (
                      tunnel.logs.map((log, i) => (
                        <div key={i} className="leading-tight py-0.2 break-all">
                          {log}
                        </div>
                      ))
                    ) : (
                      <div className="text-zinc-600">No logs yet.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
