# Security Review -- 2026-03-28

Comprehensive security audit of the Consensus Market codebase prior to public
GitHub exposure. Covers secrets archaeology, frontend security, smart contract
review, Cloudflare Worker hardening, dependency supply chain, and
infrastructure configuration.

---

## CRITICAL Findings

*None identified.*

---

## HIGH Findings

### H-01 -- Admin secret accepted via query string (information disclosure)

- **FILE:** `cloudflare/worker.js`, line 120
- **FINDING:** The `/waitlist-export` endpoint accepts the ADMIN_SECRET via
  `url.searchParams.get("secret")` as a fallback. Query parameters are logged
  by proxies, CDN edge logs, browser history, and Referer headers. An admin
  who uses `?secret=VALUE` to export the waitlist leaks the credential into
  multiple observable channels.
- **RECOMMENDATION:** Remove the query-string fallback entirely. Accept the
  secret only via the `x-admin-secret` request header. Update any scripts or
  documentation that use the query-string form.

### H-02 -- Admin secret comparison is not constant-time

- **FILE:** `cloudflare/worker.js`, line 121
- **FINDING:** `provided !== secret` uses JavaScript's standard string
  comparison, which short-circuits on the first mismatched character. This
  creates a timing side-channel that could allow an attacker to brute-force the
  ADMIN_SECRET one character at a time over many requests.
- **RECOMMENDATION:** Use a constant-time comparison. In a Cloudflare Worker,
  use `crypto.subtle.timingSafeEqual` (available since 2024) or compare
  HMAC-SHA256 digests of both strings.

### H-03 -- Hardcoded admin allowlist in client-side code

- **FILE:** `src/App.jsx`, lines 39-42
- **FINDING:** Two wallet addresses are hardcoded in the frontend as the
  `adminAllowlist`. These addresses are publicly visible to anyone who
  inspects the JavaScript bundle. While admin operations still require
  on-chain owner checks, the client-side gate reveals which addresses have
  administrative intent, making them targets for social engineering or phishing.
  More importantly, if the admin portal exposes any privileged client-side
  operations that do NOT have a corresponding on-chain access control check,
  this is a bypass vector.
- **RECOMMENDATION:** Move the admin allowlist server-side (e.g., a Worker KV
  lookup or an on-chain role check). If it must stay client-side, understand
  that it is decorative only and never rely on it as a security boundary.

---

## MEDIUM Findings

### M-01 -- KV namespace IDs committed to version control

- **FILE:** `wrangler.worker.jsonc`, lines 23-24
- **FINDING:** The KV namespace ID (`d49574c91a364e53a98e2b4e79b3f3e3`) and
  preview ID are committed to the repo. While Cloudflare KV namespaces are not
  directly exploitable with just the ID (they require an API token), exposing
  infrastructure identifiers in a public repo reduces the attacker's
  reconnaissance effort and could be combined with a leaked token.
- **RECOMMENDATION:** Move KV namespace IDs to Wrangler environment variables
  or a `.dev.vars` file that is gitignored. Reference them via
  `wrangler.jsonc` env substitution.

### M-02 -- Waitlist endpoint has no rate limiting

- **FILE:** `cloudflare/handlers/waitlist.js`
- **FINDING:** The `/waitlist` POST endpoint accepts submissions without any
  rate limiting. An attacker can flood the KV store with fake entries,
  inflating the waitlist count and consuming KV write quota. The per-email
  dedup (`seen` key) only prevents count inflation per email, not write volume.
- **RECOMMENDATION:** Add Cloudflare rate limiting via a Worker binding or
  use the `request.cf` IP to implement a simple per-IP throttle with KV TTL
  keys. Consider captcha or proof-of-work for public form submissions.

### M-03 -- RPC proxy upstream detail leakage

- **FILE:** `cloudflare/handlers/rpc-proxy.js`, line 163
- **FINDING:** When the upstream RPC returns a non-JSON response, the proxy
  includes up to 200 characters of the raw upstream response body in the
  `detail` field of the error response. This can leak internal infrastructure
  details (upstream provider error pages, IP addresses, internal hostnames).
- **RECOMMENDATION:** Remove the `detail` field from the error response, or
  replace it with a generic message. Log the raw detail server-side for
  debugging.

### M-04 -- CSP allows broad `connect-src https:`

- **FILE:** `cloudflare/lib/helpers.js`, line 37 and `public/_headers`
- **FINDING:** The Content Security Policy includes `connect-src 'self'
  https:` which allows the frontend to make fetch/XHR requests to any HTTPS
  origin. This significantly weakens CSP protection against data exfiltration
  via injected scripts. If an XSS vulnerability were found, the attacker could
  send stolen data to any HTTPS endpoint.
