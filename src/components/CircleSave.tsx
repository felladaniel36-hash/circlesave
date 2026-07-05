"use client";

// ===========================================================================
// CircleSave — Main Orchestrator (split-only model)
// ===========================================================================
// MODEL: Deposits route to the turn member at deposit time via FlowVault's
// split primitive. The progress ring tracks total contributed toward the
// current round's target. When the target is reached, the turn advances and
// the ring resets — ready to fill again for the next member.
//
// Why no lock? FlowVault's contract requires lockAmount + splitAmount ≤
// depositAmount. Setting both equal demands 2× the deposit. Split-only
// (lockAmount=0) routes the full deposit to the recipient instantly.
// ===========================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "./Header";
import { ChainStatus } from "./ChainStatus";
import { CircleOverview } from "./CircleOverview";
import { MemberGrid } from "./MemberGrid";
import { ActionPanel } from "./ActionPanel";
import { LedgerFeed } from "./LedgerFeed";
import { SetupModal } from "./SetupModal";
import { ToastBar } from "./Toast";
import { useWallet } from "@/hooks/useWallet";
import { useChainState } from "@/hooks/useChainState";
import {
  type CircleMember,
  type CircleConfig,
  type LedgerEntry,
  type Toast as ToastType,
  SEED_MEMBERS,
  STORAGE,
} from "@/lib/config";
import {
  authorizeCircleAutomation,
  deposit,
} from "@/lib/flowvault";
import { loadJSON, saveJSON, microToToken, fmtNumber } from "@/lib/format";
import { UNIT, MICRO } from "@/lib/config";

