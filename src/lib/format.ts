import { microToToken } from "flowvault-sdk";
import { BLOCK_TIME_SECONDS } from "./constants";

/** Group an integer string with thousands separators without float loss. */
function withThousands(s: string): string {
  const neg = s.startsWith("-");
  const digits = neg ? s.slice(1) : s;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? "-" + grouped : grouped;
}

export function shortenAddr(addr: string, head = 5, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Format a micro-unit number as a human USDCx string with separators. */
export function fmtUsdc(micro: number): string {
  if (!Number.isFinite(micro) || micro <= 0) return "0";
  const token = microToToken(micro);
  const [whole, frac] = token.split(".");
  const withSep = withThousands(whole);
  return frac ? `${withSep}.${frac}` : withSep;
}

/** Approximate human duration for a number of blocks. */
export function blocksToHuman(blocks: number): string {
  if (!Number.isFinite(blocks) || blocks <= 0) return "unlocked";
  const totalSec = blocks * BLOCK_TIME_SECONDS;
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && hours === 0 && mins > 0) parts.push(`${mins}m`);
  if (parts.length === 0) parts.push("<1m");
  return `~${parts.join(" ")}`;
}

export function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

/** Relative time from a unix-seconds timestamp (e.g. burn_block_time). */
export function timeAgo(unixSeconds: number | null): string {
  if (!unixSeconds) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}
