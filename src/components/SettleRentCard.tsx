"use client";

import { useCallback, useEffect, useState } from "react";
import { FlowVault, tokenToMicro, type VaultState } from "flowvault-sdk";
import { extractTxId } from "@/lib/flowvault";
import { USDCX_SYMBOL } from "@/lib/constants";
import { fmtUsdc, shortenAddr } from "@/lib/format";
import type { VaultConfig } from "@/lib/store";
import { ActionStatus, type ActionStatusData } from "./ActionStatus";

function cleanTxid(res: unknown): string | null {
  const id = extractTxId(res);
  return id && id !== "wallet-submitted" ? id : null;
}

export function SettleRentCard({
  flowVault,
  config,
  address,
  currentBlock,
  onSettled,
}: {
  flowVault: FlowVault | null;
  config: VaultConfig;
  address: string | null;
  currentBlock: number | null;
  onSettled: () => void;
}) {
  const [mine, setMine] = useState<VaultState | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ActionStatusData | null>(null);

  const loadMine = useCallback(async () => {
    if (!flowVault || !address) {
      setMine(null);
      return;
    }
    setLoadingMine(true);
    try {
      setMine(await flowVault.getVaultState(address));
    } catch {
      setMine(null);
    } finally {
      setLoadingMine(false);
    }
  }, [flowVault, address]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const deadlineReached =
    currentBlock != null && currentBlock >= config.lockUntilBlock;
  const unlocked = mine?.unlockedBalance ?? 0;
  const canSettle =
    !!flowVault && !!address && deadlineReached && unlocked > 0;

  async function settle() {
    if (!flowVault || !address) return;
    if (unlocked <= 0) {
      setStatus({ kind: "err", msg: "You have no unlocked balance to settle." });
      return;
    }

    setBusy(true);
    const micro = BigInt(unlocked);
    try {
      setStatus({
        kind: "info",
        step: "1/3",
        msg: `Withdrawing your unlocked ${fmtUsdc(unlocked)} ${USDCX_SYMBOL}…`,
      });
      await flowVault.withdraw(micro);

      setStatus({
        kind: "info",
        step: "2/3",
        msg: "Setting the landlord split route…",
      });
      await flowVault.setRoutingRules({
        lockAmount: 0n,
        lockUntilBlock: 0,
        splitAddress: config.landlordAddress,
        splitAmount: micro,
      });

      setStatus({
        kind: "info",
        step: "3/3",
        msg: "Routing rent to the landlord via FlowVault Split…",
      });
      const res = await flowVault.deposit(micro);

      setStatus({
        kind: "ok",
        msg: `Rent settled — ${fmtUsdc(unlocked)} ${USDCX_SYMBOL} routed to the landlord.`,
        txid: cleanTxid(res),
      });
      await loadMine();
      onSettled();
    } catch (err) {
      setStatus({
        kind: "err",
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h3 className="card-title">Settle Rent</h3>
        <span
          className={`badge ${deadlineReached ? "badge--open" : "badge--muted"}`}
        >
          {deadlineReached ? "settlement open" : "not yet"}
        </span>
      </div>

      <p className="card-desc">
        Once the deadline block passes, your locked balance unlocks. Settling
        withdraws it back to you, then routes it to the landlord on-chain using
        the <span className="mono">split</span> routing rule.
      </p>

      <div className="kvs" style={{ marginBottom: 14 }}>
        <div className="kv">
          <span className="k">Landlord</span>
          <span className="v mono">{shortenAddr(config.landlordAddress, 6, 6)}</span>
        </div>
        <div className="kv">
          <span className="k">Your unlocked balance</span>
          <span className="v">
            {loadingMine
              ? "…"
              : `${fmtUsdc(unlocked)} ${USDCX_SYMBOL}`}
          </span>
        </div>
      </div>

      <button
        className="btn btn--primary btn--block"
        onClick={settle}
        disabled={busy || !canSettle}
      >
        {busy ? <span className="loader" /> : null}
        {busy
          ? "Awaiting wallet…"
          : deadlineReached
            ? unlocked > 0
              ? "Settle rent → landlord"
              : "Nothing to settle"
            : "Locked until deadline"}
      </button>

      {status && (
        <div style={{ marginTop: 12 }}>
          <ActionStatus status={status} />
        </div>
      )}

      {!deadlineReached && (
        <p className="hint" style={{ marginTop: 10 }}>
          Settlement unlocks automatically once the chain reaches block #
          {config.lockUntilBlock.toLocaleString()}.
        </p>
      )}
    </section>
  );
}
