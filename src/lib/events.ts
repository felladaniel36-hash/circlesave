import { NETWORK, FLOWVAULT_CONTRACT_ID } from "./constants";

// ---------------------------------------------------------------------------
// On-chain activity via the Hiro indexer. The FlowVault contract emits
// `(print {...})` events for every deposit / withdraw, which the indexer
// surfaces with a parseable Clarity `repr`. No decoding of raw hex needed.
// ---------------------------------------------------------------------------

const INDEXER_API =
  NETWORK === "mainnet" ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

export interface VaultEvent {
  txId: string;
  blockHeight: number | null;
  timestamp: number | null; // unix seconds (burn_block_time)
  type: "deposit" | "withdraw";
  actor: string | null; // depositor / withdrawer
  amountMicro: number | null;
  splitTo: string | null; // deposit only
  splitAmountMicro: number | null; // deposit only
  lockAmountMicro: number | null; // deposit only
  lockUntil: number | null; // deposit only
}

interface RawEvent {
  tx_id: string;
  contract_log?: { value?: { repr?: string } };
}

interface TxMeta {
  blockHeight: number | null;
  timestamp: number | null;
}

// --- repr field extractors (the contract's print tuples) -------------------

function extractUint(repr: string, key: string): number | null {
  const m = repr.match(new RegExp(`\\(${key}\\s+u(\\d+)\\)`));
  return m ? Number(m[1]) : null;
}

function extractAscii(repr: string, key: string): string | null {
  const m = repr.match(new RegExp(`\\(${key}\\s+"([^"]*)"\\)`));
  return m ? m[1] : null;
}

function extractPrincipal(repr: string, key: string): string | null {
  // matches (key (some 'ADDR)) or (key 'ADDR); returns null for `none`.
  const some = repr.match(
    new RegExp(`\\(${key}\\s+\\(some\\s+'([A-Za-z0-9.-]+)\\)\\)`)
  );
  if (some) return some[1];
  const direct = repr.match(new RegExp(`\\(${key}\\s+'([A-Za-z0-9.-]+)\\)`));
  if (direct) return direct[1];
  return null;
}

export function parseEvent(raw: RawEvent): VaultEvent | null {
  const repr = raw?.contract_log?.value?.repr;
  if (!repr) return null;

  const type = extractAscii(repr, "event");
  if (type !== "deposit" && type !== "withdraw") return null;

  return {
    txId: raw.tx_id,
    blockHeight: null,
    timestamp: null,
    type,
    actor: extractPrincipal(repr, type === "deposit" ? "depositor" : "withdrawer"),
    amountMicro: extractUint(repr, "amount"),
    splitTo: type === "deposit" ? extractPrincipal(repr, "split-to") : null,
    splitAmountMicro:
      type === "deposit" ? extractUint(repr, "split-amount") : null,
    lockAmountMicro:
      type === "deposit" ? extractUint(repr, "lock-amount") : null,
    lockUntil: type === "deposit" ? extractUint(repr, "lock-until") : null,
  };
}

export async function fetchVaultEvents(limit = 40): Promise<VaultEvent[]> {
  const url = `${INDEXER_API}/extended/v1/contract/${FLOWVAULT_CONTRACT_ID}/events?limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`events fetch failed (${res.status})`);
  const data = await res.json();
  const results: RawEvent[] = data?.results ?? [];
  return results
    .map(parseEvent)
    .filter((e): e is VaultEvent => e !== null);
}

export async function fetchTxMeta(txId: string): Promise<TxMeta> {
  try {
    const res = await fetch(`${INDEXER_API}/extended/v1/tx/${txId}`, {
      cache: "no-store",
    });
    if (!res.ok) return { blockHeight: null, timestamp: null };
    const d = await res.json();
    return {
      blockHeight: d?.block_height ?? null,
      timestamp: d?.burn_block_time ?? null,
    };
  } catch {
    return { blockHeight: null, timestamp: null };
  }
}
