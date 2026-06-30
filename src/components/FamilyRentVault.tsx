"use client";

import { useEffect, useMemo, useState } from "react";
import { WalletBar } from "./WalletBar";
import { ProgressGauge } from "./ProgressGauge";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { ContributorList } from "./ContributorList";
import { VaultSetupCard } from "./VaultSetupCard";
import { ContributeCard } from "./ContributeCard";
import { SettleRentCard } from "./SettleRentCard";
import { ActivityFeed } from "./ActivityFeed";
import { PhaseBanner } from "./PhaseBanner";
import { useWallet } from "@/hooks/useWallet";
import { useFamilyVault } from "@/hooks/useFamilyVault";
import { useVaultActivity } from "@/hooks/useVaultActivity";
import { createFlowVault } from "@/lib/flowvault";
import {
  FLOWVAULT_CONTRACT_ID,
  USDCX_CONTRACT_ID,
  STX_FAUCET_URL,
  explorerContract,
} from "@/lib/constants";
import {
  loadConfig,
  saveConfig,
  clearConfig,
  loadContributors,
  addContributor,
  removeContributor,
  clearContributors,
  type VaultConfig,
} from "@/lib/store";
import { fmtUsdc } from "@/lib/format";

export function FamilyRentVault() {
  const wallet = useWallet();
  const { address } = wallet;

  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [contributors, setContributors] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setContributors(loadContributors());
    setHydrated(true);
  }, []);

  const fam = useFamilyVault(contributors, hydrated && !!config);
  const activity = useVaultActivity(hydrated && !!config);
  const flowVault = useMemo(
    () => (address ? createFlowVault(address) : null),
    [address]
  );

  const currentBlock = fam.currentBlock;
  const locked =
    !!config && (currentBlock == null ? true : currentBlock < config.lockUntilBlock);
  const phaseReady = !!config && currentBlock != null;

  function refreshAll() {
    void fam.refresh();
    void activity.refresh();
  }

  function handleCreate(cfg: VaultConfig) {
    saveConfig(cfg);
    setConfig(cfg);
  }
  function handleAddContributor(addr: string) {
    setContributors(addContributor(addr));
  }
  function handleRemoveContributor(addr: string) {
    setContributors(removeContributor(addr));
  }
  function handleContributed(addr: string) {
    setContributors(addContributor(addr));
    refreshAll();
  }
  function handleReset() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Reset the family vault? This clears the local config and contributor list."
      )
    )
      return;
    clearConfig();
    clearContributors();
    setConfig(null);
    setContributors([]);
  }

  const myState =
    fam.contributorStates.find((c) => c.address === address)?.state ?? null;
  const myLocked = myState?.lockedBalance ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-logo" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 9.5L12 4l8 5.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1V9.5Z"
                  fill="#fff"
                  fillOpacity="0.95"
                />
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-title">Family Rent Vault</span>
              <span className="brand-sub">
                Goal-based savings · FlowVault on Stacks
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="netpill">Testnet</span>
            <WalletBar
              address={address}
              isConnecting={wallet.isConnecting}
              onConnect={() => void wallet.connectWallet()}
              onDisconnect={wallet.disconnectWallet}
            />
          </div>
        </div>
      </header>

      <main className="page">
        {wallet.error && (
          <div className="toast toast--err" style={{ marginBottom: 14 }}>
            {wallet.error}
          </div>
        )}

        {!config ? (
          <VaultSetupCard currentBlock={currentBlock} onCreate={handleCreate} />
        ) : (
          <div className="dashboard">
            <div className="col-main">
              <PhaseBanner
                phaseReady={phaseReady}
                locked={locked}
                lockUntilBlock={config.lockUntilBlock}
                pooledMicro={fam.totals.totalMicro}
                landlordAddress={config.landlordAddress}
              />

              <section className="card card--hero">
                <div className="card-head">
                  <span className="hero-name">{config.name}</span>
                  <button className="btn btn--ghost btn--sm" onClick={handleReset}>
                    Reset vault
                  </button>
                </div>

                <div className="hero-grid">
                  <div className="hero-left">
                    <ProgressGauge
                      pooledMicro={fam.totals.totalMicro}
                      goalMicro={config.goalMicro}
                    />
                  </div>
                  <div className="hero-right">
                    <div className="stat-grid" style={{ marginBottom: 8 }}>
                      <div className="stat">
                        <div className="stat-value">
                          {fmtUsdc(config.goalMicro)}
                          <span className="u">USDCx</span>
                        </div>
                        <div className="stat-label">Rent goal</div>
                      </div>
                      <div className="stat">
                        <div className="stat-value">
                          {fmtUsdc(fam.totals.totalMicro)}
                          <span className="u">USDCx</span>
                        </div>
                        <div className="stat-label">Pooled</div>
                      </div>
                      <div className="stat">
                        <div className="stat-value">
                          {fmtUsdc(fam.totals.lockedMicro)}
                          <span className="u">USDCx</span>
                        </div>
                        <div className="stat-label">Locked</div>
                      </div>
                      <div className="stat">
                        <div className="stat-value">{contributors.length}</div>
                        <div className="stat-label">Contributors</div>
                      </div>
                    </div>

                    <DeadlineCountdown
                      lockUntilBlock={config.lockUntilBlock}
                      currentBlock={currentBlock}
                    />
                  </div>
                </div>

                {fam.lastError && (
                  <div className="toast toast--err" style={{ marginTop: 14 }}>
                    Chain read error: {fam.lastError}
                  </div>
                )}
              </section>

              {locked ? (
                <ContributeCard
                  flowVault={flowVault}
                  config={config}
                  address={address}
                  currentBlock={currentBlock}
                  myLockedMicro={myLocked}
                  locked={locked}
                  onContributed={handleContributed}
                />
              ) : (
                <SettleRentCard
                  flowVault={flowVault}
                  config={config}
                  address={address}
                  currentBlock={currentBlock}
                  onSettled={refreshAll}
                />
              )}
            </div>

            <div className="col-side">
              <section className="card">
                <div className="card-head">
                  <h3 className="card-title">Family Progress Tracker</h3>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => void fam.refresh()}
                    disabled={fam.isRefreshing}
                  >
                    {fam.isRefreshing ? <span className="loader" /> : "↻"} Refresh
                  </button>
                </div>
                <ContributorList
                  states={fam.contributorStates}
                  currentBlock={currentBlock}
                  onAdd={handleAddContributor}
                  onRemove={handleRemoveContributor}
                />
              </section>

              <ActivityFeed
                events={activity.events}
                loading={activity.loading}
                contributors={contributors}
                onRefresh={() => void activity.refresh()}
              />

              <section className="card">
                <div className="card-head">
                  <h3 className="card-title">Setup &amp; tokens</h3>
                </div>
                <div className="kvs">
                  <div className="kv">
                    <span className="k">FlowVault contract</span>
                    <a
                      className="v link mono"
                      href={explorerContract()}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {FLOWVAULT_CONTRACT_ID.length > 26
                        ? `${FLOWVAULT_CONTRACT_ID.slice(0, 6)}…${FLOWVAULT_CONTRACT_ID.slice(-12)}`
                        : FLOWVAULT_CONTRACT_ID}
                    </a>
                  </div>
                  <div className="kv">
                    <span className="k">Token</span>
                    <span className="v mono">{USDCX_CONTRACT_ID}</span>
                  </div>
                </div>
                <div className="divider" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <a
                    className="btn btn--ghost btn--block"
                    href={STX_FAUCET_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get testnet STX (faucet) ↗
                  </a>
                  <a
                    className="btn btn--ghost btn--block"
                    href={explorerContract()}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the contract on Stacks Explorer ↗
                  </a>
                </div>
              </section>
            </div>
          </div>
        )}

        <footer className="footer">
          <span>
            Built with the FlowVault <em>Lock</em> &amp; <em>Split</em>{" "}
            primitives · Stacks Testnet
          </span>
          <div className="links">
            <span className="mono">{USDCX_CONTRACT_ID}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
