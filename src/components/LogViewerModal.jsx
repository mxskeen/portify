import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Terminal, 
  X, 
  Search, 
  Copy, 
  Check, 
  Trash2, 
  Download, 
  Pause, 
  Play, 
  ArrowDown, 
  WrapText, 
  FolderOpen, 
  AlertCircle, 
  RefreshCw 
} from 'lucide-react';

function parseAnsi(text) {
  if (!text) return [{ text: '', classes: [] }];
  const parts = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentClasses = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), classes: [...currentClasses] });
    }
    const code = match[1];
    if (!code || code === '0') {
      currentClasses = [];
    } else {
      const codes = code.split(';');
      for (const c of codes) {
        if (c === '1') currentClasses.push('font-bold text-white');
        else if (c === '2') currentClasses.push('opacity-60');
        else if (c === '31') currentClasses.push('text-red-400');
        else if (c === '32') currentClasses.push('text-emerald-400');
        else if (c === '33') currentClasses.push('text-amber-400');
        else if (c === '34') currentClasses.push('text-blue-400');
        else if (c === '35') currentClasses.push('text-purple-400');
        else if (c === '36') currentClasses.push('text-cyan-400');
        else if (c === '90') currentClasses.push('text-zinc-500');
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), classes: [...currentClasses] });
  }

  return parts.length > 0 ? parts : [{ text, classes: [] }];
}

