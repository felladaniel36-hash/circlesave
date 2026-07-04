"use client";

import { type Toast } from "@/lib/config";
import { explorerTxUrl } from "@/lib/format";

export function ToastBar({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  const colors = {
    ok: "bg-green-500/10 border-green-500/30 text-green-300",
    err: "bg-rose-500/10 border-rose-500/30 text-rose-300",
    info: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  };
  const icons = { ok: "check_circle", err: "error", info: "hourglass_top" };
  return (
    <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${colors[toast.kind]}`}>
      <span className="material-symbols-outlined text-sm">{icons[toast.kind]}</span>
      <span className="flex-1 text-sm">{toast.msg}</span>
      {toast.txid && (
        <a
          href={explorerTxUrl(toast.txid)}
          target="_blank"
          rel="noreferrer"
          className="font-data-mono text-xs underline"
        >
          tx ↗
        </a>
      )}
    </div>
  );
}
