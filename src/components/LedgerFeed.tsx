"use client";

import { type LedgerEntry } from "@/lib/config";
import { timeAgo, explorerTxUrl } from "@/lib/format";

interface LedgerFeedProps {
  ledger: LedgerEntry[];
}

function iconFor(action: string): string {
  if (/deposit|contrib/i.test(action)) return "arrow_circle_down";
  if (/payout|dispatch/i.test(action)) return "send";
  if (/invite|member/i.test(action)) return "person_add";
  if (/cycle|round/i.test(action)) return "autorenew";
  if (/automation|authoriz/i.test(action)) return "shield_locked";
  if (/end|close/i.test(action)) return "block";
  return "receipt_long";
}

export function LedgerFeed({ ledger }: LedgerFeedProps) {
  return (
    <div className="glass-panel p-6 rounded-xl">
      <h3 className="text-xl font-bold text-white mb-4">Recent Ledger</h3>
      <div className="space-y-1">
        {ledger.length === 0 && (
          <p className="text-center text-on-surface-variant text-sm py-6">
            No activity yet.
          </p>
        )}
        {ledger.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between py-3 border-b border-zinc-900/50 last:border-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="material-symbols-outlined text-primary text-sm flex-shrink-0">
                {iconFor(e.action)}
              </span>
              <span className="text-sm truncate">{e.action}</span>
              {e.txid && (
                <a
                  href={explorerTxUrl(e.txid)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-data-mono text-[10px] text-primary hover:underline flex-shrink-0"
                >
                  tx↗
                </a>
              )}
            </div>
            <span className="font-data-mono text-xs text-zinc-500 flex-shrink-0">
              {timeAgo(e.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
