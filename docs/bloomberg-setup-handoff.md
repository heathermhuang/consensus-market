# Bloomberg Data Pipeline — Setup Handoff

This document gives a new Claude Code session on the Bloomberg Terminal machine
everything it needs to set up the consensus data pipeline.

## What This Project Is

Consensus Market (consensusmarket.com) is a KPI prediction market where users bet
on whether company KPIs (Tesla deliveries, Uber trips, Netflix subs, etc.) will
beat or miss Wall Street consensus. Built on Solidity smart contracts, React/Vite
frontend, deployed via Cloudflare Workers.

**The problem:** All 23 markets currently display SYNTHETIC data — fake consensus
numbers, fake historical actuals, fake revision trails. The founder (Heather,
YC W16 / Measurable AI) showed these numbers to investors thinking they were real.
We need to replace every number with verified Bloomberg data.

## Architecture

```
Bloomberg Terminal (this machine)
    ↓ Python script → HTTP POST with API key
Cloudflare Worker + D1 (SQLite database)
    ↓ Same Worker that serves consensusmarket.com
Frontend reads from /api/consensus, /api/calendar, /api/actuals
```

## What Needs To Happen On This Machine

### 1. Verify Bloomberg API access

```python
import pdblp
con = pdblp.BCon(debug=False, port=8194, timeout=15000)
con.start()

# Test: pull Tesla Q2'26 consensus deliveries
data = con.ref("TSLA US Equity", ["BEST_SALES", "BEST_EPS"],
               [("BEST_FPERIOD_OVERRIDE", "2Q2026")])
print(data)
con.stop()
```

If this works, Bloomberg API is accessible.

### 2. Discover KPI fields

Bloomberg uses company-specific field names for operating KPIs. We need to
discover which fields return real data for each company. The script probes
~130 field patterns per ticker.

Key fields to verify manually on the terminal first (type ticker → BEst):
- TSLA: Vehicle deliveries
- UBER: Trips
- SPOT: Monthly active users
- NFLX: Paid subscribers (NOTE: Netflix stopped reporting quarterly in 2025)
- META: Family daily active people

### 3. Push to Cloudflare D1

The Cloudflare Worker at consensusmarket.com will have these endpoints:

```
POST /api/ingest          — push consensus data (API key required)
POST /api/ingest/actuals  — push reported actuals (API key required)
POST /api/ingest/calendar — push earnings calendar (API key required)
GET  /api/consensus/:ticker?period=2Q2026  — read consensus
GET  /api/actuals/:ticker  — read historical actuals
GET  /api/calendar         — read earnings calendar
```

API key will be set as a Cloudflare Worker secret: `INGEST_API_KEY`

The Python script on this machine needs:
```
INGEST_API_KEY=<the key>
INGEST_URL=https://consensusmarket.com/api/ingest
```

### 4. Set up Windows Task Scheduler

Daily cron at 6:00 AM HKT (before Asia market open):
```
schtasks /create /tn "ConsensusMarket-BBG-Sync" /tr "python C:\consensus\bbg-sync.py" /sc daily /st 06:00
```

## Priority Tickers (Phase 1: ~100 companies)

### Current 23 prediction markets:
TSLA, UBER, DASH, ABNB, SPOT, NFLX, META, SNAP, PINS, RBLX, RDDT, AAPL,
LYFT, BKNG, DIS, 1810.HK, 0700.HK, GRAB, SE, MELI, COIN, SHOP, MTCH, ROKU

### Measurable AI coverage (e-receipt data):
AMZN, GOOGL, CRM, MSFT, PYPL, SQ, DKNG, DUOL, ETSY, FVRR, UPWK, CPNG,
GLBE, W, CHWY, DHER, 3690.HK, 9618.HK, 9988.HK, PDD

### Yipitdata coverage (consumer transaction data):
WMT, TGT, COST, HD, LOW, MCD, SBUX, CMG, NKE, LULU, TJX, ROST, GPS, ANF

### Streaming / gaming / engagement:
WBD, PARA, CMCSA, TTWO, EA, U

### Fintech / payments:
V, MA, AFRM, SOFI, HOOD

### SaaS / cloud:
NOW, SNOW, DDOG, CRWD, NET, ZS, PLTR, MDB, HUBS, TWLO

### Hardware / semis:
NVDA, AMD, TSM, INTC, QCOM

### Travel:
EXPE, TCOM

## Data To Pull Per Company

### Financial fields (always):
BEST_SALES, BEST_EPS, BEST_EBITDA, BEST_NET_INCOME, BEST_GROSS_MARGIN, BEST_OPER_MARGIN