function HighlightedText({ text, query, baseClasses = '' }) {
  if (!query || !text) {
    return <span className={baseClasses}>{text}</span>;
  }

  const parts = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let startIndex = 0;
  let matchIndex;

  while ((matchIndex = lowerText.indexOf(lowerQuery, startIndex)) !== -1) {
    if (matchIndex > startIndex) {
      parts.push({
        text: text.slice(startIndex, matchIndex),
        isMatch: false
      });
    }
    parts.push({
      text: text.slice(matchIndex, matchIndex + query.length),
      isMatch: true
    });
    startIndex = matchIndex + query.length;
  }

  if (startIndex < text.length) {
    parts.push({
      text: text.slice(startIndex),
      isMatch: false
    });
  }

  return (
    <span className={baseClasses}>
      {parts.map((part, i) => (
        part.isMatch ? (
          <mark key={i} className="bg-amber-400/30 text-amber-200 px-0.5 rounded font-semibold">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      ))}
    </span>
  );
}

export default function LogViewerModal({ target, onClose, onCopyText }) {
  const [sources, setSources] = useState([]);
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [customPath, setCustomPath] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState({ status: 'connecting', message: 'Detecting log sources...' });
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all'); // 'all' | 'error' | 'warn' | 'info'
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const containerRef = useRef(null);
  const streamIdRef = useRef(`stream-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const currentStreamId = streamIdRef.current;

  // Keybindings (Esc to close)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Connect and start log streaming
  const startLogging = useCallback(async (sourceId = null, customFilePath = null) => {
    if (!window.api || !window.api.startLogStream) {
      setStatus({ status: 'error', message: 'Portify desktop API not available' });
      return;
    }

    setStatus({ status: 'connecting', message: 'Starting stream...' });

    try {
      const res = await window.api.startLogStream({
        streamId: currentStreamId,
        target,
        sourceId,
        customFilePath
      });

      if (res) {
        if (res.sources) setSources(res.sources);
        if (res.activeSource) setActiveSourceId(res.activeSource.id);
        if (res.initialLogs && res.initialLogs.length > 0) {
          setLogs(res.initialLogs);
        }
      }
    } catch (err) {
      setStatus({ status: 'error', message: err.message });
    }
  }, [currentStreamId, target]);

  // Initial source detection and streaming start
  useEffect(() => {
    startLogging();

    // Listen to incoming log chunks
    const unsubData = window.api?.onLogData?.((data) => {
      if (data.streamId !== currentStreamId) return;
      if (isPausedRef.current) return;

      setLogs((prev) => {
        const next = [...prev, ...data.lines];
        if (next.length > 2000) {
          return next.slice(next.length - 2000);
        }
        return next;
      });
    });

    // Listen to status changes
    const unsubStatus = window.api?.onLogStatus?.((newStatus) => {
      if (newStatus.streamId !== currentStreamId) return;
      setStatus(newStatus);
      if (newStatus.source) {
        setActiveSourceId(newStatus.source.id);
      }
    });

    return () => {
      if (unsubData) unsubData();
      if (unsubStatus) unsubStatus();
      if (window.api?.stopLogStream) {
        window.api.stopLogStream(currentStreamId);
      }
    };
  }, [currentStreamId, startLogging]);

  // Handle switching sources
  const handleSelectSource = (src) => {
    if (src.type === 'custom') {
      setShowCustomInput(true);
      return;
    }
    setShowCustomInput(false);
    setActiveSourceId(src.id);
    setLogs([]);
    startLogging(src.id);
  };

  const handleApplyCustomPath = (e) => {
    e.preventDefault();
    if (!customPath.trim()) return;
    setLogs([]);
    startLogging(null, customPath.trim());
  };

  // Scroll to bottom logic
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setUserScrolledUp(false);
    }
  }, []);

  useEffect(() => {
    if (autoScroll && !userScrolledUp && !isPaused) {
      scrollToBottom();
    }
  }, [logs, autoScroll, userScrolledUp, isPaused, scrollToBottom]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isUp = distanceFromBottom > 50;
    setUserScrolledUp(isUp);
  };

  // Filter logs by search query and log level
  const filteredLogs = useMemo(() => {
    let result = logs;

    if (levelFilter !== 'all') {
      result = result.filter((line) => {
        const lower = line.toLowerCase();
        if (levelFilter === 'error') {
          return lower.includes('error') || lower.includes('err') || lower.includes('failed') || lower.includes('fatal');
        }
        if (levelFilter === 'warn') {
          return lower.includes('warn') || lower.includes('warning');
        }
        if (levelFilter === 'info') {
          return lower.includes('info') || lower.includes('notice') || lower.includes('ready') || lower.includes('listening');
        }
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((line) => line.toLowerCase().includes(q));
    }

    return result;
  }, [logs, levelFilter, searchQuery]);

  const handleCopyAll = () => {
    const text = filteredLogs.join('\n');
    if (onCopyText) {
      onCopyText(text);
    } else {
      navigator.clipboard.writeText(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = filteredLogs.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `${target.name || 'server'}-port${target.port || 'log'}-${Date.now()}.log`;
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setLogs([]);
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/75 backdrop-blur-[3px] cursor-pointer animate-in fade-in duration-150"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl h-[88vh] rounded-xl border border-white/[0.1] bg-[#0c0e12] shadow-2xl flex flex-col overflow-hidden cursor-default"
      >
        {/* Top Header */}
        <div className="px-4 py-2.5 bg-[#11141a] border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Terminal className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-zinc-100 truncate">
                  {target.title || target.name || 'Server Logs'}
                </span>
                {target.port && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/[0.08] text-zinc-300 shrink-0">
                    :{target.port}
                  </span>
                )}
                {target.isDocker && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-blue-500/15 border border-blue-500/25 text-blue-400 shrink-0">
                    docker
                  </span>
                )}
                {target.pid && (
                  <span className="font-mono text-[10px] text-zinc-500 hidden sm:inline">
                    PID {target.pid}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 truncate max-w-md">
                {target.origin || target.cwd || target.command || target.dockerContainer || 'Live Stream'}
              </div>
            </div>
          </div>

          {/* Top Right Controls & Close */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Status indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 border border-white/[0.06] text-[11px] font-mono">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                isPaused 
                  ? 'bg-amber-400' 
                  : status.status === 'streaming' 
                    ? 'bg-emerald-400 animate-pulse' 
                    : status.status === 'connecting'
                      ? 'bg-sky-400 animate-ping'
                      : status.status === 'error'
                        ? 'bg-red-500'
                        : 'bg-zinc-500'
              }`} />
              <span className="text-zinc-300 capitalize">
                {isPaused ? 'Paused' : status.status || 'Live'}
              </span>
            </div>

            <button
              onClick={onClose}
              title="Close (Esc)"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sources Bar */}
        {sources.length > 0 && (
          <div className="px-4 py-1.5 bg-[#0e1015] border-b border-white/[0.06] flex items-center justify-between gap-3 overflow-x-auto text-xs shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider shrink-0 mr-1">
                Source:
              </span>
              {sources.map((src) => {
                const isSelected = activeSourceId === src.id;
                return (
                  <button
                    key={src.id}
                    onClick={() => handleSelectSource(src)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition flex items-center gap-1.5 shrink-0 ${
                      isSelected
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium'
                        : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{src.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom file path toggle */}
            {!showCustomInput && (
              <button
                onClick={() => setShowCustomInput(true)}
                className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition shrink-0"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Specify file</span>
              </button>
            )}
          </div>
        )}

        {/* Custom file input bar if toggled */}
        {showCustomInput && (
          <form 
            onSubmit={handleApplyCustomPath}
            className="px-4 py-2 bg-[#12151c] border-b border-white/[0.06] flex items-center gap-2 shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="Enter absolute log file path (e.g. /var/log/server.log or ~/project/app.log)..."
              className="flex-1 bg-black/40 border border-white/[0.1] rounded-md px-2.5 py-1 text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-emerald-500/50"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition shrink-0"
            >
              Stream File
            </button>
            <button
              type="button"
              onClick={() => setShowCustomInput(false)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Filter and Control Toolbar */}
        <div className="px-4 py-2 bg-[#0e1015] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {/* Left: Search input & Level filters */}
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            {/* Search Input */}
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter logs (Ctrl+F)..."
                className="w-full pl-8 pr-7 py-1 rounded-md bg-black/50 border border-white/[0.08] text-xs font-mono text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500/50 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Level filters */}
            <div className="flex items-center p-0.5 bg-black/40 border border-white/[0.06] rounded-md text-[11px] font-mono">
              <button
                onClick={() => setLevelFilter('all')}
                className={`px-2 py-0.5 rounded transition ${
                  levelFilter === 'all' ? 'bg-white/10 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setLevelFilter('error')}
                className={`px-2 py-0.5 rounded transition ${
                  levelFilter === 'error' ? 'bg-red-500/20 text-red-300 font-semibold border border-red-500/30' : 'text-zinc-400 hover:text-red-400'
                }`}
              >
                Errors
              </button>
              <button
                onClick={() => setLevelFilter('warn')}
                className={`px-2 py-0.5 rounded transition ${
                  levelFilter === 'warn' ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30' : 'text-zinc-400 hover:text-amber-400'
                }`}
              >
                Warn
              </button>
              <button
                onClick={() => setLevelFilter('info')}
                className={`px-2 py-0.5 rounded transition ${
                  levelFilter === 'info' ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30' : 'text-zinc-400 hover:text-emerald-400'
                }`}
              >
                Info
              </button>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Pause / Resume */}
            <button
              onClick={() => setIsPaused((prev) => !prev)}
              title={isPaused ? "Resume live streaming" : "Pause live stream"}
              className={`px-2.5 py-1 rounded-md text-xs font-mono flex items-center gap-1.5 transition ${
                isPaused 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.06]'
              }`}
            >
              {isPaused ? <Play className="w-3 h-3 text-amber-300" /> : <Pause className="w-3 h-3 text-zinc-400" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => {
                const next = !autoScroll;
                setAutoScroll(next);
                if (next) scrollToBottom();
              }}
              title={autoScroll ? "Auto-scroll ON (click to disable)" : "Auto-scroll OFF (click to enable)"}
              className={`p-1.5 rounded-md border text-xs font-mono transition ${
                autoScroll 
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                  : 'bg-white/[0.04] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

            {/* Wrap text toggle */}
            <button
              onClick={() => setWrapLines((prev) => !prev)}
              title={wrapLines ? "Disable line wrap" : "Enable line wrap"}
              className={`p-1.5 rounded-md border text-xs font-mono transition ${
                wrapLines 
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' 
                  : 'bg-white/[0.04] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>

            {/* Clear logs */}
            <button
              onClick={handleClear}
              title="Clear visible logs"
              className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Copy all logs */}
            <button
              onClick={handleCopyAll}
              title="Copy filtered logs to clipboard"
              className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Download logs */}
            <button
              onClick={handleDownload}
              title="Download logs (.log)"
              className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 transition"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Main Terminal Viewport */}
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto bg-[#07080b] p-3 font-mono text-xs select-text relative"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500">
              {status.status === 'connecting' ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mb-3" />
                  <p className="text-xs text-zinc-300 font-medium">Connecting to live stream...</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-sm">{status.message}</p>
                </>
              ) : status.status === 'error' ? (
                <>
                  <AlertCircle className="w-6 h-6 text-red-400 mb-3" />
                  <p className="text-xs text-red-300 font-medium">Stream Error</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-md">{status.message}</p>
                </>
              ) : (
                <>
                  <Terminal className="w-6 h-6 text-zinc-600 mb-3" />
                  <p className="text-xs text-zinc-400 font-medium">No log entries matching filter.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Waiting for output from {target.name || 'server'}...
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.02]">
              {filteredLogs.map((rawLine, idx) => {
                const lower = rawLine.toLowerCase();
                const isError = lower.includes('error') || lower.includes('failed') || lower.includes('fatal') || lower.includes('err ');
                const isWarn = lower.includes('warn') || lower.includes('warning');
                const isInfo = lower.includes('listening') || lower.includes('ready') || lower.includes('compiled') || lower.includes('200 ok');
                const parsedParts = parseAnsi(rawLine);

                return (
                  <div 
                    key={idx}
                    className={`py-0.5 px-1.5 flex items-start gap-2 hover:bg-white/[0.02] rounded transition-colors group ${
                      wrapLines ? 'break-all' : 'whitespace-pre overflow-x-auto'
                    } ${
                      isError ? 'bg-red-500/[0.04]' : isWarn ? 'bg-amber-500/[0.03]' : ''
                    }`}
                  >
                    {/* Line number */}
                    <span className="select-none text-zinc-600 group-hover:text-zinc-500 text-[10px] w-9 shrink-0 text-right pr-2 tabular-nums font-mono pt-0.5">
                      {idx + 1}
                    </span>

                    {/* Log text with ANSI & highlighting */}
                    <div className="flex-1 min-w-0 font-mono text-[11px] text-zinc-300">
                      {parsedParts.map((part, pIdx) => (
                        <HighlightedText
                          key={pIdx}
                          text={part.text}
                          query={searchQuery}
                          baseClasses={`${part.classes.join(' ')} ${
                            isError && part.classes.length === 0 ? 'text-red-300' :
                            isWarn && part.classes.length === 0 ? 'text-amber-300' :
                            isInfo && part.classes.length === 0 ? 'text-emerald-300' : ''
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Jump to latest floating button when scrolled up */}
          {userScrolledUp && (
            <button
              onClick={scrollToBottom}
              className="sticky bottom-4 right-4 ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold shadow-xl transition animate-in fade-in slide-in-from-bottom-2 cursor-pointer z-10"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Scroll to latest</span>
            </button>
          )}
        </div>

        {/* Bottom Footer Bar */}
        <div className="px-4 py-2 bg-[#0e1015] border-t border-white/[0.08] flex items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <span>
              Lines: <strong className="text-zinc-300">{filteredLogs.length}</strong>
              {filteredLogs.length !== logs.length && (
                <span className="text-zinc-500 ml-1">of {logs.length}</span>
              )}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="truncate max-w-xs text-zinc-400">
              {status.message || 'Streaming'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-zinc-400">
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] text-zinc-300">Esc</kbd> to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