- **RECOMMENDATION:** Restrict `connect-src` to the specific origins the app
  needs: `'self'`, the WalletConnect relay (`wss://relay.walletconnect.org`),
  Google Analytics domains, and any specific RPC endpoints. Remove the blanket
  `https:` directive.

### M-05 -- Waitlist stores user-agent strings (privacy concern)

- **FILE:** `cloudflare/handlers/waitlist.js`, line 28
- **FINDING:** The waitlist entry stores the first 200 characters of the
  User-Agent header. Combined with the email, wallet address, and country,
  this creates a fingerprinting dataset that may trigger GDPR/privacy
  obligations. The waitlist export endpoint exposes all of this in bulk.
- **RECOMMENDATION:** Remove user-agent collection unless it serves a specific
  product need. If retained, disclose it in the privacy policy and ensure the
  export endpoint is properly secured (see H-01/H-02).

### M-06 -- Oracle and Registry use single-step ownership transfer

- **FILE:** `contracts/KpiOracle.sol` and `contracts/EligibilityRegistry.sol`
- **FINDING:** Both `KpiOracle` and `EligibilityRegistry` inherit from
  `Owned.sol` which has a single-step `transferOwnership`. A typo in the new
  owner address would permanently lock the owner out with no recovery path.
  `KpiPredictionMarket` correctly overrides this with a two-step pattern
  (F-009), but the other two contracts do not.
- **RECOMMENDATION:** Apply the same two-step ownership transfer pattern from
  `KpiPredictionMarket` to `KpiOracle` and `EligibilityRegistry`, or use
  OpenZeppelin's `Ownable2Step`.

---

## LOW Findings

### L-01 -- Hardhat default account address in runtime-manifest.json

- **FILE:** `config/runtime-manifest.json`, line 7
- **FINDING:** The operator address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
  is the well-known Hardhat account #0. This is a local development artifact.
  If this file is mistakenly deployed to production, it would point to an
  account whose private key is publicly known.
- **RECOMMENDATION:** Ensure the CI/CD pipeline never deploys
  `config/runtime-manifest.json` as-is. The production Worker should read
  addresses from Wrangler secrets, not from this file. Consider adding a
  validation step that rejects known Hardhat addresses in production deploys.

### L-02 -- Demo addresses committed to repo

