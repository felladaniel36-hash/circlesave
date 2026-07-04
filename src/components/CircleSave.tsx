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
// Contract targets (Stacks Testnet — FlowVault V2)
// ---------------------------------------------------------------------------

const CONTRACT_ADDRESS = "STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD";
const CONTRACT_NAME = "flowvault-v2";
const TOKEN_CONTRACT_ADDRESS = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
const TOKEN_CONTRACT_NAME = "usdcx";
const NETWORK = "testnet" as const;
const USDCX_DECIMALS = 6;
const MICRO = 10 ** USDCX_DECIMALS;
const UNIT = "USDCx";

const BLOCK_TIME_MIN = 10;
const RING_RADIUS = 80;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// A far-future lock block (~1 year) so deposits stay locked until manually dispatched.
const LOCK_HORIZON_BLOCKS = 52560;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CircleMember {
  id: string;
  name: string;
  address: string;
  reputation: number;
  vaultReserve: number;
  vaultStatus: "Healthy" | "Drained";
  hasReceived: boolean;
}

interface LedgerEntry {
  id: string;
  action: string;
  timestamp: number;
  txid?: string;
}

interface CircleConfig {
  name: string;
  targetPool: number;
  contributionAmount: number;
  lockBlock: number; // far-future lock; funds stay put until manual dispatch
  createdAt: number;
  creatorAddress: string;
}

type StatusKind = "ok" | "err" | "info";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_MEMBERS: CircleMember[] = [
  { id: "kwame", name: "Kwame", address: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", reputation: 98, vaultReserve: 40, vaultStatus: "Healthy", hasReceived: false },
  { id: "chidi", name: "Chidi", address: "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG", reputation: 95, vaultReserve: 35, vaultStatus: "Healthy", hasReceived: false },
  { id: "fatoumata", name: "Fatoumata", address: "STB44HYPYAT2BB2QE513NSP81HTMYWYNPVC1TCYG", reputation: 100, vaultReserve: 50, vaultStatus: "Healthy", hasReceived: false },
];

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
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Enter a valid amount (e.g. 10 or 1.5).");
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > USDCX_DECIMALS) throw new Error(`Maximum ${USDCX_DECIMALS} decimal places.`);
  const padded = frac.padEnd(USDCX_DECIMALS, "0");
  return BigInt(whole) * BigInt(MICRO) + BigInt(padded || "0");
}

