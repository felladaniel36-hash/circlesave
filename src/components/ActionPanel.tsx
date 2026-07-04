"use client";

import { useState } from "react";
import { UNIT } from "@/lib/config";

interface ActionPanelProps {
  busy: boolean;
  isActive: boolean;
  walletConnected: boolean;
  poolReady: boolean;
  poolBalance: number;
  automationAuthorized: boolean;
  turnMemberName: string | undefined;
  onDeposit: (amountMicro: bigint) => void;
  onAuthorize: () => void;
  onDispatch: () => void;
}

export function ActionPanel({
  busy,
  isActive,
  walletConnected,
  poolReady,
  poolBalance,
  automationAuthorized,
  turnMemberName,
  onDeposit,
  onAuthorize,
  onDispatch,
}: ActionPanelProps) {
  const [amount, setAmount] = useState("");

  return (
    <div className="glass-panel p-6 rounded-xl">
      <h3 className="text-xl font-bold text-white mb-4">Financial Actions</h3>

      {/* Manual Deposit Boost */}
      <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-2 block">
        Manual Deposit Boost ({UNIT})
      </label>
      <div className="relative mb-4">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none font-data-mono"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-on-surface-variant">
          {UNIT}
        </div>
      </div>
      <button
        onClick={() => {
          // Parse and pass micro-units
          const trimmed = (amount || "").trim();
          if (/^\d+(\.\d+)?$/.test(trimmed)) {
            const [w, f = ""] = trimmed.split(".");
            const micro = BigInt(w) * BigInt(1_000_000) + BigInt(f.padEnd(6, "0") || "0");
            onDeposit(micro);
            setAmount("");
          }
        }}
        disabled={busy || !walletConnected || !isActive}
        className="w-full bg-zinc-800 text-white font-bold py-3 rounded-lg hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mb-6"
      >
        <span className="material-symbols-outlined">bolt</span>
        {busy ? "Awaiting wallet…" : "Deposit Boost"}
      </button>

      {/* Automation Info */}
      <div className="rounded-lg bg-surface-container border border-outline-variant p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-base">auto_mode</span>
          <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
            FlowVault Automation
          </span>
          {automationAuthorized && (
            <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 uppercase">
              Active
            </span>
          )}
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          Auto-debit from connected wallet. Deposits lock into the pool and auto-route
          to the current turn member.
        </p>
      </div>

      {/* Authorize */}
      <button
        onClick={onAuthorize}
        disabled={busy || !walletConnected || !isActive}
        className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform flex items-center justify-center gap-2 neon-glow-orange disabled:opacity-50 disabled:cursor-not-allowed mb-3"
      >
        <span className="material-symbols-outlined">shield_locked</span>
        {busy ? "Awaiting wallet…" : automationAuthorized ? "Re-Authorize Rules" : "Authorize Automation Rules"}
      </button>

      {/* Dispatch */}
      <button
        onClick={onDispatch}
        disabled={busy || !walletConnected || !isActive}
        className={`w-full font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
          poolReady
            ? "bg-green-600 text-white hover:bg-green-500 neon-glow-orange animate-pulse"
            : "bg-zinc-800/50 text-zinc-500"
        }`}
      >
        <span className="material-symbols-outlined">send</span>
        {busy
          ? "Awaiting wallet…"
          : poolReady
            ? `🎯 Dispatch ${poolBalance.toLocaleString()} ${UNIT} → ${turnMemberName}`
            : "Dispatch Payout (unlocks at target)"}
      </button>
    </div>
  );
}
