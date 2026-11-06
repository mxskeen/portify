import React, { useState } from 'react';
import { ExternalLink, RefreshCw, Zap } from 'lucide-react';

export default function HealthBadge({ 
  health, 
  port, 
  onPing, 
  compact = false, 
  className = '' 
}) {
  const [isPinging, setIsPinging] = useState(false);

  if (!health) {
    return (
      <span 
        title="Checking health..."
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-600 bg-white/[0.02] border border-white/[0.04] ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" />
        {!compact && <span>pinging</span>}
      </span>
    );
  }

  const handleOpenBrowser = (e) => {
    e.stopPropagation();
    const url = `${health.protocol || 'http'}://localhost:${port}`;
    if (window.api && window.api.openExternal) {
      window.api.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleRecheck = async (e) => {
    e.stopPropagation();
    if (onPing && !isPinging) {
      setIsPinging(true);
      try {
        await onPing(port);
      } finally {
        setTimeout(() => setIsPinging(false), 300);
      }
    }
  };

  // 1. Alive HTTP / HTTPS
  if (health.alive && health.status) {
    const is2xx3xx = health.status >= 200 && health.status < 400;
    const is4xx = health.status >= 400 && health.status < 500;
    const is5xx = health.status >= 500;

    let badgeColors = 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25';
    let dotColor = 'bg-emerald-400 animate-pulse';

    if (is4xx) {
      badgeColors = 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/25';
      dotColor = 'bg-amber-400';
    } else if (is5xx) {
      badgeColors = 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25';
      dotColor = 'bg-red-400';
    }

    return (
      <div 
        onClick={handleOpenBrowser}
        title={`HTTP ${health.status} ${health.statusText || ''} (${health.latencyMs}ms roundtrip)\nClick to open in default browser\nRight-click to recheck`}
        onContextMenu={(e) => {
          e.preventDefault();
          handleRecheck(e);
        }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer select-none transition group ${badgeColors} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="font-semibold">{health.status}</span>
        <span className="opacity-60 text-[9px]">· {health.latencyMs}ms</span>
        <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition shrink-0 ml-0.5" />
      </div>
    );
  }

  // 2. Hung / Timeout
  if (health.type === 'timeout') {
    return (
      <div 
        onClick={handleRecheck}
        title="HTTP request timed out after 1000ms. Server process may be frozen, hung, or awaiting a dead lock.\nClick to re-ping."
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/25 cursor-pointer transition ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        <span>Hung (&gt;1s)</span>
        <RefreshCw className={`w-2.5 h-2.5 opacity-50 shrink-0 ml-0.5 ${isPinging ? 'animate-spin' : ''}`} />
      </div>
    );
  }

  // 3. Raw TCP / Database (PostgreSQL, Redis, MySQL, non-HTTP)
  if (health.type === 'raw-tcp') {
    return (
      <span 
        title={`Raw TCP socket active (${health.error || 'connected'}). Database or binary TCP protocol, not HTTP.`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-white/[0.03] border border-white/[0.06] select-none ${className}`}
      >
        <Zap className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
        <span>TCP</span>
      </span>
    );
  }

  // 4. Closed / Refused
  return (
    <span 
      title={`Port connection ${health.error || 'closed'}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-white/[0.02] border border-white/[0.04] select-none ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
      <span>Inactive</span>
    </span>
  );
}
