# Production Runbook — Ethereum Mainnet

## Pre-Deployment Checklist

- [ ] Deployer wallet funded with ETH (estimate: 0.05-0.1 ETH for 3 contract deploys + config txs)
- [ ] Hardware wallet or Gnosis Safe for deployer key (NOT a hot wallet)
- [ ] Mainnet RPC endpoint (Alchemy/Infura paid plan)
- [ ] Oracle signer key (separate from deployer, hardware wallet recommended)
- [ ] USDT contract verified: `0xdAC17F958D2ee523a2206206994597C13D831ec7`

## Deployment

```bash
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
DEPLOYER_PRIVATE_KEY=0x... \
ORACLE_SIGNER=0x... \
PROTOCOL_FEE_BPS=100 \
npx hardhat run scripts/deploy-mainnet.mjs --network mainnet
```

Record the output addresses — you need them for runtime config.

## Post-Deployment

### 1. Verify contracts on Etherscan
```bash
npx hardhat verify --network mainnet REGISTRY_ADDRESS DEPLOYER_ADDRESS
npx hardhat verify --network mainnet ORACLE_ADDRESS DEPLOYER_ADDRESS
npx hardhat verify --network mainnet MARKET_ADDRESS DEPLOYER_ADDRESS REGISTRY_ADDRESS ORACLE_ADDRESS 0xdAC17F958D2ee523a2206206994597C13D831ec7 100
```

### 2. Update Worker runtime config
```bash
CF_CHAIN_ID=1 \
CF_MARKET_ADDRESS=0x... \
CF_ORACLE_ADDRESS=0x... \
CF_REGISTRY_ADDRESS=0x... \
CF_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
npm run cf:vars:set
```

### 3. Create markets
```bash
RPC_URL=... OPERATOR_ACCOUNT=0x... MARKET_ADDRESS=0x... \
ORACLE_ADDRESS=0x... REGISTRY_ADDRESS=0x... \
npm run contracts:admin -- create-market --seed tesla-deliveries
```

## Market Operations

### Creating a new market
1. Add market definition to `data/markets.json`
2. Run `npm run contracts:admin -- create-market --seed SLUG`
3. Verify on Etherscan that the MarketCreated event fired

### Resolving a market (after KPI is announced)
1. Verify the actual KPI number from the official issuer source
2. Create the EIP-712 attestation:
   ```bash
   npm run contracts:admin -- resolve --seed SLUG --actual-value VALUE \
     --source-label "issuer-press-release" --source-uri "https://..."
   ```
3. The oracle signer signs the attestation
4. Any relayer can submit `publishSignedResolution` to the oracle
5. Anyone can call `settleMarket(marketId)` after resolution

### Cancelling a market
```bash
npm run contracts:admin -- cancel --seed SLUG
```
Users can claim full refunds after cancellation.

### Emergency: What if something goes wrong?
- **Oracle signer compromised**: Revoke signer immediately: `oracle.setSigner(address, false)`
- **Wrong resolution published**: Cannot be reversed. Cancel the market if not yet settled.
- **Contract bug discovered**: Cancel all open markets. Users claim refunds. Deploy fixed contract.
- **No global pause**: The contract has no pause mechanism. Cancel individual markets as needed.

## Monitoring

### Watch for events
```bash
npm run events:index
```

### Solvency check
The contract holds USDT for all open positions + accumulated fees. Verify:
- Total USDT in contract >= sum of all pool balances + accumulated fees
- Use `market.accumulatedFees()` and Etherscan token balance

### Key metrics
- Positions taken per market
- Total USDT deposited
- Active traders
- Protocol fees earned

## Fee Management

### Check accumulated fees
```bash
npm run contracts:admin -- status
```

### Withdraw fees
```bash
npm run contracts:admin -- withdraw-fees --recipient 0x...
```

## Jurisdiction Enforcement

- `/geo.json` endpoint returns user's country and `restricted: true/false`
- Restricted: US, CN, HK, SG, KR, GB, FR, DE, IT, AU, BE, TW
- Frontend shows demo mode for restricted users
- **This is frontend-level only** — technically bypassable with VPN
- For v2: consider on-chain KYC attestation

## Backup & Recovery

- **Contract state**: On-chain, immutable, always recoverable from blockchain
- **Runtime config**: In Cloudflare Worker env vars, backed up in `config/runtime-manifest.json`
- **Market definitions**: In `data/markets.json` (git tracked)
- **Deployer key**: Store offline. If lost, ownership cannot be recovered.
- **Oracle signer key**: Store offline. Can be rotated without redeployment.
