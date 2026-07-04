"use client";

// ===========================================================================
// useChainState — live polling of blockchain state
// ===========================================================================
// This hook is what makes the frontend "communicate" with the backend.
// It polls the current block height + vault state every 15s and exposes
// them as reactive state. The UI updates automatically as the chain moves.
// ===========================================================================

import { useState, useEffect, useCallback } from "react";
import { getCurrentBlock, getVaultState } from "@/lib/flowvault";
import { microToToken } from "@/lib/format";

export interface ChainData {
  currentBlock: number;
  poolBalance: number; // token-scale
  unlockedMicro: number;
  loading: boolean;
  lastSync: number | null;
  error: string | null;
}

const IDLE: ChainData = {
  currentBlock: 0,
  poolBalance: 0,
  unlockedMicro: 0,
  loading: false,
  lastSync: null,
  error: null,
};

export function useChainState(walletAddress: string | null) {
  const [data, setData] = useState<ChainData>(IDLE);

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setData(IDLE);
      return;
    }
    setData((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const block = await getCurrentBlock(walletAddress);
      const state = await getVaultState(walletAddress);
      setData({
        currentBlock: block,
        poolBalance: microToToken(state.totalBalance),
        unlockedMicro: state.unlockedBalance,
        loading: false,
        lastSync: Date.now(),
        error: null,
      });
    } catch (e) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Chain read failed",
      }));
    }
  }, [walletAddress]);

  // Fetch on connect + poll every 15s
  useEffect(() => {
    if (!walletAddress) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, [walletAddress, refresh]);

  return { ...data, refresh };
}
