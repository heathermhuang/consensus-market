#!/usr/bin/env python3
"""
Bloomberg Global Consensus Sync
=================================
Daily sync that captures consensus snapshots for the entire universe.
Reads tickers and fields from universe.db, writes snapshots locally and pushes to D1.

Includes optional analyst and calendar sync phases.

Usage:
  python scripts/bbg-global-sync.py                     # sync all tickers
  python scripts/bbg-global-sync.py --kpi-only           # only companies with operating KPIs
  python scripts/bbg-global-sync.py --country US          # US companies only
  python scripts/bbg-global-sync.py --sector Technology   # one sector
  python scripts/bbg-global-sync.py --top 500             # top 500 by market cap
  python scripts/bbg-global-sync.py --resume              # skip tickers already done today
  python scripts/bbg-global-sync.py --stats               # show today's sync progress
  python scripts/bbg-global-sync.py --with-analysts       # also sync analyst recs (default: on)
  python scripts/bbg-global-sync.py --with-calendar       # also sync earnings calendar (default: on)
  python scripts/bbg-global-sync.py --no-analysts         # skip analyst sync
  python scripts/bbg-global-sync.py --no-calendar         # skip calendar sync
  python scripts/bbg-global-sync.py --no-push             # local only, skip D1 push
  python scripts/bbg-global-sync.py --dry-run             # show plan without executing

Exit codes:
  0 = success (all tickers synced)
  1 = partial failure (some tickers failed, but sync completed)
  2 = fatal error (Bloomberg connection failed, etc.)
"""

import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import pdblp
    import pandas as pd
except ImportError:
    print("ERROR: pip install blpapi pdblp pandas")
    sys.exit(2)

DB_PATH = Path("data/consensus-db/universe.db")
LOG_PATH = Path("data/consensus-db/sync.log")
KPI_MAP_PATH = Path("data/consensus-db/kpi-field-map.json")
BATCH_SIZE = 20
RATE_LIMIT_SLEEP = 0.15

# Load .env if present
ENV_PATH = Path(".env")
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())

INGEST_BASE = os.environ.get('INGEST_URL', 'https://consensusmarket.com/api/ingest')
# Derive base URL for sub-endpoints: /api/ingest -> /api/ingest/analysts, etc.
if INGEST_BASE.endswith('/api/ingest'):
    INGEST_URL = INGEST_BASE
    INGEST_URL_ANALYSTS = INGEST_BASE + '/analysts'
    INGEST_URL_CALENDAR = INGEST_BASE + '/calendar'
else:
    INGEST_URL = INGEST_BASE
    INGEST_URL_ANALYSTS = INGEST_BASE.rstrip('/') + '/analysts'
    INGEST_URL_CALENDAR = INGEST_BASE.rstrip('/') + '/calendar'
API_KEY = os.environ.get('INGEST_API_KEY', '')

# KPI fields that the API can resolve (from kpi-field-map.json)
KPI_FIELDS = {}
if KPI_MAP_PATH.exists():
    try:
        kpi_data = json.loads(KPI_MAP_PATH.read_text())
        for ticker, info in kpi_data.get('found_via_api', {}).items():
            KPI_FIELDS[ticker] = info['field']
    except Exception:
        pass

# Prediction market tickers for analyst/calendar sync
MARKET_TICKERS = {
    'TSLA': 'TSLA US Equity', 'UBER': 'UBER US Equity', 'DASH': 'DASH US Equity',
    'ABNB': 'ABNB US Equity', 'SPOT': 'SPOT US Equity', 'NFLX': 'NFLX US Equity',
    'META': 'META US Equity', 'SNAP': 'SNAP US Equity', 'PINS': 'PINS US Equity',
    'RBLX': 'RBLX US Equity', 'RDDT': 'RDDT US Equity', 'AAPL': 'AAPL US Equity',
    'LYFT': 'LYFT US Equity', 'BKNG': 'BKNG US Equity', 'DIS': 'DIS US Equity',
    '1810.HK': '1810 HK Equity', '0700.HK': '700 HK Equity',
    'GRAB': 'GRAB US Equity', 'SE': 'SE US Equity', 'MELI': 'MELI US Equity',
    'COIN': 'COIN US Equity', 'SHOP': 'SHOP US Equity', 'MTCH': 'MTCH US Equity',
    'ROKU': 'ROKU US Equity',
}


