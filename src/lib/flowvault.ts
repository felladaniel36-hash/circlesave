// ===========================================================================
// FlowVault Backend Layer
// ===========================================================================
// This is the BRIDGE between the CircleSave frontend and the Stacks
// blockchain. Every on-chain read and write flows through here.
//
// READS  → fetchCallReadOnlyFunction (no wallet signature needed)
// WRITES → openContractCall (wallet signs the transaction)
//
// Importing this module is how the frontend "talks to the backend."
// ===========================================================================

import {
  uintCV,
  contractPrincipalCV,
  noneCV,
  someCV,
  principalCV,
  cvToValue,
  fetchCallReadOnlyFunction,
  PostConditionMode,
} from "@stacks/transactions";
import { openContractCall } from "@stacks/connect";
import {
  FLOWVAULT,
  USDCX,
  NETWORK,
  LOCK_HORIZON_BLOCKS,
  type VaultState,
} from "./config";

// ---------------------------------------------------------------------------
// Contract IDs (for display)
// ---------------------------------------------------------------------------

export const FLOWVAULT_CONTRACT_ID = `${FLOWVAULT.address}.${FLOWVAULT.name}`;
export const USDCX_CONTRACT_ID = `${USDCX.address}.${USDCX.name}`;

// ---------------------------------------------------------------------------
// READS — query the blockchain without signing anything
// ---------------------------------------------------------------------------

/** Read the current Stacks block height. */
export async function getCurrentBlock(senderAddress: string): Promise<number> {
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: FLOWVAULT.address,
    contractName: FLOWVAULT.name,
    functionName: "get-current-block-height",
    functionArgs: [],
    senderAddress,
    network: NETWORK,
  });
  return toUint(cvToValue(cv, true));
}

/** Read a user's full vault state (balances + lock info). */
export async function getVaultState(senderAddress: string): Promise<VaultState> {
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: FLOWVAULT.address,
    contractName: FLOWVAULT.name,
    functionName: "get-vault-state",
    functionArgs: [principalCV(senderAddress)],
    senderAddress,
    network: NETWORK,
  });
  const state = cvToValue(cv, true) as Record<string, unknown>;
  return {
    totalBalance: toUint(state["total-balance"]),
    lockedBalance: toUint(state["locked-balance"]),
    unlockedBalance: toUint(state["unlocked-balance"]),
    lockUntilBlock: toUint(state["lock-until-block"]),
    currentBlock: toUint(state["current-block"]),
  };
}

// ---------------------------------------------------------------------------
// WRITES — wallet-signed transactions via openContractCall
// ---------------------------------------------------------------------------

/** Configure lock + split routing rules for the caller. */
export function setRoutingRules(
  lockAmountMicro: bigint,
  lockUntilBlock: number,
  splitAddress: string | null,
  splitAmountMicro: bigint,
  onFinish: (txId: string) => void,
  onCancel: () => void,
): void {
  openContractCall({
    network: NETWORK,
    contractAddress: FLOWVAULT.address,
    contractName: FLOWVAULT.name,
    functionName: "set-routing-rules",
    functionArgs: [
      uintCV(lockAmountMicro),
      uintCV(lockUntilBlock),
      splitAddress ? someCV(principalCV(splitAddress)) : noneCV(),
      uintCV(splitAmountMicro),
    ],
    postConditionMode: PostConditionMode.Allow,
    onFinish: (payload: { txId?: string }) => {
      onFinish(payload.txId ?? "wallet-submitted");
    },
    onCancel,
  });
}

/** Deposit USDCx into the vault (routing rules apply at deposit time). */
export function deposit(
  amountMicro: bigint,
  onFinish: (txId: string) => void,
  onCancel: () => void,
): void {
  openContractCall({
    network: NETWORK,
    contractAddress: FLOWVAULT.address,
    contractName: FLOWVAULT.name,
    functionName: "deposit",
    functionArgs: [
      contractPrincipalCV(USDCX.address, USDCX.name),
      uintCV(amountMicro),
    ],
    postConditionMode: PostConditionMode.Allow,
    onFinish: (payload: { txId?: string }) => {
      onFinish(payload.txId ?? "wallet-submitted");
    },
    onCancel,
  });
}

/** Withdraw unlocked USDCx from the vault. */
export function withdraw(
  amountMicro: bigint,
  onFinish: (txId: string) => void,
  onCancel: () => void,
): void {
  openContractCall({
    network: NETWORK,
    contractAddress: FLOWVAULT.address,
    contractName: FLOWVAULT.name,
    functionName: "withdraw",
    functionArgs: [
      contractPrincipalCV(USDCX.address, USDCX.name),
      uintCV(amountMicro),
    ],
    postConditionMode: PostConditionMode.Allow,
    onFinish: (payload: { txId?: string }) => {
      onFinish(payload.txId ?? "wallet-submitted");
    },
    onCancel,
  });
}

// ---------------------------------------------------------------------------
// High-level CircleSave operations (composing the primitives above)
// ---------------------------------------------------------------------------

/**
 * Authorize automation: lock the contribution + auto-route to the turn member.
 * This is what makes deposits "flow" to the right person automatically.
 */
export function authorizeCircleAutomation(
  contributionMicro: bigint,
  lockBlock: number,
  turnMemberAddress: string,
  onFinish: (txId: string) => void,
  onCancel: () => void,
): void {
  setRoutingRules(
    contributionMicro,
    lockBlock,
    turnMemberAddress, // split to the turn member
    contributionMicro,
    onFinish,
    onCancel,
  );
}

/**
 * Dispatch payout: withdraw the unlocked pool, then route it to the turn member.
 * Three wallet signatures: withdraw → set split → deposit.
 */
export function dispatchPayout(
  amountMicro: bigint,
  turnMemberAddress: string,
  onStep: (step: number, msg: string) => void,
  onFinish: (txId: string) => void,
  onCancel: () => void,
): void {
  // Step 1: withdraw the unlocked pool back to the caller
  onStep(1, "Withdrawing unlocked pool…");
  withdraw(amountMicro, () => {
    // Step 2: set split routing to the turn member
    onStep(2, `Setting route to recipient…`);
    setRoutingRules(0n, 0, turnMemberAddress, amountMicro, () => {
      // Step 3: deposit → contract routes funds to the turn member
      onStep(3, "Sending to recipient…");
      deposit(amountMicro, onFinish, onCancel);
    }, onCancel);
  }, onCancel);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the far-future lock block for a goal-based circle. */
export function computeLockBlock(currentBlock: number): number {
  return currentBlock + LOCK_HORIZON_BLOCKS;
}

/** Coerce a parsed Clarity uint to a JS number. */
function toUint(v: unknown): number {
  let n: unknown = v;
  while (n && typeof n === "object" && "value" in (n as Record<string, unknown>)) {
    n = (n as Record<string, unknown>).value;
  }
  if (typeof n === "bigint") return Number(n);
  if (typeof n === "number") return n;
  if (typeof n === "string" && /^\d+$/.test(n)) return Number(n);
  return 0;
}
