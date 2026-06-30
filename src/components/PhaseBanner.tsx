"use client";

import { fmtUsdc, shortenAddr } from "@/lib/format";
import { USDCX_SYMBOL } from "@/lib/constants";

export function PhaseBanner({
  phaseReady,
  locked,
  lockUntilBlock,
  pooledMicro,
  landlordAddress,
}: {
  phaseReady: boolean;
  locked: boolean;
  lockUntilBlock: number;
  pooledMicro: number;
  landlordAddress: string;
}) {
  const open = phaseReady && !locked;

  return (
    <div className={`phase-banner ${open ? "open" : "locked"}`}>
      <div className="pb-ic">{open ? "📤" : "🔒"}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="pb-tag">
          {open ? "Phase 2 · Settlement open" : "Phase 1 · Locked savings"}
        </div>
        <div className="pb-text">
          {open ? (
            <>
              Deadline block{" "}
              <strong>#{lockUntilBlock.toLocaleString()}</strong> reached — route{" "}
              <strong>
                {fmtUsdc(pooledMicro)} {USDCX_SYMBOL}
              </strong>{" "}
              to the landlord{" "}
              <strong className="mono">
                {shortenAddr(landlordAddress, 6, 4)}
              </strong>{" "}
              via the FlowVault Split primitive.
            </>
          ) : (
            <>
              Contributions are time-locked until block{" "}
              <strong>#{lockUntilBlock.toLocaleString()}</strong>. Early
              withdrawals are rejected on-chain (FlowVault Lock).
            </>
          )}
        </div>
      </div>
    </div>
  );
}
