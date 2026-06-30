"use client";

import { explorerTx } from "@/lib/constants";

export type StatusKind = "ok" | "err" | "info";

export interface ActionStatusData {
  kind: StatusKind;
  msg: string;
  txid?: string | null;
  step?: string;
}

export function ActionStatus({ status }: { status: ActionStatusData | null }) {
  if (!status) return null;
  const txid =
    status.txid && status.txid !== "wallet-submitted" ? status.txid : null;

  return (
    <div className={`toast toast--${status.kind}`}>
      {status.step && <span className="toast-step">{status.step}</span>}
      <span>{status.msg}</span>
      {txid && (
        <a className="link" href={explorerTx(txid)} target="_blank" rel="noreferrer">
          View tx ↗
        </a>
      )}
    </div>
  );
}
