# Deployment Guide

This is a standard **Next.js 16** app. It builds to a static + serverless output
and runs on any modern host. Recommended: **Vercel**.

> The app targets **Stacks Testnet** with no secrets — all `NEXT_PUBLIC_*` values
> are public testnet addresses and the SDK falls back to them automatically, so a
> deploy works even before you set any environment variables.

---

## 1. Push to GitHub

```bash
cd family-rent-vault
git remote add origin git@github.com:<you>/family-rent-vault.git
git push -u origin main
```

(If the repo isn't initialized yet: `git init -b main && git add -A && git commit -m "init" && git remote add origin … && git push -u origin main`.)

---

## 2. Deploy on Vercel (recommended)

1. Go to <https://vercel.com/new> and **Import** your GitHub repository.
2. Vercel auto-detects **Next.js** — no build settings to change:
   - **Framework preset:** Next.js
   - **Build command:** `next build` (auto)
   - **Output directory:** `.next` (auto)
3. Under **Settings → Environment Variables**, add (all optional but recommended):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_FLOWVAULT_NETWORK` | `testnet` |
   | `NEXT_PUBLIC_FLOWVAULT_CONTRACT_ADDRESS` | `STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD` |
   | `NEXT_PUBLIC_FLOWVAULT_CONTRACT_NAME` | `flowvault-v2` |
   | `NEXT_PUBLIC_FLOWVAULT_TOKEN_CONTRACT_ADDRESS` | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM` |
   | `NEXT_PUBLIC_FLOWVAULT_TOKEN_CONTRACT_NAME` | `usdcx` |

4. Click **Deploy**. You'll get a `https://<project>.vercel.app` URL.

---

## 3. Alternative: Netlify

1. Go to <https://app.netlify.com/start> and connect the repo.
2. Set **Build command:** `npm run build`, **Publish directory:** `.next`.
3. Install the Next.js runtime plugin: **Plugins → Add plugin →
   `@netlify/plugin-nextjs`** (Netlify usually auto-suggests it).
4. Add the same environment variables under **Site settings → Environment**.
5. **Deploy site**.

---

## 4. Post-deploy verification

1. Open the deployed URL — the **"Create the Family Rent Vault"** setup screen
   should load with no console errors.
2. Click **Connect Wallet**, select a Stacks **Testnet** account (Leather / Hiro).
3. Create a vault (goal, deadline, landlord), then check the dashboard renders
   the gauge, countdown, and activity feed.
4. The activity feed should show real testnet events from the FlowVault contract.

> **Wallet network:** make sure your wallet is on **Testnet**. Transactions from a
> mainnet account will be rejected because the contract only exists on testnet.

---

## 5. Local production build (sanity check)

```bash
npm install
npm run build      # compiles + prerenders
npm run start      # serves the production build at http://localhost:3000
```

## Node version

This repo pins Node 20 via [`.nvmrc`](./.nvmrc). Vercel/Netlify pick this up
automatically.
