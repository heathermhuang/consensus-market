# Coverage Consideration List

Candidate KPIs for future markets, cross-referenced against alt-data provider coverage to gauge data availability and market interest. Only operating/product KPIs that pass the rules in `docs/legal-and-product.md` are listed (no revenue, EPS, EBITDA, or financial line items).

**Sources:** Hatched Analytics (archived Nov 2025 + LinkedIn posts), Oxford DataPlan (250+ companies, 500+ KPIs; EU/B2B strength).

---

## Currently live (20 markets in `data/markets.json`)

| Ticker | Company | KPI | Hatched | Oxford DP |
|--------|---------|-----|---------|-----------|
| TSLA | Tesla | Vehicle deliveries | - | - |
| UBER | Uber | Trips | - | - |
| DASH | DoorDash | Marketplace orders | Y (Total Orders) | likely |
| ABNB | Airbnb | Nights and experiences booked | Y | likely |
| SPOT | Spotify | Monthly active users | Y (Premium Subs) | - |
| GRAB | Grab | Monthly transacting users | - | - |
| NFLX | Netflix | Paid memberships | - | - |
| META | Meta | Family daily active people | Y (Ad Revenue) | Y |
| SE | Sea | Gross orders | - | - |
| PINS | Pinterest | Monthly active users | - | - |
| MELI | MercadoLibre | Unique active buyers | Y (Items Sold, Payment Txns) | - |
| COIN | Coinbase | Monthly transacting users | - | - |
| RBLX | Roblox | Daily active users | - | Y (DAU Index) |
| LYFT | Lyft | Rides | - | - |
| BKNG | Booking Holdings | Room nights | Y | - |
| DIS | Disney | Disney+ core subscribers | - | - |
| 1810.HK | Xiaomi | Smartphone shipments | - | - |
| 0700.HK | Tencent | Weixin/WeChat MAU | - | - |
| AAPL | Apple | iPhone shipments | Y (Services Rev) | - |
| RDDT | Reddit | Daily active uniques | - | - |

---

## Priority candidates (not yet live)

### Tier 1 — High priority (strong alt-data coverage + eligible KPI + high user interest)

| Ticker | Company | Candidate KPI | Hatched KPI | Oxford DP | Notes |
|--------|---------|---------------|-------------|-----------|-------|
| EBAY | eBay | Gross merchandise volume | GMV | likely | Clean operating metric; widely followed |
| ETSY | Etsy | Active buyers / GMS | Marketplace Revenue | likely | Active buyer count is non-financial |
| ZAL.DE | Zalando | Number of orders / active customers | Orders, Active Customers, GMV | Y | EU e-commerce bellwether |
| W | Wayfair | Orders delivered | Orders Delivered | - | Pure order-volume metric |
| CPNG | Coupang | Active customers | Product Consumer Rev | - | Leading Korean e-commerce; user metric fits |
| ROKU | Roku | Active accounts | Active Accounts | - | Recently launched by Hatched |
| EXPE | Expedia | Booked room nights | Room Nights | - | Travel volume, parallels BKNG |
| CHWY | Chewy | Active customers | Net Sales (financial) | - | Chewy discloses active customer count |
| NYT | New York Times | Digital-only subscribers | Digital Subscribers | - | Clean subscriber metric |
| FLUT | Flutter/FanDuel | US average monthly players | US Avg Monthly Players | - | Gaming engagement metric |
| RVLV | Revolve | Total orders placed | Total Orders Placed | - | Clean order volume metric |
| FIGS | FIGS | Number of orders | Number of Orders | - | DTC apparel order volume; clean metric |
| GRPN | Groupon | Units sold / active customers | NA/Intl Units Sold, Active Customers | - | New Hatched coverage (LinkedIn); dual operating KPIs |

### Tier 2 — Medium priority (alt-data coverage exists, KPI eligibility needs verification)

