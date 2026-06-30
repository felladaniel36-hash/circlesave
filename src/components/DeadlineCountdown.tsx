"use client";

import { blocksToHuman } from "@/lib/format";

export function DeadlineCountdown({
  lockUntilBlock,
  currentBlock,
}: {
  lockUntilBlock: number;
  currentBlock: number | null;
}) {
  const unknown = currentBlock == null;
  const remaining = unknown ? 0 : Math.max(0, lockUntilBlock - currentBlock);
  const locked = !unknown && currentBlock < lockUntilBlock;

  return (
    <div className="countdown">
      <div className="between">
        <span className="muted small">Rent deadline</span>
        <span className={`badge ${locked ? "badge--locked" : "badge--open"}`}>
          {unknown ? "loading" : locked ? "locked" : "unlocked"}
        </span>
      </div>
      <div className="cd-block mono">#{lockUntilBlock.toLocaleString()}</div>
      {!unknown && (
        <div className="cd-remain">
          {locked ? (
            <>
              Unlocks in <strong>{remaining.toLocaleString()}</strong> blocks ·{" "}
              {blocksToHuman(remaining)}
            </>
          ) : (
            <>Deadline reached — settlement is open.</>
          )}
        </div>
      )}
      {!unknown && (
        <div className="muted small" style={{ marginTop: 4 }}>
          Current block: <span className="mono">#{currentBlock.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
