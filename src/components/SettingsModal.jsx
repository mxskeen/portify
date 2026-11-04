import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings, 
  Power, 
  Check, 
  Box, 
  Globe 
} from 'lucide-react';

export default function SettingsModal({ onClose, onShowToast }) {
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [platform, setPlatform] = useState('');
  const [systemInfo, setSystemInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (window.api && window.api.getAutostartStatus) {
      window.api.getAutostartStatus().then((res) => {
        setAutostartEnabled(res.enabled);
        setPlatform(res.platform);
      });
    }

    if (window.api && window.api.getSystemInfo) {
      window.api.getSystemInfo().then(setSystemInfo);
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleToggleAutostart = async () => {
    setSaving(true);
    try {
      const nextState = !autostartEnabled;
      const res = await window.api.setAutostart(nextState, true);
      setAutostartEnabled(res.enabled);
      onShowToast(
        'success',
        nextState ? 'Autostart Enabled' : 'Autostart Disabled',
        nextState 
          ? 'Portify will launch minimized on system startup.' 
          : 'Portify will not start automatically on boot.'
      );
    } catch (err) {
      onShowToast('error', 'Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#111318] shadow-2xl overflow-hidden flex flex-col cursor-default"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
          <span className="font-semibold text-sm text-zinc-100">
            Preferences
          </span>

          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs">
          {/* Autostart */}
          <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06] flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-zinc-200">Start at login</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Launches Portify minimized in your system tray on boot.
              </div>
            </div>

            <button
              onClick={handleToggleAutostart}
              disabled={saving}
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition cursor-pointer shrink-0 ${
                autostartEnabled ? 'bg-zinc-200' : 'bg-zinc-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full shadow-sm transform transition ${
                  autostartEnabled ? 'translate-x-4 bg-black' : 'translate-x-0 bg-zinc-300'
                }`}
              />
            </button>
          </div>

          {/* System tray info */}
          <div className="p-3 rounded-lg bg-black/40 border border-white/[0.06]">
            <div className="font-medium text-zinc-200 mb-0.5">System Tray</div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Closing the window hides it into your tray bar. Click or double click the tray icon to reopen.
            </p>
          </div>

          {/* Tools status */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.05] flex items-center justify-between">
              <span className="text-zinc-400">cloudflared</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> ready
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.05] flex items-center justify-between">
              <span className="text-zinc-400">docker</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" /> active
              </span>
            </div>
          </div>

          {systemInfo && (
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span>{systemInfo.hostname} ({systemInfo.platform})</span>
              <span>{systemInfo.cpus} CPU cores</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.07] bg-[#0d0f13] flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-zinc-100 font-medium text-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
