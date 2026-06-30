"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchVaultEvents, fetchTxMeta, type VaultEvent } from "@/lib/events";

/**
 * Fetches recent on-chain deposit/withdraw events for the FlowVault contract
 * and enriches the most recent ones with block height + timestamp for display.
 */
export function useVaultActivity(enabled: boolean) {
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const evs = await fetchVaultEvents(40);
      const toEnrich = evs.slice(0, 12);
      const metas = await Promise.all(
        toEnrich.map((e) => fetchTxMeta(e.txId))
      );
      toEnrich.forEach((e, i) => {
        e.blockHeight = metas[i].blockHeight;
        e.timestamp = metas[i].timestamp;
      });
      evs.sort((a, b) => (b.blockHeight ?? 0) - (a.blockHeight ?? 0));
      setEvents(evs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load, enabled]);

  return { events, loading, error, refresh: load };
}
