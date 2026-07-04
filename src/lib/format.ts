// ===========================================================================
// Formatting & conversion helpers
// ===========================================================================

import { DECIMALS, MICRO, EXPLORER, NETWORK, BLOCK_TIME_MIN } from "./config";

// --- Amount conversion ---

export function microToToken(micro: number): number {
  return micro / MICRO;
}

// --- Display formatting ---

export function fmtNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtTokens(micro: number): string {
  return fmtNumber(micro / MICRO);
}

export function shortenAddr(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function blocksToHuman(blocks: number): string {
  if (blocks <= 0) return "now";
  const totalMin = Math.round(blocks * BLOCK_TIME_MIN);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  return parts.join(" ") || "<1h";
}

// --- Explorer links ---

export function explorerTxUrl(txid: string): string {
  const id = txid.startsWith("0x") ? txid : `0x${txid}`;
  return `${EXPLORER}/txid/${id}?chain=${NETWORK}`;
}

export function explorerAddrUrl(addr: string): string {
  return `${EXPLORER}/address/${addr}?chain=${NETWORK}`;
}

export function explorerContractUrl(): string {
  return `${EXPLORER}/address/${FLOWVAULT_ADDRESS()}.${FLOWVAULT_NAME()}?chain=${NETWORK}`;
}

// Local refs to avoid circular import with config
function FLOWVAULT_ADDRESS() {
  return "STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD";
}
function FLOWVAULT_NAME() {
  return "flowvault-v2";
}

// --- LocalStorage helpers ---

export function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}
