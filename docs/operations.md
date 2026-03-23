# Operations Guide

Step-by-step procedures for contract deployment and Cloudflare edge configuration.

---

## Contract Deployment (Mainnet / New Network)

### Prerequisites

- Node ≥ 20, `npm install` done
- Funded deployer EOA (covers gas for 3 contract deploys + initial setup txns)
- RPC endpoint for the target chain
- Private key exported as `PRIVATE_KEY` (never commit)

### 1. Configure Hardhat for the target network

Add the network to `hardhat.config.js` (or `.ts`):

```js
networks: {
  mainnet: {
    url: process.env.MAINNET_RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
  },
}
```

### 2. Compile contracts

```bash
npm run contracts:build
```

Artifacts land in `artifacts/`. Verify no warnings before continuing.

### 3. Deploy

There is no automated mainnet deploy script — use the Hardhat console or write a
one-off deploy script modelled on `scripts/bootstrap.js`. The deployment order is:

```
EligibilityRegistry(ownerAddress)
KpiOracle(ownerAddress)
KpiPredictionMarket(ownerAddress, registryAddress, oracleAddress)
```

Minimum post-deploy setup:

```bash
# Authorize oracle reporter + signer
oracle.setReporter(operatorAddress, true)
oracle.setSigner(signerAddress, true)

# Seed initial markets (optional — can also use contracts:admin CLI)
# npm run contracts:admin -- create-market --seed <slug>
```

Record the three deployed addresses before continuing.

### 4. Verify contracts on Etherscan / Blockscout (optional but recommended)

```bash
npx hardhat verify --network mainnet <address> <constructorArg>
```

Repeat for each of the three contracts.

### 5. Wire the operator CLI

```bash
export RPC_URL=https://...
export OPERATOR_ACCOUNT=0x...   # funded EOA
export MARKET_ADDRESS=0x...
export ORACLE_ADDRESS=0x...
export REGISTRY_ADDRESS=0x...

npm run contracts:admin -- status
```

All three contracts should report healthy.

---

## Cloudflare Worker — Runtime Config

After contract deployment, update the live Worker without rebuilding the frontend:

```bash
CF_CHAIN_ID=1 \
CF_MARKET_ADDRESS=0x... \
CF_ORACLE_ADDRESS=0x... \
CF_REGISTRY_ADDRESS=0x... \
CF_OPERATOR_ADDRESS=0x... \
CF_RPC_URLS=https://rpc-one.example,https://rpc-two.example \
npm run cf:vars:set
```

Then deploy the Worker (picks up the new vars):

```bash
npm run deploy:worker
```

Verify the live endpoints:

```bash
npm run validate:prod:live
```

### Publishing via manifest (alternative)

If you prefer a file-based source of truth in `config/runtime-manifest.json`:

```bash
RUNTIME_RPC_URLS=https://rpc-one.example,https://rpc-two.example \
npm run runtime:manifest

npm run cf:runtime:publish
```

---

## Cloudflare WAF — Rate Limiting on RPC Proxy

The Worker proxies RPC calls through `/rpc` (and `/rpc/*`). Without rate limiting,
a single client can exhaust upstream RPC quota.

### Step 1: Open WAF Rate Limiting rules

1. Log in to the Cloudflare dashboard.
2. Select the zone for `consensusmarket.com`.
3. Navigate to **Security → WAF → Rate limiting rules**.
4. Click **Create rule**.

### Step 2: Configure the RPC rule

| Field | Value |
|---|---|
| Rule name | `RPC proxy rate limit` |
| When incoming requests match… | URI Path `starts with` `/rpc` |
| Also match… | (leave empty — apply to all methods) |
| Requests | `60` |
| Period | `1 minute` |
| Action | `Block` (or `Managed Challenge` for softer handling) |
| Response code | `429` |
| Duration | `1 minute` |

This limits each IP to 60 RPC calls per minute. Adjust the threshold based on
observed traffic — the `/status.json` endpoint shows current RPC health.

### Step 3: (Optional) Tighter rule for write methods

If you want stricter limits on state-changing calls (they are more expensive upstream):

| Field | Value |
|---|---|
| Rule name | `RPC write method rate limit` |
| Matching | URI Path `starts with` `/rpc` **AND** HTTP method `POST` |
| Requests | `20` |
| Period | `1 minute` |
| Action | `Block` |

### Step 4: Verify

After saving, trigger a burst from curl or the browser devtools network tab:

```bash
for i in $(seq 1 65); do
  curl -s -o /dev/null -w "%{http_code}\n" https://consensusmarket.com/rpc \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
done
```

Requests 61–65 should return `429`.

### Notes

- Cloudflare WAF rate limiting is a paid feature (requires at least the Pro plan).
- The rule matches on the edge before the Worker runs, so blocked requests never
  touch the Worker or upstream RPC — this is the intended behavior.
- If the site ever adds a `/healthz` or `/status.json` polling path from many IPs
  (e.g., the monitor script), add an exclusion for those paths so the rate limiter
  doesn't block them:
  - Add a second condition: URI Path `does not start with` `/healthz` AND
    URI Path `does not start with` `/status.json`.

---

## Oracle Resolution — Commit-Reveal Flow

For markets where the resolution value must stay hidden until announcement:

### Step 1: Before market lock, commit the payload digest

```bash
# Compute the EIP-712 digest off-chain (use oracle-resolve.mjs or ethers directly)
# Then commit it on-chain via the operator CLI:
npm run contracts:admin -- commit-resolution \
  --seed <slug> \
  --digest 0x<eip712-digest>
```

The digest is stored in `resolutionCommits[marketId]` on the oracle contract. The
actual value remains hidden — only the hash is on-chain.

### Step 2: After announcement, publish the signed resolution

```bash
npm run oracle:resolve
```

Or using the operator CLI:

```bash
npm run contracts:admin -- resolve \
  --seed <slug> \
  --actual-value <value> \
  --source-label <label> \
  --source-uri https://...
```

`publishSignedResolution` verifies that the submitted payload's EIP-712 digest
matches the pre-committed hash. A mismatch reverts with `CommitMismatch()`.

### When to use commit-reveal

- Always recommended for markets with a single authorized signer.
- If no commit is recorded for a market, `publishSignedResolution` proceeds without
  the check (backwards compatible).

---

## Health Monitoring

Run the monitoring script in a cron or long-running process:

```bash
# One-shot (e.g., cron every 5 minutes)
MONITOR_ONCE=1 MONITOR_BASE_URL=https://consensusmarket.com node scripts/monitor-healthz.mjs

# Persistent daemon
MONITOR_BASE_URL=https://consensusmarket.com \
MONITOR_INTERVAL=60 \
MONITOR_FAILURE_LIMIT=3 \
node scripts/monitor-healthz.mjs
```

Exits with code `1` after `MONITOR_FAILURE_LIMIT` consecutive failures. Logs are
NDJSON on stdout (INFO) and stderr (WARN/ERROR) — pipe to your log aggregator.
