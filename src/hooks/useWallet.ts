"use client";

import { useCallback, useEffect, useState } from "react";
import {
  connect,
  disconnect,
  getLocalStorage,
  isConnected,
} from "@stacks/connect";
import { NETWORK } from "@/lib/constants";
import { extractStxAddress } from "@/lib/wallet";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected()) return;
    const stored = getLocalStorage();
    const addr = extractStxAddress(stored?.addresses);
    if (addr) setAddress(addr);
  }, []);

  const connectWallet = useCallback(async (): Promise<string | null> => {
    setError(null);
    setIsConnecting(true);
    try {
      const res = await connect({ network: NETWORK, forceWalletSelect: true });
      const addr = extractStxAddress(res.addresses);
      if (!addr) {
        setError(
          "No Stacks account found. Select an STX account in your wallet, or install Leather / Hiro."
        );
        return null;
      }
      setAddress(addr);
      return addr;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /reject|cancel|denied|abort/i.test(msg)
          ? "Wallet connection cancelled."
          : `Wallet error: ${msg}`
      );
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    try {
      disconnect();
    } catch {
      /* ignore */
    }
    setAddress(null);
    setError(null);
  }, []);

  return {
    address,
    isConnecting,
    error,
    connectWallet,
    disconnectWallet,
    clearError: () => setError(null),
  };
}
