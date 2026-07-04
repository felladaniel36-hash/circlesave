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
const UNIT = "USDCx"; // display unit

const BLOCK_TIME_MIN = 10;
const DAY_BLOCKS = Math.round((24 * 60) / BLOCK_TIME_MIN); // 144
const RING_RADIUS = 80;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CircleMember {
  id: string;
  name: string;
  address: string;
  reputation: number; // 0–100
  vaultReserve: number; // token-scale
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
  deadlineBlock: number;
  endDateIso: string;
  createdAt: number;
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

function blocksToHuman(blocks: number): string {
  if (blocks <= 0) return "now";
  const totalMin = Math.round(blocks * BLOCK_TIME_MIN);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  return parts.join(" ") || "<1h";
}

function maskDdMmYyyy(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

function parseDdMmYyyy(display: string): string | null {
  const m = display.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10), yyyy = parseInt(m[3], 10);
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  if (d.getDate() !== dd || d.getMonth() + 1 !== mm || d.getFullYear() !== yyyy) return null;
  return iso;
}

function toDdMmYyyy(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcDays(startIso: string, endIso: string): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso + "T00:00:00").getTime();
  const e = new Date(endIso + "T00:00:00").getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  const days = Math.round((e - s) / (24 * 3600 * 1000));
  return days >= 1 ? days : null;
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
  const [setupEndDateDisplay, setSetupEndDateDisplay] = useState("");
  const [setupStartDate, setSetupStartDate] = useState("");
  const [setupError, setSetupError] = useState("");
  const setupDeadlineDate = parseDdMmYyyy(setupEndDateDisplay);

  // --- Modal animation ---
  const [modalClosing, setModalClosing] = useState(false);
  const closeModal = useCallback(() => {
    setModalClosing(true);
    window.setTimeout(() => { setShowSetup(false); setModalClosing(false); }, 300);
  }, []);

  const openSetup = useCallback(() => {
    const today = localToday();
    setSetupStartDate(today);
    setSetupEndDateDisplay(toDdMmYyyy(addDays(today, 30)));
    setSetupError("");
    setModalClosing(false);
    setShowSetup(true);
  }, []);

  const addLedger = useCallback((action: string, txid?: string) => {
    setLedger(prev => [{ id: `l-${Date.now()}`, action, timestamp: Date.now(), txid }, ...prev].slice(0, 25));
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
      const m = localStorage.getItem("cs.members.v1");
      if (m) { const p = JSON.parse(m); if (Array.isArray(p) && p.length) setMembers(p); }
      const l = localStorage.getItem("cs.ledger.v1");
      if (l) { const p = JSON.parse(l); if (Array.isArray(p)) setLedger(p); }
      const cfg = localStorage.getItem("cs.config.v1");
      if (cfg) { const p = JSON.parse(cfg) as CircleConfig; if (p?.deadlineBlock > 0) { setCircleConfig(p); setSetupName(p.name); setSetupTarget(String(p.targetPool)); setSetupContribution(String(p.contributionAmount)); } }
      const auth = localStorage.getItem("cs.automation.v1");
      if (auth === "true") setAutomationAuthorized(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { try { localStorage.setItem("cs.members.v1", JSON.stringify(members)); } catch {} }, [members]);
  useEffect(() => { try { localStorage.setItem("cs.ledger.v1", JSON.stringify(ledger)); } catch {} }, [ledger]);

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

  // --- Create circle ---
  const createCircle = useCallback(() => {
    setSetupError("");
    let targetMicro: bigint;
    try { targetMicro = tokenToMicro(setupTarget); } catch { return setSetupError("Enter a valid target pool amount."); }
    if (targetMicro <= 0n) return setSetupError("Target must be greater than zero.");
    let contribMicro: bigint;
    try { contribMicro = tokenToMicro(setupContribution); } catch { return setSetupError("Enter a valid per-member contribution."); }
    if (!setupDeadlineDate) return setSetupError("Enter an end date in dd/mm/yyyy format.");
    const days = calcDays(setupStartDate, setupDeadlineDate);
    if (!days || days < 1) return setSetupError("End date must be at least 1 day from today.");
    if (currentBlock <= 0) return setSetupError("Connect your wallet first.");
    const targetMs = new Date(setupDeadlineDate + "T23:59:59").getTime();
    const diffMin = Math.max(1, Math.round((targetMs - Date.now()) / 60000));
    const deadlineBlock = currentBlock + Math.max(1, Math.round(diffMin / BLOCK_TIME_MIN));
    const cfg: CircleConfig = { name: setupName.trim() || "Circle", targetPool: Number(targetMicro) / MICRO, contributionAmount: Number(contribMicro) / MICRO, deadlineBlock, endDateIso: setupDeadlineDate, createdAt: Date.now() };
    setCircleConfig(cfg);
    try { localStorage.setItem("cs.config.v1", JSON.stringify(cfg)); } catch {}
    addLedger(`Circle "${cfg.name}" created — target ${cfg.targetPool} ${UNIT}, ${members.length} members`);
    closeModal();
    setStatus({ kind: "ok", msg: `Circle created! Target: ${cfg.targetPool} ${UNIT}.` });
  }, [setupName, setupTarget, setupContribution, setupDeadlineDate, setupStartDate, currentBlock, members.length, addLedger, closeModal]);

  // --- Authorize automation rules (set-routing-rules: lock + split to current turn member) ---
  const authorizeAutomation = useCallback(() => {
    setStatus(null); setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    const cfg = configRef.current;
    if (!cfg) return setStatus({ kind: "err", msg: "Create your circle first." });
    const turnMember = members[currentTurnIndex];
    if (!turnMember) return setStatus({ kind: "err", msg: "No member to route to." });
    if (turnMember.address === walletAddress) return setStatus({ kind: "info", msg: `It's your turn to receive — others will route to you. No authorization needed.` });
    const micro = BigInt(Math.round(cfg.contributionAmount * MICRO));
    setBusy(true);
    setStatus({ kind: "info", msg: `Approve automation rules — auto-route to ${turnMember.name}…` });
    openContractCall({
      network: NETWORK, contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
      functionName: "set-routing-rules",
      functionArgs: [uintCV(micro), uintCV(cfg.deadlineBlock), someCV(principalCV(turnMember.address)), uintCV(micro)],
      postConditionMode: PostConditionMode.Allow,
      onFinish: (payload) => {
        setAutomationAuthorized(true);
        try { localStorage.setItem("cs.automation.v1", "true"); } catch {}
        addLedger(`Automation authorized — auto-routing to ${turnMember.name}`, payload.txId);
        setStatus({ kind: "ok", msg: `Automation active! Deposits auto-route to ${turnMember.name}.`, txid: payload.txId });
        setBusy(false);
      },
      onCancel: () => { setStatus({ kind: "err", msg: "Authorization cancelled." }); setBusy(false); },
    });
  }, [walletAddress, members, currentTurnIndex, addLedger]);

  // --- Manual deposit boost (deposit to FlowVault) ---
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

  // --- Withdraw & dispatch payout (withdraw → advance turn) ---
  const handlePayout = useCallback(() => {
    setStatus(null); setWalletError("");
    if (!walletAddress) return setWalletError("Connect your wallet first.");
    const cfg = configRef.current;
    if (!cfg) return setStatus({ kind: "err", msg: "Create your circle first." });
    if (currentBlock < cfg.deadlineBlock) return setStatus({ kind: "err", msg: "Cycle not complete yet." });
    const micro = BigInt(unlockedMicro);
    if (micro <= 0n) return setStatus({ kind: "err", msg: "Nothing unlocked to dispatch." });
    setBusy(true);
    setStatus({ kind: "info", msg: "Approve payout withdrawal…" });
    openContractCall({
      network: NETWORK, contractAddress: CONTRACT_ADDRESS, contractName: CONTRACT_NAME,
      functionName: "withdraw",
      functionArgs: [contractPrincipalCV(TOKEN_CONTRACT_ADDRESS, TOKEN_CONTRACT_NAME), uintCV(micro)],
      postConditionMode: PostConditionMode.Allow,
      onFinish: (payload) => {
        addLedger(`Payout round dispatched — ${Number(micro) / MICRO} ${UNIT}`, payload.txId);
        setCurrentTurnIndex(prev => (prev + 1) % Math.max(1, members.length));
        setStatus({ kind: "ok", msg: `Payout dispatched!`, txid: payload.txId });
        setBusy(false); void refreshVaultState();
      },
      onCancel: () => { setStatus({ kind: "err", msg: "Payout cancelled." }); setBusy(false); },
    });
  }, [walletAddress, currentBlock, unlockedMicro, members.length, refreshVaultState, addLedger]);

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
  const deadlineBlock = circleConfig?.deadlineBlock ?? 0;
  const cyclePool = vaultBalance; // connected wallet's on-chain contribution
  const progress = targetPool > 0 ? Math.min(1, cyclePool / targetPool) : 0;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const blocksRemaining = deadlineBlock > 0 && currentBlock > 0 ? Math.max(0, deadlineBlock - currentBlock) : 0;
  const cycleComplete = deadlineBlock > 0 && currentBlock > 0 && currentBlock >= deadlineBlock;
  const turnMember = members[currentTurnIndex];
  const setupDays = calcDays(setupStartDate, setupDeadlineDate ?? "");

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
            A trustless digital cooperative where friends pool savings, take turns receiving payouts, and every rule is enforced by FlowVault smart contracts on Stacks.
          </p>
          <button onClick={openSetup} className="bg-primary-container text-on-primary-container px-8 py-3 rounded-xl font-bold neon-glow-orange hover:bg-secondary transition-colors">
            {circleConfig ? "Edit Circle" : "Start Your Circle"}
          </button>
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

        {!circleConfig && (
          <div className="mb-6 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 font-body-sm flex items-center gap-4">
            <span className="material-symbols-outlined">groups</span>
            <div className="flex-1"><strong>No circle active.</strong> Click <em>Start Your Circle</em> to configure your savings pool, cycle duration, and contribution amount.</div>
            <button onClick={openSetup} className="bg-amber-500/20 border border-amber-500/40 px-4 py-2 rounded-lg font-bold hover:bg-amber-500/30 whitespace-nowrap">Set Up</button>
          </div>
        )}

        {/* Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-stack-lg">
          {/* ===== Left Column ===== */}
          <div className="space-y-stack-lg">
            {/* Circle Overview & Progress Ring */}
            <div className="glass-panel p-stack-lg rounded-xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-headline-md text-headline-md text-white mb-1">{circleConfig?.name ?? "Savings Circle"}</h3>
                  <p className="font-body-sm text-on-surface-variant">Cycle pool status</p>
                </div>
                <div className={`px-3 py-1 rounded-full flex items-center gap-1.5 border ${cycleComplete ? "bg-green-500/10 border-green-500/30" : "bg-amber-500/10 border-amber-500/20"}`}>
                  <span className={`material-symbols-outlined text-sm ${cycleComplete ? "text-green-400" : "text-amber-500"}`}>{cycleComplete ? "lock_open" : "lock"}</span>
                  <span className={`font-label-caps text-label-caps ${cycleComplete ? "text-green-400" : "text-amber-500"}`}>{circleConfig ? (cycleComplete ? "Cycle Complete" : "Active") : "No Circle"}</span>
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
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-base">savings</span><span className="font-body-sm text-on-surface-variant">Current Cycle Pool</span></div>
                  <span className="font-data-mono text-primary font-bold">{cyclePool.toLocaleString()} / {targetPool.toLocaleString()} {UNIT}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-surface-container rounded-lg">
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-base">payments</span><span className="font-body-sm text-on-surface-variant">Your Next Contribution</span></div>
                  <span className="font-data-mono text-on-surface font-bold">{circleConfig?.contributionAmount ?? 0} {UNIT}{blocksRemaining > 0 && <span className="text-on-surface-variant font-normal text-xs"> · ~{blocksToHuman(blocksRemaining)}</span>}</span>
                </div>
                {/* Cycle Turn Indicator */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-base">cycle</span><span className="font-body-sm text-primary">Cycle Turn — Next Payout</span></div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center"><span className="material-symbols-outlined text-zinc-300 text-base">person</span></div>
                    <span className="font-body-base text-white font-bold">{turnMember?.name ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Actions & Automation */}
            <div className="glass-panel p-stack-lg rounded-xl">
              <h3 className="font-headline-md text-headline-md text-white mb-4">Financial Actions</h3>

              {/* Manual Deposit Boost */}
              <label className="font-label-caps text-on-surface-variant mb-2 block">Manual Deposit Boost ({UNIT})</label>
              <div className="relative mb-4">
                <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none font-data-mono" />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 font-label-caps text-on-surface-variant">{UNIT}</div>
              </div>
              <button onClick={handleDeposit} disabled={busy || !walletAddress || !circleConfig} className="w-full bg-zinc-800 text-white font-bold py-3 rounded-lg hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mb-6">
                <span className="material-symbols-outlined">bolt</span>{busy ? "Awaiting wallet…" : "Deposit Boost"}
              </button>

              {/* Automation Info */}
              <div className="rounded-lg bg-surface-container border border-outline-variant p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary text-base">auto_mode</span>
                  <span className="font-label-caps text-primary">FlowVault Automation</span>
                  {automationAuthorized && <span className="ml-auto badge badge--ok text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">ACTIVE</span>}
                </div>
                <p className="font-body-sm text-on-surface-variant leading-relaxed">
                  Auto-debit active from connected wallet. Backup routing linked to Commitment Vault. Deposits auto-lock until cycle end and route to the current turn member.
                </p>
              </div>

              <button onClick={authorizeAutomation} disabled={busy || !walletAddress || !circleConfig} className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform flex items-center justify-center gap-2 neon-glow-orange disabled:opacity-50 disabled:cursor-not-allowed">
                <span className="material-symbols-outlined">shield_locked</span>
                {busy ? "Awaiting wallet…" : automationAuthorized ? "Re-Authorize Rules" : "Authorize Automation Rules"}
              </button>

              {cycleComplete && (
                <button onClick={handlePayout} disabled={busy || !walletAddress} className="w-full mt-3 bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-500 transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">send</span>Dispatch Payout to {turnMember?.name}
                </button>
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
                  const isTurn = i === currentTurnIndex;
                  const repColor = m.reputation >= 90 ? "text-green-400" : m.reputation >= 70 ? "text-amber-400" : "text-rose-400";
                  return (
                    <div key={m.id} className={`p-4 rounded-lg border transition-colors ${isTurn ? "border-primary/50 bg-primary/5" : "border-outline-variant bg-surface-container hover:border-primary/20"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center border border-zinc-600"><span className="material-symbols-outlined text-zinc-300">person</span></div>
                            {isTurn && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-background flex items-center justify-center"><span className="material-symbols-outlined text-[8px] text-on-primary">star</span></div>}
                          </div>
                          <div>
                            <p className="font-body-base font-bold text-white flex items-center gap-2">{m.name}{isTurn && <span className="text-[9px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded uppercase">Turn</span>}</p>
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
                  <button onClick={() => setIsInviting(true)} className="w-full p-4 border border-dashed border-zinc-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2">
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
                      <span className="material-symbols-outlined text-primary text-sm flex-shrink-0">{/deposit|contrib/i.test(e.action) ? "arrow_circle_down" : /payout|dispatch/i.test(e.action) ? "send" : /invite|member/i.test(e.action) ? "person_add" : "receipt_long"}</span>
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

              {/* Savings Period */}
              <div>
                <label className="font-label-caps text-on-surface-variant mb-2 block">Cycle Duration</label>
                <div className="mb-2">
                  <label className="font-label-caps text-on-surface-variant mb-1 block text-[10px]">Start Date <span className="opacity-60 normal-case">(today)</span></label>
                  <div className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg font-data-mono flex items-center gap-2 opacity-90"><span className="material-symbols-outlined text-primary text-base">event</span>{toDdMmYyyy(setupStartDate)}</div>
                </div>
                <div className="mb-2">
                  <label className="font-label-caps text-on-surface-variant mb-1 block text-[10px]">End Date <span className="opacity-60 normal-case">(dd/mm/yyyy)</span></label>
                  <input type="text" inputMode="numeric" value={setupEndDateDisplay} onChange={(e) => setSetupEndDateDisplay(maskDdMmYyyy(e.target.value))} placeholder="dd/mm/yyyy" maxLength={10} className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg outline-none focus:ring-1 focus:ring-primary font-data-mono" />
                </div>
                {setupDays !== null ? (
                  <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">schedule</span>
                    <div><p className="font-label-caps text-primary text-[10px]">Cycle duration</p><p className="font-body-base text-white font-bold">{setupDays} {setupDays === 1 ? "day" : "days"}</p></div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-zinc-800/40 border border-zinc-800 p-3"><p className="font-label-caps text-[10px] text-on-surface-variant">Enter a valid end date (dd/mm/yyyy), min 1 day.</p></div>
                )}
              </div>

              {setupError && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 font-body-sm">{setupError}</div>}
              <button onClick={createCircle} disabled={currentBlock <= 0 || setupDays === null} className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
                {currentBlock <= 0 ? "Connect wallet to continue" : setupDays === null ? "Enter a valid end date" : (circleConfig ? "Update Circle" : "Create Circle")}
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
