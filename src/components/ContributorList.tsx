"use client";

import { useState } from "react";
import { fmtUsdc, shortenAddr } from "@/lib/format";
import { explorerAddr } from "@/lib/constants";
import type { ContributorState } from "@/hooks/useFamilyVault";

export function ContributorList({
  states,
  currentBlock,
  onAdd,
  onRemove,
}: {
  states: ContributorState[];
  currentBlock: number | null;
  onAdd: (addr: string) => void;
  onRemove: (addr: string) => void;
}) {
  const [addr, setAddr] = useState("");

  return (
    <div className="clist">
      <div className="clist-head between">
        <span>Contributors</span>
        <span className="muted small">{states.length}</span>
      </div>

      {states.length === 0 && (
        <div className="empty small">
          No contributors yet. Add a family member&apos;s address, or make the
          first deposit to join.
        </div>
      )}

      {states.map((c) => {
        const st = c.state;
        const lockedNow =
          !!st &&
          currentBlock != null &&
          st.lockedBalance > 0 &&
          st.lockUntilBlock > currentBlock;
        const badge = !st
          ? "badge--muted"
          : lockedNow
            ? "badge--locked"
            : st.totalBalance > 0
              ? "badge--open"
              : "badge--muted";
        const label = !st
          ? "loading"
          : lockedNow
            ? "locked"
            : st.totalBalance > 0
              ? "unlocked"
              : "empty";

        return (
          <div className="crow" key={c.address}>
            <div className="crow-main">
              <a
                className="mono crow-addr"
                href={explorerAddr(c.address)}
                target="_blank"
                rel="noreferrer"
                title={c.address}
              >
                {shortenAddr(c.address, 6, 6)}
              </a>
              <span className={`badge ${badge}`}>{label}</span>
            </div>
            <div className="crow-bal">
              {st ? (
                <>
                  {fmtUsdc(st.totalBalance)}{" "}
                  <span className="muted small">USDCx</span>
                </>
              ) : (
                "—"
              )}
            </div>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => onRemove(c.address)}
              title="Remove from registry"
            >
              ×
            </button>
          </div>
        );
      })}

      <form
        className="clist-add"
        onSubmit={(e) => {
          e.preventDefault();
          const a = addr.trim();
          if (a) {
            onAdd(a);
            setAddr("");
          }
        }}
      >
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="ST… contributor address"
        />
        <button className="btn btn--ghost btn--sm" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}
