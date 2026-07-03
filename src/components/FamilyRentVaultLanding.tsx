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

// ~144 Stacks blocks ≈ 1 day (≈10 min/block). For duration presets only.
const BLOCK_TIME_MIN = 10;
const DAY_BLOCKS = Math.round((24 * 60) / BLOCK_TIME_MIN); // 144

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

interface VaultConfig {
  goal: number; // target USDCx (token-scale)
  deadlineBlock: number; // absolute Stacks block height
  landlord: string; // landlord STX address
  createdAt: number;
}

type StatusKind = "ok" | "err" | "info";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function blocksToHuman(blocks: number): string {
  if (blocks <= 0) return "now";
  const totalMin = Math.round(blocks * BLOCK_TIME_MIN);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && mins > 0) parts.push(`${mins}m`);
  return parts.join(" ") || "<1m";
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
  const [vaultBalance, setVaultBalance] = useState(0); // token-scale
  const [unlockedMicro, setUnlockedMicro] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(0);

  // --- Vault configuration (goal + deadline + landlord) ---
  const [vaultConfig, setVaultConfig] = useState<VaultConfig | null>(null);
  const [showVaultSetup, setShowVaultSetup] = useState(false);

  // --- Registry + inputs ---
  const [contributorsList, setContributorsList] = useState<Contributor[]>([]);
  const [depositAmount, setDepositAmount] = useState("");

  // --- Setup form fields ---
  const [setupGoal, setSetupGoal] = useState("1000");
  const [setupDeadlineMode, setSetupDeadlineMode] = useState<"calendar" | "duration" | "absolute">("calendar");
  const [setupDeadlineValue, setSetupDeadlineValue] = useState(String(DAY_BLOCKS * 7)); // ~1 week (duration mode)
  const [setupDeadlineDate, setSetupDeadlineDate] = useState(""); // yyyy-mm-dd (calendar mode)
  const [setupLandlord, setSetupLandlord] = useState("");
  const [setupError, setSetupError] = useState("");

  // --- Add-sibling form ---
  const [isAddingSibling, setIsAddingSibling] = useState(false);
  const [siblingName, setSiblingName] = useState("");
  const [siblingAddress, setSiblingAddress] = useState("");

  // --- Status toasts ---
  const [status, setStatus] = useState<{ kind: StatusKind; msg: string; txid?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Refs so chained openContractCall callbacks read latest config
  const configRef = useRef(vaultConfig);
  useEffect(() => {
    configRef.current = vaultConfig;
  }, [vaultConfig]);

  // --- Restore session + local persistence on mount ---
  useEffect(() => {
    // Default calendar date = 7 days from today
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    setSetupDeadlineDate(defaultDate.toISOString().slice(0, 10));

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
      const cfg = window.localStorage.getItem("frv.landing.config.v1");
      if (cfg) {
        const parsed = JSON.parse(cfg) as VaultConfig;
        if (parsed && parsed.deadlineBlock > 0) {
          setVaultConfig(parsed);
          setSetupGoal(String(parsed.goal));
          setSetupLandlord(parsed.landlord);
        }
      }
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

  // =========================================================================
  // (1) WALLET CONNECT — v8 uses connect() (showConnect was removed)
  // =========================================================================
  const connectWallet = useCallback(async () => {
    setWalletError("");
    setIsConnecting(true);
    try {
      const res = await connect({ network: NETWORK, forceWalletSelect: true });
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
      const blockCv = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "get-current-block-height",
        functionArgs: [],
        senderAddress: walletAddress,
        network: NETWORK,
      });
      setCurrentBlock(toUint(cvToValue(blockCv, true)));

      const stateCv = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "get-vault-state",
        functionArgs: [principalCV(walletAddress)],
        senderAddress: walletAddress,
        network: NETWORK,
      });
      const state = cvToValue(stateCv, true) as Record<string, unknown>;

      setVaultBalance(toUint(state["total-balance"]) / MICRO);
      setUnlockedMicro(toUint(state["unlocked-balance"]));
    } catch (e) {
      console.warn("vault read failed", e);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return;
    void refreshVaultState();
    const id = window.setInterval(() => void refreshVaultState(), 20000);
    return () => window.clearInterval(id);
  }, [walletAddress, refreshVaultState]);

  // =========================================================================
  // VAULT SETUP — resolve the configured goal/deadline/landlord
  // =========================================================================
  const createVault = useCallback(() => {
    setSetupError("");

    // Validate goal
    let goalMicro: bigint;
    try {
      goalMicro = tokenToMicro(setupGoal);
    } catch {
      return setSetupError("Enter a valid rent goal in USDCx (e.g. 1000).");
    }
    if (goalMicro <= 0n) return setSetupError("Goal must be greater than zero.");

    // Validate landlord
    const landlord = setupLandlord.trim();
    if (!landlord) return setSetupError("Enter the landlord's Stacks address.");
    if (!/^(ST|SP|SM|SN)[0-9A-Z]{30,}/i.test(landlord))
      return setSetupError("Landlord address looks invalid (should start with ST/SP/SM/SN).");

    // Resolve deadline block
    let deadlineBlock: number;
    if (setupDeadlineMode === "calendar") {
      if (!setupDeadlineDate) return setSetupError("Pick a calendar date for the deadline.");
      // Convert the selected date to a block height:
      // targetTime (end of selected day) → minutes from now → blocks → + currentBlock
      const targetMs = new Date(setupDeadlineDate + "T23:59:59").getTime();
      const nowMs = Date.now();
      if (Number.isNaN(targetMs)) return setSetupError("Invalid date selected.");
      if (targetMs <= nowMs) return setSetupError("Pick a future date.");
      if (currentBlock <= 0)
        return setSetupError("Connect your wallet first so we can read the current block height.");
      const diffMin = Math.max(1, Math.round((targetMs - nowMs) / 60000));
      deadlineBlock = currentBlock + Math.max(1, Math.round(diffMin / BLOCK_TIME_MIN));
    } else {
      const n = Number(setupDeadlineValue);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0)
        return setSetupError("Enter a positive whole number of blocks.");

      if (setupDeadlineMode === "duration") {
        if (currentBlock <= 0)
          return setSetupError("Connect your wallet first so we can read the current block height.");
        deadlineBlock = currentBlock + n;
      } else {
        // absolute
        deadlineBlock = n;
        if (currentBlock > 0 && deadlineBlock <= currentBlock)
          return setSetupError("Absolute deadline must be a future block.");
      }
    }

    const cfg: VaultConfig = {
      goal: Number(goalMicro) / MICRO,
      deadlineBlock,
      landlord,
      createdAt: Date.now(),
    };
    setVaultConfig(cfg);
    try {
      window.localStorage.setItem("frv.landing.config.v1", JSON.stringify(cfg));
    } catch {
      /* ignore */
    }
    setShowVaultSetup(false);
    setStatus({ kind: "ok", msg: `Vault created — goal ${cfg.goal} USDCx, unlocks at block #${deadlineBlock.toLocaleString()}.` });
  }, [setupGoal, setupLandlord, setupDeadlineMode, setupDeadlineValue, setupDeadlineDate, currentBlock]);

  // =========================================================================
  // (2) DEPOSIT — openContractCall: set-routing-rules (lock) → deposit
  // =========================================================================
  const handleContribute = useCallback(() => {
    setStatus(null);
    setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    const cfg = configRef.current;
    if (!cfg) return setStatus({ kind: "err", msg: "Create your vault first (Launch Your Vault)." });

    let micro: bigint;
    try {
      micro = tokenToMicro(depositAmount);
    } catch (e) {
      return setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Invalid amount." });
    }

    setBusy(true);
    setStatus({ kind: "info", msg: "Approve the LOCK rule in your wallet (1/2)…" });

    openContractCall({
      network: NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: "set-routing-rules",
      functionArgs: [
        uintCV(micro), // lock-amount (full deposit locked)
        uintCV(cfg.deadlineBlock), // lock-until-block (family deadline)
        noneCV(), // split-address (none during the savings phase)
        uintCV(0), // split-amount
      ],
      postConditionMode: PostConditionMode.Allow,
      onFinish: () => {
        setStatus({ kind: "info", msg: "Lock set. Now approve the USDCx DEPOSIT (2/2)…" });
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
              msg: `Locked ${Number(micro) / MICRO} USDCx until block #${cfg.deadlineBlock.toLocaleString()}.`,
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
  }, [walletAddress, depositAmount, refreshVaultState]);

  // =========================================================================
  // (3) SETTLE & ROUTE — withdraw → set-routing-rules (split) → deposit
  // =========================================================================
  const handleSettleAndRoute = useCallback(() => {
    setStatus(null);
    setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    const cfg = configRef.current;
    if (!cfg) return setStatus({ kind: "err", msg: "Create your vault first." });
    if (currentBlock < cfg.deadlineBlock)
      return setStatus({ kind: "err", msg: "Deadline block not reached yet." });

    const ll = cfg.landlord.trim();
    if (!/^(ST|SP|SM|SN)[0-9A-Z]{30,}/i.test(ll))
      return setStatus({ kind: "err", msg: "Landlord address looks invalid." });

    const micro = BigInt(unlockedMicro);
    if (micro <= 0n) return setStatus({ kind: "err", msg: "Nothing unlocked to settle." });

    setBusy(true);
    setStatus({ kind: "info", msg: "Approve WITHDRAW to unlock funds (1/3)…" });

    openContractCall({
      network: NETWORK,
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: "withdraw",
      functionArgs: [contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME), uintCV(micro)],
      postConditionMode: PostConditionMode.Allow,
      onFinish: () => {
        setStatus({ kind: "info", msg: "Approve the SPLIT rule → landlord (2/3)…" });
        openContractCall({
          network: NETWORK,
          contractAddress: CONTRACT_ADDRESS,
          contractName: CONTRACT_NAME,
          functionName: "set-routing-rules",
          functionArgs: [uintCV(0), uintCV(0), someCV(principalCV(ll)), uintCV(micro)],
          postConditionMode: PostConditionMode.Allow,
          onFinish: () => {
            setStatus({ kind: "info", msg: "Approve DEPOSIT to route rent to landlord (3/3)…" });
            openContractCall({
              network: NETWORK,
              contractAddress: CONTRACT_ADDRESS,
              contractName: CONTRACT_NAME,
              functionName: "deposit",
              functionArgs: [contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME), uintCV(micro)],
              postConditionMode: PostConditionMode.Allow,
              onFinish: (payload) => {
                setStatus({ kind: "ok", msg: `Routed ${Number(micro) / MICRO} USDCx to the landlord.`, txid: payload.txId });
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
  }, [walletAddress, currentBlock, unlockedMicro, refreshVaultState]);

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
  const goal = vaultConfig?.goal ?? 0;
  const deadlineBlock = vaultConfig?.deadlineBlock ?? 0;
  const progress = goal > 0 ? Math.min(1, vaultBalance / goal) : 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const settlementReady = deadlineBlock > 0 && currentBlock > 0 && currentBlock >= deadlineBlock;
  const blocksRemaining = deadlineBlock > 0 && currentBlock > 0 ? Math.max(0, deadlineBlock - currentBlock) : 0;

  // Resolved absolute block shown in the setup modal (for duration/calendar modes)
  let resolvedAbsolute = 0;
  if (setupDeadlineMode === "calendar") {
    if (setupDeadlineDate && currentBlock > 0) {
      const targetMs = new Date(setupDeadlineDate + "T23:59:59").getTime();
      const diffMin = Math.max(1, Math.round((targetMs - Date.now()) / 60000));
      resolvedAbsolute = currentBlock + Math.max(1, Math.round(diffMin / BLOCK_TIME_MIN));
    }
  } else if (setupDeadlineMode === "duration") {
    resolvedAbsolute = currentBlock > 0 ? currentBlock + (Number(setupDeadlineValue) || 0) : 0;
  } else {
    resolvedAbsolute = Number(setupDeadlineValue) || 0;
  }

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
              <button
                onClick={() => setShowVaultSetup(true)}
                className="bg-primary-container text-on-primary-container px-8 py-3 rounded-xl font-bold neon-glow-orange hover:bg-secondary transition-colors"
              >
                {vaultConfig ? "Edit Vault Settings" : "Launch Your Vault"}
              </button>
              <button className="border border-zinc-700 text-white px-8 py-3 rounded-xl font-medium hover:bg-zinc-900 transition-colors">
                View Audit
              </button>
            </div>
          </div>
        </section>

        {/* Errors + status */}
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
              <a href={explorerTx(status.txid)} target="_blank" rel="noreferrer" className="font-data-mono text-xs underline">tx ↗</a>
            )}
          </div>
        )}

        {/* If no vault yet — show a prompt */}
        {!vaultConfig && (
          <div className="mb-6 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 font-body-sm flex items-center gap-4">
            <span className="material-symbols-outlined">info</span>
            <div className="flex-1">
              <strong>No vault configured yet.</strong> Click <em>Launch Your Vault</em> to set your rent goal, deadline block, and landlord address.
            </div>
            <button onClick={() => setShowVaultSetup(true)} className="bg-amber-500/20 border border-amber-500/40 px-4 py-2 rounded-lg font-bold hover:bg-amber-500/30 transition-colors whitespace-nowrap">
              Set Up
            </button>
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
                  <span className="material-symbols-outlined text-amber-500 text-sm">{settlementReady ? "lock_open" : "lock"}</span>
                  <span className="font-label-caps text-label-caps text-amber-500">
                    {vaultConfig ? (settlementReady ? "Settlement Open" : "Status: Time-Locked") : "No Vault"}
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
                    <span className="font-label-caps text-xs text-on-surface-variant">OF {goal.toLocaleString()} USDCx</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-outline-variant">
                <div>
                  <p className="font-label-caps text-on-surface-variant mb-1">Current Block</p>
                  <p className="font-data-mono text-primary">{currentBlock > 0 ? `#${currentBlock.toLocaleString()}` : "—"}</p>
                </div>
                <div className="text-right">
                  <p className="font-label-caps text-on-surface-variant mb-1">Target Unlock</p>
                  <p className="font-data-mono text-on-surface">{deadlineBlock > 0 ? `#${deadlineBlock.toLocaleString()}` : "—"}</p>
                  {blocksRemaining > 0 && (
                    <p className="font-label-caps text-[10px] text-on-surface-variant mt-1">~{blocksToHuman(blocksRemaining)} left</p>
                  )}
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
                  disabled={busy || !walletAddress || !vaultConfig}
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
                {/* Landlord (reflects config, read-only) */}
                <div className="w-full mb-6">
                  <label className="font-label-caps text-on-surface-variant mb-2 block text-left">Landlord Wallet Address</label>
                  <div className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg font-data-mono text-sm flex items-center justify-between">
                    <span className={vaultConfig?.landlord ? "" : "text-zinc-600"}>
                      {vaultConfig?.landlord || "Not set — configure in Launch Your Vault"}
                    </span>
                    <button onClick={() => setShowVaultSetup(true)} className="font-label-caps text-primary hover:underline">
                      Edit
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleSettleAndRoute}
                  disabled={busy || !settlementReady || !vaultConfig}
                  className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all ${settlementReady && vaultConfig ? "bg-primary-container text-on-primary-container hover:scale-[0.98] cursor-pointer" : "bg-zinc-800/50 text-zinc-500 cursor-not-allowed opacity-50"}`}
                >
                  <span className="material-symbols-outlined">{settlementReady ? "lock_open" : "lock"}</span>
                  {busy ? "Awaiting wallet…" : "Settle Rent & Route Funds"}
                </button>
                {!settlementReady && vaultConfig && currentBlock > 0 && (
                  <p className="font-body-sm text-on-surface-variant mt-3">
                    Locked until block #{deadlineBlock.toLocaleString()} ({blocksToHuman(blocksRemaining)} left, current #{currentBlock.toLocaleString()}).
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ===== Right Column ===== */}
          <div className="space-y-stack-lg">
            <div className="glass-panel p-stack-lg rounded-xl h-full flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-headline-md text-headline-md text-white">Family Registry</h3>
                <span className="font-label-caps text-primary">{contributorsList.length} Active {contributorsList.length === 1 ? "Sibling" : "Siblings"}</span>
              </div>

              <div className="space-y-4 flex-grow">
                {contributorsList.length === 0 && (
                  <div className="p-6 border border-dashed border-zinc-800 rounded-lg text-center text-on-surface-variant font-body-sm">
                    No contributors yet. Add a sibling below.
                  </div>
                )}
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
                      <button onClick={handleJoinVault} disabled={!siblingName.trim() || !siblingAddress.trim()} className="flex-1 bg-primary-container text-on-primary-container font-bold py-3 rounded-lg hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed">Add Sibling</button>
                      <button onClick={() => { setIsAddingSibling(false); setSiblingName(""); setSiblingAddress(""); }} className="px-4 border border-zinc-700 text-zinc-400 font-medium py-3 rounded-lg hover:bg-zinc-900 transition-colors">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setIsAddingSibling(true)} className="w-full p-4 border border-dashed border-zinc-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group">
                    <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">add_circle</span>
                    <span className="font-label-caps text-on-surface-variant group-hover:text-primary transition-colors">+ Add Sibling Wallet Address</span>
                  </button>
                )}
              </div>

              <div className="mt-12 bg-black rounded-xl overflow-hidden border border-zinc-800">
                <div className="p-6 border-b border-zinc-800">
                  <p className="font-label-caps text-on-surface-variant">Recent Activity</p>
                </div>
                <div>
                  <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-900/50">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-sm">receipt_long</span>
                      <span className="font-body-sm">Vault created</span>
                    </div>
                    <span className="font-data-mono text-xs text-zinc-500">{vaultConfig ? "just now" : "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ====================== Vault Setup Modal ====================== */}
      {showVaultSetup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowVaultSetup(false)}>
          <div
            className="glass-panel rounded-xl p-stack-lg w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline-md text-headline-md text-white">
                {vaultConfig ? "Edit Vault Settings" : "Launch Your Vault"}
              </h3>
              <button onClick={() => setShowVaultSetup(false)} className="text-zinc-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-6">
              {/* Goal */}
              <div>
                <label className="font-label-caps text-on-surface-variant mb-2 block">Rent Goal (USDCx)</label>
                <input
                  type="number"
                  value={setupGoal}
                  onChange={(e) => setSetupGoal(e.target.value)}
                  placeholder="1000"
                  className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono"
                />
                <p className="font-label-caps text-[10px] text-on-surface-variant mt-2">
                  The total amount the family is saving toward.
                </p>
              </div>

              {/* Deadline */}
              <div>
                <label className="font-label-caps text-on-surface-variant mb-2 block">Deadline (Unlock Date)</label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setSetupDeadlineMode("calendar")}
                    className={`p-3 rounded-lg border font-label-caps transition-colors ${setupDeadlineMode === "calendar" ? "bg-primary-container text-on-primary-container border-primary-container" : "border-zinc-800 text-on-surface-variant hover:border-zinc-700"}`}
                  >
                    Calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupDeadlineMode("duration")}
                    className={`p-3 rounded-lg border font-label-caps transition-colors ${setupDeadlineMode === "duration" ? "bg-primary-container text-on-primary-container border-primary-container" : "border-zinc-800 text-on-surface-variant hover:border-zinc-700"}`}
                  >
                    Duration
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupDeadlineMode("absolute")}
                    className={`p-3 rounded-lg border font-label-caps transition-colors ${setupDeadlineMode === "absolute" ? "bg-primary-container text-on-primary-container border-primary-container" : "border-zinc-800 text-on-surface-variant hover:border-zinc-700"}`}
                  >
                    Block #
                  </button>
                </div>

                {/* Calendar mode — native date picker */}
                {setupDeadlineMode === "calendar" && (
                  <div className="mb-3">
                    <input
                      type="date"
                      value={setupDeadlineDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setSetupDeadlineDate(e.target.value)}
                      className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono"
                    />
                  </div>
                )}

                {/* Duration mode — number input + presets */}
                {setupDeadlineMode === "duration" && (
                  <>
                    <input
                      type="number"
                      value={setupDeadlineValue}
                      onChange={(e) => setSetupDeadlineValue(e.target.value)}
                      placeholder={String(DAY_BLOCKS)}
                      className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono mb-3"
                    />
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[
                        ["1 hour", 6],
                        ["1 day", DAY_BLOCKS],
                        ["1 week", DAY_BLOCKS * 7],
                        ["1 month", DAY_BLOCKS * 30],
                      ].map(([label, val]) => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => setSetupDeadlineValue(String(val))}
                          className={`px-3 py-1.5 rounded-lg border font-label-caps text-xs transition-colors ${setupDeadlineValue === String(val) ? "bg-primary/20 border-primary text-primary" : "border-zinc-800 text-on-surface-variant hover:border-zinc-700"}`}
                        >
                          {label} <span className="opacity-60">· {val}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Absolute mode — raw block number */}
                {setupDeadlineMode === "absolute" && (
                  <input
                    type="number"
                    value={setupDeadlineValue}
                    onChange={(e) => setSetupDeadlineValue(e.target.value)}
                    placeholder="8820000"
                    className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono mb-3"
                  />
                )}

                <p className="font-label-caps text-[10px] text-on-surface-variant">
                  {setupDeadlineMode === "calendar"
                    ? `Funds lock until this date. Resolves to block #${resolvedAbsolute > 0 ? resolvedAbsolute.toLocaleString() : "…"}`
                    : setupDeadlineMode === "duration"
                      ? `Adds blocks to the current chain height. Resolves to #${resolvedAbsolute > 0 ? resolvedAbsolute.toLocaleString() : "…"}`
                      : "Enter a specific future Stacks block height."}
                  {currentBlock > 0 && ` (current: #${currentBlock.toLocaleString()}).`}
                  {" "}~{DAY_BLOCKS} blocks ≈ 1 day.
                </p>
              </div>

              {/* Landlord */}
              <div>
                <label className="font-label-caps text-on-surface-variant mb-2 block">Landlord Wallet Address</label>
                <input
                  value={setupLandlord}
                  onChange={(e) => setSetupLandlord(e.target.value)}
                  placeholder="ST… or SP…"
                  className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono text-sm"
                />
                <p className="font-label-caps text-[10px] text-on-surface-variant mt-2">
                  Where the rent gets routed after the deadline (FlowVault Split).
                </p>
              </div>

              {setupError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-body-sm">
                  {setupError}
                </div>
              )}

              <button
                onClick={createVault}
                disabled={currentBlock <= 0 && setupDeadlineMode !== "absolute"}
                className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {currentBlock <= 0 && setupDeadlineMode !== "absolute" ? "Connect wallet to read block height" : (vaultConfig ? "Update Vault" : "Create Vault")}
              </button>
            </div>
          </div>
        </div>
      )}

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
