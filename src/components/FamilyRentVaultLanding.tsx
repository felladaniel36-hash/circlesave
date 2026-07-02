"use client";

import { useState, useEffect, useCallback } from "react";

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "frv.landing.contributors.v1";

const RING_RADIUS = 80;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ≈ 502.65

const INITIAL_CONTRIBUTORS: Contributor[] = [
  {
    id: "alice",
    name: "Alice",
    address: "ST1P...GZGM",
    amount: 150,
    status: "Confirmed",
  },
  {
    id: "bob",
    name: "Bob",
    address: "ST3A...X932",
    amount: 200,
    status: "Confirmed",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FamilyRentVaultLanding() {
  // --- State Management ----------------------------------------------------
  // Refactored from hardcoded HTML values into React state, ready to be
  // wired to real on-chain reads (flowvault-sdk getVaultState) later.

  const [vaultBalance, setVaultBalance] = useState(350);
  const [targetGoal] = useState(1000);
  const [currentBlock, setCurrentBlock] = useState(842100);
  const [targetUnlockBlock] = useState(843500);

  const [contributorsList, setContributorsList] = useState<Contributor[]>(
    INITIAL_CONTRIBUTORS
  );

  // Deposit input binder
  const [depositAmount, setDepositAmount] = useState("");

  // Add-sibling inline form
  const [isAddingSibling, setIsAddingSibling] = useState(false);
  const [siblingName, setSiblingName] = useState("");
  const [siblingAddress, setSiblingAddress] = useState("");

  // --- Effects -------------------------------------------------------------

  // Load contributors from localStorage on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setContributorsList(parsed as Contributor[]);
        }
      }
    } catch {
      /* ignore parse / quota errors */
    }
  }, []);

  // Persist contributors to localStorage whenever they change
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(contributorsList)
      );
    } catch {
      /* ignore */
    }
  }, [contributorsList]);

  // --- Handlers ------------------------------------------------------------

  // (2) Add a sibling wallet to the registry + persist to localStorage
  const handleJoinVault = useCallback(() => {
    const name = siblingName.trim();
    const address = siblingAddress.trim();
    if (!name || !address) return;

    const newContributor: Contributor = {
      id: `sib-${Date.now()}`,
      name,
      address,
      amount: 0,
      status: "Pending",
    };

    setContributorsList((prev) => [...prev, newContributor]);

    // Reset form
    setSiblingName("");
    setSiblingAddress("");
    setIsAddingSibling(false);
  }, [siblingName, siblingAddress]);

  // (3) Deposit handler — MOCK for now, wired to local state.
  // TODO: replace with flowvault-sdk calls:
  //   1. setRoutingRules({ lockAmount: micro, lockUntilBlock: targetUnlockBlock,
  //                        splitAddress: null, splitAmount: 0n })
  //   2. deposit(micro)
  const handleDepositUSDCx = useCallback(() => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;

    // ⚠️ MOCK — updates local balance only. Swap for real SDK deposit().
    setVaultBalance((prev) => prev + amount);
    setDepositAmount("");
  }, [depositAmount]);

  // (3) Settlement handler — TEMPLATE / no-op until deadline block reached.
  // TODO: wire to flowvault-sdk:
  //   1. withdraw(unlockedBalance)
  //   2. setRoutingRules({ lockAmount: 0, lockUntilBlock: 0,
  //                        splitAddress: landlord, splitAmount: amount })
  //   3. deposit(amount)  ← FlowVault routes USDCx to landlord
  const handleSettleAndRoute = useCallback(() => {
    // Intentionally empty — settlement logic goes here.
  }, []);

  // --- Derived values ------------------------------------------------------

  const progress = Math.min(1, vaultBalance / targetGoal);
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const settlementReady = currentBlock >= targetUnlockBlock;

  // --- Render --------------------------------------------------------------

  return (
    <>
      {/* ============================ Top Nav Bar ============================ */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-container-max mx-auto px-margin-desktop h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary text-3xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              lock_clock
            </span>
            <span className="font-headline-md text-headline-md font-bold text-primary tracking-tight">
              Family Rent Vault
            </span>
          </div>

          <div className="flex items-center gap-stack-md">
            {/* TODO: wire useWallet() here for real wallet state */}
            <div className="hidden md:flex flex-col items-end mr-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full pulse-green" />
                <span className="font-data-mono text-data-mono text-on-surface">
                  ST1PQH...GZGM
                </span>
              </div>
              <button className="font-label-caps text-label-caps text-primary hover:underline transition-all">
                Disconnect
              </button>
            </div>
            <button className="bg-primary-container text-on-primary-container px-6 py-2 rounded-lg font-bold hover:scale-95 transition-transform">
              0x71C...4f21
            </button>
            <span className="material-symbols-outlined text-primary cursor-pointer">
              account_balance_wallet
            </span>
          </div>
        </div>
      </header>

      {/* =============================== Main ================================ */}
      <main className="pt-32 pb-20 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
        {/* --- Hero --- */}
        <section className="text-center mb-20 relative">
          <div className="relative z-10 max-w-3xl mx-auto">
            <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg mb-6 leading-tight">
              Programmable{" "}
              <span className="text-primary">Collective Savings</span>
            </h1>
            <p className="font-body-base text-on-surface-variant max-w-xl mx-auto mb-10">
              Pool USDCx securely with family members to meet fixed
              milestones—programmatically locked and automatically routed
              straight to your landlord.
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

        {/* --- Dashboard Grid --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-stack-lg">
          {/* ===== Left Column ===== */}
          <div className="space-y-stack-lg">
            {/* Rent Completion */}
            <div className="glass-panel p-stack-lg rounded-xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="font-headline-md text-headline-md text-white mb-1">
                    Rent Completion
                  </h3>
                  <p className="font-body-sm text-on-surface-variant">
                    Block-synced treasury status
                  </p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-500 text-sm">
                    lock
                  </span>
                  <span className="font-label-caps text-label-caps text-amber-500">
                    Status: Time-Locked
                  </span>
                </div>
              </div>

              {/* Progress ring — dynamic */}
              <div className="flex flex-col items-center justify-center py-6">
                <div className="relative w-48 h-48">
                  <svg className="w-full h-full" viewBox="0 0 192 192">
                    <circle
                      className="text-zinc-800"
                      cx="96"
                      cy="96"
                      fill="transparent"
                      r={RING_RADIUS}
                      stroke="currentColor"
                      strokeWidth="8"
                    />
                    <circle
                      className="text-primary progress-ring-circle"
                      cx="96"
                      cy="96"
                      fill="transparent"
                      r={RING_RADIUS}
                      stroke="currentColor"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      strokeWidth="10"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="font-display-lg text-2xl text-white">
                      {vaultBalance.toLocaleString()}
                    </span>
                    <span className="font-label-caps text-xs text-on-surface-variant">
                      OF {targetGoal.toLocaleString()} USDCx
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-outline-variant">
                <div>
                  <p className="font-label-caps text-on-surface-variant mb-1">
                    Current Block
                  </p>
                  <p className="font-data-mono text-primary">
                    #{currentBlock.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-label-caps text-on-surface-variant mb-1">
                    Target Unlock
                  </p>
                  <p className="font-data-mono text-on-surface">
                    #{targetUnlockBlock.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Financial Action */}
            <div className="glass-panel p-stack-lg rounded-xl">
              <h3 className="font-headline-md text-headline-md text-white mb-6">
                Financial Action
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="font-label-caps text-on-surface-variant mb-2 block">
                    Amount to Contribute (USDCx)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-[#09090b] border border-zinc-800 text-white p-4 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 font-label-caps text-on-surface-variant">
                      USDCx
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDepositUSDCx}
                  className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-xl hover:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">bolt</span>
                  Contribute to Rent
                </button>
              </div>
            </div>

            {/* Settlement Zone */}
            <div className="glass-panel p-stack-lg rounded-xl border border-dashed border-zinc-800">
              <div className="flex flex-col items-center text-center">
                <h3 className="font-headline-md text-headline-md text-white mb-2">
                  Settlement Zone
                </h3>
                <p className="font-body-sm text-on-surface-variant mb-8 max-w-sm">
                  Unlocks automatically when Target Block Height is reached.
                </p>
                <button
                  onClick={handleSettleAndRoute}
                  disabled={!settlementReady}
                  className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all ${
                    settlementReady
                      ? "bg-primary-container text-on-primary-container hover:scale-[0.98] cursor-pointer"
                      : "bg-zinc-800/50 text-zinc-500 cursor-not-allowed opacity-50"
                  }`}
                >
                  <span className="material-symbols-outlined">
                    {settlementReady ? "lock_open" : "lock"}
                  </span>
                  Settle Rent &amp; Route Funds
                </button>
              </div>
            </div>
          </div>

          {/* ===== Right Column ===== */}
          <div className="space-y-stack-lg">
            {/* Family Registry */}
            <div className="glass-panel p-stack-lg rounded-xl h-full flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-headline-md text-headline-md text-white">
                  Family Registry
                </h3>
                <span className="font-label-caps text-primary">
                  {contributorsList.length} Active{" "}
                  {contributorsList.length === 1 ? "Sibling" : "Siblings"}
                </span>
              </div>

              <div className="space-y-4 flex-grow">
                {/* Contributor rows — mapped from state */}
                {contributorsList.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-4 bg-surface-container rounded-lg border border-outline-variant hover:border-primary/30 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                        <span className="material-symbols-outlined text-zinc-400">
                          person
                        </span>
                      </div>
                      <div>
                        <p className="font-body-base font-bold text-white">
                          {c.name}
                        </p>
                        <p className="font-data-mono text-xs text-on-surface-variant">
                          {c.address}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-data-mono text-primary">
                        {c.amount} USDCx
                      </p>
                      <p
                        className={`font-label-caps text-[10px] ${
                          c.status === "Confirmed"
                            ? "text-green-500"
                            : "text-amber-500"
                        }`}
                      >
                        {c.status}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Add Sibling — inline form or dashed button */}
                {isAddingSibling ? (
                  <div className="p-4 border border-primary/30 rounded-lg bg-primary/5 space-y-3">
                    <input
                      value={siblingName}
                      onChange={(e) => setSiblingName(e.target.value)}
                      placeholder="Sibling name"
                      className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-body-base"
                    />
                    <input
                      value={siblingAddress}
                      onChange={(e) => setSiblingAddress(e.target.value)}
                      placeholder="ST... wallet address"
                      className="w-full bg-[#09090b] border border-zinc-800 text-white p-3 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-data-mono text-sm"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleJoinVault}
                        disabled={
                          !siblingName.trim() || !siblingAddress.trim()
                        }
                        className="flex-1 bg-primary-container text-on-primary-container font-bold py-3 rounded-lg hover:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add Sibling
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingSibling(false);
                          setSiblingName("");
                          setSiblingAddress("");
                        }}
                        className="px-4 border border-zinc-700 text-zinc-400 font-medium py-3 rounded-lg hover:bg-zinc-900 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAddingSibling(true)}
                    className="w-full p-4 border border-dashed border-zinc-700 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 group"
                  >
                    <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">
                      add_circle
                    </span>
                    <span className="font-label-caps text-on-surface-variant group-hover:text-primary transition-colors">
                      + Add Sibling Wallet Address
                    </span>
                  </button>
                )}
              </div>

              {/* Recent Activity */}
              <div className="mt-12 bg-black rounded-xl overflow-hidden border border-zinc-800">
                <div className="p-6 border-b border-zinc-800">
                  <p className="font-label-caps text-on-surface-variant">
                    Recent Activity
                  </p>
                </div>
                <div>
                  <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-900/50">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-sm">
                        receipt_long
                      </span>
                      <span className="font-body-sm">
                        Alice contributed 50 USDCx
                      </span>
                    </div>
                    <span className="font-data-mono text-xs text-zinc-500">
                      2h ago
                    </span>
                  </div>
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-sm">
                        receipt_long
                      </span>
                      <span className="font-body-sm">
                        Bob joined the Vault
                      </span>
                    </div>
                    <span className="font-data-mono text-xs text-zinc-500">
                      5h ago
                    </span>
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
            <span className="material-symbols-outlined text-primary">
              lock_clock
            </span>
            <p className="font-body-sm text-on-surface-variant">
              © 2026 Family Rent Vault. Secured by Smart Contract.
            </p>
          </div>
          <div className="flex gap-stack-md">
            <a
              className="font-body-sm text-on-surface-variant hover:text-primary transition-colors"
              href="#"
            >
              Privacy Policy
            </a>
            <a
              className="font-body-sm text-on-surface-variant hover:text-primary transition-colors"
              href="#"
            >
              Terms of Service
            </a>
            <a
              className="font-body-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
              href="#"
            >
              Security Audit
              <span className="material-symbols-outlined text-[14px]">
                open_in_new
              </span>
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
