"use client";

// ===========================================================================
// useChainState — live polling with MULTI-VAULT AGGREGATION (loop-free)
// ===========================================================================
// Polls every 20s:
//   • Current block height
//   • Connected wallet's unlocked balance (for dispatch)
//   • AGGREGATED pool across ALL circle members (the true cooperative total)
//
// CRITICAL: the polling interval is set up ONCE per wallet connection and
// never tears down/rebuilds on data changes. This prevents the infinite
// re-render loop that caused the constant flicker/reload.
// ===========================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getCurrentBlock, getVaultState, getTotalCirclePool } from "@/lib/flowvault";
import { microToToken } from "@/lib/format";

export interface ChainData {
  currentBlock: number;
  poolBalance: number; // AGGREGATED token-scale total across all members
  unlockedMicro: number; // connected wallet's unlocked balance (for dispatch)
  perMember: Record<string, number>; // per-member breakdown (micro)
  loading: boolean; // true ONLY during the initial fetch
  lastSync: number | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const SENDER_FALLBACK = "STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD";

export function useChainState(
  walletAddress: string | null,
  memberAddresses: string[],
): ChainData {
  const [currentBlock, setCurrentBlock] = useState(0);
  const [poolBalance, setPoolBalance] = useState(0);
  const [unlockedMicro, setUnlockedMicro] = useState(0);
  const [perMember, setPerMember] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Refs to hold the latest values WITHOUT triggering re-renders ---
  // These break the dependency loop: the polling function reads from refs
  // instead of closures, so it never needs to be rebuilt.
  const walletRef = useRef(walletAddress);
  const membersRef = useRef(memberAddresses);
  const hasDataRef = useRef(false); // have we ever successfully fetched?

  useEffect(() => {
    walletRef.current = walletAddress;
  }, [walletAddress]);

  useEffect(() => {
    membersRef.current = memberAddresses;
  }, [memberAddresses]);

  // --- The core fetch function. STABLE — no dependencies, reads from refs. ---
  const doFetch = useCallback(async (silent: boolean) => {
    const addr = walletRef.current;
    if (!addr) return;
    if (!silent) setLoading(true);
    try {
      const sender = addr ?? SENDER_FALLBACK;
      const block = await getCurrentBlock(sender);

      let myUnlocked = 0;
      try {
        const myState = await getVaultState(addr);
        myUnlocked = myState.unlockedBalance;
      } catch {
        /* wallet may have no vault yet */
      }

      const agg = await getTotalCirclePool(membersRef.current, sender);

      setCurrentBlock(block);
      setPoolBalance(microToToken(agg.totalMicro));
      setUnlockedMicro(myUnlocked);
      setPerMember(agg.perMember);
      setLastSync(Date.now());
      setError(null);
      hasDataRef.current = true;
    } catch (e) {
      // Only show an error if we've never had good data
      if (!silent || !hasDataRef.current) {
        setError(e instanceof Error ? e.message : "Chain read failed");
      }
    } finally {
      setLoading(false);
    }
  }, []); // ← empty deps = stable forever

  // Exposed refresh — always silent
  const refresh = useCallback(() => doFetch(true), [doFetch]);

  // --- Polling interval: set up ONCE per wallet connection, never rebuilds ---
  useEffect(() => {
    if (!walletAddress) {
      // Reset everything on disconnect
      hasDataRef.current = false;
      setCurrentBlock(0);
      setPoolBalance(0);
      setUnlockedMicro(0);
      setPerMember({});
      setLoading(false);
      setLastSync(null);
      setError(null);
      return;
    }

    // Initial fetch (shows loading)
    hasDataRef.current = false;
    void doFetch(false);

    // Background poll every 20s (silent — no loading flash)
    const id = window.setInterval(() => {
      void doFetch(true);
    }, 20000);

    return () => window.clearInterval(id);
  }, [walletAddress, doFetch]);

  // --- Stable return — only changes when a primitive actually changes ---
  return useMemo(
    () => ({
      currentBlock,
      poolBalance,
      unlockedMicro,
      perMember,
      loading,
      lastSync,
      error,
      refresh,
    }),
    [currentBlock, poolBalance, unlockedMicro, perMember, loading, lastSync, error, refresh],
  );
}
