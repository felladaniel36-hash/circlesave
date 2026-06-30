# Submission Writeup — Family Rent Vault

> Written summary required by the [flow-vault.dev/bounty](http://flow-vault.dev/bounty)
> submission form: *"how the build incorporates the FlowVault `Lock` & `Split`
> primitives."* Paste the sections below, or paraphrase for the form.

---

## Project summary

**Family Rent Vault** is a collaborative, goal-based savings application that lets
a family (e.g. several siblings) pool **USDCx** toward a shared milestone — paying
the parents' rent. The product is built entirely on top of the FlowVault
programmable routing layer: **no custom vault contract was written**. All routing,
locking, and distribution logic is executed by the deployed FlowVault V2 contract
on the Stacks Testnet (`STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD.flowvault-v2`),
invoked through the official `flowvault-sdk`. The frontend is a thin,
wallet-signed control surface over that on-chain state machine — deliberately
avoiding the "generic frontend wrapper" anti-pattern, because every dollar of
enforcement happens inside the contract.

## How the `Lock` primitive is incorporated

FlowVault's **Lock** primitive lets a depositor time-gate a balance until a
specific Stacks block height. We use it as the spine of the product:

- When a family member contributes, the app calls `set-routing-rules` with
  `lock-amount` equal to the full deposit and `lock-until-block` set to the
  family's shared rent deadline. It then calls `deposit`, which transfers the
  USDCx into the vault and applies the stored rule — so the **entire
  contribution is provably locked until the deadline**.
- Because the lock is enforced inside the contract (not in our UI), an early
  `withdraw` is rejected on-chain with `ERR-FUNDS-LOCKED (u1003)`. The app
  exposes an **"Attempt early withdrawal"** control that deliberately triggers
  this rejection, producing a transaction hash that proves the time-lock is
  real and not cosmetic.
- The Family Progress Tracker aggregates each contributor's `get-vault-state`
  (`locked-balance`) into a single pooled-vs-goal gauge, with a live countdown
  to the unlock block. The lock is therefore both individual (each member's
  funds are separately locked under their own principal) and collective (the
  dashboard sums them against the shared goal).

## How the `Split` primitive is incorporated

FlowVault's **Split** primitive routes a fixed amount of a deposit to a
designated recipient principal at deposit time. We use it for the actual rent
payment:

- When the deadline block passes, locks expire and balances become withdrawable.
  The **"Settle Rent"** action then routes the funds to the landlord on-chain:
  it calls `withdraw` to bring the unlocked balance back to the contributor,
  then calls `set-routing-rules` with `split-address` set to the landlord and
  `split-amount` equal to the rent, and finally calls `deposit`. On that final
  deposit, FlowVault's routing engine transfers the USDCx straight to the
  landlord's principal — the disbursement is executed by the contract, not by a
  manual transfer in our code.
- This means the landlord payment is **automated, auditable, and non-custodial**:
  no intermediary holds the funds, and every split is recorded as a `print`
  event on-chain. The app's activity feed parses those events so the family can
  see each deposit and each landlord-bound split in real time.

## Faithfulness to the FlowVault design

The contract stores routing rules **per user** and applies its split **at deposit
time** — it cannot defer a split to a future withdrawal. Rather than fight the
contract (or ship a misleading "lock-now, auto-split-on-withdraw" narrative), we
designed the two-phase flow above so that **both primitives are exercised exactly
as the contract intends**: Lock to enforce savings discipline, Split to execute
the final payment. The result is a product whose core treasury logic is 100%
on-chain and verifiable, with the frontend responsible only for configuration,
wallet signing, and readable aggregation.

## What makes this more than a frontend wrapper

- **No backend custodian.** Funds live in the FlowVault contract; the app never
  touches them.
- **On-chain enforcement.** The lock (u1003) and the landlord split are both
  contract-internal; they hold even if our frontend is taken offline.
- **Real SDK integration.** All reads (`get-vault-state`,
  `get-current-block-height`) and all writes (`set-routing-rules`, `deposit`,
  `withdraw`) go through `flowvault-sdk` in wallet-executor mode via
  `@stacks/connect`, with deterministic micro-unit conversion and full error-code
  mapping (e.g. u1003 → "Funds are currently locked").
- **Indexer-backed transparency.** The activity feed reads the contract's
  emitted `print` events directly from the Hiro indexer, giving an independent,
  tamper-evident history of every deposit and split.
