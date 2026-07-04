# CircleSave 💸🔄

[![Stacks](https://img.shields.io/badge/Stacks-Testnet-5546FF?logo=stacks&logoColor=white)](https://www.stacks.co/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Save Together. Trust the Code.**

A trustless digital cooperative savings platform powered by FlowVault on Stacks. Pool savings with friends, fill the target, and the pool auto-resets to the next member — turn by turn, until you end it.

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and connect a Stacks Testnet wallet (Leather recommended).

## 📐 How It Works

1. **Create a Circle** — set a target pool + per-member contribution
2. **Authorize Automation** — point your deposits to the current turn member
3. **Deposit** — money routes instantly to the turn member via FlowVault's split primitive
4. **Target reached** — ring fills → turn advances → ring resets → next member
5. **Repeat** — until the creator ends the circle

## 🏗️ Architecture

```
src/
├── lib/
│   ├── config.ts      → contract addresses, types, constants
│   ├── flowvault.ts   → all contract reads + writes (the backend)
│   ├── format.ts      → formatting + localStorage helpers
│   └── wallet.ts      → address extraction
├── hooks/
│   ├── useWallet.ts   → connect/disconnect with 20s timeout
│   └── useChainState.ts → live block-height polling
├── components/        → presentational UI (Header, CircleOverview, etc.)
└── app/               → Next.js shell
```

## 🔗 Contract

- **FlowVault V2:** `STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD.flowvault-v2`
- **USDCx:** `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`

## 📦 Deploy

Push to GitHub → import to Vercel → deploy. No env vars required.

## 📝 License

MIT