- **FILE:** `demo-live-addresses.json`
- **FINDING:** This file contains Hardhat default account addresses (accounts
  #1, #2, #3) which are well-known test accounts. Acceptable for a demo file,
  but ensure no production workflow reads from this file.
- **RECOMMENDATION:** Add a comment or rename to make it clear these are
  local-only test addresses.

### L-03 -- `bbg-cron.sh` uses `--no-verify` for git commits

- **FILE:** `scripts/bbg-cron.sh`, line 111
- **FINDING:** The cron script commits Bloomberg data updates with
  `--no-verify`, bypassing any pre-commit hooks (linting, secret scanning).
  If a Bloomberg export accidentally includes sensitive data, pre-commit
  secret scanning would not catch it.
- **RECOMMENDATION:** Remove `--no-verify` or add a separate secret-scanning
  step before the commit.

### L-04 -- `style-src 'unsafe-inline'` in CSP

- **FILE:** `cloudflare/lib/helpers.js`, line 37 and `public/_headers`
- **FINDING:** The CSP includes `style-src 'self' 'unsafe-inline'`. While
  common in React applications (inline styles are used extensively),
  `unsafe-inline` for styles can enable CSS injection attacks in older
  browsers and reduces the overall CSP protection level.
- **RECOMMENDATION:** If feasible, migrate to CSS modules or external
  stylesheets and remove `unsafe-inline`. If not feasible, document as an
  accepted risk.

### L-05 -- EligibilityRegistry autoApprove could be accidentally enabled

- **FILE:** `contracts/EligibilityRegistry.sol`, line 9
- **FINDING:** The `autoApprove` flag, if set to `true`, allows any address to
  gain eligibility by calling `requestAccess()` without operator review. This
  is by design for demo/development, but if accidentally left enabled in
  production, it would bypass the allowlisting gate entirely.
- **RECOMMENDATION:** Add a deployment check or monitoring alert that flags
  when `autoApprove` is `true` in production.

### L-06 -- Front-running risk in open market window

- **FINDING:** Prediction market `takePosition` transactions are visible in
  the mempool before confirmation. An attacker could observe large positions
  and front-run them. This is an inherent blockchain risk. The market design
  partially mitigates this via the lock window (positions cannot be taken
  after `locksAt`), but within the open window, front-running is possible.
- **RECOMMENDATION:** For demo-credit mode, this is acceptable. For live USDT
  mode, consider commit-reveal schemes or private mempools (Flashbots Protect).

---

## INFORMATIONAL Findings

### I-01 -- No XSS vectors found in frontend

- **FILE:** `src/` (all JSX files)
- **FINDING:** No usage of `dangerouslySetInnerHTML`, `innerHTML`,
  `document.write`, or `eval()` was found in any frontend source file. React's
  default escaping is used throughout.

### I-02 -- No secrets found in git history

- **FINDING:** Searched git history for `PRIVATE_KEY`, `mnemonic`, and
  Hardhat default private key prefix (`0xac0974bec`). No matches found. All
  private keys are loaded from environment variables at runtime.

### I-03 -- .env is properly gitignored

- **FINDING:** `.env` is in `.gitignore`. The `.env.example` contains only
  placeholder/zero addresses and no real values.

### I-04 -- Smart contracts use Solidity 0.8.24 (overflow-safe)

- **FINDING:** All contracts use `pragma solidity ^0.8.24`, which has built-in
  overflow/underflow protection. No unchecked arithmetic blocks were found.

### I-05 -- ReentrancyGuard is correctly applied

- **FINDING:** `KpiPredictionMarket` inherits `ReentrancyGuard` from
  OpenZeppelin and applies `nonReentrant` to all functions that transfer tokens
  (`deposit`, `withdraw`, `claim`, `withdrawFees`, `sweepExcessTokens`). The
  `takePosition` function also has `nonReentrant`.

### I-06 -- EIP-712 signature verification is well-implemented

- **FINDING:** `KpiOracle._recoverSigner` correctly validates signature length
  (65 bytes), normalizes `v` values, checks `s` against the secp256k1
  half-order (preventing signature malleability), and rejects `address(0)`
  recovery. The domain separator is computed per-chain, preventing cross-chain
  replay. Attestation reuse is prevented via the `usedAttestations` mapping.

### I-07 -- RPC proxy correctly restricts to read-only methods

- **FINDING:** The `ALLOWED_RPC_METHODS` set contains only read methods
  (`eth_call`, `eth_getLogs`, `eth_getBalance`, etc.). Write methods like
  `eth_sendRawTransaction` are not in the allowlist. The proxy validates JSON
  structure, enforces same-origin, and limits body size to 32KB.

### I-08 -- CORS is properly scoped on RPC proxy

- **FINDING:** The RPC proxy CORS allows only `consensusmarket.com`,
  `capital.markets`, and same-origin. It does not reflect arbitrary origins.

### I-09 -- Package lock file present with dependency overrides

- **FINDING:** `package-lock.json` exists, pinning dependency versions. The
  `overrides` section patches `diff` and `serialize-javascript` to known-safe
  versions.

### I-10 -- Deployment scripts use stdin piping for secrets

- **FILE:** `scripts/set-worker-runtime-vars.mjs`
- **FINDING:** The Worker secret-setting script correctly uses `spawnSync`
  with `input` (stdin piping) rather than shell interpolation, preventing
  secrets from appearing in `ps` output or shell history.

### I-11 -- No open redirect vulnerabilities found

- **FINDING:** Frontend routing uses hash-based navigation
  (`window.location.hash`). The only redirect in the Worker is a hardcoded
  `capital.markets` to `consensusmarket.com` redirect with a fixed domain.
  No user-controlled redirect targets were found.

---

## Summary

| Severity      | Count |
|---------------|-------|
| CRITICAL      | 0     |
| HIGH          | 3     |
| MEDIUM        | 6     |
| LOW           | 6     |
| INFORMATIONAL | 11    |

The codebase demonstrates strong security fundamentals: no hardcoded secrets,
proper Solidity patterns (reentrancy guard, overflow protection, signature
malleability checks), a well-scoped RPC proxy, and comprehensive security
headers. The three HIGH findings are straightforward to remediate and relate
to the admin secret handling and a client-side admin gate that should not be
treated as a security boundary.

### Priority remediation order

1. **H-01 + H-02** -- Fix admin secret handling (same code area, one PR)
2. **H-03** -- Move admin allowlist server-side or document as decorative
3. **M-04** -- Tighten `connect-src` in CSP
4. **M-01** -- Remove KV namespace IDs from version control
5. **M-06** -- Add two-step ownership to Oracle and Registry contracts
6. **M-02** -- Add rate limiting to waitlist endpoint
7. **M-03** -- Remove upstream detail from RPC proxy error responses
