# Consensus Market — CLAUDE.md

Compliance-first KPI prediction market prototype. Allowlisted users spend non-redeemable demo credits to predict whether a publicly disclosed KPI will beat or miss sell-side consensus.

**Production site:** consensusmarket.com (Cloudflare Worker)

---

## Project structure

```
contracts/          Solidity — EligibilityRegistry, KpiOracle, KpiPredictionMarket, Owned
test/               Hardhat/Mocha contract tests
scripts/            Operator + deployment scripts (all .mjs / .js)
src/                React/Vite frontend (JSX)
cloudflare/         worker.js — serves runtime config + diagnostics endpoints
public/             Static assets, company/firm logos, _headers
config/             runtime-manifest.json — on-disk runtime config
data/               markets.json — seed market definitions
docs/               Legal, production runbook, Cloudflare Pages notes, security audit
qa-evidence/tests/  Playwright smoke + QA specs
```

---

## Commands

### Install
```bash
npm_config_cache=.npm-cache npm install
```

### Contracts
```bash
npm test                    # compile + run Hardhat tests
npm run contracts:build     # compile only
```

### Frontend
```bash
npm run frontend:dev        # Vite dev server
npm run frontend:build      # production build → dist/
npm run frontend:preview    # preview built dist/
```

### Local demo stack
```bash
npm run dev:node            # start local Hardhat node
npm run demo:deploy         # deploy contracts + seed markets
# prints VITE_MARKET_ADDRESS, VITE_ORACLE_ADDRESS, VITE_CHAIN_ID → paste into .env
```

### Cloudflare Worker
```bash
npm run deploy:worker       # build + wrangler deploy (wrangler.worker.jsonc)
npm run deploy:cf:prod      # Cloudflare Pages deploy (dist → capital-markets project)
```

### Production workflow
```bash
npm run validate:prod           # preflight checks (local)
npm run validate:prod:live      # preflight against consensusmarket.com
npm run deploy:prod             # validate + deploy:worker + validate:prod:live
npm run qa:smoke:live           # Playwright smoke test against live site
```

### Runtime config (Worker)
```bash
# Build and publish runtime manifest
RUNTIME_RPC_URLS=https://rpc1,https://rpc2 npm run runtime:manifest
npm run cf:runtime:publish

# Set prod vars on the deployed Worker
CF_CHAIN_ID=1 CF_MARKET_ADDRESS=0x... CF_ORACLE_ADDRESS=0x... \
CF_REGISTRY_ADDRESS=0x... CF_RPC_URL=https://rpc.example \
npm run cf:vars:set
```

### Operator CLI
```bash
RPC_URL=... OPERATOR_ACCOUNT=0x... MARKET_ADDRESS=0x... \
ORACLE_ADDRESS=0x... REGISTRY_ADDRESS=0x... \
npm run contracts:admin -- <command>

# Key commands:
#   status
#   allowlist --account 0x... --eligible true
#   credits --account 0x... --amount 5000
#   reporter --account 0x... --authorized true
#   signer --account 0x... --authorized true
#   list-markets --account 0x...
#   create-market --seed tesla-deliveries
#   settle-market --seed tesla-deliveries
#   claim --seed tesla-deliveries
#   resolve --seed tesla-deliveries --actual-value 425000 --source-label tesla-release --source-uri https://...
```

### Events index
```bash
RPC_URL=... MARKET_ADDRESS=0x... ORACLE_ADDRESS=0x... REGISTRY_ADDRESS=0x... \
npm run events:index        # writes public/activity.json
```

---

## Environment

Copy `.env.example` to `.env` and fill in:
```
VITE_CHAIN_ID=
VITE_MARKET_ADDRESS=
VITE_ORACLE_ADDRESS=
VITE_REGISTRY_ADDRESS=
VITE_RPC_URL=
```

Live site reads contract config from the Worker at `/runtime-config.json` — so env vars only matter for local dev.

---

## Architecture notes

- **No real money.** Demo credits only. No cash deposits, withdrawals, transferable shares, or stablecoin wagering. This is intentional — see `docs/legal-and-product.md`.
- **KPI scope:** Only product/operating metrics (deliveries, trips, orders). No revenue, EPS, EBITDA, or financial line items.
- **Access gating:** `EligibilityRegistry` allowlist + operator-granted credits before any market interaction.
- **Oracle flow:** Authorized signer creates EIP-712 attestation → any relayer submits `publishSignedResolution` → oracle verifies, stores resolution → anyone can settle.
- **Scenario mode:** Frontend works read-only without deployed contracts — useful for demos.
- **Runtime config:** Worker at `/runtime-config.json`, `/status.json`, `/catalog.json`, `/healthz`. Update chain wiring without rebuilding frontend.

---

## Build outputs (gitignored)

- `dist/` — Vite frontend build
- `artifacts/` — Hardhat compiled contracts
- `cache/` — Hardhat cache
- `typechain-types/` — generated TypeScript bindings
- `.wrangler/` — Wrangler state
- `qa-evidence/*.png` — Playwright screenshots
