# Deployment Guide

CircleSave is a standard **Next.js 16** app. It deploys cleanly to any modern host — recommended: **Vercel**.

> The app targets **Stacks Testnet** with no secrets. Contract addresses are hardcoded as testnet defaults, so a deploy works with **zero environment variables**.

---

## 1. Push to GitHub

```bash
cd circlesave
git init -b main            # if not already initialized
git add -A
git commit -m "init: CircleSave"
git remote add origin git@github.com:<you>/circlesave.git
git push -u origin main
```

---

## 2. Deploy on Vercel (recommended)

1. Go to <https://vercel.com/new> and **Import** your GitHub repository.
2. Vercel auto-detects **Next.js** — no build settings to change:
   - **Framework preset:** Next.js
   - **Build command:** `next build` (auto)
   - **Output directory:** `.next` (auto)
3. No environment variables required.
4. Click **Deploy**. You'll get a `https://circlesave.vercel.app` URL.

---

## 3. Alternative: Netlify

1. Go to <https://app.netlify.com/start> and connect the repo.
2. Set **Build command:** `npm run build`, **Publish directory:** `.next`.
3. Install the Next.js runtime plugin: **Plugins → Add plugin → `@netlify/plugin-nextjs`** (Netlify usually auto-suggests it).
4. **Deploy site**.

---

## 4. Post-deploy verification

1. Open the deployed URL — the **CircleSave** hero ("Save Together. Trust the Code.") should load with no console errors.
2. Click **Connect Wallet**, select a Stacks **Testnet** account (Leather recommended).
3. Create a circle (name, target pool, per-member contribution).
4. The dashboard renders: progress ring, member grid, ledger, and the **Chain Link** panel showing a live block height.

> **Wallet network:** make sure your wallet is on **Testnet**. Transactions from a mainnet account will be rejected because the contract only exists on testnet.

---

## 5. Local production build (sanity check)

```bash
npm install
npm run build      # compiles + prerenders
npm run start      # serves the production build at http://localhost:3000
```

## Node version

This repo pins Node 20 via [`.nvmrc`](./.nvmrc). Vercel/Netlify pick this up automatically.
