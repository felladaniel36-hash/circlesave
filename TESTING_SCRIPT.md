# Wallet Testing Script

End-to-end testnet walkthrough for the Family Rent Vault. Follow it in order and
capture the noted transaction hashes — these are your submission artifacts.

---

## 0. Prerequisites

| Need | How | Notes |
| --- | --- | --- |
| Stacks Testnet wallet | Install **Leather** or **Hiro** browser extension; switch the network to **Testnet** | The app only works with an STX account (not a BTC-only account). |
| Testnet **STX** (gas) | [Hiro faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet) | You need a little STX to sign every transaction. ~1–2 STX is plenty. |
| Testnet **USDCx** (the asset) | **See "Obtaining USDCx" below** | This is the one prerequisite that is *not* self-serve. Resolve it first. |

### ⚠️ Obtaining USDCx (read this first)

Testnet USDCx (`ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`) is a
**bridged** token (the `usdcx-v1` xReserve protocol). Its `mint` is gated by a
cross-chain deposit-intent signature — there is **no public self-serve faucet**.
Real balances exist on testnet, so it *is* obtainable, but you must source it
through one of:

1. **The bounty's distribution channel.** Check the flow-vault.dev bounty
   portal / Discord — the organizers most likely distribute testnet USDCx to
   participant addresses on request.
2. **Request from a holder.** The top testnet holders can `transfer` USDCx to
   you (a normal SIP-010 transfer costs only gas).
3. **Bridge** real testnet USDC via the xReserve deposit flow (advanced; usually
   not required for a hackathon).

> **Fallback if you can't obtain USDCx in time:** Steps 1–3 below (wallet
> connect, vault creation, and the `set-routing-rules` lock configuration) all
> succeed without a token balance, and every **read** (`get-vault-state`,
> `get-current-block-height`, the activity feed) works fully. Only the `deposit`
> step needs USDCx. Run the lock-config + read flows and clearly document the
> token-acquisition constraint in your submission.

---

## 1. Connect wallet

1. Open the deployed app (or `npm run dev` locally → http://localhost:3000).
2. Top-right → **Connect Wallet** → pick your Testnet STX account.
3. Confirm your address appears (e.g. `ST…`). Network pill should read **Testnet**.

---

## 2. Create the vault

On the setup screen, fill in:

- **Vault name:** `Parents' Rent`
- **Rent goal (USDCx):** `1000`
- **Landlord address:** a *second* testnet address you control (so you can see
  the split land). Use a different account than your contributor wallet.
- **Deadline:** choose **Duration** and set a **short value for testing**, e.g.
  `12` (≈ 1–2 hours at ~5–10 min/block). A short deadline lets you reach the
  Settle phase in the same session. *(For a realistic demo, `144` ≈ 1 day.)*
- Click **Create vault**. (No transaction — stored locally + shared via the
  deadline/landlord.)

✅ Dashboard appears: gauge at 0%, countdown shows "locked", current block visible.

---

## 3. Make a contribution (Lock primitive)

1. In **Contribute to Rent**, enter an amount (e.g. `10` USDCx).
2. Click **Lock contribution**.
3. **Wallet approval #1 — `set-routing-rules`** (the lock rule). Approve.
   - *Captures: lock configuration on-chain.*
4. **Wallet approval #2 — `deposit`** (transfer USDCx in, locked). Approve.
   - **📸 Capture this tx hash** → your **"successful testnet transaction"** artifact.
5. The gauge updates; your address appears in the tracker as **locked**.

> Optional: add a second contributor address to the registry (right column →
> "Add") and have that wallet also deposit, so the "family" aggregation is
> visible.

---

## 4. Prove the lock (early-withdrawal rejection)

This is the on-chain proof that funds can't be pulled early.

1. Click **🛡️ Attempt early withdrawal (lock-enforcement proof)**.
2. Approve the `withdraw` in your wallet.
3. The transaction is broadcast but **fails on-chain** with
   `ERR-FUNDS-LOCKED (u1003)`. The app surfaces: **"✅ Lock enforced: …"**.
   - **📸 Capture this tx hash** → your **lock-enforcement proof**. (In Hiro
     Explorer it shows as aborted with reason `u1003`.)

---

## 5. Settle the rent (Split primitive) — after the deadline

Wait until the in-app countdown flips to **"unlocked / settlement open"** and the
**Phase 2 · Settlement open** banner appears (with a short deadline, ~1–2 hours).

1. The **Settle Rent** card becomes active. Click **Settle rent → landlord**.
2. **Wallet approval #1 — `withdraw`** (unlock, funds return to you). Approve.
3. **Wallet approval #2 — `set-routing-rules`** (split → landlord). Approve.
4. **Wallet approval #3 — `deposit`** (FlowVault routes USDCx to landlord). Approve.
   - **📸 Capture this tx hash** → your **landlord-routed split** artifact.
5. Check the landlord address in Hiro Explorer — its USDCx balance increased.

> If you don't want to wait: steps 1–4 above fully demonstrate the Lock primitive
> and are sufficient for a strong submission. The Settle phase is the bonus that
> shows the Split primitive paying the landlord.

---

## Artifacts checklist (for the submission form)

- [ ] **Live URL** (Vercel/Netlify deploy)
- [ ] **GitHub repo** link
- [ ] **Deposit tx hash** (Step 3) — "successful testnet transaction"
- [ ] **Early-withdraw tx hash** (Step 4) — lock proof (fails with u1003)
- [ ] **Settle/split tx hash** (Step 5) — landlord routing
- [ ] **Video walkthrough** — connect → create → deposit → early-withdraw proof
      → (settle, if deadline passed)
- [ ] **Written summary** — see [`SUBMISSION_WRITEUP.md`](./SUBMISSION_WRITEUP.md)

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `InvalidAddressError` / `tb1…` | You connected a BTC account. Reconnect and select the **STX** account. |
| Wallet shows "contract not found" | Your wallet is on Mainnet. Switch to **Testnet**. |
| Deposit fails at the transfer step | No USDCx balance — see "Obtaining USDCx". |
| `u1008 Invalid lock block` | Deadline must be a future block. Use Duration mode or a larger absolute height. |
| `u1004 Routing exceeds deposit` | Lock amount can't exceed the deposit (shouldn't happen — app sets lock = deposit). |
| Settle button stays disabled | Deadline block hasn't been mined yet. Wait for the countdown to reach zero. |
| Activity feed empty | No recent contract events; it populates as soon as anyone transacts. |
