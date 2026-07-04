"use client";

// ===========================================================================
// CircleSave — Main Orchestrator
// ===========================================================================
// This component wires together:
//   • useWallet     → connect/disconnect (frontend ↔ wallet extension)
//   • useChainState → live block + vault reads (frontend ↔ blockchain)
//   • lib/flowvault → all contract writes (frontend → smart contract)
//   • Circle state  → members, turns, ledger (localStorage persistence)
//
// The components are dumb/presentational — all state lives here.
// ===========================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  dispatchPayout,
  deposit,
  withdraw,
  computeLockBlock,
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

  // --- Chain (aggregates pool across ALL members) ---
  const memberAddresses = useMemo(() => members.map((m) => m.address), [members]);
  const chain = useChainState(address, memberAddresses);

  // --- UI state ---
  const [showSetup, setShowSetup] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastType | null>(null);

  // --- Refs to hold latest values for use in stable callbacks ---
  // This breaks the rebuild chain: callbacks read from refs instead of
  // depending on `chain`, so they never rebuild on every 20s poll.
  const chainRef = useRef(chain);
  useEffect(() => { chainRef.current = chain; }, [chain]);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const membersRef = useRef(members);
  useEffect(() => { membersRef.current = members; }, [members]);

  const turnIndexRef = useRef(turnIndex);
  useEffect(() => { turnIndexRef.current = turnIndex; }, [turnIndex]);

  const addressRef = useRef(address);
  useEffect(() => { addressRef.current = address; }, [address]);

  // --- Restore from localStorage on mount ---
  useEffect(() => {
    const m = loadJSON<CircleMember[]>(STORAGE.members, SEED_MEMBERS);
    if (m.length) setMembers(m);
    const l = loadJSON<LedgerEntry[]>(STORAGE.ledger, []);
    if (l.length) setLedger(l);
    const cfg = loadJSON<CircleConfig | null>(STORAGE.config, null);
    if (cfg) setConfig(cfg);
    const t = loadJSON<number>(STORAGE.turn, 0);
    setTurnIndex(t);
    setEnded(loadJSON<boolean>(STORAGE.ended, false));
    setAutomation(loadJSON<boolean>(STORAGE.automation, false));
  }, []);

  // --- Persist ---
  useEffect(() => { saveJSON(STORAGE.members, members); }, [members]);
  useEffect(() => { saveJSON(STORAGE.ledger, ledger); }, [ledger]);
  useEffect(() => { saveJSON(STORAGE.turn, turnIndex); }, [turnIndex]);

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

  // --- Create circle (stable — reads chain block from ref) ---
  const handleCreate = useCallback(
    (name: string, target: number, contribution: number) => {
      const addr = addressRef.current;
      const block = chainRef.current.currentBlock;
      if (!addr || block <= 0) {
        setToast({ kind: "err", msg: "Connect your wallet first." });
        return;
      }
      const cfg: CircleConfig = {
        name,
        targetPool: target,
        contributionAmount: contribution,
        lockBlock: computeLockBlock(block),
        createdAt: Date.now(),
        creatorAddress: addr,
      };
      setConfig(cfg);
      setEnded(false);
      setTurnIndex(0);
      setMembers((prev) => prev.map((m) => ({ ...m, hasReceived: false })));
      saveJSON(STORAGE.config, cfg);
      saveJSON(STORAGE.ended, false);
      saveJSON(STORAGE.turn, 0);
      addLedger(`Circle "${name}" created — target ${target} ${UNIT}, ${membersRef.current.length} members`);
      closeModal();
      setToast({ kind: "ok", msg: `Circle live! Target: ${target} ${UNIT}. Day 1 begins now.` });
    },
    [addLedger, closeModal],
  );

  // --- Deposit (stable — reads from refs) ---
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
        addLedger(`Deposited ${fmtNumber(amt)} ${UNIT} to circle pool`, txId);
        setToast({ kind: "ok", msg: `Deposited ${fmtNumber(amt)} ${UNIT}.`, txid: txId });
        setBusy(false);
        void chainRef.current.refresh();
      }, () => {
        setToast({ kind: "err", msg: "Deposit cancelled." });
        setBusy(false);
      });
    },
    [addLedger],
  );

  // --- Authorize automation (stable — reads from refs) ---
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
    authorizeCircleAutomation(micro, cfg.lockBlock, turn.address, (txId) => {
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

  // --- Dispatch payout (stable — reads from refs) ---
  const handleDispatch = useCallback(() => {
    setToast(null);
    const addr = addressRef.current;
    if (!addr) return setToast({ kind: "err", msg: "Connect your wallet first." });
    const cfg = configRef.current;
    if (!cfg) return setToast({ kind: "err", msg: "Create your circle first." });
    const curMembers = membersRef.current;
    const curTurn = turnIndexRef.current;
    const turn = curMembers[curTurn];
    if (!turn) return setToast({ kind: "err", msg: "No current turn member." });
    const micro = BigInt(chainRef.current.unlockedMicro);
    if (micro <= 0n) return setToast({ kind: "err", msg: "Nothing unlocked to dispatch yet." });
    setBusy(true);
    dispatchPayout(micro, turn.address, (step, msg) => {
      setToast({ kind: "info", msg: `Step ${step}/3: ${msg}` });
    }, (txId) => {
      const amt = microToToken(Number(micro));
      setMembers((prev) => prev.map((m, i) => (i === curTurn ? { ...m, hasReceived: true } : m)));
      const next = (curTurn + 1) % Math.max(1, curMembers.length);
      setTurnIndex(next);
      const allReceived = curMembers.every((m, i) => i === curTurn || m.hasReceived);
      if (allReceived) {
        setMembers((prev) => prev.map((m) => ({ ...m, hasReceived: false })));
        addLedger(`🎉 Full cycle complete! Starting a new round.`, txId);
      }
      addLedger(`Payout dispatched — ${fmtNumber(amt)} ${UNIT} → ${turn.name}`, txId);
      setAutomation(false);
      saveJSON(STORAGE.automation, false);
      setToast({
        kind: "ok",
        msg: `🎯 ${turn.name} received ${fmtNumber(amt)} ${UNIT}! Next up: ${curMembers[next]?.name}.`,
        txid: txId,
      });
      setBusy(false);
      void chainRef.current.refresh();
    }, () => {
      setToast({ kind: "err", msg: "Dispatch cancelled." });
      setBusy(false);
    });
  }, [addLedger]);

  // --- End circle (stable — reads from refs) ---
  const handleEndCircle = useCallback(() => {
    const addr = addressRef.current;
    const cfg = configRef.current;
    if (!addr || addr !== cfg?.creatorAddress) {
      setToast({ kind: "err", msg: "Only the creator can end the circle." });
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("End this circle? Remaining funds withdraw to you.")) return;
    const micro = BigInt(chainRef.current.unlockedMicro);
    if (micro > 0n) {
      setBusy(true);
      setToast({ kind: "info", msg: "Withdrawing remaining pool…" });
      withdraw(micro, () => {
        setEnded(true);
        saveJSON(STORAGE.ended, true);
        addLedger(`Circle ended by creator. Remaining ${fmtNumber(microToToken(Number(micro)))} ${UNIT} withdrawn.`);
        setToast({ kind: "ok", msg: "Circle ended. Funds withdrawn to you." });
        setBusy(false);
        void chainRef.current.refresh();
      }, () => {
        setToast({ kind: "err", msg: "End circle cancelled." });
        setBusy(false);
      });
    } else {
      setEnded(true);
      saveJSON(STORAGE.ended, true);
      addLedger("Circle ended by creator.");
      setToast({ kind: "ok", msg: "Circle ended." });
    }
  }, [addLedger]);

  // --- Invite ---
  const handleInvite = useCallback((name: string, addr: string) => {
    setMembers((prev) => [
      ...prev,
      { id: `m-${Date.now()}`, name, address: addr, reputation: 0, vaultReserve: 0, vaultStatus: "Drained", hasReceived: false },
    ]);
    addLedger(`${name} invited to the circle`);
  }, [addLedger]);

  // --- Start a new circle (after ending the previous one) ---
  const handleNewCircle = useCallback(() => {
    // Clear the old circle state
    setConfig(null);
    setEnded(false);
    setTurnIndex(0);
    setAutomation(false);
    setMembers((prev) => prev.map((m) => ({ ...m, hasReceived: false })));
    saveJSON(STORAGE.config, null);
    saveJSON(STORAGE.ended, false);
    saveJSON(STORAGE.turn, 0);
    saveJSON(STORAGE.automation, false);
    addLedger("Started fresh — ready to create a new circle.");
    // Open the setup modal immediately
    openModal();
  }, [addLedger, openModal]);

  // --- Derived ---
  const isActive = !!config && !ended;
  const poolReady = isActive && config ? chain.poolBalance >= config.targetPool : false;
  const turnMember = members[turnIndex];

  // Reactive target-reached trigger — fires a notification ONCE when the
  // aggregated pool crosses the target, so the turn-by-turn routing is
  // surfaced to the user immediately.
  const targetReachedRef = useRef(false);
  useEffect(() => {
    if (poolReady && !targetReachedRef.current && config) {
      targetReachedRef.current = true;
      setToast({
        kind: "ok",
        msg: `🎯 Target reached! ${config.targetPool} ${UNIT} pooled across all members. ${turnMember?.name} is ready to receive — tap "Dispatch Payout".`,
      });
    }
    if (!poolReady) {
      targetReachedRef.current = false; // reset so it can fire again next round
    }
  }, [poolReady, config, turnMember]);
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

        {/* Pool ready banner */}
        {poolReady && (
          <div className="mb-6 p-4 rounded-xl bg-green-500/15 border border-green-500/40 text-green-300 text-sm flex items-center gap-3 animate-pulse">
            <span className="material-symbols-outlined">celebration</span>
            <span className="flex-1">
              <strong>Target reached!</strong> Dispatch the pool to{" "}
              <strong>{turnMember?.name}</strong> now.
            </span>
          </div>
        )}

        {/* Ended banner — now with a Start New Circle button */}
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
            {/* Left: Circle + Actions */}
            <div className="lg:col-span-2 space-y-6">
              <CircleOverview
                name={config.name}
                poolBalance={chain.poolBalance}
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
                poolBalance={chain.poolBalance}
                automationAuthorized={automation}
                turnMemberName={turnMember?.name}
                onDeposit={handleDeposit}
                onAuthorize={handleAuthorize}
                onDispatch={handleDispatch}
              />
            </div>

            {/* Right: Members + Ledger + ChainStatus */}
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
                perMemberBalances={chain.perMember}
                onInvite={handleInvite}
              />
              <LedgerFeed ledger={ledger} />
            </div>
          </div>
        )}
      </main>

      {/* Setup Modal */}
      <SetupModal
        open={showSetup}
        closing={modalClosing}
        walletConnected={!!address}
        hasConfig={!!config}
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
