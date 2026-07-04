"use client";

// ===========================================================================
// useChainState — lightweight block-height polling (flicker-free + stable)
// ===========================================================================
// Polls the current Stacks block height every 20s for the ChainStatus panel.
// Pool tracking is handled locally via `poolCollected` in the orchestrator
// (incremented on each deposit), so this hook no longer reads vault balances.
//
// CRITICAL: the polling interval is set up ONCE per wallet connection and
// never tears down/rebuilds on data changes. Background polls are silent.
// ===========================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getCurrentBlock } from "@/lib/flowvault";

export interface ChainData {
  currentBlock: number;
  loading: boolean;
  lastSync: number | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const SENDER_FALLBACK = "STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD";

export function useChainState(walletAddress: string | null): ChainData {
  const [currentBlock, setCurrentBlock] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const walletRef = useRef(walletAddress);
  useEffect(() => {
    walletRef.current = walletAddress;
  }, [walletAddress]);

  const doFetch = useCallback(async (silent: boolean) => {
    const addr = walletRef.current ?? SENDER_FALLBACK;
    if (!silent) setLoading(true);
    try {
      const block = await getCurrentBlock(addr);
      setCurrentBlock(block);
      setLastSync(Date.now());
      setError(null);
    } catch (e) {
      if (!silent || currentBlock === 0) {
        setError(e instanceof Error ? e.message : "Chain read failed");
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => doFetch(true), [doFetch]);

  useEffect(() => {
    if (!walletAddress) {
      setCurrentBlock(0);
      setLoading(false);
      setLastSync(null);
      setError(null);
      return;
    }
    void doFetch(false);
    const id = window.setInterval(() => void doFetch(true), 20000);
    return () => window.clearInterval(id);
  }, [walletAddress, doFetch]);

  return useMemo(
    () => ({ currentBlock, loading, lastSync, error, refresh }),
    [currentBlock, loading, lastSync, error, refresh],
  );
}
