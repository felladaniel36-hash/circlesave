// ===========================================================================
// FlowVault Backend Layer
// ===========================================================================
// The bridge between the CircleSave frontend and the Stacks blockchain.
//
// MODEL (split-only): Deposits route to the turn member at deposit time via
// the FlowVault split primitive. The ring tracks total contributed; when the
// target is reached the turn advances and routing re-points to the next member.
//
// READS  → fetchCallReadOnlyFunction (no wallet signature needed)
// WRITES → openContractCall (wallet signs the transaction)
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
import { FLOWVAULT, USDCX, NETWORK } from "./config";

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

// ---------------------------------------------------------------------------
// WRITES — wallet-signed transactions via openContractCall
// ---------------------------------------------------------------------------

/** Configure routing rules (split-only in CircleSave's model). */
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

// ---------------------------------------------------------------------------
// High-level CircleSave operations
// ---------------------------------------------------------------------------

/**
 * Authorize automation: split-only routing to the turn member.
 * No lock — deposits route directly to the recipient at deposit time.
 */
export function authorizeCircleAutomation(
  contributionMicro: bigint,
  turnMemberAddress: string,
  onFinish: (txId: string) => void,
  onCancel: () => void,
): void {
  setRoutingRules(
    0n, // lockAmount = 0 (split-only)
    0, // lockUntilBlock = 0 (irrelevant when no lock)
    turnMemberAddress, // split to the turn member
    contributionMicro, // split the full contribution amount
    onFinish,
    onCancel,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
