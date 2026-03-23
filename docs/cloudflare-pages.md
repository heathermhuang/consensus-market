# Cloudflare Pages Setup

This repo can still deploy to Cloudflare Pages, but the active production path is now the Worker-backed deployment on `consensusmarket.com`.

## Project settings

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

## Environment variables

Set these in the Cloudflare Pages project before the first production build:

- `VITE_CHAIN_ID`
- `VITE_MARKET_ADDRESS`
- `VITE_ORACLE_ADDRESS`
- `VITE_REGISTRY_ADDRESS`
- `VITE_RPC_URL`

Example values for a local demo are stored in [.env.example](/Users/heatherm/Documents/Codex/PRED/.env.example). Production values should point to your real deployed contracts.

For the live `consensusmarket.com` Worker deployment, the preferred path is runtime config instead of a rebuild. Use:

```bash
CF_CHAIN_ID=1 \
CF_MARKET_ADDRESS=0x... \
CF_ORACLE_ADDRESS=0x... \
CF_REGISTRY_ADDRESS=0x... \
CF_RPC_URL=https://rpc.example \
npm run cf:vars:set

npm run deploy:worker
```

After deployment, verify:

- `/runtime-config.json`
- `/status.json`
- `/catalog.json`
- `/healthz`

If you prefer a single source of truth for runtime values:

```bash
RUNTIME_RPC_URLS=https://rpc-one.example,https://rpc-two.example \
npm run runtime:manifest

npm run cf:runtime:publish
```

## Custom domain

In Cloudflare Pages:

1. Open the project.
2. Go to `Custom domains`.
3. Add `capital.markets`.
4. Add `www.capital.markets` only if you want it, then redirect it to the apex domain.
4. If you keep `capital.markets`, use it only as a legacy redirect host.

If you prefer the API path, this repo now includes [attach-custom-domain.mjs](/Users/heatherm/Documents/Codex/PRED/scripts/attach-custom-domain.mjs). It requires a Cloudflare token with `zone:write` and `pages:write`, then:

```bash
CF_API_TOKEN=... \
CF_ACCOUNT_ID=63a7fe52c985c63bb9e69ce47efdc569 \
CF_ZONE_ID=2cab46632caf8de81f503c792075bd92 \
CF_PAGES_PROJECT=capital-markets \
CF_DOMAIN=capital.markets \
npm run cf:domain:attach
```

## Notes

- `public/_headers` adds a baseline security header policy.
- `wrangler.toml` makes the project compatible with `wrangler pages deploy` if you want CLI deployment later.
- The production runbook lives in [production-runbook.md](/Users/heatherm/Documents/Codex/PRED/docs/production-runbook.md).
