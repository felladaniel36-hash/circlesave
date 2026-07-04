"use client";

// ===========================================================================
// useChainState — live polling of blockchain state (flicker-free + stable)
// ===========================================================================
// Polls the current block height + vault state every 20s.
//  • Background polls update data SILENTLY (no loading flash) so the UI
//    doesn't flicker. Only the very first fetch shows a loading state.
//  • Returns a STABLE object (memoized) so consumers don't re-render every
//    poll cycle unless the data actually changed.
// ===========================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getCurrentBlock, getVaultState } from "@/lib/flowvault";
import { microToToken } from "@/lib/format";

export interface ChainData {
  currentBlock: number;
  poolBalance: number; // token-scale
  unlockedMicro: number;
  loading: boolean; // true ONLY during the initial fetch
  lastSync: number | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useChainState(walletAddress: string | null): ChainData {
  const [currentBlock, setCurrentBlock] = useState(0);
  const [poolBalance, setPoolBalance] = useState(0);
  const [unlockedMicro, setUnlockedMicro] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const didInit = useRef(false);

  const refresh = useCallback(
    async (silent: boolean) => {
      if (!walletAddress) return;
      if (!silent) setLoading(true);
      try {
        const block = await getCurrentBlock(walletAddress);
        const state = await getVaultState(walletAddress);
        setCurrentBlock(block);
        setPoolBalance(microToToken(state.totalBalance));
        setUnlockedMicro(state.unlockedBalance);
        setLastSync(Date.now());
        setError(null);
      } catch (e) {
        // On silent (background) polls, keep last good data — don't blank the UI
        if (!silent || currentBlock === 0) {
          setError(e instanceof Error ? e.message : "Chain read failed");
        }
      } finally {
        setLoading(false);
      }
    },
    [walletAddress, currentBlock],
  );

  // Exposed refresh — always silent (no loading flash) for manual re-fetches
  const refreshExposed = useCallback(() => refresh(true), [refresh]);

  // Initial fetch on connect + poll every 20s (silent)
  useEffect(() => {
    if (!walletAddress) {
      didInit.current = false;
      setCurrentBlock(0);
      setPoolBalance(0);
      setUnlockedMicro(0);
      setLoading(false);
      setLastSync(null);
      setError(null);
      return;
    }
    void refresh(false);
    didInit.current = true;
    const id = window.setInterval(() => void refresh(true), 20000);
    return () => window.clearInterval(id);
  }, [walletAddress, refresh]);

  // Stable return — only changes when a primitive actually changes
  return useMemo(
    () => ({
      currentBlock,
      poolBalance,
      unlockedMicro,
      loading,
      lastSync,
      error,
      refresh: refreshExposed,
    }),
    [currentBlock, poolBalance, unlockedMicro, loading, lastSync, error, refreshExposed],
  );
}