function explorerTx(txid: string): string {
  const id = txid.startsWith("0x") ? txid : `0x${txid}`;
  return `https://explorer.hiro.so/txid/${id}?chain=testnet`;
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CircleSave() {
  // --- Wallet ---
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  // --- On-chain ---
  const [vaultBalance, setVaultBalance] = useState(0);
  const [unlockedMicro, setUnlockedMicro] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(0);

  // --- Circle config ---
  const [circleConfig, setCircleConfig] = useState<CircleConfig | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [circleEnded, setCircleEnded] = useState(false);

  // --- Members & turns ---
  const [members, setMembers] = useState<CircleMember[]>(SEED_MEMBERS);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);

  // --- Actions ---
  const [depositAmount, setDepositAmount] = useState("");
  const [automationAuthorized, setAutomationAuthorized] = useState(false);

  // --- Ledger ---
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  // --- Status ---
  const [status, setStatus] = useState<{ kind: StatusKind; msg: string; txid?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // --- Invite form ---
  const [isInviting, setIsInviting] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteAddress, setInviteAddress] = useState("");

  // --- Setup form ---
  const [setupName, setSetupName] = useState("Family Circle");
  const [setupTarget, setSetupTarget] = useState("1200");
  const [setupContribution, setSetupContribution] = useState("10");
  const [setupError, setSetupError] = useState("");

  // --- Modal animation ---
  const [modalClosing, setModalClosing] = useState(false);
  const closeModal = useCallback(() => {
    setModalClosing(true);
    window.setTimeout(() => { setShowSetup(false); setModalClosing(false); }, 300);
  }, []);

  const openSetup = useCallback(() => {
    setSetupError("");
    setModalClosing(false);
    setShowSetup(true);
  }, []);

  const addLedger = useCallback((action: string, txid?: string) => {
    setLedger(prev => [{ id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, action, timestamp: Date.now(), txid }, ...prev].slice(0, 25));
  }, []);

  const configRef = useRef(circleConfig);
  useEffect(() => { configRef.current = circleConfig; }, [circleConfig]);

  // --- Restore on mount ---
  useEffect(() => {
    if (isConnected()) {
      const stored = getLocalStorage();
      const addr = extractStxAddress(stored?.addresses);
      if (addr) setWalletAddress(addr);
    }
    try {
      const m = localStorage.getItem("cs.members.v2");
      if (m) { const p = JSON.parse(m); if (Array.isArray(p) && p.length) setMembers(p); }
      const l = localStorage.getItem("cs.ledger.v2");
      if (l) { const p = JSON.parse(l); if (Array.isArray(p)) setLedger(p); }
      const cfg = localStorage.getItem("cs.config.v2");
      if (cfg) { const p = JSON.parse(cfg) as CircleConfig; if (p?.targetPool > 0) { setCircleConfig(p); setSetupName(p.name); setSetupTarget(String(p.targetPool)); setSetupContribution(String(p.contributionAmount)); } }
      const ended = localStorage.getItem("cs.ended.v2");
      if (ended === "true") setCircleEnded(true);
      const turn = localStorage.getItem("cs.turn.v2");
      if (turn) setCurrentTurnIndex(parseInt(turn, 10) || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { try { localStorage.setItem("cs.members.v2", JSON.stringify(members)); } catch {} }, [members]);
  useEffect(() => { try { localStorage.setItem("cs.ledger.v2", JSON.stringify(ledger)); } catch {} }, [ledger]);
  useEffect(() => { try { localStorage.setItem("cs.turn.v2", String(currentTurnIndex)); } catch {} }, [currentTurnIndex]);

  // --- Wallet connect/disconnect ---
  const connectWallet = useCallback(async () => {
    setWalletError(""); setIsConnecting(true);
    try {
      const res = await connect({ network: NETWORK, forceWalletSelect: true });
      const addr = extractStxAddress(res?.addresses);
      if (!addr) { setWalletError("No Stacks account found. Select an STX account."); return; }
      setWalletAddress(addr);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWalletError(/reject|cancel|denied|abort/i.test(msg) ? "Connection cancelled." : msg);
    } finally { setIsConnecting(false); }
  }, []);

  const disconnectWallet = useCallback(() => {
    try { disconnect(); } catch {}
    setWalletAddress(null); setUnlockedMicro(0);
  }, []);

  // --- Read on-chain state ---
  const refreshVaultState = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const blockCv = await fetchCallReadOnlyFunction({ contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME, functionName: "get-current-block-height", functionArgs: [], senderAddress: walletAddress, network: NETWORK });
      setCurrentBlock(toUint(cvToValue(blockCv, true)));
      const stateCv = await fetchCallReadOnlyFunction({ contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME, functionName: "get-vault-state", functionArgs: [principalCV(walletAddress)], senderAddress: walletAddress, network: NETWORK });
      const state = cvToValue(stateCv, true) as Record<string, unknown>;
      setVaultBalance(toUint(state["total-balance"]) / MICRO);
      setUnlockedMicro(toUint(state["unlocked-balance"]));
    } catch (e) { console.warn("vault read failed", e); }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return;
    void refreshVaultState();
    const id = window.setInterval(() => void refreshVaultState(), 20000);
    return () => window.clearInterval(id);
  }, [walletAddress, refreshVaultState]);

  // --- Create circle (NO date, NO duration — goal-based, infinite rounds) ---
  const createCircle = useCallback(() => {
    setSetupError("");
    let targetMicro: bigint;
    try { targetMicro = tokenToMicro(setupTarget); } catch { return setSetupError("Enter a valid target pool amount."); }
    if (targetMicro <= 0n) return setSetupError("Target must be greater than zero.");
    if (Number(targetMicro) / MICRO > 99999) return setSetupError("Target too high (max 99999).");
    let contribMicro: bigint;
    try { contribMicro = tokenToMicro(setupContribution); } catch { return setSetupError("Enter a valid per-member contribution."); }
    if (contribMicro <= 0n) return setSetupError("Contribution must be greater than zero.");
    if (currentBlock <= 0) return setSetupError("Connect your wallet first.");
    if (!walletAddress) return setSetupError("Connect your wallet first.");

    const cfg: CircleConfig = {
      name: setupName.trim() || "Circle",
      targetPool: Number(targetMicro) / MICRO,
      contributionAmount: Number(contribMicro) / MICRO,
      lockBlock: currentBlock + LOCK_HORIZON_BLOCKS, // far-future lock; funds held until manual dispatch
      createdAt: Date.now(),
      creatorAddress: walletAddress,
    };
    setCircleConfig(cfg);
    setCircleEnded(false);
    setCurrentTurnIndex(0);
    setMembers(prev => prev.map(m => ({ ...m, hasReceived: false })));
    try {
      localStorage.setItem("cs.config.v2", JSON.stringify(cfg));
      localStorage.setItem("cs.ended.v2", "false");
      localStorage.setItem("cs.turn.v2", "0");
    } catch {}
    addLedger(`Circle "${cfg.name}" created — target ${cfg.targetPool} ${UNIT}, ${members.length} members`);
    closeModal();
    setStatus({ kind: "ok", msg: `Circle live! Target: ${cfg.targetPool} ${UNIT}. Day 1 begins now.` });
  }, [setupName, setupTarget, setupContribution, currentBlock, walletAddress, members.length, addLedger, closeModal]);

  // --- Authorize automation (set-routing-rules: lock contribution, route to turn member) ---
  const authorizeAutomation = useCallback(() => {
    setStatus(null); setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    const cfg = configRef.current;
    if (!cfg) return setStatus({ kind: "err", msg: "Create your circle first." });
    const turnMember = members[currentTurnIndex];
    if (!turnMember) return setStatus({ kind: "err", msg: "No member to route to." });
    if (turnMember.address === walletAddress) return setStatus({ kind: "info", msg: `It's your turn to receive — others will route to you.` });
    const micro = BigInt(Math.round(cfg.contributionAmount * MICRO));
    setBusy(true);
    setStatus({ kind: "info", msg: `Approve automation — auto-route to ${turnMember.name}…` });
    openContractCall({
      network: NETWORK, contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
      functionName: "set-routing-rules",
      functionArgs: [uintCV(micro), uintCV(cfg.lockBlock), someCV(principalCV(turnMember.address)), uintCV(micro)],
      postConditionMode: PostConditionMode.Allow,
      onFinish: (payload) => {
        setAutomationAuthorized(true);
        addLedger(`Automation authorized — auto-routing to ${turnMember.name}`, payload.txId);
        setStatus({ kind: "ok", msg: `Automation active! Deposits auto-route to ${turnMember.name}.`, txid: payload.txId });
        setBusy(false);
      },
      onCancel: () => { setStatus({ kind: "err", msg: "Authorization cancelled." }); setBusy(false); },
    });
  }, [walletAddress, members, currentTurnIndex, addLedger]);

  // --- Manual deposit boost ---
  const handleDeposit = useCallback(() => {
    setStatus(null); setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    const cfg = configRef.current;
    if (!cfg) return setStatus({ kind: "err", msg: "Create your circle first." });
    let micro: bigint;
    try { micro = tokenToMicro(depositAmount); } catch (e) { return setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Invalid amount." }); }
    setBusy(true);
    setStatus({ kind: "info", msg: "Approve the deposit in your wallet…" });
    openContractCall({
      network: NETWORK, contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
      functionName: "deposit",
      functionArgs: [contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME), uintCV(micro)],
      postConditionMode: PostConditionMode.Allow,
      onFinish: (payload) => {
        const amt = Number(micro) / MICRO;
        addLedger(`Deposited ${amt} ${UNIT} to circle pool`, payload.txId);
        setStatus({ kind: "ok", msg: `Deposited ${amt} ${UNIT}.`, txid: payload.txId });
        setDepositAmount(""); setBusy(false); void refreshVaultState();
      },
      onCancel: () => { setStatus({ kind: "err", msg: "Deposit cancelled." }); setBusy(false); },
    });
  }, [walletAddress, depositAmount, refreshVaultState, addLedger]);

  // --- Dispatch payout (target reached → route to turn member → advance turn → reset pool) ---
  const handleDispatch = useCallback(() => {
    setStatus(null); setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    const cfg = configRef.current;
    if (!cfg) return setStatus({ kind: "err", msg: "Create your circle first." });
    const turnMember = members[currentTurnIndex];
    if (!turnMember) return setStatus({ kind: "err", msg: "No current turn member." });
    const micro = BigInt(unlockedMicro);
    if (micro <= 0n) return setStatus({ kind: "err", msg: "Nothing in the pool to dispatch yet." });

    setBusy(true);
    setStatus({ kind: "info", msg: `Approve WITHDRAW to unlock pool (1/2)…` });
    openContractCall({
      network: NETWORK, contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
      functionName: "withdraw",
      functionArgs: [contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME), uintCV(micro)],
      postConditionMode: PostConditionMode.Allow,
      onFinish: () => {
        setStatus({ kind: "info", msg: `Approve SPLIT → ${turnMember.name} (2/2)…` });
        openContractCall({
          network: NETWORK, contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
          functionName: "set-routing-rules",
          functionArgs: [uintCV(0), uintCV(0), someCV(principalCV(turnMember.address)), uintCV(micro)],
          postConditionMode: PostConditionMode.Allow,
          onFinish: () => {
            setStatus({ kind: "info", msg: `Approve DEPOSIT to send to ${turnMember.name}…` });
            openContractCall({
              network: NETWORK, contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
              functionName: "deposit",
              functionArgs: [contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME), uintCV(micro)],
              postConditionMode: PostConditionMode.Allow,
              onFinish: (payload) => {
                const amt = Number(micro) / MICRO;
                // Mark turn member as received
                setMembers(prev => prev.map((m, i) => i === currentTurnIndex ? { ...m, hasReceived: true } : m));
                // Advance turn (wrap around)
                const nextIndex = (currentTurnIndex + 1) % Math.max(1, members.length);
                setCurrentTurnIndex(nextIndex);
                // Check if everyone has received → new full cycle
                const allReceived = members.every((m, i) => i === currentTurnIndex || m.hasReceived);
                if (allReceived) {
                  setMembers(prev => prev.map(m => ({ ...m, hasReceived: false })));
                  addLedger(`🎉 Full cycle complete! Starting a new round.`, payload.txId);
                }
                addLedger(`Payout dispatched — ${amt} ${UNIT} → ${turnMember.name}`, payload.txId);
                setAutomationAuthorized(false);
                try { localStorage.setItem("cs.automation.v2", "false"); } catch {}
                setStatus({ kind: "ok", msg: `🎯 ${turnMember.name} received ${amt} ${UNIT}! Pool reset — next up: ${members[nextIndex]?.name}.`, txid: payload.txId });
                setBusy(false); void refreshVaultState();
              },
              onCancel: () => { setStatus({ kind: "err", msg: "Final deposit cancelled." }); setBusy(false); },
            });
          },
          onCancel: () => { setStatus({ kind: "err", msg: "Split rule cancelled." }); setBusy(false); },
        });
      },
      onCancel: () => { setStatus({ kind: "err", msg: "Withdraw cancelled." }); setBusy(false); },
    });
  }, [walletAddress, unlockedMicro, members, currentTurnIndex, refreshVaultState, addLedger]);

  // --- End circle (creator only) ---
  const endCircle = useCallback(() => {
    if (!walletAddress || walletAddress !== circleConfig?.creatorAddress) {
      setStatus({ kind: "err", msg: "Only the circle creator can end it." });
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("End this circle? The pool will be withdrawn back to you and the circle will close.")) return;
    setBusy(true);
    setStatus({ kind: "info", msg: "Withdrawing remaining pool back to you…" });
    const micro = BigInt(unlockedMicro);
    if (micro > 0n) {
      openContractCall({
        network: NETWORK, contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
        functionName: "withdraw",
        functionArgs: [contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME), uintCV(micro)],
        postConditionMode: PostConditionMode.Allow,
        onFinish: () => {
          setCircleEnded(true);
          try { localStorage.setItem("cs.ended.v2", "true"); } catch {}
          addLedger(`Circle ended by creator. Remaining ${Number(micro) / MICRO} ${UNIT} withdrawn.`);
          setStatus({ kind: "ok", msg: "Circle ended. Remaining funds withdrawn to you." });
          setBusy(false); void refreshVaultState();
        },
        onCancel: () => { setStatus({ kind: "err", msg: "End circle cancelled." }); setBusy(false); },
      });
    } else {
      setCircleEnded(true);
      try { localStorage.setItem("cs.ended.v2", "true"); } catch {}
      addLedger(`Circle ended by creator.`);
      setStatus({ kind: "ok", msg: "Circle ended." });
      setBusy(false);
    }
  }, [walletAddress, circleConfig, unlockedMicro, addLedger, refreshVaultState]);

  // --- Invite member ---
  const handleInvite = useCallback(() => {
    const name = inviteName.trim(); const addr = inviteAddress.trim();
    if (!name || !addr) return;
    setMembers(prev => [...prev, { id: `m-${Date.now()}`, name, address: addr, reputation: 0, vaultReserve: 0, vaultStatus: "Drained", hasReceived: false }]);
    addLedger(`${name} invited to the circle`);
    setInviteName(""); setInviteAddress(""); setIsInviting(false);
  }, [inviteName, inviteAddress, addLedger]);

  // --- Derived ---
  const targetPool = circleConfig?.targetPool ?? 0;
  const cyclePool = vaultBalance;
  const progress = targetPool > 0 ? Math.min(1, cyclePool / targetPool) : 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const poolReady = targetPool > 0 && cyclePool >= targetPool;
  const turnMember = members[currentTurnIndex];
  const isCreator = !!walletAddress && walletAddress === circleConfig?.creatorAddress;

  // Day counter (cosmetic — increments each calendar day since creation)
  const circleDay = circleConfig && !circleEnded
    ? Math.max(1, Math.floor((Date.now() - circleConfig.createdAt) / 86400000) + 1)
    : 0;

  // Round number
  const receivedCount = members.filter(m => m.hasReceived).length;
  const roundNumber = receivedCount + 1;

  const isActive = !!circleConfig && !circleEnded;

  // -------------------------------------------------------------------------
  return (
    <>
      {/* ===================== Header ===================== */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-container-max mx-auto px-margin-desktop h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="cs-logo-spin">
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                <circle cx="11" cy="12" r="5" stroke="#ffb690" strokeWidth="2.2" fill="none" />
                <circle cx="21" cy="12" r="5" stroke="#ffb690" strokeWidth="2.2" fill="none" />
                <circle cx="16" cy="21" r="5" stroke="#ffb690" strokeWidth="2.2" fill="none" />
              </svg>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">CircleSave</span>
              <span className="text-[10px] text-on-surface-variant tracking-wide hidden sm:block">Save Together. Trust the Code.</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {walletAddress ? (
              <>
                <div className="hidden md:flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant">
                  <div className="w-2 h-2 bg-green-500 rounded-full pulse-green" />
                  <span className="font-data-mono text-data-mono text-on-surface">{walletAddress.slice(0, 7)}…{walletAddress.slice(-4)}</span>
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Testnet</span>
                </div>
                <button onClick={disconnectWallet} className="text-zinc-400 hover:text-white text-sm font-medium">Disconnect</button>
              </>
            ) : (
              <button onClick={connectWallet} disabled={isConnecting} className="bg-primary-container text-on-primary-container px-6 py-2 rounded-lg font-bold hover:scale-95 transition-transform disabled:opacity-60">
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ===================== Main ===================== */}
      <main className="pt-28 pb-20 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
        {/* Hero */}
        <section className="text-center mb-16">
          <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg mb-4 leading-tight">
            Save Together. <span className="text-primary">Trust the Code.</span>
          </h1>
          <p className="font-body-base text-on-surface-variant max-w-xl mx-auto mb-8">
            A trustless digital cooperative. Pool savings, fill the target, and the pool auto-resets to the next member — turn by turn, round after round, until you decide to end it.
          </p>
          {!circleConfig && (
            <button onClick={openSetup} className="bg-primary-container text-on-primary-container px-8 py-3 rounded-xl font-bold neon-glow-orange hover:bg-secondary transition-colors">
              Start Your Circle
            </button>
          )}
          {circleConfig && isCreator && isActive && (
            <button onClick={openSetup} className="border border-zinc-700 text-white px-6 py-2 rounded-xl font-medium hover:bg-zinc-900 transition-colors mr-3">Edit Circle</button>
          )}
          {circleConfig && isCreator && (
            <button onClick={endCircle} disabled={busy} className="border border-rose-500/40 text-rose-400 px-6 py-2 rounded-xl font-medium hover:bg-rose-500/10 transition-colors disabled:opacity-50">
              {circleEnded ? "Circle Ended" : "End Circle"}
            </button>
          )}
        </section>

        {/* Toasts */}
        {walletError && <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-body-sm">{walletError}</div>}
        {status && (
          <div className={`mb-6 p-4 rounded-xl border font-body-sm flex items-center gap-3 ${status.kind === "ok" ? "bg-green-500/10 border-green-500/30 text-green-300" : status.kind === "err" ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : "bg-amber-500/10 border-amber-500/30 text-amber-300"}`}>
            <span className="material-symbols-outlined text-sm">{status.kind === "ok" ? "check_circle" : status.kind === "err" ? "error" : "hourglass_top"}</span>
            <span className="flex-1">{status.msg}</span>
            {status.txid && <a href={explorerTx(status.txid)} target="_blank" rel="noreferrer" className="font-data-mono text-xs underline">tx ↗</a>}
          </div>
        )}

        {/* Pool ready banner */}
        {poolReady && isActive && (
          <div className="mb-6 p-4 rounded-xl bg-green-500/15 border border-green-500/40 text-green-300 font-body-sm flex items-center gap-3 animate-pulse">
            <span className="material-symbols-outlined">celebration</span>
            <span className="flex-1"><strong>Target reached!</strong> Dispatch the pool to <strong>{turnMember?.name}</strong> now.</span>
          </div>
        )}

        {/* Ended banner */}
        {circleEnded && (
          <div className="mb-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 text-zinc-400 font-body-sm flex items-center gap-3">
            <span className="material-symbols-outlined">block</span>
            <span>This circle has ended. Start a new one to begin saving again.</span>
          </div>
        )}

        {!circleConfig && (
          <div className="mb-6 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 font-body-sm flex items-center gap-4">
            <span className="material-symbols-outlined">groups</span>
            <div className="flex-1"><strong>No circle active.</strong> Click <em>Start Your Circle</em> to set your target pool and per-member contribution.</div>
            <button onClick={openSetup} className="bg-amber-500/20 border border-amber-500/40 px-4 py-2 rounded-lg font-bold hover:bg-amber-500/30 whitespace-nowrap">Set Up</button>
          </div>
        )}

        {/* Dashboard */}
        {circleConfig && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-stack-lg">
            {/* ===== Left Column ===== */}
            <div className="space-y-stack-lg">
              {/* Circle Overview */}
              <div className="glass-panel p-stack-lg rounded-xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-headline-md text-headline-md text-white mb-1">{circleConfig.name}</h3>
                    <p className="font-body-sm text-on-surface-variant">
                      {isActive ? <>Day {circleDay} · Round {roundNumber} of {members.length}</> : "Ended"}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full flex items-center gap-1.5 border ${poolReady ? "bg-green-500/10 border-green-500/30" : "bg-amber-500/10 border-amber-500/20"}`}>
                    <span className={`material-symbols-outlined text-sm ${poolReady ? "text-green-400" : "text-amber-500"}`}>{circleEnded ? "block" : poolReady ? "celebration" : "trending_up"}</span>
                    <span className={`font-label-caps text-label-caps ${poolReady ? "text-green-400" : "text-amber-500"}`}>{circleEnded ? "Ended" : poolReady ? "Target Reached" : "Filling"}</span>
                  </div>
                </div>

                {/* Progress Ring */}
                <div className="flex flex-col items-center py-4">
                  <div className="relative w-48 h-48">
                    <svg className="w-full h-full" viewBox="0 0 192 192">
                      <circle className="text-zinc-800" cx="96" cy="96" fill="transparent" r={RING_RADIUS} stroke="currentColor" strokeWidth="8" />
                      <circle className="text-primary progress-ring-circle" cx="96" cy="96" fill="transparent" r={RING_RADIUS} stroke="currentColor" strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={strokeDashoffset} strokeLinecap="round" strokeWidth="10" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="font-display-lg text-2xl text-white">{cyclePool.toLocaleString()}</span>
                      <span className="font-label-caps text-xs text-on-surface-variant">OF {targetPool.toLocaleString()} {UNIT}</span>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-1 gap-3 mt-6 pt-6 border-t border-outline-variant">
                  <div className="flex items-center justify-between p-3 bg-surface-container rounded-lg">
                    <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-base">savings</span><span className="font-body-sm text-on-surface-variant">Current Pool</span></div>
                    <span className="font-data-mono text-primary font-bold">{cyclePool.toLocaleString()} / {targetPool.toLocaleString()} {UNIT}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-surface-container rounded-lg">
                    <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-base">payments</span><span className="font-body-sm text-on-surface-variant">Per-Member Contribution</span></div>
                    <span className="font-data-mono text-on-surface font-bold">{circleConfig.contributionAmount} {UNIT}</span>
                  </div>
                  {/* Cycle Turn Indicator */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-base">cycle</span><span className="font-body-sm text-primary">Next Payout Goes To</span></div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center"><span className="material-symbols-outlined text-zinc-300 text-base">person</span></div>
                      <span className="font-body-base text-white font-bold">{turnMember?.name ?? "—"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Actions */}
              <div className="glass-panel p-stack-lg rounded-xl">
                <h3 className="font-headline-md text-headline-md text-white mb-4">Financial Actions</h3>

                {/* Manual Deposit Boost */}
                <label className="font-label-caps text-on-surface-variant mb-2 block">Manual Deposit Boost ({UNIT})</label>
                <div className="relative mb-4">
                  <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none font-data-mono" />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 font-label-caps text-on-surface-variant">{UNIT}</div>
                </div>
                <button onClick={handleDeposit} disabled={busy || !walletAddress || !isActive} className="w-full bg-zinc-800 text-white font-bold py-3 rounded-lg hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mb-6">
                  <span className="material-symbols-outlined">bolt</span>{busy ? "Awaiting wallet…" : "Deposit Boost"}
                </button>

                {/* Automation Info */}
                <div className="rounded-lg bg-surface-container border border-outline-variant p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary text-base">auto_mode</span>
                    <span className="font-label-caps text-primary">FlowVault Automation</span>
                    {automationAuthorized && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">ACTIVE</span>}
                  </div>
                  <p className="font-body-sm text-on-surface-variant leading-relaxed">
                    Auto-debit active from connected wallet. Backup routing linked to Commitment Vault. Deposits lock into the pool and auto-route to the current turn member.
                  </p>
                </div>

                <button onClick={authorizeAutomation} disabled={busy || !walletAddress || !isActive} className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform flex items-center justify-center gap-2 neon-glow-orange disabled:opacity-50 disabled:cursor-not-allowed mb-3">
                  <span className="material-symbols-outlined">shield_locked</span>
                  {busy ? "Awaiting wallet…" : automationAuthorized ? "Re-Authorize Rules" : "Authorize Automation Rules"}
                </button>

                {/* Dispatch Payout — bright when target reached */}
                <button onClick={handleDispatch} disabled={busy || !walletAddress || !isActive} className={`w-full font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${poolReady ? "bg-green-600 text-white hover:bg-green-500 neon-glow-orange animate-pulse" : "bg-zinc-800/50 text-zinc-500"}`}>
                  <span className="material-symbols-outlined">send</span>
                  {busy ? "Awaiting wallet…" : poolReady ? `🎯 Dispatch ${cyclePool.toLocaleString()} ${UNIT} → ${turnMember?.name}` : "Dispatch Payout (fills on target)"}
                </button>
                {!poolReady && isActive && (
                  <p className="font-body-sm text-on-surface-variant mt-2 text-center">
                    {(targetPool - cyclePool).toLocaleString()} {UNIT} until target → {turnMember?.name} gets paid.
                  </p>
                )}
              </div>
            </div>

            {/* ===== Right Column ===== */}
            <div className="space-y-stack-lg">
              {/* Member Grid */}
              <div className="glass-panel p-stack-lg rounded-xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-headline-md text-headline-md text-white">Circle Members</h3>
                  <span className="font-label-caps text-primary">{members.length} Members</span>
                </div>
                <div className="space-y-3">
                  {members.map((m, i) => {
                    const isTurn = i === currentTurnIndex && isActive;
                    const repColor = m.reputation >= 90 ? "text-green-400" : m.reputation >= 70 ? "text-amber-400" : "text-rose-400";
                    return (
                      <div key={m.id} className={`p-4 rounded-lg border transition-colors ${isTurn ? "border-primary/50 bg-primary/5" : m.hasReceived ? "border-green-500/20 bg-green-500/5" : "border-outline-variant bg-surface-container hover:border-primary/20"}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center border border-zinc-600"><span className="material-symbols-outlined text-zinc-300">person</span></div>
                              {isTurn && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-background flex items-center justify-center"><span className="material-symbols-outlined text-[8px] text-on-primary">star</span></div>}
                            </div>
                            <div>
                              <p className="font-body-base font-bold text-white flex items-center gap-2">
                                {m.name}
                                {isTurn && <span className="text-[9px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded uppercase">Turn</span>}
                                {m.hasReceived && <span className="text-[9px] font-bold text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded uppercase">✓ Received</span>}
                              </p>
                              <p className="font-data-mono text-xs text-on-surface-variant">{m.address.slice(0, 7)}…{m.address.slice(-4)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-outline-variant/50">
                          <div>
                            <p className="font-label-caps text-[10px] text-on-surface-variant mb-0.5">Reputation</p>
                            <p className={`font-data-mono font-bold ${repColor}`}>{m.reputation}% Reliable</p>
                          </div>
                          <div className="text-right">
                            <p className="font-label-caps text-[10px] text-on-surface-variant mb-0.5">Commitment Vault</p>
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-data-mono font-bold text-white">{m.vaultReserve} {UNIT}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${m.vaultStatus === "Healthy" ? "bg-green-500/15 text-green-400" : "bg-rose-500/15 text-rose-400"}`}>{m.vaultStatus}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Invite Member */}
                  {isInviting ? (
                    <div className="p-4 border border-primary/30 rounded-lg bg-primary/5 space-y-3">
                      <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Member name" className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg outline-none focus:ring-1 focus:ring-primary font-body-base" />
                      <input value={inviteAddress} onChange={(e) => setInviteAddress(e.target.value)} placeholder="ST… wallet address" className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg outline-none focus:ring-1 focus:ring-primary font-data-mono text-sm" />
                      <div className="flex gap-2">
                        <button onClick={handleInvite} disabled={!inviteName.trim() || !inviteAddress.trim()} className="flex-1 bg-primary-container text-on-primary-container font-bold py-2.5 rounded-lg disabled:opacity-50">Invite</button>
                        <button onClick={() => { setIsInviting(false); setInviteName(""); setInviteAddress(""); }} className="px-4 border border-zinc-700 text-zinc-400 py-2.5 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setIsInviting(true)} disabled={!isActive} className="w-full p-4 border border-dashed border-zinc-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                      <span className="material-symbols-outlined text-primary">person_add</span>
                      <span className="font-label-caps text-on-surface-variant">+ Invite Member to Circle</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Recent Ledger Feed */}
              <div className="glass-panel p-stack-lg rounded-xl">
                <h3 className="font-headline-md text-headline-md text-white mb-4">Recent Ledger</h3>
                <div className="space-y-1">
                  {ledger.length === 0 && <p className="text-center text-on-surface-variant font-body-sm py-6">No activity yet.</p>}
                  {ledger.map((e) => (
                    <div key={e.id} className="flex items-center justify-between py-3 border-b border-zinc-900/50 last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="material-symbols-outlined text-primary text-sm flex-shrink-0">{/deposit|contrib/i.test(e.action) ? "arrow_circle_down" : /payout|dispatch/i.test(e.action) ? "send" : /invite|member/i.test(e.action) ? "person_add" : /cycle|round/i.test(e.action) ? "autorenew" : "receipt_long"}</span>
                        <span className="font-body-sm truncate">{e.action}</span>
                        {e.txid && <a href={explorerTx(e.txid)} target="_blank" rel="noreferrer" className="font-data-mono text-[10px] text-primary underline flex-shrink-0">tx↗</a>}
                      </div>
                      <span className="font-data-mono text-xs text-zinc-500 flex-shrink-0">{timeAgo(e.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===================== Setup Modal ===================== */}
      {showSetup && (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm ${modalClosing ? "frv-backdrop-exit" : "frv-backdrop-enter"}`} onClick={closeModal}>
          <div className={`glass-panel rounded-xl p-stack-lg w-full max-w-md max-h-[90vh] overflow-y-auto ${modalClosing ? "frv-modal-exit" : "frv-modal-enter"}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline-md text-headline-md text-white">{circleConfig ? "Edit Circle" : "Start Your Circle"}</h3>
              <button onClick={closeModal} className="text-zinc-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="space-y-5">
              <div>
                <label className="font-label-caps text-on-surface-variant mb-2 block">Circle Name</label>
                <input type="text" value={setupName} onChange={(e) => setSetupName(e.target.value)} placeholder="Family Circle" className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg outline-none focus:ring-1 focus:ring-primary font-body-base" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-caps text-on-surface-variant mb-2 block">Target Pool ({UNIT})</label>
                  <input type="number" value={setupTarget} onChange={(e) => setSetupTarget(e.target.value)} placeholder="1200" className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg outline-none focus:ring-1 focus:ring-primary font-data-mono" />
                </div>
                <div>
                  <label className="font-label-caps text-on-surface-variant mb-2 block">Per-Member ({UNIT})</label>
                  <input type="number" value={setupContribution} onChange={(e) => setSetupContribution(e.target.value)} placeholder="10" className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg outline-none focus:ring-1 focus:ring-primary font-data-mono" />
                </div>
              </div>
              <p className="font-label-caps text-[10px] opacity-50 -mt-2">(Min 0 Max 99999)</p>

              <div className="rounded-lg bg-surface-container border border-outline-variant p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-primary text-base">all_inclusive</span>
                  <span className="font-label-caps text-primary">No fixed duration</span>
                </div>
                <p className="font-body-sm text-on-surface-variant leading-relaxed">
                  The circle runs continuously — Day 1, Day 2, Day 3… Each time the pool hits the target, it pays out to the current member and resets to fill again for the next. You end it whenever you want.
                </p>
              </div>

              {setupError && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-body-sm">{setupError}</div>}
              <button onClick={createCircle} disabled={currentBlock <= 0} className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
                {currentBlock <= 0 ? "Connect wallet to continue" : (circleConfig ? "Update Circle" : "Create Circle")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-outline-variant bg-background mt-12">
        <div className="max-w-container-max mx-auto px-margin-desktop py-stack-lg flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2 opacity-80">
            <span className="material-symbols-outlined text-primary text-base">groups</span>
            <p className="font-body-sm text-on-surface-variant">© 2026 CircleSave · Powered by FlowVault on Stacks</p>
          </div>
        </div>
      </footer>
    </>
  );
}
