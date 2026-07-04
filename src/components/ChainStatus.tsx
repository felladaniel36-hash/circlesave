"use client";

// ===========================================================================
// ChainStatus — the "communication indicator"
// ===========================================================================
// This panel makes the frontend ↔ backend link VISIBLE. It shows:
//   • Whether the chain is reachable (green/red dot)
//   • The live block height (updates every 15s)
//   • The contract being interacted with
//   • Last sync timestamp
// ===========================================================================

import { FLOWVAULT_CONTRACT_ID, USDCX_CONTRACT_ID } from "@/lib/flowvault";
import { explorerContractUrl, timeAgo } from "@/lib/format";

interface ChainStatusProps {
  connected: boolean;
  currentBlock: number;
  lastSync: number | null;
  loading: boolean;
  error: string | null;
}

export function ChainStatus({
  connected,
  currentBlock,
  lastSync,
  loading,
  error,
}: ChainStatusProps) {
  const reachable = connected && !error;

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-on-surface-variant">
            hub
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Chain Link
          </span>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              reachable ? "bg-green-500 pulse-green" : error ? "bg-rose-500" : "bg-zinc-600"
            }`}
          />
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              reachable ? "text-green-400" : error ? "text-rose-400" : "text-zinc-500"
            }`}
          >
            {reachable ? (loading ? "Syncing" : "Live") : error ? "Error" : "Idle"}
          </span>
        </div>
      </div>

      {/* Block height */}
      <div className="flex items-center justify-between py-2 border-t border-outline-variant/50">
        <span className="text-xs text-on-surface-variant">Block Height</span>
        <span className="font-data-mono text-sm text-primary font-bold">
          {currentBlock > 0 ? `#${currentBlock.toLocaleString()}` : "—"}
        </span>
      </div>

      {/* Last sync */}
      <div className="flex items-center justify-between py-2 border-t border-outline-variant/50">
        <span className="text-xs text-on-surface-variant">Last Sync</span>
        <span className="font-data-mono text-xs text-on-surface">
          {lastSync ? timeAgo(lastSync) : "—"}
        </span>
      </div>

      {/* Contract */}
      <div className="flex items-center justify-between py-2 border-t border-outline-variant/50">
        <span className="text-xs text-on-surface-variant">Contract</span>
        <a
          href={explorerContractUrl()}
          target="_blank"
          rel="noreferrer"
          className="font-data-mono text-[10px] text-primary hover:underline"
        >
          {FLOWVAULT_CONTRACT_ID.slice(0, 8)}…{FLOWVAULT_CONTRACT_ID.slice(-12)} ↗
        </a>
      </div>

      {/* Token */}
      <div className="flex items-center justify-between py-2 border-t border-outline-variant/50">
        <span className="text-xs text-on-surface-variant">Token</span>
        <span className="font-data-mono text-[10px] text-on-surface">
          {USDCX_CONTRACT_ID.slice(0, 8)}…{USDCX_CONTRACT_ID.slice(-8)}
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[10px] text-rose-400 mt-2 leading-relaxed">{error}</p>
      )}
    </div>
  );
}
