# Production Runbook

This project currently deploys as a Cloudflare Worker-backed static frontend on `consensusmarket.com` with `capital.markets` retained as a legacy hostname.

## Architecture

- Frontend: Vite + React in `src/`
- Contracts: Hardhat + Solidity in `contracts/`
- Edge runtime: Cloudflare Worker in [worker.js](/Users/heatherm/Documents/Codex/PRED/cloudflare/worker.js)
- Static assets: built into `dist/` and served through the Worker asset binding
- Runtime wiring: live chain and contract addresses exposed through `/runtime-config.json`

## Release Commands

Preflight the release locally:

```bash
npm run validate:prod
```

Run the rendered-browser smoke test:

```bash
npm run qa:smoke:live
```

Deploy and verify production:

```bash
npm run deploy:prod
```

The production deploy command will:

1. Build the frontend
2. Run the contract tests
3. Audit production dependencies
4. Clean Worker deploy artifacts in `dist/`
5. Deploy the Worker
6. Verify live root, runtime, status, catalog, and news endpoints on `https://consensusmarket.com`
7. Verify that the legacy `capital.markets` hostname redirects on a diagnostic endpoint
8. Run a browser smoke test against the live board and market-open flow

## Runtime Configuration

Set runtime values on the Worker with:

```bash
CF_CHAIN_ID=1 \
CF_MARKET_ADDRESS=0x... \
CF_ORACLE_ADDRESS=0x... \
CF_REGISTRY_ADDRESS=0x... \
CF_OPERATOR_ADDRESS=0x... \
CF_RPC_URLS=https://rpc-one.example,https://rpc-two.example \
npm run cf:vars:set
```

Or publish from `config/runtime-manifest.json`:

```bash
npm run cf:runtime:publish
```

## Verification Checklist

- `https://consensusmarket.com` returns `200`
- `https://consensusmarket.com/runtime-config.json` returns valid config
- `https://consensusmarket.com/status.json` returns `ok: true`
- `https://consensusmarket.com/catalog.json` returns 20 markets
- `https://consensusmarket.com/news.json?market=lyft-rides` returns a secure JSON response
- `https://capital.markets/status.json` redirects to `https://consensusmarket.com/status.json`

## Rollback

Use Wrangler rollback if the latest version is unhealthy:

```bash
npx wrangler rollback --config wrangler.worker.jsonc
```

Then rerun:

```bash
VALIDATE_BASE_URL=https://consensusmarket.com node scripts/validate-production.mjs
```

## Known Operational Truths

- The app is still a demo-credit market system, not a real-money production venue.
- Live chain sync depends on healthy RPC endpoints. If upstream RPCs are unavailable, the site should truthfully fall back to scenario mode.
- `capital.markets` should remain a legacy redirect hostname, not an independently served primary property.
