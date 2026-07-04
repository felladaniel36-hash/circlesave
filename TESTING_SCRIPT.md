# Wallet Testing Script

End-to-end testnet walkthrough for CircleSave. Follow it in order and capture the noted transaction hashes — these are your submission artifacts.

---

## 0. Prerequisites

| Need | How | Notes |
| --- | --- | --- |
| Stacks Testnet wallet | Install **Leather** (`leather.io/install`); switch the network to **Testnet** | The app uses `@stacks/connect` v8, which speaks Leather's protocol. |
| Testnet **STX** (gas) | [Hiro faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet) | A little STX pays for every transaction. |
| Testnet **USDCx** | See "Obtaining USDCx" below | The asset that gets routed. |

### Obtaining USDCx

Testnet USDCx (`ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`) is a bridged token with no public self-serve faucet. Real balances exist on testnet, so it *is* obtainable, typically via the bounty's distribution channel or by requesting from a holder. The steps below (wallet connect, circle creation, authorize automation) all succeed without a token balance — only the actual `deposit` step requires USDCx.

---

## 1. Connect wallet

1. Open the deployed app (or `npm run dev` → http://localhost:3000).
2. Top-right → **Connect Wallet** → pick your Testnet STX account (Leather).
3. Confirm your address appears with a green dot + "Testnet" badge.

---

## 2. Create the circle

On the hero, click **Start Your Circle**. Fill in:

- **Circle Name:** `Family Circle`
- **Target Pool (USDCx):** `1200`
- **Per-Member (USDCx):** `10`
- **Automatic Payout:** toggle ON (auto-advance turn when target reached)
- Click **Create Circle**. (No transaction — stored locally + shared via config.)

✅ Dashboard appears: progress ring at 0%, turn indicator shows the first member.

---

## 3. Authorize automation (set the route)

1. In **Financial Actions**, click **Authorize Automation Rules**.
2. Leather pops up → approve the `set-routing-rules` transaction.
3. The "FlowVault Automation" panel shows an **ACTIVE** badge.

📸 **Capture this tx hash** — proof that routing is configured on-chain.

---

## 4. Deposit (route to the turn member)

1. In **Manual Deposit Boost**, enter an amount (e.g. `10`).
2. Click **Deposit Boost**.
3. Leather pops up → approve the `deposit` transaction.
4. The contract routes the USDCx to the turn member **instantly**. The progress ring fills a bit.

📸 **Capture this tx hash** — your "successful testnet transaction" artifact.

> Repeat deposits from one or more members to fill the ring toward the target.

---

## 5. Target reached → turn advances

When the aggregated contributions hit the target:

- **Auto-payout ON:** the turn advances automatically after ~1s. The ring resets to 0. The next member becomes the turn recipient. A re-authorize prompt appears (routing must be re-pointed to the new recipient).
- **Auto-payout OFF:** a notification appears: *"🎯 Target reached! Dispatch the payout to [NAME]."*. Click **Dispatch Payout** → turn advances → ring resets.

---

## Artifacts checklist (for the submission form)

- [ ] **Live URL** (Vercel/Netlify deploy)
- [ ] **GitHub repo** link
- [ ] **Authorize tx hash** (Step 3) — routing configured on-chain
- [ ] **Deposit tx hash** (Step 4) — successful routed transaction
- [ ] **Video walkthrough** — connect → create → authorize → deposit → (target reached)
- [ ] **Written summary** — see [`SUBMISSION_WRITEUP.md`](./SUBMISSION_WRITEUP.md)

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Wallet doesn't respond | Use **Leather** (not Xverse — Xverse dropped the Stacks provider protocol). Allow popups for the site. |
| `u1004 Routing exceeds deposit` | Should not happen (split-only). If it does, the routing rule was set with a non-zero lock amount. |
| Deposit fails at the transfer step | No USDCx balance — see "Obtaining USDCx". |
| Ring doesn't fill | You may be viewing a different wallet's circle. Reconnect with the contributor account. |