| Ticker | Company | Candidate KPI | Hatched KPI | Oxford DP | Notes |
|--------|---------|---------------|-------------|-----------|-------|
| SHOP | Shopify | MRR / unique subscribers | Subscription Rev, MRR | - | MRR is borderline financial; merchant count may work |
| ROO.L | Deliveroo | Orders | Orders, GTV | - | UK food delivery; order count is clean |
| TKWY.AS | Just Eat Takeaway | Orders (UK/Canada) | UK, UKI, Canada Orders | - | Regional order volume |
| WISE.L | Wise | Customers | Customers, Volume | - | Customer count is operating metric |
| FVRR | Fiverr | Annual active buyers | Active Buyers, GMV | - | Buyer count fits; revenue doesn't |
| SEAT | Vivid Seats | Marketplace orders | Total Marketplace Orders | - | Event ticketing volume |
| VIPS | Vipshop | Total orders | Total Orders | - | Chinese e-commerce orders |
| GLBE | Global-e | GMV | GMV | - | Cross-border GMV is borderline |
| XRO.AU | Xero | Total subscribers | ANZ + Intl Subscribers | - | SaaS subscriber count |
| SEMR | SEMrush | Paying customers | Paying Customers | - | B2B SaaS customer metric |
| MNDY | monday.com | Customers > $50K ARR | Revenue (financial) | Y | Need non-financial KPI; customer count may work |
| UPWK | Upwork | Active clients / GSV | GSV | - | Active client count fits |
| IBKR | Interactive Brokers | DARTs | Daily Avg Rev Trades | - | Trading activity volume metric |
| ZOMATO.NS | Zomato | Quick commerce orders | QC Orders, Food GOV | - | Indian delivery volume |
| 3690.HK | Meituan | On-demand delivery transactions | Delivery Txns (retired by Hatched) | - | Check if Meituan still discloses |
| PARA | Paramount | Paramount+ subscribers | Subscribers | - | Streaming sub count; merger status TBD |
| TALABAT.AE | Talabat | GMV | GMV (from LinkedIn) | - | First DFM-listed ticker; GMV is borderline |
| YOU.DE | About You | Number of orders | Number of Orders, Orders LTM | - | EU fashion e-commerce; order count is clean |

### Tier 3 — Lower priority / needs more research

| Ticker | Company | Candidate KPI | Hatched KPI | Oxford DP | Notes |
|--------|---------|---------------|-------------|-----------|-------|
| SQSP | Squarespace | Unique subscriptions | Unique Subscriptions | - | Recently launched by Hatched |
| DOCN | DigitalOcean | Total customers | Customers, Users | - | Niche B2B; lower user interest |
| TMV.DE | TeamViewer | Total subscribers | Subscribers | - | EU SaaS subscribers |
| CDON.ST | CDON | Orders / active customers | Orders, Active Customers | - | Smaller Nordic marketplace |
| WIX | Wix | (check for user/subscriber KPI) | ARR, Bookings | - | ARR is financial; need operating metric |
| NYKAA.NS | Nykaa | Total orders | Total Orders, BPC Orders | - | Indian beauty e-commerce |
| HSW.L | Hostelworld | Net bookings | Net Bookings | - | Travel niche |
| 4385.T | Mercari | Total orders | Total Orders | - | Japanese marketplace |
| ZEN | Zendesk | Paying customers | Paying Customers | - | Now private (taken private 2022); skip |
| NTDOY | Nintendo | (digital sales is borderline financial) | Digital Sales | - | Revenue-adjacent; likely ineligible |

---

## Oxford DataPlan — additional coverage notes

Oxford DP covers 250+ companies and 500+ KPIs but does not publish a full list. Confirmed coverage:
- **META** — digital advertising (ad revenue is financial; DAP is operating)
- **RBLX** — Bookings & DAU Index (DAU fits; bookings is borderline)
- **MNDY** — monday.com (need to identify non-financial KPI)
- **GOOG** — digital advertising (financial metrics only; no eligible KPI)
- **Braze (BRZE)** — subscription revenue (financial; ineligible)

Oxford DP emphasizes EU and B2B names underserved by other providers. Their sector coverage (food delivery, consumer, software, media) overlaps heavily with Hatched. Full list requires direct contact.

---

## Hatched Analytics — full coverage reference (72 tickers)

Hatched covers 72 tickers with 100+ KPIs. Companies already listed in tiers above are omitted here. Remaining tickers with only financial-line-item KPIs (revenue, net sales) or no disclosed KPI are ineligible under current market rules:

**Ineligible (financial KPIs only):** ADBE (Subscription Rev), ADSK (Subscription Rev), AMZN (Net Sales), ASAN (Billings/Rev), ASC.L (Rev), BOOT (E-comm Net Sales), BOO.L, CHWY (Net Sales), DOCU (Subscription Rev), DNLM.L (Sales), GDDY (Rev), INTU (Rev), ITX.MC (Online Sales), LULU (E-comm Rev), PETS (Net Sales), RDC.DE (Orders — pharmacy niche), SHOP (Subscription Rev), SQ/Block (Afterpay Sales), TEAM (Subscription Rev), VSCO (Direct Net Sales), WRBY (E-comm Rev), ZM (Rev)

**Airlines (no operating KPI disclosed by Hatched):** AMC, EZJ.L, RYA.L, WIZZ.L, LUV (Passenger Billings — borderline), NXT.L

---

## Decision log

_Use this section to record decisions as candidates are promoted or dropped._

| Date | Ticker | Decision | Reason |
|------|--------|----------|--------|
| | | | |
