"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlowVault, type VaultState } from "flowvault-sdk";
import { createFlowVault } from "@/lib/flowvault";
import { CONTRACT_ADDRESS } from "@/lib/constants";

export interface ContributorState {
  address: string;
  state: VaultState | null;
  error?: string;
}

export interface FamilyTotals {
  lockedMicro: number;
  totalMicro: number;
  unlockedMicro: number;
}

/**
 * Read-only aggregation layer.
 * Polls the current block height and every contributor's vault state,
 * then sums them for the Family Progress Tracker.
 */
export function useFamilyVault(contributors: string[], enabled: boolean) {
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  const [contributorStates, setContributorStates] = useState<ContributorState[]>(
    []
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const vaultRef = useRef<FlowVault | null>(null);

  if (!vaultRef.current) {
    vaultRef.current = createFlowVault(CONTRACT_ADDRESS);
  }

  const refresh = useCallback(async () => {
    const vault = vaultRef.current ?? createFlowVault(CONTRACT_ADDRESS);
    vaultRef.current = vault;
    setIsRefreshing(true);
    setLastError(null);
    try {
      const block = await vault.getCurrentBlockHeight(CONTRACT_ADDRESS);
      setCurrentBlock(block);

      const results = await Promise.all(
        contributors.map(
          async (addr): Promise<ContributorState> => {
            try {
              const st = await vault.getVaultState(addr);
              return { address: addr, state: st };
            } catch (e) {
              return {
                address: addr,
                state: null,
                error: e instanceof Error ? e.message : String(e),
              };
            }
          }
        )
      );
      setContributorStates(results);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRefreshing(false);
    }
  }, [contributors]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 20000);
    return () => window.clearInterval(id);
  }, [refresh, enabled]);

  const totals: FamilyTotals = contributorStates.reduce(
    (acc, c) => {
      if (c.state) {
        acc.lockedMicro += c.state.lockedBalance || 0;
        acc.totalMicro += c.state.totalBalance || 0;
        acc.unlockedMicro += c.state.unlockedBalance || 0;
      }
      return acc;
    },
    { lockedMicro: 0, totalMicro: 0, unlockedMicro: 0 }
  );

  return {
    currentBlock,
    contributorStates,
    totals,
    isRefreshing,
    lastError,
    refresh,
  };
}
