// ===========================================================================
// CircleSave — Core Configuration & Types
// ===========================================================================
// Single source of truth for contract addresses, network config, and all
// shared types. Everything imports from here.
// ===========================================================================

// ---------------------------------------------------------------------------
// Stacks Testnet contract targets (FlowVault V2 — already deployed)
// ---------------------------------------------------------------------------

export const NETWORK = "testnet" as const;

export const FLOWVAULT = {
  address: "STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD",
  name: "flowvault-v2",
} as const;

export const USDCX = {
  address: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  name: "usdcx",
} as const;

export const EXPLORER = "https://explorer.hiro.so";

// ---------------------------------------------------------------------------
// Token constants
// ---------------------------------------------------------------------------

export const DECIMALS = 6;
export const MICRO = 10 ** DECIMALS; // 1,000,000
export const UNIT = "USDCx";

// ~10 min per Stacks block (used only for cosmetic time estimates)
export const BLOCK_TIME_MIN = 10;

// ---------------------------------------------------------------------------
// UI constants
// ---------------------------------------------------------------------------

export const RING_RADIUS = 80;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface CircleMember {
  id: string;
  name: string;
  address: string;
  reputation: number;
  vaultReserve: number;
  vaultStatus: "Healthy" | "Drained";
  hasReceived: boolean;
}

export interface CircleConfig {
  name: string;
  targetPool: number;
  contributionAmount: number;
  lockBlock: number;
  createdAt: number;
  creatorAddress: string;
  autoDispatch: boolean; // auto-trigger payout flow when target reached
}

export interface LedgerEntry {
  id: string;
  action: string;
  timestamp: number;
  txid?: string;
}

export interface VaultState {
  totalBalance: number; // micro-units
  lockedBalance: number;
  unlockedBalance: number;
  lockUntilBlock: number;
  currentBlock: number;
}

export interface ChainStatus {
  connected: boolean;
  currentBlock: number;
  contractId: string;
  tokenId: string;
  lastSync: number | null;
}

export type ToastKind = "ok" | "err" | "info";

export interface Toast {
  kind: ToastKind;
  msg: string;
  txid?: string;
}

// ---------------------------------------------------------------------------
// Storage keys (versioned)
// ---------------------------------------------------------------------------

export const STORAGE = {
  members: "cs.members.v3",
  ledger: "cs.ledger.v3",
  config: "cs.config.v3",
  turn: "cs.turn.v3",
  ended: "cs.ended.v3",
  automation: "cs.automation.v3",
  pool: "cs.pool.v3", // total contributed toward current round
} as const;

// ---------------------------------------------------------------------------
// Seed members (demo data)
// ---------------------------------------------------------------------------

export const SEED_MEMBERS: CircleMember[] = [
  { id: "kwame", name: "Kwame", address: "ST2KY52148HEZ544N614HYPVSX6HDF45V419E83M0", reputation: 98, vaultReserve: 40, vaultStatus: "Healthy", hasReceived: false },
];
