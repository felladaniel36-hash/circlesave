"use client";

// ===========================================================================
// useWallet — connect/disconnect with timeout + session persistence
// ===========================================================================

import { useState, useEffect, useCallback } from "react";
import {
  connect,
  disconnect,
  isConnected,
  getLocalStorage,
} from "@stacks/connect";
import { NETWORK } from "@/lib/config";
import { extractStxAddress } from "@/lib/wallet";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Restore session on mount
  useEffect(() => {
    if (isConnected()) {
      const stored = getLocalStorage();
      const addr = extractStxAddress(stored?.addresses);
      if (addr) setAddress(addr);
    }
  }, []);

  const connectWallet = useCallback(async (): Promise<string | null> => {
    setError("");
    setConnecting(true);
    try {
      // Race against a 20s timeout so the button can never hang forever
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

  return {
    address,
    error,
    connecting,
    connectWallet,
    disconnectWallet,
    clearError: () => setError(""),
  };
}
