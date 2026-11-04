import React, { useEffect } from 'react';
import { Power, X, Check, ArrowRight } from 'lucide-react';

export default function OnboardingModal({ onEnable, onDismiss }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  return (
    <div 
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px] cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#111318] shadow-2xl overflow-hidden flex flex-col cursor-default"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-zinc-300">
              <Power className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm text-zinc-100">
              Welcome to Portify
            </span>
          </div>

          <button
            onClick={onDismiss}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <p className="text-zinc-300 leading-relaxed text-xs">
            Would you like Portify to launch automatically when your system starts?
          </p>

          <div className="p-3.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-2 text-[11px] text-zinc-400">
            <div className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>Starts quietly minimized into your system tray</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>Monitors background ports, memory & long-running Docker containers</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>Zero-latency open anytime by clicking the tray icon</span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            This is optional and can be toggled at any time in Preferences.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-white/[0.07] bg-[#0d0f13] flex items-center justify-between gap-3">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-200 text-xs font-mono transition"
          >
            Not Now
          </button>

          <button
            onClick={onEnable}
            className="px-4 py-1.5 rounded-md bg-white/10 hover:bg-white/15 border border-white/[0.12] text-zinc-100 text-xs font-medium transition flex items-center gap-1.5"
          >
            <span>Enable at Startup</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
