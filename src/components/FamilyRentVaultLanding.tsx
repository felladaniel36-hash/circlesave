"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  connect,
  disconnect,
  isConnected,
  getLocalStorage,
  openContractCall,
} from "@stacks/connect";
import {
  uintCV,
  contractPrincipalCV,
  noneCV,
  someCV,
  principalCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  PostConditionMode,
} from "@stacks/transactions";
import { extractStxAddress } from "@/lib/wallet";

// ---------------------------------------------------------------------------
// Contract targets (Stacks Testnet — already deployed)
// ---------------------------------------------------------------------------

const CONTRACT_ADDRESS = "STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD";
const CONTRACT_NAME = "flowvault-v2";
const TOKEN_CONTRACT_ADDRESS = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const TOKEN_CONTRACT_NAME = "usdcx";
const NETWORK = "testnet" as const;
const USDCX_DECIMALS = 6;
const MICRO = 10 ** USDCX_DECIMALS;

// ---------------------------------------------------------------------------
// Progress ring geometry
// ---------------------------------------------------------------------------

const RING_RADIUS = 80;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ≈ 502.65

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contributor {
  id: string;
  name: string;
  address: string;
  amount: number;
  status: "Confirmed" | "Pending";
}

type StatusKind = "ok" | "err" | "info";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Robustly coerce a parsed Clarity uint (bigint|number|string|{value}) to a JS number. */
function toUint(v: unknown): number {
  let n: unknown = v;
  while (n && typeof n === "object" && "value" in (n as Record<string, unknown>)) {
    n = (n as Record<string, unknown>).value;
  }
  if (typeof n === "bigint") return Number(n);
  if (typeof n === "number") return n;
  if (typeof n === "string" && /^\d+$/.test(n)) return Number(n);
  return 0;
}

/** Convert a decimal token string (e.g. "1.5") to integer micro-units. */
function tokenToMicro(amountStr: string): bigint {
  const trimmed = (amountStr || "").trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid amount (e.g. 10 or 1.5).");
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > USDCX_DECIMALS) {
    throw new Error(`Maximum ${USDCX_DECIMALS} decimal places.`);
  }
  const padded = frac.padEnd(USDCX_DECIMALS, "0");
  return BigInt(whole) * BigInt(MICRO) + BigInt(padded || "0");
}

