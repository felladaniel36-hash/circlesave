"use client";

import { useState } from "react";
import { FlowVault, tokenToMicro } from "flowvault-sdk";
import { extractTxId } from "@/lib/flowvault";
import { USDCX_SYMBOL } from "@/lib/constants";
import { fmtUsdc } from "@/lib/format";
import type { VaultConfig } from "@/lib/store";
import { ActionStatus, type ActionStatusData } from "./ActionStatus";

function cleanTxid(res: unknown): string | null {
  const id = extractTxId(res);
  return id && id !== "wallet-submitted" ? id : null;
}

export function ContributeCard({
  flowVault,
  config,
  address,
  currentBlock,
  myLockedMicro,
  locked,
  onContributed,
}: {
  flowVault: FlowVault | null;
  config: VaultConfig;
  address: string | null;
  currentBlock: number | null;
  myLockedMicro: number;
  locked: boolean;
  onContributed: (addr: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ActionStatusData | null>(null);

  const ready = !!flowVault && !!address && currentBlock != null;

  async function contribute(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!flowVault || !address) {
      setStatus({ kind: "err", msg: "Connect your wallet first." });
      return;
    }
    if (!locked) {
      setStatus({
        kind: "err",
        msg: "The deadline has passed — use Settle Rent instead of contributing.",
      });
      return;
    }

    let micro: bigint;
    try {
      micro = tokenToMicro(amount);
    } catch {
      setStatus({ kind: "err", msg: "Enter a valid USDCx amount." });
      return;
    }
    if (micro <= 0n) {
      setStatus({ kind: "err", msg: "Amount must be greater than zero." });
      return;
    }

    setBusy(true);
    try {
      setStatus({
        kind: "info",
        step: "1/2",
        msg: "Approve the lock rule in your wallet (locks funds until the deadline)…",
      });
      await flowVault.setRoutingRules({
        lockAmount: micro,
        lockUntilBlock: config.lockUntilBlock,
        splitAddress: null,
        splitAmount: 0n,
      });

      setStatus({
        kind: "info",
        step: "2/2",
        msg: "Approve the USDCx deposit in your wallet…",
      });
      const res = await flowVault.deposit(micro);

      setStatus({
        kind: "ok",
        msg: `Locked ${fmtUsdc(Number(micro))} ${USDCX_SYMBOL} until block #${config.lockUntilBlock.toLocaleString()}.`,
        txid: cleanTxid(res),
      });
      setAmount("");
      onContributed(address);
    } catch (err) {
      setStatus({
        kind: "err",
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function attemptEarlyWithdraw() {
    setStatus(null);
    if (!flowVault || !address) {
      setStatus({ kind: "err", msg: "Connect your wallet first." });
      return;
    }
    setBusy(true);
    try {
      setStatus({
        kind: "info",
        step: "proof",
        msg: "Attempting an early withdrawal — approve in your wallet. It will be rejected on-chain…",
      });
      const micro = tokenToMicro("1");
      const res = await flowVault.withdraw(micro);
      setStatus({
        kind: "info",
        msg: "Broadcast — this transaction will fail on-chain with ERR-FUNDS-LOCKED (u1003). Capture this hash as your lock-enforcement proof.",
        txid: cleanTxid(res),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isLock =
        msg.includes("1003") || msg.toLowerCase().includes("locked");
      setStatus({
        kind: isLock ? "ok" : "err",
        msg: isLock ? `✅ Lock enforced: ${msg}` : msg,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h3 className="card-title">Contribute to Rent</h3>
        {locked ? (
          <span className="badge badge--locked">funds locked</span>
        ) : (
          <span className="badge badge--muted">deadline passed</span>
        )}
      </div>

      <p className="card-desc">
        Your deposit is fully locked against the family deadline. Because the
        contract&apos;s <span className="mono">deposit</span> applies the routing
        rule, the funds cannot be withdrawn early.
      </p>

      {myLockedMicro > 0 && (
        <div className="note-row" style={{ marginBottom: 14 }}>
          <span>🔒</span>
          <span>
            Your locked contribution so far:{" "}
            <strong>
              {fmtUsdc(myLockedMicro)} {USDCX_SYMBOL}
            </strong>
          </span>
        </div>
      )}

      <form onSubmit={contribute} style={{ display: "grid", gap: 12 }}>
        <div className="field">
          <label>Amount ({USDCX_SYMBOL})</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="250"
            inputMode="decimal"
            disabled={busy || !locked}
          />
        </div>
        <button
          className="btn btn--primary btn--block"
          type="submit"
          disabled={busy || !ready || !locked}
        >
          {busy ? <span className="loader" /> : null}
          {busy ? "Awaiting wallet…" : "Lock contribution"}
        </button>
      </form>

      <div className="divider" />

      <button
        className="btn btn--ghost btn--block"
        onClick={attemptEarlyWithdraw}
        disabled={busy || !ready || !locked}
        title="Proves the time-lock by attempting a withdraw that must fail"
      >
        🛡️ Attempt early withdrawal (lock-enforcement proof)
      </button>

      {status && (
        <div style={{ marginTop: 12 }}>
          <ActionStatus status={status} />
        </div>
      )}

      {!address && (
        <p className="hint" style={{ marginTop: 10 }}>
          Connect a Stacks Testnet wallet (Leather / Hiro) to contribute. You
          need testnet STX for gas and testnet USDCx to deposit.
        </p>
      )}
    </section>
  );
}