def log(msg):
    """Print and flush immediately (important for bat file log capture)."""
    print(msg, flush=True)


def connect_db():
    if not DB_PATH.exists():
        print("ERROR: universe.db not found. Run bbg-universe.py --discover first.")
        sys.exit(2)
    return sqlite3.connect(str(DB_PATH))


def connect_bbg():
    try:
        con = pdblp.BCon(debug=False, port=8194, timeout=15000)
        con.start()
        return con
    except Exception as e:
        log(f"ERROR: Cannot connect to Bloomberg: {e}")
        sys.exit(2)


def get_target_periods():
    """Current quarter + next quarter."""
    now = datetime.now()
    q = (now.month - 1) // 3 + 1
    y = now.year
    current = f"{q}Q{y}"
    nq = q + 1
    ny = y
    if nq > 4:
        nq = 1
        ny += 1
    next_p = f"{nq}Q{ny}"
    return [current, next_p]


def get_fy_period():
    """Current fiscal year."""
    return f"FY{datetime.now().year}"


def get_tickers_to_sync(db_conn, kpi_only=False, country=None, sector=None, top=None, resume=False):
    """Get list of tickers to sync based on filters."""
    c = db_conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    query = "SELECT DISTINCT t.bbg_ticker FROM tickers t"
    conditions = []
    params = []

    if kpi_only:
        query += " JOIN available_fields af ON t.bbg_ticker = af.bbg_ticker"
        conditions.append("af.field LIKE 'BEST_EST_%' AND af.has_coverage = 1")

    if country:
        conditions.append("t.country = ?")
        params.append(country)

    if sector:
        conditions.append("t.sector LIKE ?")
        params.append(f"%{sector}%")

    if resume:
        conditions.append(f"""t.bbg_ticker NOT IN (
            SELECT DISTINCT bbg_ticker FROM consensus_snapshots
            WHERE snapshot_date = '{today}'
        )""")

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY t.market_cap DESC NULLS LAST"

    if top:
        query += f" LIMIT {top}"

    c.execute(query)
    return [row[0] for row in c.fetchall()]


def get_fields_for_ticker(db_conn, bbg_ticker):
    """Get all available fields for a ticker."""
    c = db_conn.cursor()
    c.execute("""
        SELECT field FROM available_fields
        WHERE bbg_ticker = ? AND has_coverage = 1
    """, (bbg_ticker,))
    return [row[0] for row in c.fetchall()]


def detect_fy_only(bbg_con, bbg_ticker, field):
    """Check if a KPI field returns the same value for all quarters (FY-only).
    Returns True if quarterly breakdown is not available."""
    values = []
    year = datetime.now().year
    for q in range(1, 5):
        period = f"{q}Q{year}"
        try:
            data = bbg_con.ref(bbg_ticker, [field], [("BEST_FPERIOD_OVERRIDE", period)])
            if not data.empty and pd.notna(data.iloc[0]["value"]):
                values.append(float(data.iloc[0]["value"]))
            time.sleep(RATE_LIMIT_SLEEP)
        except Exception:
            pass

    if len(values) < 2:
        return True  # Not enough data, treat as FY-only
    # If all values are identical, it's FY-only (quarterly breakdown not available)
    return len(set(values)) == 1


