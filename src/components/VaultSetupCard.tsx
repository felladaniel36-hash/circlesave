"use client";

import { useState } from "react";
import { tokenToMicro } from "flowvault-sdk";
import type { VaultConfig } from "@/lib/store";
import { explorerContract } from "@/lib/constants";

const PRESETS: ReadonlyArray<readonly [string, string]> = [
  ["1 day", "144"],
  ["2 days", "288"],
  ["1 week", "1008"],
  ["~1 month", "4320"],
];

export function VaultSetupCard({
  currentBlock,
  onCreate,
}: {
  currentBlock: number | null;
  onCreate: (cfg: VaultConfig) => void;
}) {
  const [name, setName] = useState("Parents' Rent");
  const [goal, setGoal] = useState("1000");
  const [landlord, setLandlord] = useState("");
  const [mode, setMode] = useState<"duration" | "absolute">("duration");
  const [blocks, setBlocks] = useState("288");
  const [err, setErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!name.trim()) return setErr("Give your family vault a name.");

    let goalMicro: bigint;
    try {
      goalMicro = tokenToMicro(goal);
    } catch {
      return setErr("Enter a valid rent goal in USDCx (e.g. 1000).");
    }
    if (goalMicro <= 0n) return setErr("Rent goal must be greater than zero.");

    const ll = landlord.trim();
    if (!ll) return setErr("Enter the landlord's Stacks address.");
    if (!/^(ST|SP|SM|SN)[0-9A-Z]{30,}/i.test(ll))
      return setErr("Landlord address looks invalid (should start with ST/SP/SM/SN).");

    const n = Number(blocks);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0)
      return setErr("Enter a positive whole number of blocks.");

    let lockUntilBlock: number;
    if (mode === "duration") {
      if (currentBlock == null)
        return setErr("Fetching current block height… please retry in a moment.");
      lockUntilBlock = currentBlock + n;
    } else {
      lockUntilBlock = n;
      if (currentBlock != null && lockUntilBlock <= currentBlock)
        return setErr("Absolute deadline must be a block in the future.");
    }

    onCreate({
      name: name.trim(),
      goalMicro: Number(goalMicro),
      lockUntilBlock,
      landlordAddress: ll,
      createdAt: Date.now(),
    });
  }

  return (
    <div className="setup-wrap">
      <section className="card card--setup">
        <div className="card-head">
          <h3 className="card-title">Create the Family Rent Vault</h3>
          <span className="badge badge--muted">Config</span>
        </div>
        <p className="card-desc">
          Define the shared rent goal, the deadline (as a Stacks block height),
          and the landlord who will receive the funds. Every contributor then
          locks deposits against this same deadline.
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label>Vault name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Parents' Rent — July"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Rent goal (USDCx)</label>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="1000"
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label>Landlord address</label>
              <input
                value={landlord}
                onChange={(e) => setLandlord(e.target.value)}
                placeholder="ST… or SP…"
              />
            </div>
          </div>

          <div className="field">
            <label>Deadline</label>
            <div className="field-row" style={{ marginBottom: 2 }}>
              <select
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "duration" | "absolute")
                }
              >
                <option value="duration">Duration (blocks from now)</option>
                <option value="absolute">Absolute block height</option>
              </select>
              <input
                value={blocks}
                onChange={(e) => setBlocks(e.target.value)}
                placeholder={mode === "duration" ? "288" : "8812000"}
                inputMode="numeric"
              />
            </div>
            {mode === "duration" ? (
              <>
                <div className="preset-row" style={{ marginTop: 2 }}>
                  {PRESETS.map(([label, val]) => (
                    <button
                      type="button"
                      key={val}
                      className={`preset ${blocks === val ? "preset--active" : ""}`}
                      onClick={() => setBlocks(val)}
                    >
                      {label} · {val}
                    </button>
                  ))}
                </div>
                <span className="hint">
                  ~144 Stacks blocks ≈ 1 day. Resolves to absolute block{" "}
                  {currentBlock != null
                    ? `#${(currentBlock + Number(blocks || 0)).toLocaleString()}`
                    : "…"}
                  {currentBlock != null
                    ? ` (current #${currentBlock.toLocaleString()})`
                    : ""}
                  .
                </span>
              </>
            ) : (
              <span className="hint">
                Enter a future Stacks block height directly.
              </span>
            )}
          </div>

          {err && <div className="toast toast--err">{err}</div>}

          <button className="btn btn--primary btn--block" type="submit">
            Create vault
          </button>

          <div className="note-row">
            <span>ℹ️</span>
            <span>
              This configuration is stored locally in your browser and shared
              with your family via the deadline + landlord address. No on-chain
              transaction is required to create it.
            </span>
          </div>
        </form>
      </section>

      <aside className="card">
        <div className="card-head">
          <h3 className="card-title">How it works</h3>
        </div>
        <div className="how">
          <div className="how-step">
            <div className="how-num">1</div>
            <div>
              <h4>Create</h4>
              <p>
                Set the rent goal, deadline block, and landlord. Shared with the
                whole family.
              </p>
            </div>
          </div>
          <div className="how-step">
            <div className="how-num">2</div>
            <div>
              <h4>Lock (FlowVault Lock)</h4>
              <p>
                Each member&apos;s deposit is time-locked until the deadline. No
                early withdrawals — the contract rejects them (error u1003).
              </p>
            </div>
          </div>
          <div className="how-step">
            <div className="how-num">3</div>
            <div>
              <h4>Settle (FlowVault Split)</h4>
              <p>
                After the deadline, funds are routed to the landlord on-chain
                via the Split primitive.
              </p>
            </div>
          </div>
          <div className="divider" />
          <div className="kvs">
            <div className="kv">
              <span className="k">Vault contract</span>
              <a
                className="v link mono"
                href={explorerContract()}
                target="_blank"
                rel="noreferrer"
              >
                view ↗
              </a>
            </div>
            <div className="kv">
              <span className="k">Token</span>
              <span className="v mono">USDCx (6 decimals)</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
