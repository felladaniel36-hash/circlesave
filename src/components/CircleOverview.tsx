"use client";

import { memo } from "react";
import { RING_CIRCUMFERENCE, RING_RADIUS, UNIT, type CircleMember } from "@/lib/config";
import { fmtNumber } from "@/lib/format";

interface CircleOverviewProps {
  name: string;
  poolBalance: number;
  targetPool: number;
  contributionAmount: number;
  turnMember: CircleMember | undefined;
  dayCount: number;
  roundNumber: number;
  totalRounds: number;
  isActive: boolean;
  poolReady: boolean;
  circleEnded: boolean;
}

export function CircleOverviewBase({
  name,
  poolBalance,
  targetPool,
  contributionAmount,
  turnMember,
  dayCount,
  roundNumber,
  totalRounds,
  isActive,
  poolReady,
  circleEnded,
}: CircleOverviewProps) {
  const progress = targetPool > 0 ? Math.min(1, poolBalance / targetPool) : 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const remaining = Math.max(0, targetPool - poolBalance);

  return (
    <div className="glass-panel p-6 rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-0.5">{name}</h3>
          <p className="text-sm text-on-surface-variant">
            {circleEnded
              ? "Ended"
              : `Day ${dayCount} · Round ${roundNumber} of ${totalRounds}`}
          </p>
        </div>
        <div
          className={`px-3 py-1 rounded-full flex items-center gap-1.5 border ${
            poolReady
              ? "bg-green-500/10 border-green-500/30"
              : "bg-amber-500/10 border-amber-500/20"
          }`}
        >
          <span
            className={`material-symbols-outlined text-sm ${
              poolReady ? "text-green-400" : "text-amber-500"
            }`}
          >
            {circleEnded ? "block" : poolReady ? "celebration" : "trending_up"}
          </span>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              poolReady ? "text-green-400" : "text-amber-500"
            }`}
          >
            {circleEnded ? "Ended" : poolReady ? "Target Reached" : "Filling"}
          </span>
        </div>
      </div>

      {/* Progress Ring */}
      <div className="flex flex-col items-center py-4">
        <div className="relative w-48 h-48">
          <svg className="w-full h-full" viewBox="0 0 192 192">
            <circle
              cx="96"
              cy="96"
              r={RING_RADIUS}
              fill="transparent"
              stroke="#27272a"
              strokeWidth="8"
            />
            <circle
              cx="96"
              cy="96"
              r={RING_RADIUS}
              fill="transparent"
              stroke="#ffb690"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              className="progress-ring-circle"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-white">
              {fmtNumber(poolBalance)}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">
              of {fmtNumber(targetPool)} {UNIT}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-2 mt-4 pt-4 border-t border-outline-variant">
        <div className="flex items-center justify-between p-3 bg-surface-container rounded-lg">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">
              savings
            </span>
            <span className="text-sm text-on-surface-variant">Current Pool</span>
          </div>
          <span className="font-data-mono text-primary font-bold">
            {fmtNumber(poolBalance)} / {fmtNumber(targetPool)} {UNIT}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-surface-container rounded-lg">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">
              payments
            </span>
            <span className="text-sm text-on-surface-variant">
              Per-Member Contribution
            </span>
          </div>
          <span className="font-data-mono text-on-surface font-bold">
            {contributionAmount} {UNIT}
          </span>
        </div>

        {/* Turn Indicator */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-base">cycle</span>
            <span className="text-sm text-primary">Next Payout Goes To</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-zinc-300 text-sm">person</span>
            </div>
            <span className="font-bold text-white">{turnMember?.name ?? "—"}</span>
          </div>
        </div>

        {/* Remaining until target */}
        {isActive && !poolReady && (
          <p className="text-center text-xs text-on-surface-variant pt-1">
            {fmtNumber(remaining)} {UNIT} until target → {turnMember?.name} gets paid
          </p>
        )}
      </div>
    </div>
  );
}

// Memoized — only re-renders when its props actually change
export const CircleOverview = memo(CircleOverviewBase);
