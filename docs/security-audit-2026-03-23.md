# Security Audit and Threat Model

Date: March 23, 2026
Application: Consensus Market
Auditor: Codex Security Engineer workflow

## Scope

- Frontend wallet connection and admin flows in [App.jsx](/Users/heatherm/Documents/Codex/PRED/src/App.jsx)
- WalletConnect integration in [walletConnect.js](/Users/heatherm/Documents/Codex/PRED/src/walletConnect.js)
- Cloudflare edge and proxy behavior in [worker.js](/Users/heatherm/Documents/Codex/PRED/cloudflare/worker.js)
- Smart contracts in [KpiPredictionMarket.sol](/Users/heatherm/Documents/Codex/PRED/contracts/KpiPredictionMarket.sol), [KpiOracle.sol](/Users/heatherm/Documents/Codex/PRED/contracts/KpiOracle.sol), [EligibilityRegistry.sol](/Users/heatherm/Documents/Codex/PRED/contracts/EligibilityRegistry.sol)
- Production helper scripts in [validate-production.mjs](/Users/heatherm/Documents/Codex/PRED/scripts/validate-production.mjs) and [set-worker-runtime-vars.mjs](/Users/heatherm/Documents/Codex/PRED/scripts/set-worker-runtime-vars.mjs)
- Dependency posture from `npm audit`

## System Overview

- Architecture: React SPA + Cloudflare Worker + EVM contracts
- Sensitive data: wallet addresses, local account-profile data, market-attestation inputs, operator actions, upstream RPC access
- Primary trust boundaries:
  - Browser user -> React client
  - React client -> Cloudflare Worker
  - Cloudflare Worker -> upstream RPC providers and news feeds
  - Operator wallet -> oracle and registry contracts
  - Trader wallet -> market contract

## STRIDE Threat Model

| Threat | Component | Risk | Current mitigation |
| --- | --- | --- | --- |
| Spoofing | Admin UI access | Medium | Client admin gating plus on-chain `onlyOwner` checks for writes |
| Tampering | RPC proxy requests | High | Read-only RPC method allowlist, body-size limits, sanitized upstream forwarding |
| Repudiation | Oracle resolution publication | Medium | EIP-712 digests, signer capture, emitted events |
| Information Disclosure | News feed links, runtime config, wallet-local storage | Medium | URL sanitization, CSP, browser-local scope warning |
| Denial of Service | Worker RPC endpoint | Medium | Method allowlist, body-size limits, and same-origin browser-only enforcement; no edge rate limiting yet |
| Elevation of Privilege | Market settlement / signature handling | High | Settlement timing guard, post-settlement trade lock, low-s signature enforcement |

## Findings

### Fixed

1. High: The Worker RPC proxy was acting as an overly generic public relay.
   - Impact: third parties could use the site as a read/write-capable proxy into upstream RPC infrastructure, increasing abuse and spend risk.
   - Fix:
     - restricted `/rpc` to `POST`
     - enforced JSON parsing and body-size limits
     - limited requests to an explicit read-only RPC method allowlist
     - stopped forwarding arbitrary request headers upstream
     - rejected anonymous cross-site callers and only accept same-origin browser requests
   - Files: [worker.js](/Users/heatherm/Documents/Codex/PRED/cloudflare/worker.js)

2. High: Settled markets could still accept positions, and markets could be settled before lock.
   - Impact: if an oracle resolution existed early, a market could be settled prematurely and still accept new positions until lock, creating a severe market-integrity flaw.
   - Fix:
     - blocked `takePosition` after settlement
     - blocked `settleMarket` while the market is still open
   - Files: [KpiPredictionMarket.sol](/Users/heatherm/Documents/Codex/PRED/contracts/KpiPredictionMarket.sol), [KpiPredictionMarket.js](/Users/heatherm/Documents/Codex/PRED/test/KpiPredictionMarket.js)

