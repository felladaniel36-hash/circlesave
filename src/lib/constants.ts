import type { NetworkName } from "flowvault-sdk";

// ---------------------------------------------------------------------------
// Contract targets. Read from env with safe fallbacks to the known,
// already-deployed Stacks testnet addresses. The flowvault-sdk itself uses
// the same defaults, so the app works even with no env at all.
// ---------------------------------------------------------------------------

export const NETWORK = (process.env.NEXT_PUBLIC_FLOWVAULT_NETWORK ??
  "testnet") as NetworkName;

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_FLOWVAULT_CONTRACT_ADDRESS ??
  "STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD";

export const CONTRACT_NAME =
  process.env.NEXT_PUBLIC_FLOWVAULT_CONTRACT_NAME ?? "flowvault-v2";

export const TOKEN_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_FLOWVAULT_TOKEN_CONTRACT_ADDRESS ??
  "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";

export const TOKEN_CONTRACT_NAME =
  process.env.NEXT_PUBLIC_FLOWVAULT_TOKEN_CONTRACT_NAME ?? "usdcx";

export const USDCX_SYMBOL = "USDCx";
export const TOKEN_DECIMALS = 6;

/**
 * Rough Stacks block time used ONLY for human-friendly countdown estimates.
 * The FlowVault reference examples treat ~144 blocks as one day, which implies
 * a ~10 minute block. Treat the displayed time as approximate.
 */
export const BLOCK_TIME_SECONDS = 600;

export const EXPLORER_BASE = "https://explorer.hiro.so";

export function explorerTx(txid: string): string {
  const id = txid.startsWith("0x") ? txid : `0x${txid}`;
  return `${EXPLORER_BASE}/txid/${id}?chain=${NETWORK}`;
}

export function explorerAddr(addr: string): string {
  return `${EXPLORER_BASE}/address/${addr}?chain=${NETWORK}`;
}

export function explorerContract(): string {
  return `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}.${CONTRACT_NAME}?chain=${NETWORK}`;
}

export const STX_FAUCET_URL =
  "https://explorer.hiro.so/sandbox/faucet?chain=testnet";

export const USDCX_CONTRACT_ID = `${TOKEN_CONTRACT_ADDRESS}.${TOKEN_CONTRACT_NAME}`;
export const FLOWVAULT_CONTRACT_ID = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`;
