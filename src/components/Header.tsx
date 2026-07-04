"use client";

import { memo } from "react";
import { shortenAddr } from "@/lib/format";

interface HeaderProps {
  address: string | null;
  connecting: boolean;
  onConnect: () => Promise<string | null>;
  onDisconnect: () => void;
}

function HeaderBase({ address, connecting, onConnect, onDisconnect }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="cs-logo-spin">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
              <circle cx="11" cy="12" r="5" stroke="#ffb690" strokeWidth="2.2" />
              <circle cx="21" cy="12" r="5" stroke="#ffb690" strokeWidth="2.2" />
              <circle cx="16" cy="21" r="5" stroke="#ffb690" strokeWidth="2.2" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-lg font-bold text-primary tracking-tight">CircleSave</span>
            <span className="text-[10px] text-on-surface-variant tracking-wide hidden sm:block">
              Save Together. Trust the Code.
            </span>
          </div>
          {/* FlowVault co-brand badge */}
          <span className="hidden md:flex items-center gap-1 ml-2 px-2 py-0.5 rounded-md bg-surface-container border border-outline-variant text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
            <span className="material-symbols-outlined text-[10px] text-primary">lock</span>
            Backed by FlowVault
          </span>
        </div>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          {address ? (
            <>
              <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-outline-variant">
                <div className="w-2 h-2 bg-green-500 rounded-full pulse-green" />
                <span className="font-data-mono text-sm text-on-surface">
                  {shortenAddr(address, 7, 4)}
                </span>
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                  Testnet
                </span>
              </div>
              <button
                onClick={onDisconnect}
                className="text-zinc-400 hover:text-white text-sm font-medium transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={onConnect}
              disabled={connecting}
              className="bg-primary-container text-on-primary-container px-6 py-2 rounded-lg font-bold hover:scale-95 transition-transform disabled:opacity-60"
            >
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// Memoized — only re-renders when address/connecting actually changes
export const Header = memo(HeaderBase);
