import React, { useState, useEffect } from 'react';
import { 
  X, 
  Terminal, 
  Copy, 
  Check, 
  Clock, 
  HardDrive, 
  User, 
  ShieldAlert 
} from 'lucide-react';
import HealthBadge from './HealthBadge';

export default function ProcessModal({ processData, onClose, onKillPort, onCopyText, onViewLogs, health }) {
  const [copied, setCopied] = useState(false);
  const [killing, setKilling] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!processData) return null;

  const handleCopyCmd = () => {
    onCopyText(processData.command || processData.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleExecuteKill = async (forceElevated = false) => {
    setKilling(true);
    try {
      await onKillPort({ ...processData, forceElevated });
      onClose();
    } finally {
      setKilling(false);
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-white/[0.1] bg-[#111318] shadow-2xl overflow-hidden flex flex-col cursor-default"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-zinc-100">
              {processData.name || 'Process Details'}
            </span>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/[0.06] text-zinc-300">
              :{processData.port}
            </span>
            {health && (
              <HealthBadge health={health} port={processData.port} />
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 text-xs">
          {/* Key specs */}
          <div className="grid grid-cols-4 gap-2 font-mono">
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.05]">
              <span className="text-[10px] text-zinc-500 block">PID</span>
              <span className="text-zinc-200 font-semibold">{processData.pid || '—'}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.05]">
              <span className="text-[10px] text-zinc-500 block">USER</span>
              <span className="text-zinc-200 font-semibold truncate block">{processData.user || '—'}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.05]">
              <span className="text-[10px] text-zinc-500 block">RAM</span>
              <span className="text-zinc-200 font-semibold">{processData.memoryFormatted || '—'}</span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.05]">
              <span className="text-[10px] text-zinc-500 block">UPTIME</span>
              <span className="text-zinc-200 font-semibold truncate block">{processData.uptimeFormatted || '—'}</span>
            </div>
          </div>

          {/* Start time & Location */}
          <div className="space-y-1 font-mono text-[11px] text-zinc-400">
            {processData.origin && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 w-16 shrink-0">Location:</span>
                <span className="text-zinc-200 truncate">{processData.origin}</span>
              </div>
            )}
            {processData.cwd && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 w-16 shrink-0">Directory:</span>
                <span className="text-zinc-200 truncate">{processData.cwd}</span>
              </div>
            )}
            {processData.startTime && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 w-16 shrink-0">Started:</span>
                <span>{processData.startTime}</span>
              </div>
            )}
          </div>

          {/* Command line */}
          <div>
            <div className="flex items-center justify-between mb-1 text-[11px]">
              <span className="text-zinc-500 font-mono">COMMAND LINE</span>
              <button
                onClick={handleCopyCmd}
                className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono transition"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-3 rounded-lg bg-black/60 border border-white/[0.06] font-mono text-xs text-zinc-300 break-all select-text max-h-36 overflow-y-auto leading-relaxed">
              {processData.command || processData.name || 'No command details.'}
            </div>
          </div>

          {/* Docker note */}
          {processData.isDocker && (
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] font-mono text-blue-300">
              Container: {processData.dockerContainer} ({processData.dockerImage})
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.07] bg-[#0d0f13] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs font-mono text-zinc-400 hover:text-zinc-200 transition"
            >
              Cancel
            </button>

            {onViewLogs && (
              <button
                onClick={() => {
                  onClose();
                  onViewLogs(processData);
                }}
                className="px-3 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 text-xs font-mono font-medium flex items-center gap-1.5 transition"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Live Logs</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {processData.user === 'root' && (
              <button
                onClick={() => handleExecuteKill(true)}
                disabled={killing}
                className="px-3 py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-mono transition"
              >
                Root Kill
              </button>
            )}

            <button
              onClick={() => handleExecuteKill(false)}
              disabled={killing}
              className="px-3.5 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-mono font-medium transition"
            >
              {killing ? 'Terminating...' : 'Force Kill'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
