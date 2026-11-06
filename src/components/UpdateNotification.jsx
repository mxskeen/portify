import React from 'react';
import { Sparkles, RefreshCw, X, Download } from 'lucide-react';

export default function UpdateNotification({ updateStatus, onDismiss, onRestartAndInstall }) {
  if (!updateStatus) return null;

  const isDownloading = updateStatus.state === 'downloading';
  const isReady = updateStatus.state === 'ready';

  if (!isDownloading && !isReady) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-[#12161f] border border-emerald-500/30 rounded-xl p-3.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            {isDownloading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </div>

          <div>
            <div className="font-semibold text-xs text-zinc-100 flex items-center gap-1.5">
              <span>{isReady ? 'Update Ready to Install' : 'Downloading Update'}</span>
              {updateStatus.version && (
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                  v{updateStatus.version}
                </span>
              )}
            </div>

            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              {isReady
                ? 'A new version of Portify has been downloaded. Restart now to apply.'
                : updateStatus.message || 'Downloading in background...'}
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isReady && (
        <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
          <button
            onClick={onDismiss}
            className="px-2.5 py-1 rounded-md text-xs font-mono text-zinc-400 hover:text-zinc-200 transition"
          >
            Later
          </button>
          <button
            onClick={onRestartAndInstall}
            className="px-3 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Restart & Install</span>
          </button>
        </div>
      )}
    </div>
  );
}
