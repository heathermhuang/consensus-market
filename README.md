# Consensus Market

`Consensus Market` is a compliance-first prototype for KPI prediction markets around major listed companies. Instead of shipping a real-money betting venue, this repo implements a safer on-chain core where allowlisted users spend non-redeemable demo credits to predict whether an officially announced KPI will hit or miss market consensus.

The current prototype is designed around markets such as:

- Tesla vehicle deliveries vs. sell-side consensus
- Uber trips vs. consensus
- DoorDash marketplace orders vs. consensus

The product is intentionally limited to product and operating metrics disclosed by the issuer. It excludes direct financial line items such as revenue, profit, EBITDA, or EPS.

## What is in the repo

- `contracts/EligibilityRegistry.sol`: allowlist for approved users
- `contracts/KpiOracle.sol`: oracle publisher for official KPI outcomes and signed EIP-712 attestations
- `contracts/KpiPredictionMarket.sol`: binary hit/miss market engine using demo credits
- `test/KpiPredictionMarket.ts`: Hardhat tests covering settlement, eligibility, and cancellation
- `scripts/bootstrap.ts`: deploys a local demo stack and seeds sample markets
- `src/`: React/Vite frontend for trading and oracle attestation relay
- `docs/legal-and-product.md`: product and regulatory boundary for a lawful rollout path

## Product boundary

This code does **not** implement:

- cash deposits
- stablecoin wagering
- user withdrawals
- transferable market shares
- a profit-sharing token
- permissionless access

Those omissions are deliberate. In the United States, a real-money event-contract venue can trigger commodities, derivatives, money transmission, gambling, sanctions, KYC, and securities issues. The prototype therefore models the safer version: informational markets with closed-loop points and explicit compliance gates.

## Quick start

```bash
npm_config_cache=.npm-cache npm install
npm_config_cache=.npm-cache npx hardhat test
```

## Frontend

The frontend is a Vite/React market board with:

- wallet connection
- scenario-mode market browsing even with no contracts deployed
- live read-only market loading through multi-RPC runtime config
- deep-linkable market pages and payout analytics
- operator console for eligibility, credits, oracle roles, and market creation
- status filters, saved board preferences, and auto-refresh controls
- direct reporter resolution plus demo-account onboarding shortcuts
- indexed on-chain activity feed from `public/activity.json`
- EIP-712 oracle-attestation signing and relay

Run it with:

```bash
npm run frontend:dev
```

To switch on live contract interactions, copy `.env.example` to `.env` and fill in the deployed addresses.

## Cloudflare deployment

The production frontend is currently served by a Cloudflare Worker on `consensusmarket.com`.

1. Build command: `npm run build`
2. Build output directory: `dist`
3. Production domain: `consensusmarket.com`
4. Add Cloudflare Pages environment variables for:
   - `VITE_CHAIN_ID`
   - `VITE_MARKET_ADDRESS`
   - `VITE_ORACLE_ADDRESS`
   - `VITE_REGISTRY_ADDRESS`
   - `VITE_RPC_URL`

The repo includes [wrangler.toml](/Users/heatherm/Documents/Codex/PRED/wrangler.toml) and [public/_headers](/Users/heatherm/Documents/Codex/PRED/public/_headers) for the current Cloudflare deployment path.

There is also a Worker deployment path in [wrangler.worker.jsonc](/Users/heatherm/Documents/Codex/PRED/wrangler.worker.jsonc) for zones where route-based Cloudflare Workers are easier to activate than Pages custom domains.

## Production workflow

Run the full preflight:

```bash
npm run validate:prod
```

Run the live browser smoke test:

```bash
npm run qa:smoke:live
```

Deploy and verify production:

```bash
npm run deploy:prod
```

Operational details live in [production-runbook.md](/Users/heatherm/Documents/Codex/PRED/docs/production-runbook.md).

## Live contract wiring

The live site now reads contract config from the Worker at `/runtime-config.json`, so you can update chain wiring without rebuilding the frontend.

