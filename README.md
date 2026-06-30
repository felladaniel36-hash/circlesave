# Family Rent Vault 🔐🏠

[![Stacks](https://img.shields.io/badge/Stacks-Testnet-5546FF?logo=stacks&logoColor=white)](https://www.stacks.co/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![flowvault-sdk](https://img.shields.io/npm/v/flowvault-sdk?label=flowvault-sdk&color=8b5cf6)](https://www.npmjs.com/package/flowvault-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A collaborative, **goal-based savings** application built on the **FlowVault**
programmable routing layer for the **Stacks** blockchain (Testnet).

A family (e.g. siblings) pools **USDCx** toward a shared milestone — paying the
parents' rent. Every contribution is **time-locked** until a deadline block
height (FlowVault **Lock** primitive); once that deadline passes, the pooled
funds are **routed to the landlord** on-chain (FlowVault **Split** primitive).

> Built for the **[flow-vault.dev/bounty](http://flow-vault.dev/bounty)** —
> Track: *Goal-Based Savings & Treasury Automation*.
>
> A static visual preview lives at [`preview.html`](./preview.html) (sample data).

---

## ✨ Features

- **🔒 Enforced time-lock** — each deposit is locked to a family deadline block;
  early withdrawals are rejected on-chain (`ERR-FUNDS-LOCKED / u1003`).
- **✂️ Automated landlord routing** — after the deadline, funds are routed to the
  landlord via FlowVault's on-chain `split` rule.
- **📊 Family Progress Tracker** — aggregates every contributor's `get-vault-state`
  into a pooled-vs-goal gauge with a live deadline countdown.
- **🧾 On-chain activity feed** — parses the contract's `print` events into typed
  deposit/withdraw history; family rows highlighted.
- **🔌 Wallet-native** — `@stacks/connect` (Leather / Hiro); all writes are
  wallet-signed via the SDK's `contractCallExecutor`.

## 🧱 Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Wallet | `@stacks/connect` (Leather / Hiro) |
| SDK | [`flowvault-sdk`](https://www.npmjs.com/package/flowvault-sdk) `0.1.2` |
| Chain reads | FlowVault SDK + Hiro indexer (events) |

## 🏗️ How FlowVault primitives are used

```
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 1 — LOCKED SAVINGS                                         │
│   set-routing-rules { lockAmount = deposit, lockUntil = deadline }│
│   deposit(amount)          →  funds locked until deadline block   │
│   (early withdraw  ─✗──  ERR-FUNDS-LOCKED u1003)                  │
└──────────────────────────────────────────────────────────────────┘
                              │ deadline block reached
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ PHASE 2 — SETTLEMENT                                             │
│   withdraw(unlocked)       →  balance returns to contributor      │
│   set-routing-rules { splitAddress = landlord, splitAmount = X }  │
│   deposit(X)               →  FlowVault routes X to landlord      │
└──────────────────────────────────────────────────────────────────┘
```

**Design note:** FlowVault's contract stores routing rules per-user and applies
its `split` at deposit time — it cannot defer a split to a future withdrawal.
This app is therefore built to honour the contract's real semantics while
exercising **both** primitives (see `README` design-notes / `DEPLOY.md`).

## 🌐 On-chain targets (Stacks Testnet)

| What | Contract ID |
| --- | --- |
| FlowVault V2 | `STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD.flowvault-v2` |
| USDCx token | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx` |

The SDK defaults to these addresses, so the app runs with **zero configuration**.

## 🚀 Quick start

```bash
npm install
cp .env.example .env.local   # optional — defaults already target testnet
npm run dev
```

Open http://localhost:3000 and connect a Stacks **Testnet** wallet.

### Prerequisites for live transactions

- Testnet **STX** for gas → [Stacks faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet)
- Testnet **USDCx** to deposit → mint from the token contract above
- A Stacks Testnet wallet — **Leather** or **Hiro**

## 🔌 Environment

All variables are **optional** (public testnet values; no secrets):

```
NEXT_PUBLIC_FLOWVAULT_NETWORK=testnet
NEXT_PUBLIC_FLOWVAULT_CONTRACT_ADDRESS=STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD
NEXT_PUBLIC_FLOWVAULT_CONTRACT_NAME=flowvault-v2
NEXT_PUBLIC_FLOWVAULT_TOKEN_CONTRACT_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
NEXT_PUBLIC_FLOWVAULT_TOKEN_CONTRACT_NAME=usdcx
```

## 📂 Structure

```
src/
├── app/            # Next.js shell (layout, page, globals.css, icon.svg)
├── components/     # ProgressGauge, ContributorList, ActivityFeed,
│                   # ContributeCard, SettleRentCard, PhaseBanner, …
├── hooks/          # useWallet, useFamilyVault (reads), useVaultActivity (events)
└── lib/            # constants, wallet, format, store (localStorage),
                    # flowvault (SDK factory), events (indexer parsing)
```

## 📦 Deploy

See **[DEPLOY.md](./DEPLOY.md)** for the full Vercel / Netlify walkthrough.
TL;DR: push to GitHub → import to Vercel → add the env vars above → deploy.

## ✅ Submission checklist

- [ ] Live deployed URL (Vercel/Netlify)
- [ ] Public GitHub repository (this repo)
- [ ] Video walkthrough (connect wallet → deposit → early-withdraw proof → settle)
- [ ] Successful testnet transaction hash
- [ ] Written summary of Lock & Split usage (see this README's "How FlowVault primitives are used")

## 📝 License

[MIT](./LICENSE) — built for the FlowVault bounty.