3. Medium: Oracle signature verification accepted malleable high-s signatures.
   - Impact: alternative valid encodings of the same signature weaken auditability and can complicate downstream signature handling assumptions.
   - Fix:
     - added a low-s check in `_recoverSigner`
     - added a regression test for high-s rejection
   - Files: [KpiOracle.sol](/Users/heatherm/Documents/Codex/PRED/contracts/KpiOracle.sol), [KpiPredictionMarket.js](/Users/heatherm/Documents/Codex/PRED/test/KpiPredictionMarket.js)

4. Medium: External news-feed links were not explicitly protocol-sanitized before being rendered as links.
   - Impact: untrusted feed data should never be trusted to stay within `http/https`.
   - Fix:
     - only `http` and `https` news links survive Worker parsing
   - Files: [worker.js](/Users/heatherm/Documents/Codex/PRED/cloudflare/worker.js)

5. Medium: Worker secret-setting and production-validation scripts relied on shell interpolation.
   - Impact: env-controlled strings and externally supplied URLs were going through shell paths unnecessarily.
   - Fix:
     - replaced runtime-secret writes with `spawnSync` stdin piping
     - replaced curl-based validation fetches with Node `fetch`
   - Files: [set-worker-runtime-vars.mjs](/Users/heatherm/Documents/Codex/PRED/scripts/set-worker-runtime-vars.mjs), [validate-production.mjs](/Users/heatherm/Documents/Codex/PRED/scripts/validate-production.mjs)

6. Low: The UI described a browser-local blacklist as if it were a real enforcement boundary.
   - Impact: operators could overestimate protection and users could misunderstand what is actually enforced on-chain.
   - Fix:
     - clarified all blacklist copy as browser-local only
     - added address validation before operator-address actions
   - Files: [App.jsx](/Users/heatherm/Documents/Codex/PRED/src/App.jsx), [AdminPortal.jsx](/Users/heatherm/Documents/Codex/PRED/src/AdminPortal.jsx), [AccountPage.jsx](/Users/heatherm/Documents/Codex/PRED/src/AccountPage.jsx)

### Residual Risks

1. Medium: The RPC proxy is now read-only and same-origin gated, but it still lacks edge-native rate limiting.
   - Recommendation: add Cloudflare rate limiting or Access/WAF rules on `/rpc*` once a token with firewall/ruleset write scope is available.

2. Medium: Oracle resolutions can still be published before market lock if an authorized signer/reporter acts early.
   - Current state: the market can no longer settle early, which removes the worst exploit path.
   - Remaining issue: the oracle resolution itself is public on-chain once published.
   - Recommendation: move publish-time enforcement into the oracle design or adopt a commit/reveal flow for pre-lock resolution handling.

3. Low: Account profile data remains browser-local and unencrypted.
   - Recommendation: treat it as convenience state only, or move to a real authenticated backend with explicit privacy handling.

4. Low: Live contracts still need redeploy or upgrade before the on-chain market and oracle fixes protect production users.
   - Current state: the Worker/UI/script hardening is deployable immediately, but the Solidity fixes only take effect after contract rollout.
   - Recommendation: deploy upgraded market and oracle contracts, then repoint runtime addresses.

## Verification

- `npm test`: passed
- `npm run contracts:build`: passed
- `npm run frontend:build`: passed
- `npm audit`: passed with 0 vulnerabilities
- `npm audit --omit=dev`: passed with 0 vulnerabilities
- `node scripts/validate-production.mjs`: passed

## Recommended Next Security Sprint

1. Add Cloudflare rate limits / WAF rules for `/rpc*`, `/news.json`, and admin-adjacent endpoints.
2. Design contract-native denylist or policy enforcement instead of browser-local restriction state.
3. Add oracle publication timing enforcement so signed resolutions cannot become public pre-lock.
4. Roll out the upgraded market and oracle contracts so the on-chain fixes are live.
