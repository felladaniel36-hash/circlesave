"use client";

import { useState } from "react";
import { type CircleMember } from "@/lib/config";
import { shortenAddr } from "@/lib/format";

interface MemberGridProps {
  members: CircleMember[];
  currentTurnIndex: number;
  isActive: boolean;
  onInvite: (name: string, address: string) => void;
}

export function MemberGrid({
  members,
  currentTurnIndex,
  isActive,
  onInvite,
}: MemberGridProps) {
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");

  return (
    <div className="glass-panel p-6 rounded-xl">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xl font-bold text-white">Circle Members</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
          {members.length} Members
        </span>
      </div>

      <div className="space-y-3">
        {members.map((m, i) => {
          const isTurn = i === currentTurnIndex && isActive;
          const repColor =
            m.reputation >= 90
              ? "text-green-400"
              : m.reputation >= 70
                ? "text-amber-400"
                : "text-rose-400";
          return (
            <div
              key={m.id}
              className={`p-4 rounded-lg border transition-colors ${
                isTurn
                  ? "border-primary/50 bg-primary/5"
                  : m.hasReceived
                    ? "border-green-500/20 bg-green-500/5"
                    : "border-outline-variant bg-surface-container hover:border-primary/20"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center border border-zinc-600">
                      <span className="material-symbols-outlined text-zinc-300">person</span>
                    </div>
                    {isTurn && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-background flex items-center justify-center">
                        <span className="material-symbols-outlined text-[8px] text-on-primary">
                          star
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-white flex items-center gap-2">
                      {m.name}
                      {isTurn && (
                        <span className="text-[9px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded uppercase">
                          Turn
                        </span>
                      )}
                      {m.hasReceived && (
                        <span className="text-[9px] font-bold text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded uppercase">
                          ✓ Received
                        </span>
                      )}
                    </p>
                    <p className="font-data-mono text-xs text-on-surface-variant">
                      {shortenAddr(m.address, 7, 4)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-outline-variant/50">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-0.5">
                    Reputation
                  </p>
                  <p className={`font-data-mono font-bold text-sm ${repColor}`}>
                    {m.reputation}% Reliable
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-0.5">
                    Commitment Vault
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-data-mono font-bold text-sm text-white">
                      {m.vaultReserve} USDCx
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        m.vaultStatus === "Healthy"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-rose-500/15 text-rose-400"
                      }`}
                    >
                      {m.vaultStatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Invite */}
        {inviting ? (
          <div className="p-4 border border-primary/30 rounded-lg bg-primary/5 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Member name"
              className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="ST… wallet address"
              className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg outline-none focus:ring-1 focus:ring-primary font-data-mono text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (name.trim() && addr.trim()) {
                    onInvite(name.trim(), addr.trim());
                    setName("");
                    setAddr("");
                    setInviting(false);
                  }
                }}
                disabled={!name.trim() || !addr.trim()}
                className="flex-1 bg-primary-container text-on-primary-container font-bold py-2.5 rounded-lg disabled:opacity-50"
              >
                Invite
              </button>
              <button
                onClick={() => {
                  setInviting(false);
                  setName("");
                  setAddr("");
                }}
                className="px-4 border border-zinc-700 text-zinc-400 py-2.5 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setInviting(true)}
            disabled={!isActive}
            className="w-full p-4 border border-dashed border-zinc-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-primary">person_add</span>
            <span className="text-xs uppercase tracking-wider text-on-surface-variant">
              + Invite Member to Circle
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