export function CircleSave() {
  // --- Wallet ---
  const wallet = useWallet();
  const { address } = wallet;

  // --- Circle state ---
  const [config, setConfig] = useState<CircleConfig | null>(null);
  const [members, setMembers] = useState<CircleMember[]>(SEED_MEMBERS);
  const [turnIndex, setTurnIndex] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [automation, setAutomation] = useState(false);
  const [ended, setEnded] = useState(false);
  const [poolCollected, setPoolCollected] = useState(0); // total contributed this round

  // --- Chain (block height for ChainStatus display) ---
  const chain = useChainState(address);

  // --- UI state ---
  const [showSetup, setShowSetup] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastType | null>(null);

  // --- Refs for stable callbacks ---
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);
  const membersRef = useRef(members);
  useEffect(() => { membersRef.current = members; }, [members]);
  const turnIndexRef = useRef(turnIndex);
  useEffect(() => { turnIndexRef.current = turnIndex; }, [turnIndex]);
  const addressRef = useRef(address);
  useEffect(() => { addressRef.current = address; }, [address]);
  const poolRef = useRef(poolCollected);
  useEffect(() => { poolRef.current = poolCollected; }, [poolCollected]);

  // --- Restore from localStorage on mount ---
  useEffect(() => {
    const m = loadJSON<CircleMember[]>(STORAGE.members, SEED_MEMBERS);
    if (m.length) setMembers(m);
    const l = loadJSON<LedgerEntry[]>(STORAGE.ledger, []);
    if (l.length) setLedger(l);
    const cfg = loadJSON<CircleConfig | null>(STORAGE.config, null);
    if (cfg) setConfig(cfg);
    setTurnIndex(loadJSON<number>(STORAGE.turn, 0));
    setEnded(loadJSON<boolean>(STORAGE.ended, false));
    setAutomation(loadJSON<boolean>(STORAGE.automation, false));
    setPoolCollected(loadJSON<number>(STORAGE.pool, 0));
  }, []);

  // --- Persist ---
  useEffect(() => { saveJSON(STORAGE.members, members); }, [members]);
  useEffect(() => { saveJSON(STORAGE.ledger, ledger); }, [ledger]);
  useEffect(() => { saveJSON(STORAGE.turn, turnIndex); }, [turnIndex]);
  useEffect(() => { saveJSON(STORAGE.pool, poolCollected); }, [poolCollected]);

  // --- Helpers ---
  const addLedger = useCallback((action: string, txid?: string) => {
    setLedger((prev) =>
      [{ id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, action, timestamp: Date.now(), txid }, ...prev].slice(0, 25),
    );
  }, []);

  const closeModal = useCallback(() => {
    setModalClosing(true);
    window.setTimeout(() => { setShowSetup(false); setModalClosing(false); }, 300);
  }, []);

  const openModal = useCallback(() => {
    setModalClosing(false);
    setShowSetup(true);
  }, []);

  // --- Advance turn + reset pool (the "dispatch" — no on-chain tx needed) ---
  const advanceTurn = useCallback(() => {
    const curMembers = membersRef.current;
    const curTurn = turnIndexRef.current;
    const turn = curMembers[curTurn];
    const cfg = configRef.current;
    if (!turn || !cfg) return;

    // Mark current member as received
    setMembers((prev) => prev.map((m, i) => (i === curTurn ? { ...m, hasReceived: true } : m)));
    // Advance turn
    const next = (curTurn + 1) % Math.max(1, curMembers.length);
    setTurnIndex(next);
    // Reset pool counter for the next round
    setPoolCollected(0);
    saveJSON(STORAGE.pool, 0);
    // Reset automation (new recipient needs re-authorization)
    setAutomation(false);
    saveJSON(STORAGE.automation, false);
    // Check full cycle
    const allReceived = curMembers.every((m, i) => i === curTurn || m.hasReceived);
    if (allReceived) {
      setMembers((prev) => prev.map((m) => ({ ...m, hasReceived: false })));
      addLedger(`🎉 Full cycle complete! ${curMembers.length} members paid. Starting a new round.`);
    }
    addLedger(`✓ ${turn.name} received ${fmtNumber(cfg.targetPool)} ${UNIT}. Turn → ${curMembers[next]?.name}.`);
    setToast({
      kind: "ok",
      msg: `✓ ${turn.name} received the payout! Pool reset — next up: ${curMembers[next]?.name}.`,
    });
  }, [addLedger]);

  const advanceRef = useRef(advanceTurn);
  useEffect(() => { advanceRef.current = advanceTurn; }, [advanceTurn]);

  // --- Create circle ---
  const handleCreate = useCallback(
    (name: string, target: number, contribution: number, autoDispatch: boolean) => {
      const addr = addressRef.current;
      if (!addr || chain.currentBlock <= 0) {
        setToast({ kind: "err", msg: "Connect your wallet first." });
        return;
      }
      const cfg: CircleConfig = {
        name,
        targetPool: target,
        contributionAmount: contribution,
        lockBlock: 0, // no lock in split-only model
        createdAt: Date.now(),
        creatorAddress: addr,
        autoDispatch,
      };
      setConfig(cfg);
      setEnded(false);
      setTurnIndex(0);
      setPoolCollected(0);
      setMembers((prev) => prev.map((m) => ({ ...m, hasReceived: false })));
      saveJSON(STORAGE.config, cfg);
      saveJSON(STORAGE.ended, false);
      saveJSON(STORAGE.turn, 0);
      saveJSON(STORAGE.pool, 0);
      addLedger(`Circle "${name}" created — target ${target} ${UNIT}, ${membersRef.current.length} members${autoDispatch ? ", auto-payout ON" : ""}`);
      closeModal();
      setToast({ kind: "ok", msg: `Circle live! Target: ${target} ${UNIT}.${autoDispatch ? " Auto-payout enabled." : ""} Day 1 begins now.` });
    },
    [chain.currentBlock, addLedger, closeModal],
  );

  // --- Deposit (increments pool counter on success) ---
  const handleDeposit = useCallback(
    (amountMicro: bigint) => {
      setToast(null);
      const addr = addressRef.current;
      if (!addr) return setToast({ kind: "err", msg: "Connect your wallet first." });
      const cfg = configRef.current;
      if (!cfg) return setToast({ kind: "err", msg: "Create your circle first." });
      setBusy(true);
      setToast({ kind: "info", msg: "Approve the deposit in your wallet…" });
      deposit(amountMicro, (txId) => {
        const amt = microToToken(Number(amountMicro));
        // Increment the pool counter — this is what fills the ring
        setPoolCollected((prev) => prev + amt);
        addLedger(`Deposited ${fmtNumber(amt)} ${UNIT} → routed to ${membersRef.current[turnIndexRef.current]?.name}`, txId);
        setToast({ kind: "ok", msg: `Deposited ${fmtNumber(amt)} ${UNIT} — routed to the turn member.`, txid: txId });
        setBusy(false);
      }, () => {
        setToast({ kind: "err", msg: "Deposit cancelled." });
        setBusy(false);
      });
    },
    [addLedger],
  );

  // --- Authorize automation (split-only — no lock) ---
  const handleAuthorize = useCallback(() => {
    setToast(null);
    const addr = addressRef.current;
    if (!addr) return setToast({ kind: "err", msg: "Connect your wallet first." });
    const cfg = configRef.current;
    if (!cfg) return setToast({ kind: "err", msg: "Create your circle first." });
    const curMembers = membersRef.current;
    const turn = curMembers[turnIndexRef.current];
    if (!turn) return setToast({ kind: "err", msg: "No member to route to." });
    if (turn.address === addr)
      return setToast({ kind: "info", msg: "It's your turn to receive — others route to you." });
    const micro = BigInt(Math.round(cfg.contributionAmount * MICRO));
    setBusy(true);
    setToast({ kind: "info", msg: `Approve automation — route to ${turn.name}…` });
    authorizeCircleAutomation(micro, turn.address, (txId) => {
      setAutomation(true);
      saveJSON(STORAGE.automation, true);
      addLedger(`Automation authorized — auto-routing to ${turn.name}`, txId);
      setToast({ kind: "ok", msg: `Automation active! Deposits route to ${turn.name}.`, txid: txId });
      setBusy(false);
    }, () => {
      setToast({ kind: "err", msg: "Authorization cancelled." });
      setBusy(false);
    });
  }, [addLedger]);

  // --- End circle ---
  const handleEndCircle = useCallback(() => {
    const addr = addressRef.current;
    const cfg = configRef.current;
    if (!addr || addr !== cfg?.creatorAddress) {
      setToast({ kind: "err", msg: "Only the creator can end the circle." });
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("End this circle? The circle will close.")) return;
    setEnded(true);
    saveJSON(STORAGE.ended, true);
    addLedger("Circle ended by creator.");
    setToast({ kind: "ok", msg: "Circle ended." });
  }, [addLedger]);

  // --- Invite ---
  const handleInvite = useCallback((name: string, addr: string) => {
    setMembers((prev) => [
      ...prev,
      { id: `m-${Date.now()}`, name, address: addr, reputation: 0, vaultReserve: 0, vaultStatus: "Drained", hasReceived: false },
    ]);
    addLedger(`${name} invited to the circle`);
  }, [addLedger]);

  // --- Start a new circle ---
  const handleNewCircle = useCallback(() => {
    setConfig(null);
    setEnded(false);
    setTurnIndex(0);
    setAutomation(false);
    setPoolCollected(0);
    setMembers((prev) => prev.map((m) => ({ ...m, hasReceived: false })));
    saveJSON(STORAGE.config, null);
    saveJSON(STORAGE.ended, false);
    saveJSON(STORAGE.turn, 0);
    saveJSON(STORAGE.automation, false);
    saveJSON(STORAGE.pool, 0);
    addLedger("Started fresh — ready to create a new circle.");
    openModal();
  }, [addLedger, openModal]);

  // --- Derived ---
  const isActive = !!config && !ended;
  const poolReady = isActive && config ? poolCollected >= config.targetPool : false;
  const turnMember = members[turnIndex];

  // Reactive target-reached trigger
  const targetReachedRef = useRef(false);
  useEffect(() => {
    if (poolReady && !targetReachedRef.current && config) {
      targetReachedRef.current = true;
      if (config.autoDispatch) {
        setToast({
          kind: "ok",
          msg: `🎯 Target reached! ${fmtNumber(config.targetPool)} ${UNIT} contributed. Advancing payout to ${turnMember?.name}.`,
        });
        addLedger(`🎯 Target reached — auto-advancing to ${turnMember?.name}`);
        const t = window.setTimeout(() => {
          advanceRef.current();
        }, 1200);
        return () => window.clearTimeout(t);
      } else {
        setToast({
          kind: "ok",
          msg: `🎯 Target reached! ${fmtNumber(config.targetPool)} ${UNIT} contributed. Tap "Dispatch Payout" to send to ${turnMember?.name}.`,
        });
        addLedger(`🎯 Target reached — awaiting manual dispatch to ${turnMember?.name}`);
      }
    }
    if (!poolReady) {
      targetReachedRef.current = false;
    }
  }, [poolReady, config, turnMember, addLedger]);

  const isCreator = !!address && address === config?.creatorAddress;
  const dayCount = config && !ended
    ? Math.max(1, Math.floor((Date.now() - config.createdAt) / 86400000) + 1)
    : 0;
  const receivedCount = members.filter((m) => m.hasReceived).length;
  const roundNumber = receivedCount + 1;

  // -------------------------------------------------------------------------
  return (
    <>
      <Header
        address={address}
        connecting={wallet.connecting}
        onConnect={wallet.connectWallet}
        onDisconnect={wallet.disconnectWallet}
      />

      <main className="pt-28 pb-20 px-6 max-w-7xl mx-auto">
        {/* Hero */}
        <section className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Save Together. <span className="text-primary">Trust the Code.</span>
          </h1>
          <p className="text-on-surface-variant max-w-xl mx-auto mb-8">
            A trustless digital cooperative. Pool savings, fill the target, and the
            pool auto-resets to the next member — turn by turn, until you end it.
          </p>
          {!config && (
            <button
              onClick={openModal}
              className="bg-primary-container text-on-primary-container px-8 py-3 rounded-xl font-bold neon-glow-orange hover:bg-secondary transition-colors"
            >
              Start Your Circle
            </button>
          )}
          {config && !ended && isCreator && (
            <div className="flex gap-3 justify-center">
              <button
                onClick={openModal}
                className="border border-zinc-700 text-white px-6 py-2 rounded-xl font-medium hover:bg-zinc-900 transition-colors"
              >
                Edit Circle
              </button>
              <button
                onClick={handleEndCircle}
                disabled={busy}
                className="border border-rose-500/40 text-rose-400 px-6 py-2 rounded-xl font-medium hover:bg-rose-500/10 transition-colors disabled:opacity-50"
              >
                End Circle
              </button>
            </div>
          )}
          {ended && (
            <button
              onClick={handleNewCircle}
              className="bg-primary-container text-on-primary-container px-8 py-3 rounded-xl font-bold neon-glow-orange hover:bg-secondary transition-colors"
            >
              🔄 Start New Circle
            </button>
          )}
        </section>

        {/* Toasts */}
        {wallet.error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {wallet.error}
          </div>
        )}
        <ToastBar toast={toast} />

        {/* Re-authorize banner (turn changed — routing needs re-pointing) */}
        {isActive && !automation && poolCollected < (config?.targetPool ?? 0) && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-center gap-3">
            <span className="material-symbols-outlined">sync</span>
            <span className="flex-1">
              <strong>Re-authorize routing.</strong> The turn moved to{" "}
              <strong>{turnMember?.name}</strong>. Tap{" "}
              <em>Authorize Automation Rules</em> so your deposits route to them.
            </span>
          </div>
        )}

        {/* Pool ready banner */}
        {poolReady && !config?.autoDispatch && (
          <div className="mb-6 p-4 rounded-xl bg-green-500/15 border border-green-500/40 text-green-300 text-sm flex items-center gap-3 animate-pulse">
            <span className="material-symbols-outlined">celebration</span>
            <span className="flex-1">
              <strong>Target reached!</strong> Dispatch the payout to{" "}
              <strong>{turnMember?.name}</strong> now.
            </span>
          </div>
        )}

        {/* Ended banner */}
        {ended && (
          <div className="mb-6 p-6 rounded-xl bg-primary/10 border border-primary/30 text-sm flex items-center gap-4">
            <span className="material-symbols-outlined text-primary">autorenew</span>
            <div className="flex-1 text-on-surface">
              <strong className="text-primary">This circle has ended.</strong> The ledger and members are kept for your records. Start a new circle anytime.
            </div>
            <button
              onClick={handleNewCircle}
              className="bg-primary-container text-on-primary-container px-6 py-2.5 rounded-lg font-bold hover:scale-95 transition-transform whitespace-nowrap"
            >
              Start New Circle
            </button>
          </div>
        )}

        {/* No circle prompt */}
        {!config && (
          <div className="mb-6 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-center gap-4">
            <span className="material-symbols-outlined">groups</span>
            <div className="flex-1">
              <strong>No circle active.</strong> Click <em>Start Your Circle</em> to set
              your target pool and contribution.
            </div>
            <button
              onClick={openModal}
              className="bg-amber-500/20 border border-amber-500/40 px-4 py-2 rounded-lg font-bold hover:bg-amber-500/30 whitespace-nowrap"
            >
              Set Up
            </button>
          </div>
        )}

        {/* Dashboard */}
        {config && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left */}
            <div className="lg:col-span-2 space-y-6">
              <CircleOverview
                name={config.name}
                poolBalance={poolCollected}
                targetPool={config.targetPool}
                contributionAmount={config.contributionAmount}
                turnMember={turnMember}
                dayCount={dayCount}
                roundNumber={roundNumber}
                totalRounds={members.length}
                isActive={isActive}
                poolReady={poolReady}
                circleEnded={ended}
              />
              <ActionPanel
                busy={busy}
                isActive={isActive}
                walletConnected={!!address}
                poolReady={poolReady}
                poolBalance={poolCollected}
                automationAuthorized={automation}
                turnMemberName={turnMember?.name}
                onDeposit={handleDeposit}
                onAuthorize={handleAuthorize}
                onDispatch={advanceTurn}
              />
            </div>

            {/* Right */}
            <div className="space-y-6">
              <ChainStatus
                connected={!!address}
                currentBlock={chain.currentBlock}
                lastSync={chain.lastSync}
                loading={chain.loading}
                error={chain.error}
              />
              <MemberGrid
                members={members}
                currentTurnIndex={turnIndex}
                isActive={isActive}
                onInvite={handleInvite}
              />
              <LedgerFeed ledger={ledger} />
            </div>
          </div>
        )}

        {/* How It Works & FAQ Section for Judges */}
        <div className="mt-12 glass-panel p-8 rounded-xl border border-zinc-800/80">
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary text-3xl">help_outline</span>
            <h3 className="text-2xl font-bold text-white">How It Works & FAQ</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-primary flex items-center gap-2 mb-1.5">
                  <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                  How do other members contribute to the vault?
                </h4>
                <p className="text-on-surface-variant leading-relaxed">
                  In a production environment, each participant connects their own Leather Wallet. They click <strong className="text-white">"Authorize Automation Rules"</strong> to sign a transaction specifying the active turn recipient on-chain. When they deposit, FlowVault's Split primitive intercepts the deposit and routes it peer-to-peer instantly.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-primary flex items-center gap-2 mb-1.5">
                  <span className="material-symbols-outlined text-sm">group_add</span>
                  If I invite a new member, are they added to the rotation?
                </h4>
                <p className="text-on-surface-variant leading-relaxed">
                  Yes. Inviting a member appends them to the end of the rotation list. The sequential turn-based engine will cycle through to them once the active members ahead of them have successfully completed their respective rounds.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-primary flex items-center gap-2 mb-1.5">
                  <span className="material-symbols-outlined text-sm">rotate_left</span>
                  Why are Kwame, Chidi, and Fatoumata already in the list?
                </h4>
                <p className="text-on-surface-variant leading-relaxed">
                  To keep the MVP testing experience smooth and immediately interactive for judges! Rather than forcing you to type and coordinate multiple fake wallet addresses manually, these pre-configured members demonstrate how the automated split-routings and commitment vault reserves behave right out of the box.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-primary flex items-center gap-2 mb-1.5">
                  <span className="material-symbols-outlined text-sm">verified_user</span>
                  Is this custody-free? Where is the money held?
                </h4>
                <p className="text-on-surface-variant leading-relaxed">
                  CircleSave is completely <strong className="text-white">non-custodial</strong>. No funds are ever held by a centralized backend. Every routing rule is written directly to the FlowVault smart contract, and all deposit routing is executed trustlessly peer-to-peer at deposit time on the Stacks blockchain.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Setup Modal */}
      <SetupModal
        open={showSetup}
        closing={modalClosing}
        walletConnected={!!address}
        hasConfig={!!config}
        initialAutoDispatch={config?.autoDispatch ?? false}
        onClose={closeModal}
        onCreate={handleCreate}
      />

      {/* Footer */}
      <footer className="border-t border-outline-variant bg-background mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-center gap-2 opacity-80">
          <span className="material-symbols-outlined text-primary text-base">groups</span>
          <p className="text-sm text-on-surface-variant">
            © 2026 CircleSave · Powered by FlowVault on Stacks
          </p>
        </div>
      </footer>
    </>
  );
}