The Worker also exposes lightweight diagnostics:

- `/status.json`
- `/catalog.json`
- `/healthz`

You can also manage runtime config through a manifest:

```bash
RUNTIME_RPC_URLS=https://rpc-one.example,https://rpc-two.example \
npm run runtime:manifest

npm run cf:runtime:publish
```

To set real production values on the deployed Worker:

```bash
CF_CHAIN_ID=1 \
CF_MARKET_ADDRESS=0x... \
CF_ORACLE_ADDRESS=0x... \
CF_REGISTRY_ADDRESS=0x... \
CF_RPC_URL=https://rpc.example \
npm run cf:vars:set

npm run deploy:worker
```

## Local demo deployment

To seed a local network with the same markets shown in the UI:

```bash
npm run dev:node
npm run demo:deploy
```

The bootstrap script prints `VITE_MARKET_ADDRESS`, `VITE_ORACLE_ADDRESS`, and `VITE_CHAIN_ID` values you can paste into `.env`.

To publish an activity report into the frontend:

```bash
RPC_URL=http://127.0.0.1:8545 \
MARKET_ADDRESS=0x... \
ORACLE_ADDRESS=0x... \
REGISTRY_ADDRESS=0x... \
npm run events:index
```

## Operator CLI

For admin actions outside the browser, use:

```bash
RPC_URL=http://127.0.0.1:8545 \
OPERATOR_ACCOUNT=0x... \
MARKET_ADDRESS=0x... \
ORACLE_ADDRESS=0x... \
REGISTRY_ADDRESS=0x... \
npm run contracts:admin -- status
```

Useful commands:

- `npm run contracts:admin -- allowlist --account 0x... --eligible true`
- `npm run contracts:admin -- credits --account 0x... --amount 5000`
- `npm run contracts:admin -- reporter --account 0x... --authorized true`
- `npm run contracts:admin -- signer --account 0x... --authorized true`
- `npm run contracts:admin -- list-markets --account 0x...`
- `npm run contracts:admin -- create-market --seed tesla-deliveries`
- `npm run contracts:admin -- cancel-market --seed tesla-deliveries`
- `npm run contracts:admin -- take-position --seed tesla-deliveries --side hit --amount 100`
- `npm run contracts:admin -- settle-market --seed tesla-deliveries`
- `npm run contracts:admin -- claim --seed tesla-deliveries`
- `npm run contracts:admin -- resolve --seed tesla-deliveries --actual-value 425000 --source-label tesla-release --source-uri https://ir.tesla.com`

## How the market works

1. The operator allowlists eligible wallets in `EligibilityRegistry`.
2. The operator grants demo credits to those wallets.
3. The operator creates a market with:
   - issuer ticker
   - KPI name
   - consensus benchmark
   - opening time, lock time, and expected announcement time
   - a human-readable resolution policy
4. Users take a `Beat` or `Miss` position before the lock time.
5. An authorized oracle reporter publishes the official KPI result.
6. The preferred path is for an authorized signer to create an EIP-712 attestation and let any relayer submit it on-chain.
7. Anyone can settle the market.
8. Winners receive their stake plus a pro-rata share of the losing pool, paid in demo credits.

## Signed oracle flow

1. The operator authorizes a signer in `KpiOracle`.
2. The signer prepares a typed payload containing:
   - `marketId`
   - `actualValue`
   - `sourceHash`
   - `sourceUri`
   - `observedAt`
   - `validAfter`
   - `validBefore`
   - `nonce`
3. The signer approves that payload with an EIP-712 signature.
4. Any relayer submits `publishSignedResolution(payload, signature)`.
5. The oracle verifies the signature, marks the attestation digest as used, and stores the resolution.

## Current production blockers

- real-money flows are still intentionally out of scope
- live RPC health still determines whether the site can operate beyond scenario mode
- legal review is still required before any monetization or public-risk expansion
