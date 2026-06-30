"use client";

import { shortenAddr } from "@/lib/format";
import { explorerAddr } from "@/lib/constants";

export function WalletBar({
  address,
  isConnecting,
  onConnect,
  onDisconnect,
}: {
  address: string | null;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!address) {
    return (
      <button
        className="btn btn--primary"
        onClick={onConnect}
        disabled={isConnecting}
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  return (
    <div className="walletpill">
      <span className="walletdot" />
      <a
        className="mono walletaddr"
        href={explorerAddr(address)}
        target="_blank"
        rel="noreferrer"
        title={address}
      >
        {shortenAddr(address, 6, 6)}
      </a>
      <button className="btn btn--ghost btn--sm" onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}
