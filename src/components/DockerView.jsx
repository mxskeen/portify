import React, { useState } from 'react';
import { 
  Box, 
  RotateCw, 
  Square, 
  Trash2, 
  Globe, 
  AlertCircle,
  Play,
  Settings,
  Terminal
} from 'lucide-react';

export default function DockerView({ 
  dockerResult = {}, 
  onStopContainer, 
  onKillContainer, 
  onRestartContainer, 
  onStartTunnel,
  onViewLogs,
  dependencies = null,
  onOpenDockerSetup
}) {
  const [actionInProgress, setActionInProgress] = useState(null);

  const available = dockerResult.available;
  const containers = dockerResult.containers || [];

  if (!available) {
    const canStart = dependencies?.docker?.canStartService;
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#090a0d]">
        <div className="w-12 h-12 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-center mb-3 text-zinc-400">
          <Box className="w-6 h-6 text-zinc-400" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-200">Docker Daemon Inactive</h3>
        <p className="text-[11px] text-zinc-500 max-w-sm mt-1 mb-5 leading-relaxed">
          Portify cannot connect to the Docker daemon. Ensure Docker Desktop or the system Docker service is running.
        </p>

        {onOpenDockerSetup && (
          <button
            onClick={onOpenDockerSetup}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/[0.1] text-zinc-200 text-xs font-medium transition flex items-center gap-2"
          >
            {canStart ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Settings className="w-3.5 h-3.5 text-zinc-400" />}
            <span>{canStart ? 'Start Docker Service (1-Click)' : 'Configure Docker / View Setup'}</span>
          </button>
        )}
      </div>
    );
  }

  const handleAction = async (actionFn, id, actionName) => {
    setActionInProgress(`${actionName}-${id}`);
    try {
      await actionFn(id);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-[#090a0d]">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-[#0d0f13] border-b border-white/[0.06] text-zinc-400 text-[11px] font-mono select-none">
          <tr>
            <th className="py-2.5 px-4">CONTAINER</th>
            <th className="py-2.5 px-4">IMAGE</th>
            <th className="py-2.5 px-4">UPTIME</th>
            <th className="py-2.5 px-4">MAPPED PORTS</th>
            <th className="py-2.5 px-4">RAM · CPU</th>
            <th className="py-2.5 px-4 text-right">ACTION</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-white/[0.04]">
          {containers.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-20 text-zinc-500">
                <Box className="w-6 h-6 mx-auto mb-2 opacity-30" />
                <p className="text-xs text-zinc-400 font-medium">No Docker containers found.</p>
              </td>
            </tr>
          ) : (
            containers.map((c) => {
              const isRunning = c.state === 'running';

              return (
                <tr key={c.fullId} className="hover:bg-white/[0.02] transition-colors group">
                  {/* Container name & ID */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isRunning ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`} />
                      <span className="font-semibold text-zinc-100 text-sm">
                        {c.name}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      {c.id}
                    </div>
                  </td>

                  {/* Image */}
                  <td className="py-3 px-4 font-mono text-[11px] text-zinc-300">
                    {c.image}
                  </td>

                  {/* Uptime */}
                  <td className="py-3 px-4 font-mono text-[11px] text-zinc-200">
                    <div>{c.status || c.runningFor}</div>
                    <div className="text-[10px] text-zinc-500">
                      Started: {c.runningFor}
                    </div>
                  </td>

                  {/* Ports Mapped */}
                  <td className="py-3 px-4">
                    {c.portsRaw ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-zinc-300">
                          {c.portsRaw}
                        </span>
                        {c.mappedPorts && c.mappedPorts.map((p) => (
                          <button
                            key={p}
                            onClick={() => onStartTunnel(p)}
                            title={`Tunnel port ${p}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[10px] font-mono text-zinc-300 transition"
                          >
                            <Globe className="w-2.5 h-2.5 text-zinc-400" />
                            <span>Tunnel {p}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-zinc-600 font-mono">—</span>
                    )}
                  </td>

                  {/* RAM · CPU */}
                  <td className="py-3 px-4 font-mono text-[11px] tabular-nums text-zinc-300">
                    {isRunning ? (
                      <div>
                        <span>{c.memUsage.split('/')[0].trim()}</span>
                        <span className="text-zinc-500 ml-1.5 text-[10px]">{c.cpuPerc}</span>
                      </div>
                    ) : (
                      <span className="text-zinc-600">stopped</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onViewLogs && (
                        <button
                          onClick={() => onViewLogs({
                            name: c.name,
                            title: c.name,
                            isDocker: true,
                            dockerContainer: c.name,
                            dockerId: c.id,
                            mappedPorts: c.mappedPorts,
                            origin: c.image
                          })}
                          title="View Live Container Logs"
                          className="p-1 rounded text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isRunning ? (
                        <>
                          <button
                            onClick={() => handleAction(onRestartContainer, c.id, 'restart')}
                            disabled={Boolean(actionInProgress)}
                            title="Restart"
                            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition disabled:opacity-40"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${actionInProgress === `restart-${c.id}` ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            onClick={() => handleAction(onStopContainer, c.id, 'stop')}
                            disabled={Boolean(actionInProgress)}
                            title="Stop Gracefully"
                            className="px-2 py-1 rounded text-[11px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition disabled:opacity-40"
                          >
                            Stop
                          </button>

                          <button
                            onClick={() => handleAction(onKillContainer, c.id, 'kill')}
                            disabled={Boolean(actionInProgress)}
                            title="Force Kill"
                            className="px-2 py-1 rounded text-[11px] font-mono text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                          >
                            Kill
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-zinc-600 font-mono ml-1">Inactive</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