### KPI fields (company-specific, discovered via probing):
Examples: BEST_EST_VEHICLE_DELIVERIES, BEST_EST_MAU, BEST_EST_TRIPS, etc.

### For each field, pull:
- Consensus mean
- Consensus high
- Consensus low
- Number of analysts
- Individual firm estimates (if available via BDS)

### Periods:
- Current: 1Q2026, 2Q2026, 3Q2026, 4Q2026, FY2026, FY2027
- Historical backfill: Every quarter from 1Q2016 to 4Q2025 (40 quarters)
- For each historical period, pull point-in-time consensus snapshots at:
  12 weeks before, 8 weeks before, 4 weeks before, and at lock (final)

### Actuals:
- Reported actual values for all historical periods
- Source: Bloomberg BEst actuals or company filings

### Earnings calendar:
- EXPECTED_REPORT_DT
- EARN_ANN_DT_TIME_EST_CONFD
- Confirmed vs tentative

## Bloomberg API Limits

- 500,000 data hits per day
- 5,000-7,000 unique securities per month
- Rate: ~20 requests/second is safe, add 50ms delays between calls
- Batch: ref() can handle 10+ fields per call

## Estimated Hit Budget

| Task | Hits | Time |
|------|------|------|
| Field discovery (100 companies × 130 fields / 10 batch) | ~1,300 | 5 min |
| Current consensus (100 × 10 fields × 6 periods) | ~6,000 | 15 min |
| Historical backfill (100 × 10 × 45 periods) | ~45,000 | 2-3 hours |
| Actuals (100 × 8 fields × 45 periods) | ~36,000 | 2 hours |
| Detail (high/low/count) for KPIs | ~5,000 | 15 min |
| **Total Day 1** | **~93,000** | **~5 hours** |
| Daily cron (100 × 10 × 6) | ~6,000 | 15 min |

Well within the 500K daily limit.

## D1 Schema (will be created on the Cloudflare side)

```sql
CREATE TABLE consensus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  bbg_ticker TEXT NOT NULL,
  company TEXT NOT NULL,
  period TEXT NOT NULL,           -- e.g. "2Q2026", "FY2026"
  field TEXT NOT NULL,            -- e.g. "BEST_SALES", "BEST_EST_MAU"
  value REAL,
  high REAL,
  low REAL,
  analyst_count INTEGER,
  snapshot_date TEXT NOT NULL,    -- ISO date of when this was pulled
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE actuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  bbg_ticker TEXT NOT NULL,
  company TEXT NOT NULL,
  period TEXT NOT NULL,
  field TEXT NOT NULL,
  value REAL,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE earnings_calendar (
  ticker TEXT PRIMARY KEY,
  bbg_ticker TEXT NOT NULL,
  company TEXT NOT NULL,
  next_earnings_date TEXT,
  earnings_time TEXT,
  confirmed TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_consensus_ticker_period ON consensus(ticker, period);
CREATE INDEX idx_consensus_field ON consensus(field);
CREATE INDEX idx_consensus_snapshot ON consensus(snapshot_date);
CREATE INDEX idx_actuals_ticker ON actuals(ticker, period);
```

## Git Repo

The main repo is at: https://github.com/<owner>/consensus-market (or wherever it's hosted)
Clone it to C:\consensus\ on this machine.

The relevant scripts are in scripts/:
- bbg-discover-fields.py — probe Bloomberg for available KPI fields
- bbg-global-sync.py — main sync script (Bloomberg → HTTP POST → Worker)
- bbg-priority-backfill.py — 10-year historical backfill

## What The Other Machine Is Doing

The main development machine (macOS) handles:
- Cloudflare Worker code (cloudflare/worker.js) — adding D1 bindings + API endpoints
- Frontend code (src/) — reading from /api/consensus instead of static data
- Deployment (npm run deploy:prod)

Once the D1 endpoints are live, this machine just needs to POST data to them.

## Quick Start Checklist

1. [ ] Clone repo to C:\consensus\
2. [ ] pip install blpapi pdblp pandas requests
3. [ ] Verify Bloomberg API: `python -c "import pdblp; ..."`
4. [ ] Run field discovery: `python scripts/bbg-discover-fields.py --dry-run`
5. [ ] Get INGEST_API_KEY from the main machine operator
6. [ ] Run current consensus sync: `python scripts/bbg-global-sync.py`
7. [ ] Run historical backfill: `python scripts/bbg-global-sync.py --backfill`
8. [ ] Set up Windows Task Scheduler for daily sync