def sync_ticker(bbg_con, db_conn, bbg_ticker, periods, push_records):
    """Sync consensus snapshots for one ticker across all its fields and periods.
    Returns (count, errors) tuple."""
    c = db_conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")
    fields = get_fields_for_ticker(db_conn, bbg_ticker)

    if not fields:
        return 0, 0

    # Determine ticker short name for KPI field lookup
    # bbg_ticker is like "TSLA US Equity" -> extract "TSLA"
    ticker_short = bbg_ticker.split()[0]
    # Handle HK tickers: "1810 HK Equity" -> "1810.HK"
    parts = bbg_ticker.split()
    if len(parts) >= 2 and parts[1] == 'HK':
        ticker_short = f"{parts[0]}.HK"

    kpi_field = KPI_FIELDS.get(ticker_short)

    count = 0
    errors = 0
    for period in periods:
        for field in fields:
            try:
                # For KPI fields, check if this is FY-only
                # (We only do this check once per field, not per period)
                if field == kpi_field and period != periods[0]:
                    # We already checked in the first period iteration
                    pass

                overrides = [("BEST_FPERIOD_OVERRIDE", period)]
                data = bbg_con.ref(bbg_ticker, [field], overrides)

                if data.empty or pd.isna(data.iloc[0]["value"]):
                    continue

                consensus = float(data.iloc[0]["value"])
                if consensus == 0:
                    continue

                # Get high/low/count
                high_val = low_val = num_analysts = None
                try:
                    h = bbg_con.ref(bbg_ticker, [f"{field}_HIGH"], overrides)
                    if not h.empty and pd.notna(h.iloc[0]["value"]):
                        high_val = float(h.iloc[0]["value"])
                except Exception:
                    pass

                try:
                    lo = bbg_con.ref(bbg_ticker, [f"{field}_LOW"], overrides)
                    if not lo.empty and pd.notna(lo.iloc[0]["value"]):
                        low_val = float(lo.iloc[0]["value"])
                except Exception:
                    pass

                try:
                    ct = bbg_con.ref(bbg_ticker, ["BEST_EST_NUM_ANALYSTS"], overrides)
                    if not ct.empty and pd.notna(ct.iloc[0]["value"]):
                        num_analysts = int(ct.iloc[0]["value"])
                except Exception:
                    pass

                c.execute("""
                    INSERT OR REPLACE INTO consensus_snapshots
                    (bbg_ticker, field, period, snapshot_date, consensus, high, low, num_analysts)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (bbg_ticker, field, period, today, consensus, high_val, low_val, num_analysts))

                # Queue for D1 push
                push_records.append({
                    'ticker': ticker_short,
                    'bbg_ticker': bbg_ticker,
                    'company': ticker_short,
                    'period': period,
                    'field': field,
                    'value': consensus,
                    'high': high_val,
                    'low': low_val,
                    'analyst_count': num_analysts,
                    'snapshot_date': today,
                })

                count += 1
                time.sleep(RATE_LIMIT_SLEEP)

            except Exception as e:
                errors += 1
                continue

    db_conn.commit()
    return count, errors


def sync_kpi_fy(bbg_con, push_records):
    """Sync KPI fields as FY-only for tickers where quarterly breakdown is unavailable.
    This detects FY-only fields and stores them with period=FYxxxx."""
    today = datetime.now().strftime("%Y-%m-%d")
    year = datetime.now().year
    fy_period = f"FY{year}"
    count = 0

    log("\n--- KPI FY-Only Detection ---")
    for ticker_short, field in KPI_FIELDS.items():
        bbg_ticker = MARKET_TICKERS.get(ticker_short)
        if not bbg_ticker:
            continue

        try:
            # Pull FY value
            data = bbg_con.ref(bbg_ticker, [field], [("BEST_FPERIOD_OVERRIDE", fy_period)])
            if data.empty or pd.isna(data.iloc[0]["value"]):
                log(f"  {ticker_short:10s} {field:35s} FY: no data")
                continue

            consensus = float(data.iloc[0]["value"])
            if consensus == 0:
                continue

            # Check if quarterly is available by comparing 1Q and 2Q
            q1_val = q2_val = None
            try:
                d1 = bbg_con.ref(bbg_ticker, [field], [("BEST_FPERIOD_OVERRIDE", f"1Q{year}")])
                if not d1.empty and pd.notna(d1.iloc[0]["value"]):
                    q1_val = float(d1.iloc[0]["value"])
                time.sleep(RATE_LIMIT_SLEEP)
                d2 = bbg_con.ref(bbg_ticker, [field], [("BEST_FPERIOD_OVERRIDE", f"2Q{year}")])
                if not d2.empty and pd.notna(d2.iloc[0]["value"]):
                    q2_val = float(d2.iloc[0]["value"])
                time.sleep(RATE_LIMIT_SLEEP)
            except Exception:
                pass

            is_fy_only = (q1_val is not None and q2_val is not None and q1_val == q2_val == consensus)

            if is_fy_only:
                # Store as FY only
                store_period = fy_period
                log(f"  {ticker_short:10s} {field:35s} FY-ONLY: {consensus:>15,.0f}")
            else:
                # Quarterly data is available - already handled in sync_ticker
                log(f"  {ticker_short:10s} {field:35s} QUARTERLY available (1Q={q1_val}, 2Q={q2_val}, FY={consensus})")
                continue

            # Get high/low/count for FY
            high_val = low_val = num_analysts = None
            try:
                h = bbg_con.ref(bbg_ticker, [f"{field}_HIGH"], [("BEST_FPERIOD_OVERRIDE", store_period)])
                if not h.empty and pd.notna(h.iloc[0]["value"]):
                    high_val = float(h.iloc[0]["value"])
            except Exception:
                pass
            try:
                lo = bbg_con.ref(bbg_ticker, [f"{field}_LOW"], [("BEST_FPERIOD_OVERRIDE", store_period)])
                if not lo.empty and pd.notna(lo.iloc[0]["value"]):
                    low_val = float(lo.iloc[0]["value"])
            except Exception:
                pass
            try:
                ct = bbg_con.ref(bbg_ticker, ["BEST_EST_NUM_ANALYSTS"], [("BEST_FPERIOD_OVERRIDE", store_period)])
                if not ct.empty and pd.notna(ct.iloc[0]["value"]):
                    num_analysts = int(ct.iloc[0]["value"])
            except Exception:
                pass

            push_records.append({
                'ticker': ticker_short,
                'bbg_ticker': bbg_ticker,
                'company': ticker_short,
                'period': store_period,
                'field': field,
                'value': consensus,
                'high': high_val,
                'low': low_val,
                'analyst_count': num_analysts,
                'snapshot_date': today,
            })
            count += 1
            time.sleep(RATE_LIMIT_SLEEP)

        except Exception as e:
            log(f"  {ticker_short:10s} ERROR: {str(e)[:60]}")

    log(f"  KPI FY records: {count}")
    return count


def sync_analysts(bbg_con, push=True):
    """Sync analyst recommendations for all prediction market tickers."""
    log("\n--- Analyst Sync ---")
    today = datetime.now().strftime('%Y-%m-%d')
    all_analysts = []

    for ticker, bbg in MARKET_TICKERS.items():
        try:
            data = bbg_con.bulkref(bbg, 'BEST_ANALYST_RECS_BULK')
        except Exception as e:
            log(f"  {ticker}: ERROR - {str(e)[:80]}")
            continue

        positions = data.groupby('position')
        count = 0
        for pos, group in positions:
            row = {}
            for _, r in group.iterrows():
                row[r['name']] = r['value']

            firm = row.get('Firm Name', '')
            analyst = row.get('Analyst', '')
            rec = row.get('Recommendation', '')
            target = row.get('Target Price', 0)
            date = row.get('Date', '')

            if not firm:
                continue
            if target and float(target) < 0.01:
                target = None

            all_analysts.append({
                'ticker': ticker,
                'bbg_ticker': bbg,
                'firm': firm,
                'analyst': analyst,
                'recommendation': rec,
                'target_price': float(target) if target else None,
                'date': str(date)[:10] if date else today,
                'snapshot_date': today,
            })
            count += 1

        log(f"  {ticker:10s}: {count} analysts")
        time.sleep(0.2)

    log(f"  Total analyst records: {len(all_analysts)}")

    # Save locally
    outfile = Path('data/consensus-db/analyst-firms.json')
    outfile.parent.mkdir(parents=True, exist_ok=True)
    outfile.write_text(json.dumps(all_analysts, indent=2, default=str))

    if push and API_KEY and all_analysts:
        push_to_d1(all_analysts, INGEST_URL_ANALYSTS, "analyst")

    return len(all_analysts)


def sync_calendar(bbg_con, push=True):
    """Sync earnings calendar for all prediction market tickers."""
    log("\n--- Calendar Sync ---")
    today = datetime.now().strftime('%Y-%m-%d')
    calendar = []

    for ticker, bbg in MARKET_TICKERS.items():
        try:
            data = bbg_con.ref(bbg, ['EXPECTED_REPORT_DT'])
            if data.empty or pd.isna(data.iloc[0]["value"]):
                continue

            earnings_date = str(data.iloc[0]["value"])[:10]

            calendar.append({
                'ticker': ticker,
                'bbg_ticker': bbg,
                'company': ticker,
                'next_earnings_date': earnings_date,
                'earnings_time': '',
                'confirmed': 'estimated',
            })
            log(f"  {ticker:10s}: {earnings_date}")
        except Exception as e:
            log(f"  {ticker:10s}: ERROR - {str(e)[:60]}")
        time.sleep(RATE_LIMIT_SLEEP)

    log(f"  Total calendar entries: {len(calendar)}")

    if push and API_KEY and calendar:
        push_to_d1(calendar, INGEST_URL_CALENDAR, "calendar")

    return len(calendar)


def push_to_d1(records, url, label="consensus"):
    """Push records to D1 ingest API in batches."""
    if not API_KEY:
        log(f"  WARNING: No INGEST_API_KEY set, skipping D1 push for {label}")
        return 0

    try:
        import requests
    except ImportError:
        log("  WARNING: requests not installed, skipping D1 push")
        return 0

    headers = {'Content-Type': 'application/json', 'X-API-Key': API_KEY}
    batch_size = 50
    total = 0

    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            resp = requests.post(url, headers=headers, json=batch, timeout=30)
            if resp.ok:
                r = resp.json()
                total += r.get('inserted', r.get('upserted', len(batch)))
            else:
                log(f"  D1 {label} batch {i // batch_size + 1}: HTTP {resp.status_code}")
        except Exception as e:
            log(f"  D1 {label} batch {i // batch_size + 1}: {str(e)[:60]}")
        time.sleep(0.05)

    log(f"  D1 {label}: {total} rows pushed")
    return total


def show_stats(db_conn):
    """Show today's sync progress."""
    c = db_conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    c.execute("SELECT COUNT(DISTINCT bbg_ticker) FROM consensus_snapshots WHERE snapshot_date = ?", (today,))
    synced_today = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM tickers")
    total = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM consensus_snapshots WHERE snapshot_date = ?", (today,))
    snapshots_today = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM consensus_snapshots")
    total_snapshots = c.fetchone()[0]

    c.execute("SELECT MIN(snapshot_date), MAX(snapshot_date) FROM consensus_snapshots")
    date_range = c.fetchone()

    log(f"Sync Status ({today}):")
    log(f"  Tickers synced today:  {synced_today:,} / {total:,}")
    log(f"  Snapshots today:       {snapshots_today:,}")
    log(f"  Total snapshots:       {total_snapshots:,}")
    log(f"  Date range:            {date_range[0]} to {date_range[1]}")

    db_size = DB_PATH.stat().st_size / (1024 * 1024)
    log(f"  Database size:         {db_size:.1f} MB")


def main():
    parser = argparse.ArgumentParser(description="Bloomberg Global Consensus Sync")
    parser.add_argument("--kpi-only", action="store_true", help="Only companies with operating KPIs")
    parser.add_argument("--country", help="Filter by country code (e.g., US, HK, JP)")
    parser.add_argument("--sector", help="Filter by GICS sector name")
    parser.add_argument("--top", type=int, help="Top N by market cap")
    parser.add_argument("--resume", action="store_true", help="Skip tickers already synced today")
    parser.add_argument("--stats", action="store_true", help="Show sync progress")
    parser.add_argument("--no-analysts", action="store_true", help="Skip analyst sync")
    parser.add_argument("--no-calendar", action="store_true", help="Skip calendar sync")
    parser.add_argument("--no-push", action="store_true", help="Skip D1 push (local SQLite only)")
    parser.add_argument("--dry-run", action="store_true", help="Show plan without executing")
    args = parser.parse_args()

    db_conn = connect_db()

    if args.stats:
        show_stats(db_conn)
        return

    periods = get_target_periods()
    tickers = get_tickers_to_sync(db_conn, args.kpi_only, args.country, args.sector, args.top, args.resume)

    log("=" * 60)
    log("Bloomberg Global Consensus Sync")
    log("=" * 60)
    log(f"  Date:      {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    log(f"  Tickers:   {len(tickers)}")
    log(f"  Periods:   {', '.join(periods)}")
    log(f"  Analysts:  {'yes' if not args.no_analysts else 'skip'}")
    log(f"  Calendar:  {'yes' if not args.no_calendar else 'skip'}")
    log(f"  D1 push:   {'yes' if not args.no_push and API_KEY else 'no'}")
    log(f"  Est. time: ~{len(tickers) * len(periods) * 4 * RATE_LIMIT_SLEEP / 60:.0f} minutes")
    log("")

    if args.dry_run:
        log("DRY RUN - no changes made")
        for t in tickers[:20]:
            log(f"  {t}")
        if len(tickers) > 20:
            log(f"  ... and {len(tickers) - 20} more")
        return

    if not tickers and args.no_analysts and args.no_calendar:
        log("Nothing to sync (all done for today, or no tickers match filters).")
        return

    bbg_con = connect_bbg()
    start = time.time()
    total_snapshots = 0
    total_errors = 0
    push_records = []

    # Phase 1: Consensus snapshots
    if tickers:
        log("--- Phase 1: Consensus Snapshots ---")
        for i, bbg_ticker in enumerate(tickers):
            try:
                count, errs = sync_ticker(bbg_con, db_conn, bbg_ticker, periods, push_records)
                total_snapshots += count
                total_errors += errs
            except Exception as e:
                log(f"  {bbg_ticker}: FATAL - {str(e)[:80]}")
                total_errors += 1

            if (i + 1) % 10 == 0:
                elapsed = time.time() - start
                rate = (i + 1) / elapsed * 60
                remaining = (len(tickers) - i - 1) / rate if rate > 0 else 0
                log(f"  [{i + 1}/{len(tickers)}] {total_snapshots} snapshots, {rate:.0f} tickers/min, ~{remaining:.0f} min left")

        log(f"  Phase 1 complete: {total_snapshots} snapshots, {total_errors} errors")

    # Phase 1b: KPI FY-only detection and storage
    kpi_fy_count = sync_kpi_fy(bbg_con, push_records)

    # Phase 1c: Push consensus to D1
    if not args.no_push and push_records:
        log(f"\n--- D1 Push: {len(push_records)} consensus records ---")
        push_to_d1(push_records, INGEST_URL, "consensus")

    # Phase 2: Analyst sync
    if not args.no_analysts:
        sync_analysts(bbg_con, push=not args.no_push)

    # Phase 3: Calendar sync
    if not args.no_calendar:
        sync_calendar(bbg_con, push=not args.no_push)

    # Summary
    elapsed = time.time() - start
    log("\n" + "=" * 60)
    log("SYNC COMPLETE")
    log("=" * 60)
    log(f"  Tickers:    {len(tickers)}")
    log(f"  Snapshots:  {total_snapshots} + {kpi_fy_count} KPI FY")
    log(f"  Errors:     {total_errors}")
    log(f"  Duration:   {elapsed / 60:.1f} min")
    log(f"  D1 pushed:  {len(push_records)} records")
    log("")

    bbg_con.stop()
    db_conn.close()

    # Exit code: 1 if there were errors but sync completed
    if total_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
