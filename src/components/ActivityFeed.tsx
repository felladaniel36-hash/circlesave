"use client";

import { fmtUsdc, shortenAddr, timeAgo } from "@/lib/format";
import {
  explorerAddr,
  explorerTx,
  USDCX_SYMBOL,
} from "@/lib/constants";
import type { VaultEvent } from "@/lib/events";

export function ActivityFeed({
  events,
  loading,
  contributors,
  onRefresh,
}: {
  events: VaultEvent[];
  loading: boolean;
  contributors: string[];
  onRefresh: () => void;
}) {
  const famSet = new Set(contributors);
  const family = events.filter((e) => e.actor && famSet.has(e.actor));
  const showFamily = family.length > 0;
  const shown = (showFamily ? family : events).slice(0, 12);

  return (
    <section className="card">
      <div className="card-head">
        <h3 className="card-title">
          {showFamily ? "Family activity" : "Vault activity"}
        </h3>
        <button
          className="btn btn--ghost btn--sm"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh activity"
        >
          {loading ? <span className="loader" /> : "↻"}
        </button>
      </div>

      {!showFamily && (
        <p className="card-desc" style={{ marginBottom: 10 }}>
          Latest on-chain deposits &amp; withdrawals on this FlowVault contract.
          Your family&apos;s rows get highlighted once they contribute.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="empty small">No activity yet.</div>
      ) : (
        <div className="feed">
          {shown.map((e, i) => {
            const isFam = e.actor ? famSet.has(e.actor) : false;
            const dep = e.type === "deposit";
            const when = e.timestamp
              ? timeAgo(e.timestamp)
              : e.blockHeight
                ? `block #${e.blockHeight.toLocaleString()}`
                : "";

            return (
              <div
                className={`frow ${isFam ? "is-family" : ""}`}
                key={`${e.txId}-${i}`}
              >
                <div className={`ficon ${dep ? "dep" : "wd"}`}>
                  {dep ? "↓" : "↑"}
                </div>
                <div className="fmid">
                  <div className="fwho">
                    {e.actor ? (
                      <a
                        className="mono"
                        href={explorerAddr(e.actor)}
                        target="_blank"
                        rel="noreferrer"
                        title={e.actor}
                      >
                        {shortenAddr(e.actor, 5, 4)}
                      </a>
                    ) : (
                      "unknown"
                    )}
                    {isFam && <span className="badge badge--ok">family</span>}
                    <span className={`badge ${dep ? "badge--open" : "badge--warn"}`}>
                      {dep ? "deposit" : "withdraw"}
                    </span>
                  </div>
                  <div className="fmeta">
                    {when}
                    {dep && e.lockUntil
                      ? ` · locked→#${e.lockUntil.toLocaleString()}`
                      : ""}
                    {dep && e.splitTo
                      ? ` · split→${shortenAddr(e.splitTo, 5, 4)}`
                      : ""}
                    {" · "}
                    <a
                      className="link"
                      href={explorerTx(e.txId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      tx
                    </a>
                  </div>
                </div>
                <div className="famt">
                  {e.amountMicro != null ? (
                    <>
                      {fmtUsdc(e.amountMicro)}{" "}
                      <span className="muted small">{USDCX_SYMBOL}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
