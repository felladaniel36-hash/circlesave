# Submission Writeup — CircleSave

> Written summary describing how the build incorporates the FlowVault split primitive to power a trustless digital cooperative (esusu/susu) savings platform on Stacks.

---

## Project summary

**CircleSave** ("Save Together. Trust the Code.") is a trustless digital cooperative savings platform where a group of friends pools savings, takes turns receiving payouts, and every rule is enforced by FlowVault smart contracts on the Stacks blockchain.

The core mechanism is the **rotating savings circle** (known as esusu, ajo, or susu): members contribute continuously, the pooled funds flow to one member per round, the turn rotates, and the cycle repeats — indefinitely, until the creator closes the circle.

No funds are held by CircleSave itself. All routing is executed on-chain by the deployed FlowVault V2 contract (`STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD.flowvault-v2`), invoked through `@stacks/connect`. CircleSave is the wallet-signed control surface over that on-chain state machine.

## How the FlowVault `Split` primitive is used

FlowVault's **Split** primitive routes a fixed amount of a deposit to a designated recipient principal **at deposit time**. CircleSave uses this as the engine of the cooperative:

- When the turn points to a member (e.g. Kwame), the contributor calls **"Authorize Automation Rules"**, which invokes FlowVault's `set-routing-rules` with `splitAddress = Kwame` and `splitAmount = contribution`.
- Subsequent **deposits** call FlowVault's `deposit`. The contract applies the stored split rule instantly: the contributed USDCx leaves the depositor's wallet and arrives in Kwame's wallet immediately.
- The progress ring tracks total contributed toward the round target. When the target is reached, the turn advances, the routing re-points to the next member, and the ring resets.
- The cycle continues until the creator ends the circle.

This is an honest use of the Split primitive: payouts are real on-chain transfers, executed deterministically by the contract, not by the frontend.

## Why this is more than a frontend wrapper

- **No backend custodian.** Funds never touch a CircleSave-controlled wallet; they route peer-to-peer through the FlowVault contract at deposit time.
- **On-chain enforcement.** The split rule is contract-internal — it holds even if the CircleSave frontend is taken offline.
- **Real SDK integration.** All writes (`set-routing-rules`, `deposit`) go through `@stacks/connect`'s `openContractCall`; all reads (`get-current-block-height`) go through `@stacks/transactions`' `fetchCallReadOnlyFunction`. The ChainStatus panel surfaces this link live (block height + contract address).
- **Per-member routing.** Each contributor controls their own routing rule, so a circle is really a set of independent wallets all pointed at the same turn member — fully non-custodial and trustless.
