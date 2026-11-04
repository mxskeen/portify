import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, Lock, Key, ArrowRight } from 'lucide-react';

export default function ElevatedKillModal({ target, onClose, onExecuteKill }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!target) return null;

  const handleSystemPromptKill = async () => {
    setLoading(true);
    setError('');
    try {
      await onExecuteKill({
        ...target,
        forceElevated: true,
        sudoPassword: ''
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Authorization failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordKill = async (e) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await onExecuteKill({
        ...target,
        forceElevated: true,
        sudoPassword: password
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Incorrect sudo password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px] cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#111318] shadow-2xl overflow-hidden flex flex-col cursor-default"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-sm text-zinc-100">
              Root Privileges Required
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs">
          <p className="text-zinc-400 leading-relaxed text-[11px]">
            Port <span className="font-mono text-zinc-200 font-semibold">{target.port}</span> (PID {target.pid || target.targetPid || '—'} · <span className="text-zinc-200">{target.title || target.name}</span>) is controlled by a root or system process. To guarantee it is killed and freed:
          </p>

          {/* Option A: Native OS Dialog */}
          <button
            onClick={handleSystemPromptKill}
            disabled={loading}
            className="w-full p-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-between text-left transition disabled:opacity-40"
          >
            <div className="flex items-center gap-2.5">
              <Key className="w-4 h-4 text-zinc-300" />
              <div>
                <div className="font-medium text-zinc-200 text-xs">Authenticate via System Dialog</div>
                <div className="text-[10px] text-zinc-500">Prompts OS authorization (pkexec / UAC)</div>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
          </button>

          <div className="flex items-center gap-2 text-zinc-600 font-mono text-[10px]">
            <div className="h-[1px] flex-1 bg-white/[0.06]" />
            <span>OR ENTER SUDO PASSWORD</span>
            <div className="h-[1px] flex-1 bg-white/[0.06]" />
          </div>

          {/* Option B: Direct sudo password */}
          <form onSubmit={handlePasswordKill} className="space-y-3">
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                placeholder="Enter sudo password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-black/50 border border-white/[0.08] focus:border-white/20 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 font-mono outline-none transition"
              />
            </div>

            {error && (
              <div className="text-red-400 text-[11px] font-mono leading-tight">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-200 text-xs font-mono transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={loading || !password}
                className="px-3.5 py-1.5 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-mono font-medium transition disabled:opacity-40"
              >
                {loading ? 'Killing...' : 'Force Kill as Root'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
