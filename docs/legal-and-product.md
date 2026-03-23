# Legal and Product Boundary

This document explains the safest product shape for a KPI-based prediction market built on blockchain rails. It is not legal advice. Real-money deployment needs counsel in every launch jurisdiction.

## Why this repo avoids real-money betting

As of March 17, 2026, U.S. regulators still treat event contracts and tokenized market infrastructure as high-risk areas.

- The CFTC proposed rules on May 10, 2024 targeting event contracts involving gaming, unlawful activity, and certain public-interest categories under Commodity Exchange Act section 5c(c)(5)(C).
- On February 4, 2026, the CFTC withdrew that proposal, but the underlying statutory limits and case-by-case review posture did not disappear.
- The SEC's April 3, 2019 framework for digital-asset investment-contract analysis remains a useful reminder that tradable tokens can become securities if marketed around profit expectation and managerial effort.
- FinCEN's May 9, 2019 convertible virtual currency guidance also means a platform handling redeemable crypto flows can trigger money-transmission analysis.

Because of that, the prototype in this repo uses a much narrower design:

- closed-loop demo credits only
- no redemptions or withdrawals
- no transferable market shares
- no governance token with economic rights
- allowlisted users only
- oracle settlement based on official issuer disclosures

## Market design rules

Only list markets that satisfy all of the following:

- The KPI must be objectively measurable from an official issuer disclosure, earnings release, investor presentation, or SEC filing.
- The KPI must be a product or operating metric tied to user activity, unit volume, shipments, trips, orders, or similar operating throughput.
- The KPI must not be a direct financial line item such as revenue, gross profit, operating income, net income, EBITDA, or EPS.
- The consensus number must come from a documented snapshot captured before market lock.
- Resolution policy must define which source wins if multiple documents publish similar numbers.
- The market must ask only a binary question: `Did the issuer-reported KPI meet or exceed consensus?`
- The KPI must not depend on unofficial channel checks, rumors, social posts, or leaked data.

Examples that fit:

- `Did Tesla Q2 2026 vehicle deliveries meet or exceed consensus?`
- `Did Uber Q2 2026 trips meet or exceed consensus?`
- `Did DoorDash Q2 2026 marketplace orders meet or exceed consensus?`

Examples that do not fit:

- `Did NVIDIA Q4 2026 data center revenue beat consensus?` because that is a direct financial metric.
- `Did quarterly EPS beat consensus?` because earnings-style financial metrics are outside the product scope.
- `Will a merger close this quarter?` because that drifts into broader event-contract risk and legal ambiguity.

## Oracle pattern

The prototype uses a trusted reporter model:

- A market is created with a market id, KPI name, consensus value, and resolution policy.
- An authorized reporter publishes the actual KPI value plus a source hash and source URI.
- Anyone can settle the market once the oracle record exists.

For production, the safer next step is a signed-attestation oracle pipeline:

- fetch the issuer release from the canonical investor-relations or SEC source
- extract the KPI value and archive the raw document hash
- sign a settlement payload from a controlled oracle key
- expose the payload and extraction method publicly for auditability

## If you ever want real-money markets

Do not just "turn on USDC deposits" in this codebase. A real-money launch would likely require:

- venue and contract-structure analysis under CFTC rules
- state-by-state gaming review
- KYC, sanctions, and AML controls
- custody and payments review
- token-design review to avoid creating a security
- consumer disclosures, surveillance, and abuse monitoring

The practical product advice is simple: use this repo as a market-mechanics and oracle prototype, not as a production wagering system.

## Official sources

- CFTC event contracts proposal, May 10, 2024: <https://www.cftc.gov/PressRoom/PressReleases/8911-24>
- CFTC withdrawal of the proposal, February 4, 2026: <https://www.cftc.gov/PressRoom/PressReleases/9075-26>
- SEC framework for digital asset investment contracts, April 3, 2019: <https://www.sec.gov/corpfin/framework-investment-contract-analysis-digital-assets>
- FinCEN guidance on convertible virtual currency, May 9, 2019: <https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models>
