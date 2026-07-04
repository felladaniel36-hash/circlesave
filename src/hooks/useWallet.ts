"use client";

// ===========================================================================
// useWallet — connect/disconnect with timeout + session persistence
// ===========================================================================
// Returns a FULLY STABLE object (memoized) so consumers never re-render
// unless a primitive value actually changes.
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  connect,
  disconnect,
  isConnected,
  getLocalStorage,
} from "@stacks/connect";
import { NETWORK } from "@/lib/config";
import { extractStxAddress } from "@/lib/wallet";

export interface WalletState {
  address: string | null;
  error: string;
  connecting: boolean;
  connectWallet: () => Promise<string | null>;
  disconnectWallet: () => void;
  clearError: () => void;
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Restore session on mount — runs ONCE
  useEffect(() => {
    if (isConnected()) {
      const stored = getLocalStorage();
      const addr = extractStxAddress(stored?.addresses);
      if (addr) setAddress(addr);
    }
  }, []);

  // Stable callbacks (empty deps)
  const connectWallet = useCallback(async (): Promise<string | null> => {
    setError("");
    setConnecting(true);
    try {
      const connectPromise = connect({ network: NETWORK });
      const timeoutPromise = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("WALLET_TIMEOUT")), 20000),
      );
      const res = await Promise.race([connectPromise, timeoutPromise]);
      const addr = extractStxAddress(res?.addresses);
      if (!addr) {
        setError("No Stacks account found. Select an STX account in your wallet.");
        return null;
      }
      setAddress(addr);
      return addr;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "WALLET_TIMEOUT") {
        setError(
          "Wallet didn't respond in 20s. Make sure Xverse/Leather is installed and enabled, then allow popups for this site.",
        );
      } else if (/reject|cancel|denied|abort/i.test(msg)) {
        setError("Connection cancelled.");
      } else {
        setError(`Wallet error: ${msg}`);
      }
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    try {
      disconnect();
    } catch {
      /* ignore */
    }
    setAddress(null);
    setError("");
  }, []);

  const clearError = useCallback(() => setError(""), []);

  // Memoized return — only changes when a primitive actually changes
  return useMemo(
    () => ({
      address,
      error,
      connecting,
      connectWallet,
      disconnectWallet,
      clearError,
    }),
    [address, error, connecting, connectWallet, disconnectWallet, clearError],
  );
}
