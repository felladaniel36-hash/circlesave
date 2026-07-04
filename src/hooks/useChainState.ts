"use client";

// ===========================================================================
// useChainState — live polling with MULTI-VAULT AGGREGATION
// ===========================================================================
// Polls every 20s:
//   • Current block height
//   • Connected wallet's unlocked balance (for dispatch)
//   • AGGREGATED pool across ALL circle members (the true cooperative total)
//
// Background polls are SILENT (no loading flash) to prevent UI flickering.
// Return value is memoized so consumers only re-render when data changes.
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

  // Keep a ref to member addresses so the polling interval doesn't reset
  // every time the array identity changes.
  const membersRef = useRef(memberAddresses);
  useEffect(() => {
    membersRef.current = memberAddresses;
  }, [memberAddresses]);

  const refresh = useCallback(
    async (silent: boolean) => {
      const sender = walletAddress ?? "STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD";
      if (!silent) setLoading(true);
      try {
        const block = await getCurrentBlock(sender);

        // Read the connected wallet's own vault (for unlocked/dispatch balance)
        let myUnlocked = 0;
        if (walletAddress) {
          try {
            const myState = await getVaultState(walletAddress);
            myUnlocked = myState.unlockedBalance;
          } catch {
            /* ignore — wallet may have no vault yet */
          }
        }

        // AGGREGATE across all circle members
        const agg = await getTotalCirclePool(membersRef.current, sender);

        setCurrentBlock(block);
        setPoolBalance(microToToken(agg.totalMicro));
        setUnlockedMicro(myUnlocked);
        setPerMember(agg.perMember);
        setLastSync(Date.now());
        setError(null);
      } catch (e) {
        if (!silent || currentBlock === 0) {
          setError(e instanceof Error ? e.message : "Chain read failed");
        }
      } finally {
        setLoading(false);
      }
    },
    [walletAddress, currentBlock],
  );

  const refreshExposed = useCallback(() => refresh(true), [refresh]);

  useEffect(() => {
    if (!walletAddress) return;
    void refresh(false);
    const id = window.setInterval(() => void refresh(true), 20000);
    return () => window.clearInterval(id);
  }, [walletAddress, refresh]);

  // Reset when wallet disconnects
  useEffect(() => {
    if (!walletAddress) {
      setCurrentBlock(0);
      setPoolBalance(0);
      setUnlockedMicro(0);
      setPerMember({});
      setLoading(false);
      setLastSync(null);
      setError(null);
    }
  }, [walletAddress]);

  return useMemo(
    () => ({
      currentBlock,
      poolBalance,
      unlockedMicro,
      perMember,
      loading,
      lastSync,
      error,
      refresh: refreshExposed,
    }),
    [currentBlock, poolBalance, unlockedMicro, perMember, loading, lastSync, error, refreshExposed],
  );
}
