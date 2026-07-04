"use client";

import { useState, useEffect, useCallback } from "react";
import { UNIT } from "@/lib/config";

interface SetupModalProps {
  open: boolean;
  closing: boolean;
  walletConnected: boolean;
  hasConfig: boolean;
  onClose: () => void;
  onCreate: (name: string, target: number, contribution: number) => void;
}

export function SetupModal({
  open,
  closing,
  walletConnected,
  hasConfig,
  onClose,
  onCreate,
}: SetupModalProps) {
  const [name, setName] = useState("Family Circle");
  const [target, setTarget] = useState("1200");
  const [contribution, setContribution] = useState("10");
  const [error, setError] = useState("");

  const handleCreate = useCallback(() => {
    setError("");
    const t = parseFloat(target);
    const c = parseFloat(contribution);
    if (!name.trim()) return setError("Enter a circle name.");
    if (!t || t <= 0) return setError("Enter a valid target pool.");
    if (t > 99999) return setError("Target too high (max 99999).");
    if (!c || c <= 0) return setError("Enter a valid contribution amount.");
    onCreate(name.trim(), t, c);
  }, [name, target, contribution, onCreate]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm ${
        closing ? "frv-backdrop-exit" : "frv-backdrop-enter"
      }`}
      onClick={onClose}
    >
      <div
        className={`glass-panel rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto ${
          closing ? "frv-modal-exit" : "frv-modal-enter"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">
            {hasConfig ? "Edit Circle" : "Start Your Circle"}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-2 block">
              Circle Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Family Circle"
              className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-2 block">
                Target Pool ({UNIT})
              </label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="1200"
                className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg outline-none focus:ring-1 focus:ring-primary font-data-mono"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-2 block">
                Per-Member ({UNIT})
              </label>
              <input
                type="number"
                value={contribution}
                onChange={(e) => setContribution(e.target.value)}
                placeholder="10"
                className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg outline-none focus:ring-1 focus:ring-primary font-data-mono"
              />
            </div>
          </div>
          <p className="text-[10px] opacity-50 -mt-2">(Min 0 Max 99999)</p>

          {/* No-duration info */}
          <div className="rounded-lg bg-surface-container border border-outline-variant p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-primary text-base">
                all_inclusive
              </span>
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                No Fixed Duration
              </span>
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              The circle runs continuously. Each time the pool hits the target, it
              pays out to the current member and resets for the next. You end it
              whenever you want.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!walletConnected}
            className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!walletConnected
              ? "Connect wallet to continue"
              : hasConfig
                ? "Update Circle"
                : "Create Circle"}
          </button>
        </div>
      </div>
    </div>
  );
}
