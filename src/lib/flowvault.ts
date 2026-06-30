import { FlowVault } from "flowvault-sdk";
import { request } from "@stacks/connect";
import {
  NETWORK,
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  TOKEN_CONTRACT_ADDRESS,
  TOKEN_CONTRACT_NAME,
} from "./constants";

/**
 * Create a FlowVault SDK instance wired for the browser:
 * - Reads use the SDK's fetchCallReadOnlyFunction directly (no wallet needed).
 * - Writes are delegated to the connected wallet via `contractCallExecutor`.
 */
export function createFlowVault(senderAddress?: string): FlowVault {
  return new FlowVault({
    network: NETWORK,
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    tokenContractAddress: TOKEN_CONTRACT_ADDRESS,
    tokenContractName: TOKEN_CONTRACT_NAME,
    senderAddress,
    contractCallExecutor: async (call) => {
      const mode = String(call.postConditionMode ?? "allow")
        .toLowerCase()
        .includes("deny")
        ? "deny"
        : "allow";

      return request("stx_callContract", {
        contract: `${call.contractAddress}.${call.contractName}`,
        functionName: call.functionName,
        functionArgs: call.functionArgs,
        network: call.network,
        postConditionMode: mode,
        postConditions: call.postConditions,
      });
    },
  });
}

/** Best-effort txid extraction from the varied wallet response shapes. */
export function extractTxId(result: unknown): string | null {
  if (typeof result === "string" && result.length > 0) return result;
  if (!result || typeof result !== "object") return null;
  const v = result as Record<string, unknown>;
  if (typeof v.txid === "string") return v.txid;
  if (typeof v.txId === "string") return v.txId;
  if (typeof v.id === "string") return v.id;
  return null;
}
