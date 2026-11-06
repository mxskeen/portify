import React, { useState } from 'react';
import { ExternalLink, RefreshCw, Zap, Lock } from 'lucide-react';

export default function HealthBadge({ 
  health, 
  port, 
  onPing, 
  compact = false, 
  className = '' 
}) {
  const [isPinging, setIsPinging] = useState(false);

  // If no health data, or if it is a non-web socket (system infrastructure, UDP, closed socket), don't show any badge
  if (!health || (!health.alive && health.isWeb === false && health.type !== 'raw-tcp')) {
    return null;
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

  // 1. Alive HTTP / HTTPS Server
  if (health.alive && health.status) {
    const is2xx3xx = health.status >= 200 && health.status < 400;
    const isAuth = health.status === 401 || health.status === 403;
    const is4xx = health.status >= 400 && health.status < 500 && !isAuth;
    const is5xx = health.status >= 500;

    let badgeColors = 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/25';
    let dotColor = 'bg-emerald-400 animate-pulse';

    if (isAuth) {
      badgeColors = 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/25';
      dotColor = 'bg-sky-400';
    } else if (is4xx) {
      badgeColors = 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/25';
      dotColor = 'bg-amber-400';
    } else if (is5xx) {
      badgeColors = 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25';
      dotColor = 'bg-red-400';
    }

    return (
      <div 
        onClick={handleOpenBrowser}
        title={
          isAuth 
            ? `HTTP ${health.status} Protected (${health.latencyMs}ms)\nServer active and requires authentication\nClick to open in browser`
            : `HTTP ${health.status} ${health.statusText || ''} (${health.latencyMs}ms roundtrip)\nClick to open in default browser\nRight-click to recheck`
        }
        onContextMenu={(e) => {
          e.preventDefault();
          handleRecheck(e);
        }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer select-none transition group ${badgeColors} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        {isAuth ? <Lock className="w-2.5 h-2.5 opacity-80" /> : null}
        <span className="font-semibold">{health.status}</span>
        <span className="opacity-60 text-[9px]">· {health.latencyMs}ms</span>
        <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition shrink-0 ml-0.5" />
      </div>
    );
  }

  // 2. Verified Dev/Web Server that is actually Hung / Timed Out
  if (health.type === 'timeout' && health.isWeb) {
    return (
      <div 
        onClick={handleRecheck}
        title="Web server timed out after 900ms. Process may be deadlocked, frozen, or awaiting a database lock.\nClick to re-ping."
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/25 cursor-pointer transition ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        <span>Hung (&gt;1s)</span>
        <RefreshCw className={`w-2.5 h-2.5 opacity-50 shrink-0 ml-0.5 ${isPinging ? 'animate-spin' : ''}`} />
      </div>
    );
  }

  // 3. Raw TCP (PostgreSQL, Redis, MySQL, active binary sockets)
  if (health.type === 'raw-tcp') {
    return (
      <span 
        title={`Active TCP service (${health.error || 'connected'}). Database or binary TCP connection.`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-white/[0.03] border border-white/[0.06] select-none ${className}`}
      >
        <Zap className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
        <span>TCP</span>
      </span>
    );
  }

  return null;
}