function explorerTx(txid: string): string {
  const id = txid.startsWith("0x") ? txid : `0x${txid}`;
  return `https://explorer.hiro.so/txid/${id}?chain=testnet`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FamilyRentVaultLanding() {
  // --- Wallet state ---
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  // --- On-chain state (populated from get-vault-state) ---
  const [vaultBalance, setVaultBalance] = useState(350); // token-scale, for the ring
  const [unlockedMicro, setUnlockedMicro] = useState(0); // micro, for settlement
  const [targetGoal] = useState(1000);
  const [currentBlock, setCurrentBlock] = useState(842100);
  const [targetUnlockBlock, setTargetUnlockBlock] = useState(843500);

  // --- Registry + inputs ---
  const [contributorsList, setContributorsList] = useState<Contributor[]>([
    { id: "alice", name: "Alice", address: "ST1P...GZGM", amount: 150, status: "Confirmed" },
    { id: "bob", name: "Bob", address: "ST3A...X932", amount: 200, status: "Confirmed" },
  ]);
  const [depositAmount, setDepositAmount] = useState("");
  const [landlordAddress, setLandlordAddress] = useState("");

  // --- Add-sibling form ---
  const [isAddingSibling, setIsAddingSibling] = useState(false);
  const [siblingName, setSiblingName] = useState("");
  const [siblingAddress, setSiblingAddress] = useState("");

  // --- Status toasts ---
  const [status, setStatus] = useState<{ kind: StatusKind; msg: string; txid?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Ref so async/onFinish callbacks read the latest landlord without stale closures
  const landlordRef = useRef(landlordAddress);
  useEffect(() => {
    landlordRef.current = landlordAddress;
  }, [landlordAddress]);

  // --- Restore session + local persistence on mount ---
  useEffect(() => {
    if (isConnected()) {
      const stored = getLocalStorage();
      const addr = extractStxAddress(stored?.addresses);
      if (addr) setWalletAddress(addr);
    }
    try {
      const c = window.localStorage.getItem("frv.landing.contributors.v1");
      if (c) {
        const parsed = JSON.parse(c);
        if (Array.isArray(parsed) && parsed.length) setContributorsList(parsed);
      }
      const ll = window.localStorage.getItem("frv.landing.landlord.v1");
      if (ll) setLandlordAddress(ll);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("frv.landing.contributors.v1", JSON.stringify(contributorsList));
    } catch {
      /* ignore */
    }
  }, [contributorsList]);

  useEffect(() => {
    try {
      window.localStorage.setItem("frv.landing.landlord.v1", landlordAddress);
    } catch {
      /* ignore */
    }
  }, [landlordAddress]);

  // =========================================================================
  // (1) WALLET CONNECT — v8 uses connect() (showConnect was removed)
  // =========================================================================
  const connectWallet = useCallback(async () => {
    setWalletError("");
    setIsConnecting(true);
    try {
      const res = await connect({
        network: NETWORK,
        forceWalletSelect: true,
      });
      const addr = extractStxAddress(res?.addresses);
      if (!addr) {
        setWalletError("No Stacks account found. Select an STX account in your wallet.");
        return;
      }
      setWalletAddress(addr);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWalletError(/reject|cancel|denied|abort/i.test(msg) ? "Connection cancelled." : msg);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    try {
      disconnect();
    } catch {
      /* ignore */
    }
    setWalletAddress(null);
    setUnlockedMicro(0);
  }, []);

  // =========================================================================
  // (4) DYNAMIC DATA — fetchCallReadOnlyFunction for live vault state + block
  // =========================================================================
  const refreshVaultState = useCallback(async () => {
    if (!walletAddress) return;
    try {
      // current block height
      const blockCv = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "get-current-block-height",
        functionArgs: [],
        senderAddress: walletAddress,
        network: NETWORK,
      });
      setCurrentBlock(toUint(cvToValue(blockCv, true)));

      // vault state for this wallet
      const stateCv = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "get-vault-state",
        functionArgs: [principalCV(walletAddress)],
        senderAddress: walletAddress,
        network: NETWORK,
      });
      const state = cvToValue(stateCv, true) as Record<string, unknown>;

      const totalMicro = toUint(state["total-balance"]);
      const unlocked = toUint(state["unlocked-balance"]);
      const lockUntil = toUint(state["lock-until-block"]);

      setVaultBalance(totalMicro / MICRO);
      setUnlockedMicro(unlocked);
      if (lockUntil > 0) setTargetUnlockBlock(lockUntil);
    } catch (e) {
      // Silent fail on reads — chain may be unreachable; UI keeps last values.
      console.warn("vault read failed", e);
    }
  }, [walletAddress]);

  // Fetch live data when a wallet connects, then poll every 20s
  useEffect(() => {
    if (!walletAddress) return;
    void refreshVaultState();
    const id = window.setInterval(() => void refreshVaultState(), 20000);
    return () => window.clearInterval(id);
  }, [walletAddress, refreshVaultState]);

  // =========================================================================
  // (2) DEPOSIT — openContractCall: set-routing-rules (lock) → deposit
  // =========================================================================
  const handleContribute = useCallback(() => {
    setStatus(null);
    setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    let micro: bigint;
    try {
      micro = tokenToMicro(depositAmount);
    } catch (e) {
      return setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Invalid amount." });
    }

    setBusy(true);
    setStatus({ kind: "info", msg: "Approve the LOCK rule in your wallet (1/2)…" });

    // Step 1 — configure the time-lock for this deposit
    openContractCall({
      network: NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: "set-routing-rules",
      functionArgs: [
        uintCV(micro), // lock-amount  (full deposit locked)
        uintCV(targetUnlockBlock), // lock-until-block (family deadline)
        noneCV(), // split-address (none during the savings phase)
        uintCV(0), // split-amount
      ],
      postConditionMode: PostConditionMode.Allow,
      onFinish: () => {
        setStatus({ kind: "info", msg: "Lock set. Now approve the USDCx DEPOSIT (2/2)…" });
        // Step 2 — deposit; FlowVault applies the lock at deposit time
        openContractCall({
          network: NETWORK,
          contractAddress: CONTRACT_ADDRESS,
          contractName: CONTRACT_NAME,
          functionName: "deposit",
          functionArgs: [
            contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME),
            uintCV(micro),
          ],
          postConditionMode: PostConditionMode.Allow,
          onFinish: (payload) => {
            setStatus({
              kind: "ok",
              msg: `Locked ${Number(micro) / MICRO} USDCx until block #${targetUnlockBlock.toLocaleString()}.`,
              txid: payload.txId,
            });
            setDepositAmount("");
            setBusy(false);
            void refreshVaultState();
          },
          onCancel: () => {
            setStatus({ kind: "err", msg: "Deposit cancelled in wallet." });
            setBusy(false);
          },
        });
      },
      onCancel: () => {
        setStatus({ kind: "err", msg: "Lock rule cancelled in wallet." });
        setBusy(false);
      },
    });
  }, [walletAddress, depositAmount, targetUnlockBlock, refreshVaultState]);

  // =========================================================================
  // (3) SETTLE & ROUTE — withdraw (unlock) → set-routing-rules (split) → deposit
  //     The FlowVault contract applies Split at deposit time, so we route to
  //     the landlord by withdrawing first, then depositing with a split rule.
  // =========================================================================
  const handleSettleAndRoute = useCallback(() => {
    setStatus(null);
    setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    if (targetUnlockBlock === 0) return setStatus({ kind: "err", msg: "No lock configured yet." });
    if (currentBlock < targetUnlockBlock)
      return setStatus({ kind: "err", msg: "Deadline block not reached yet." });

    const ll = landlordRef.current.trim();
    if (!ll) return setStatus({ kind: "err", msg: "Set a landlord address first." });
    if (!/^(ST|SP|SM|SN)[0-9A-Z]{30,}/i.test(ll))
      return setStatus({ kind: "err", msg: "Landlord address looks invalid." });

    const micro = BigInt(unlockedMicro);
    if (micro <= 0n) return setStatus({ kind: "err", msg: "Nothing unlocked to settle." });

    setBusy(true);
    setStatus({ kind: "info", msg: "Approve WITHDRAW to unlock funds (1/3)…" });

    // Step 1 — withdraw unlocked balance back to the contributor
    openContractCall({
      network: NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: "withdraw",
      functionArgs: [
        contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME),
        uintCV(micro),
      ],
      postConditionMode: PostConditionMode.Allow,
      onFinish: () => {
        setStatus({ kind: "info", msg: "Approve the SPLIT rule → landlord (2/3)…" });
        // Step 2 — set routing rule to split the full amount to the landlord
        openContractCall({
          network: NETWORK,
          contractAddress: CONTRACT_ADDRESS,
          contractName: CONTRACT_NAME,
          functionName: "set-routing-rules",
          functionArgs: [
            uintCV(0), // lock-amount
            uintCV(0), // lock-until-block
            someCV(principalCV(ll)), // split-address = landlord
            uintCV(micro), // split-amount
          ],
          postConditionMode: PostConditionMode.Allow,
          onFinish: () => {
            setStatus({ kind: "info", msg: "Approve DEPOSIT to route rent to landlord (3/3)…" });
            // Step 3 — deposit; FlowVault's Split routes the funds to the landlord
            openContractCall({
              network: NETWORK,
              contractAddress: CONTRACT_ADDRESS,
              contractName: CONTRACT_NAME,
              functionName: "deposit",
              functionArgs: [
                contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME),
                uintCV(micro),
              ],
              postConditionMode: PostConditionMode.Allow,
              onFinish: (payload) => {
                setStatus({
                  kind: "ok",
                  msg: `Routed ${Number(micro) / MICRO} USDCx to the landlord.`,
                  txid: payload.txId,
                });
                setBusy(false);
                void refreshVaultState();
              },
              onCancel: () => {
                setStatus({ kind: "err", msg: "Final deposit cancelled." });
                setBusy(false);
              },
            });
          },
          onCancel: () => {
            setStatus({ kind: "err", msg: "Split rule cancelled." });
            setBusy(false);
          },
        });
      },
      onCancel: () => {
        setStatus({ kind: "err", msg: "Withdraw cancelled." });
        setBusy(false);
      },
    });
  }, [walletAddress, currentBlock, targetUnlockBlock, unlockedMicro, refreshVaultState]);

  // --- Add sibling ---
  const handleJoinVault = useCallback(() => {
    const name = siblingName.trim();
    const address = siblingAddress.trim();
    if (!name || !address) return;
    setContributorsList((prev) => [
      ...prev,
      { id: `sib-${Date.now()}`, name, address, amount: 0, status: "Pending" },
    ]);
    setSiblingName("");
    setSiblingAddress("");
    setIsAddingSibling(false);
  }, [siblingName, siblingAddress]);

  // --- Derived ---
  const progress = Math.min(1, vaultBalance / targetGoal);
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const settlementReady = targetUnlockBlock > 0 && currentBlock >= targetUnlockBlock;

  // -------------------------------------------------------------------------
  return (
    <>
      {/* ============================== Top Nav ============================== */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-container-max mx-auto px-margin-desktop h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              lock_clock
            </span>
            <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">
              Family Rent Vault
            </span>
          </div>

          <div className="flex items-center gap-stack-md">
            {walletAddress ? (
              <div className="hidden md:flex flex-col items-end mr-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full pulse-green" />
                  <span className="font-data-mono text-data-mono text-on-surface">{walletAddress.slice(0, 7)}…{walletAddress.slice(-4)}</span>
                </div>
                <button onClick={disconnectWallet} className="font-label-caps text-label-caps text-primary hover:underline transition-all">
                  Disconnect
                </button>
              </div>
            ) : (
              <button onClick={connectWallet} disabled={isConnecting} className="bg-primary-container text-on-primary-container px-6 py-2 rounded-lg font-bold hover:scale-95 transition-transform disabled:opacity-60">
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </button>
            )}
            {walletAddress && (
              <button onClick={disconnectWallet} className="bg-primary-container text-on-primary-container px-6 py-2 rounded-lg font-bold hover:scale-95 transition-transform">
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </button>
            )}
            <span className="material-symbols-outlined text-primary cursor-pointer">account_balance_wallet</span>
          </div>
        </div>
      </header>

      {/* =============================== Main ================================ */}
      <main className="pt-32 pb-20 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
        {/* Hero */}
        <section className="text-center mb-20 relative">
          <div className="relative z-10 max-w-3xl mx-auto">
            <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg mb-6 leading-tight">
              Programmable <span className="text-primary">Collective Savings</span>
            </h1>
            <p className="font-body-base text-on-surface-variant max-w-xl mx-auto mb-10">
              Pool USDCx securely with family members to meet fixed milestones—programmatically locked and automatically routed straight to your landlord.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button className="bg-primary-container text-on-primary-container px-8 py-3 rounded-xl font-bold neon-glow-orange hover:bg-secondary transition-colors">
                Launch Your Vault
              </button>
              <button className="border border-zinc-700 text-white px-8 py-3 rounded-xl font-medium hover:bg-zinc-900 transition-colors">
                View Audit
              </button>
            </div>
          </div>
        </section>

        {/* Errors */}
        {walletError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-body-sm">
            {walletError}
          </div>
        )}
        {status && (
          <div className={`mb-6 p-4 rounded-xl border font-body-sm flex items-center gap-3 ${status.kind === "ok" ? "bg-green-500/10 border-green-500/30 text-green-300" : status.kind === "err" ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : "bg-amber-500/10 border-amber-500/30 text-amber-300"}`}>
            <span className="material-symbols-outlined text-sm">
              {status.kind === "ok" ? "check_circle" : status.kind === "err" ? "error" : "hourglass_top"}
            </span>
            <span className="flex-1">{status.msg}</span>
            {status.txid && (
              <a href={explorerTx(status.txid)} target="_blank" rel="noreferrer" className="font-data-mono text-xs underline">
                tx ↗
              </a>
            )}
          </div>
        )}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-stack-lg">
          {/* ===== Left Column ===== */}
          <div className="space-y-stack-lg">
            {/* Rent Completion */}
            <div className="glass-panel p-stack-lg rounded-xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="font-headline-md text-headline-md text-white mb-1">Rent Completion</h3>
                  <p className="font-body-sm text-on-surface-variant">Block-synced treasury status</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-500 text-sm">lock</span>
                  <span className="font-label-caps text-label-caps text-amber-500">
                    {settlementReady ? "Settlement Open" : "Status: Time-Locked"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center py-6">
                <div className="relative w-48 h-48">
                  <svg className="w-full h-full" viewBox="0 0 192 192">
                    <circle className="text-zinc-800" cx="96" cy="96" fill="transparent" r={RING_RADIUS} stroke="currentColor" strokeWidth="8" />
                    <circle className="text-primary progress-ring-circle" cx="96" cy="96" fill="transparent" r={RING_RADIUS} stroke="currentColor" strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={strokeDashoffset} strokeLinecap="round" strokeWidth="10" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="font-display-lg text-2xl text-white">{vaultBalance.toLocaleString()}</span>
                    <span className="font-label-caps text-xs text-on-surface-variant">OF {targetGoal.toLocaleString()} USDCx</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-outline-variant">
                <div>
                  <p className="font-label-caps text-on-surface-variant mb-1">Current Block</p>
                  <p className="font-data-mono text-primary">#{currentBlock.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-label-caps text-on-surface-variant mb-1">Target Unlock</p>
                  <p className="font-data-mono text-on-surface">#{targetUnlockBlock > 0 ? targetUnlockBlock.toLocaleString() : "—"}</p>
                </div>
              </div>
            </div>

            {/* Financial Action */}
            <div className="glass-panel p-stack-lg rounded-xl">
              <h3 className="font-headline-md text-headline-md text-white mb-6">Financial Action</h3>
              <div className="space-y-6">
                <div>
                  <label className="font-label-caps text-on-surface-variant mb-2 block">Amount to Contribute (USDCx)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 font-label-caps text-on-surface-variant">USDCx</div>
                  </div>
                </div>
                <button
                  onClick={handleContribute}
                  disabled={busy || !walletAddress}
                  className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined">bolt</span>
                  {busy ? "Awaiting wallet…" : "Contribute to Rent"}
                </button>
              </div>
            </div>

            {/* Settlement Zone */}
            <div className="glass-panel p-stack-lg rounded-xl border border-dashed border-zinc-800">
              <div className="flex flex-col items-center text-center">
                <h3 className="font-headline-md text-headline-md text-white mb-2">Settlement Zone</h3>
                <p className="font-body-sm text-on-surface-variant mb-4 max-w-sm">
                  Unlocks automatically when Target Block Height is reached, then routes to the landlord via FlowVault Split.
                </p>
                {/* Landlord address */}
                <div className="w-full mb-6">
                  <label className="font-label-caps text-on-surface-variant mb-2 block text-left">Landlord Wallet Address</label>
                  <input
                    value={landlordAddress}
                    onChange={(e) => setLandlordAddress(e.target.value)}
                    placeholder="ST… landlord address"
                    className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono text-sm"
                  />
                </div>
                <button
                  onClick={handleSettleAndRoute}
                  disabled={busy || !settlementReady || !landlordAddress.trim()}
                  className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all ${settlementReady && landlordAddress.trim() ? "bg-primary-container text-on-primary-container hover:scale-[0.98] cursor-pointer" : "bg-zinc-800/50 text-zinc-500 cursor-not-allowed opacity-50"}`}
                >
                  <span className="material-symbols-outlined">{settlementReady ? "lock_open" : "lock"}</span>
                  {busy ? "Awaiting wallet…" : "Settle Rent & Route Funds"}
                </button>
                {!settlementReady && (
                  <p className="font-body-sm text-on-surface-variant mt-3">
                    Locked until block #{targetUnlockBlock.toLocaleString()} (current #{currentBlock.toLocaleString()}).
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ===== Right Column ===== */}
          <div className="space-y-stack-lg">
            {/* Family Registry */}
            <div className="glass-panel p-stack-lg rounded-xl h-full flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-headline-md text-headline-md text-white">Family Registry</h3>
                <span className="font-label-caps text-primary">
                  {contributorsList.length} Active {contributorsList.length === 1 ? "Sibling" : "Siblings"}
                </span>
              </div>

              <div className="space-y-4 flex-grow">
                {contributorsList.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-4 bg-surface-container rounded-lg border border-outline-variant hover:border-primary/30 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                        <span className="material-symbols-outlined text-zinc-400">person</span>
                      </div>
                      <div>
                        <p className="font-body-base font-bold text-white">{c.name}</p>
                        <p className="font-data-mono text-xs text-on-surface-variant">{c.address}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-data-mono text-primary">{c.amount} USDCx</p>
                      <p className={`font-label-caps text-[10px] ${c.status === "Confirmed" ? "text-green-500" : "text-amber-500"}`}>{c.status}</p>
                    </div>
                  </div>
                ))}

                {isAddingSibling ? (
                  <div className="p-4 border border-primary/30 rounded-lg bg-primary/5 space-y-3">
                    <input value={siblingName} onChange={(e) => setSiblingName(e.target.value)} placeholder="Sibling name" className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-body-base" />
                    <input value={siblingAddress} onChange={(e) => setSiblingAddress(e.target.value)} placeholder="ST… wallet address" className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono text-sm" />
                    <div className="flex gap-3">
                      <button onClick={handleJoinVault} disabled={!siblingName.trim() || !siblingAddress.trim()} className="flex-1 bg-primary-container text-on-primary-container font-bold py-3 rounded-lg hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
                        Add Sibling
                      </button>
                      <button onClick={() => { setIsAddingSibling(false); setSiblingName(""); setSiblingAddress(""); }} className="px-4 border border-zinc-700 text-zinc-400 font-medium py-3 rounded-lg hover:bg-zinc-900 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setIsAddingSibling(true)} className="w-full p-4 border border-dashed border-zinc-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group">
                    <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">add_circle</span>
                    <span className="font-label-caps text-on-surface-variant group-hover:text-primary transition-colors">+ Add Sibling Wallet Address</span>
                  </button>
                )}
              </div>

              {/* Recent Activity */}
              <div className="mt-12 bg-black rounded-xl overflow-hidden border border-zinc-800">
                <div className="p-6 border-b border-zinc-800">
                  <p className="font-label-caps text-on-surface-variant">Recent Activity</p>
                </div>
                <div>
                  <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-900/50">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-sm">receipt_long</span>
                      <span className="font-body-sm">Alice contributed 50 USDCx</span>
                    </div>
                    <span className="font-data-mono text-xs text-zinc-500">2h ago</span>
                  </div>
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-sm">receipt_long</span>
                      <span className="font-body-sm">Bob joined the Vault</span>
                    </div>
                    <span className="font-data-mono text-xs text-zinc-500">5h ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ============================== Footer ============================== */}
      <footer className="mt-20 border-t border-outline-variant bg-background">
        <div className="max-w-container-max mx-auto px-margin-desktop py-stack-lg flex flex-col md:flex-row justify-between items-center gap-stack-md">
          <div className="flex items-center gap-2 opacity-80">
            <span className="material-symbols-outlined text-primary">lock_clock</span>
            <p className="font-body-sm text-on-surface-variant">© 2026 Family Rent Vault. Secured by Smart Contract.</p>
          </div>
          <div className="flex gap-stack-md">
            <a className="font-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</a>
            <a className="font-body-sm text-on-surface-variant hover:text-primary transition-colors" href="#">Terms of Service</a>
            <a className="font-body-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1" href="#">
              Security Audit
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
