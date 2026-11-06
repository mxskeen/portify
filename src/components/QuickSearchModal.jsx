import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronRight, Globe } from 'lucide-react';
import HealthBadge from './HealthBadge';

export default function QuickSearchModal({
  isOpen,
  onClose,
  ports = [],
  tunnels = [],
  healthMap = new Map(),
  searchQuery = '',
  onUpdateSearch,
  onSelectPort
}) {
  const [query, setQuery] = useState(searchQuery || '');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Sync external search query and focus immediately on open
  useEffect(() => {
    if (isOpen) {
      setQuery(searchQuery || '');
      setSelectedIndex(0);
      // Immediate synchronous focus with microtask fallback for zero lag
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
      requestAnimationFrame(() => {
        if (inputRef.current) inputRef.current.focus();
      });
    }
  }, [isOpen]);

  // Handle escape & shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const tunnelMap = useMemo(() => {
    const map = new Map();
    for (const t of tunnels) {
      map.set(Number(t.port), t);
    }
    return map;
  }, [tunnels]);

  // Filter ports based on query
  const filteredPorts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ports.slice(0, 30); // show top 30 if empty

    return ports.filter((p) => {
      const portStr = String(p.port);
      const name = (p.name || '').toLowerCase();
      const origin = (p.origin || '').toLowerCase();
      const pid = String(p.pid || '');
      const user = (p.user || '').toLowerCase();
      const proto = (p.protocol || '').toLowerCase();
      const container = (p.dockerContainer?.name || '').toLowerCase();

      return (
        portStr.includes(q) ||
        name.includes(q) ||
        origin.includes(q) ||
        pid.includes(q) ||
        user.includes(q) ||
        proto.includes(q) ||
        container.includes(q)
      );
    });
  }, [ports, query]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const handleInputChange = (val) => {
    setQuery(val);
  };

  const handleClear = () => {
    setQuery('');
    if (inputRef.current) inputRef.current.focus();
  };

  const handleClose = () => {
    if (onUpdateSearch) {
      onUpdateSearch(query);
    }
    onClose();
  };

  const handleSelect = (port) => {
    if (onUpdateSearch) {
      onUpdateSearch(query);
    }
    onSelectPort(port);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredPorts.length ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredPorts.length > 0 && filteredPorts[selectedIndex]) {
        handleSelect(filteredPorts[selectedIndex]);
      }
    }
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/75 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-white/[0.1] bg-[#111317] shadow-2xl overflow-hidden flex flex-col cursor-default"
      >
        {/* Search Input Bar */}
        <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-3 bg-[#13161c]">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search port (e.g. 3000), process name, or PID..."
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none font-mono tracking-tight"
          />

          {query && (
            <button
              onClick={handleClear}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition text-xs"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] font-mono text-zinc-400 shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto divide-y divide-white/[0.03] p-1.5 select-none"
        >
          {filteredPorts.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-mono">
              No active ports or processes found matching "{query}"
            </div>
          ) : (
            filteredPorts.map((p, idx) => {
              const isSelected = idx === selectedIndex;
              const hasTunnel = tunnelMap.has(Number(p.port));
              const isDevOrigin = p.origin && (p.origin.startsWith('~/') || p.origin.startsWith('.'));

              return (
                <div
                  key={`${p.port}-${p.protocol}-${p.pid || idx}`}
                  onClick={() => handleSelect(p)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-3 py-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-white/[0.08] border border-white/[0.1] text-zinc-100'
                      : 'hover:bg-white/[0.03] text-zinc-300 border border-transparent'
                  }`}
                >
                  {/* Left: Port & Protocol */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Status Dot Indicator */}
                    <div className="shrink-0 flex items-center">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          p.isDocker
                            ? 'bg-sky-400'
                            : isDevOrigin
                            ? 'bg-emerald-400'
                            : 'bg-zinc-600'
                        }`}
                      />
                    </div>

                    <div className="min-w-16 font-mono text-xs tabular-nums shrink-0 flex items-center gap-1.5">
                      <span className="font-semibold text-zinc-100">{p.port}</span>
                      <span className="text-[10px] text-zinc-500">{p.protocol}</span>
                      <HealthBadge 
                        health={healthMap.get(String(p.port)) || healthMap.get(p.port)} 
                        port={p.port} 
                        compact 
                      />
                    </div>

                    {/* Process Info */}
                    <div className="min-w-0 flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs text-zinc-200 truncate">
                          {p.name || 'Process'}
                        </span>

                        {p.isDocker ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-sky-500/10 text-sky-300 border border-sky-500/20">
                            docker
                          </span>
                        ) : isDevOrigin ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            dev
                          </span>
                        ) : null}

                        {hasTunnel && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                            <Globe className="w-2.5 h-2.5" /> tunnel
                          </span>
                        )}
                      </div>

                      {/* Origin breadcrumb / Command */}
                      <span className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                        {p.origin || (p.command ? p.command.slice(0, 50) : `PID ${p.pid || '—'}`)}
                      </span>
                    </div>
                  </div>

                  {/* Right: RAM, CPU, PID & Arrow */}
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    <div className="flex flex-col items-end text-[11px] font-mono text-zinc-400">
                      <span>{p.memoryFormatted || '—'}</span>
                      <span className="text-[10px] text-zinc-500">
                        {p.pid ? `PID ${p.pid}` : p.user || '—'}
                      </span>
                    </div>

                    <ChevronRight
                      className={`w-3.5 h-3.5 transition ${
                        isSelected ? 'text-zinc-300 translate-x-0.5' : 'text-zinc-600'
                      }`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2 border-t border-white/[0.06] bg-[#0c0e12] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-zinc-300">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-zinc-300">↵</kbd> inspect
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-zinc-300">ESC</kbd> dismiss
            </span>
          </div>

          <span>
            {filteredPorts.length} {filteredPorts.length === 1 ? 'match' : 'matches'}
          </span>
        </div>
      </div>
    </div>
  );
}
