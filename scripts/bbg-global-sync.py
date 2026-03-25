#!/usr/bin/env python3
"""
Bloomberg Global Consensus Sync
=================================
Daily scraper that captures consensus snapshots for the entire universe.
Reads tickers and fields from universe.db, writes snapshots to the same db.

Designed to run as a daily cron job. Rate-limited to stay within Bloomberg
API limits. Handles partial failures gracefully — can resume where it left off.

Usage:
  python scripts/bbg-global-sync.py                     # sync all tickers
  python scripts/bbg-global-sync.py --kpi-only          # only companies with operating KPIs
  python scripts/bbg-global-sync.py --country US         # US companies only
  python scripts/bbg-global-sync.py --sector Technology   # one sector
  python scripts/bbg-global-sync.py --top 500            # top 500 by market cap
  python scripts/bbg-global-sync.py --resume             # skip tickers already done today
  python scripts/bbg-global-sync.py --stats              # show today's sync progress

Cron setup (runs at 7am HKT weekdays — after US market close, before Asia open):
  0 7 * * 1-5 /path/to/scripts/bbg-global-sync.py --resume >> /tmp/bbg-global.log 2>&1
"""

import argparse
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
    sys.exit(1)

DB_PATH = Path("data/consensus-db/universe.db")
BATCH_SIZE = 20  # Bloomberg bulk ref batch size
RATE_LIMIT_SLEEP = 0.15  # seconds between requests


def connect_db():
    if not DB_PATH.exists():
        print("ERROR: universe.db not found. Run bbg-universe.py --discover first.")
        sys.exit(1)
    return sqlite3.connect(str(DB_PATH))


def connect_bbg():
    try:
        con = pdblp.BCon(debug=False, port=8194, timeout=15000)
        con.start()
        return con
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


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


def sync_ticker(bbg_con, db_conn, bbg_ticker, periods):
    """Sync consensus snapshots for one ticker across all its fields and periods."""
    c = db_conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")
    fields = get_fields_for_ticker(db_conn, bbg_ticker)

    if not fields:
        return 0

    count = 0
    for period in periods:
        for field in fields:
            try:
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

                count += 1
                time.sleep(RATE_LIMIT_SLEEP)

            except Exception:
                continue

    # Check for newly reported actuals
    for period in periods:
        for field in fields:
            try:
                c.execute("SELECT actual FROM actuals WHERE bbg_ticker = ? AND field = ? AND period = ?",
                          (bbg_ticker, field, period))
                existing = c.fetchone()
                if existing and existing[0] is not None:
                    continue  # Already have the actual

                data = bbg_con.ref(bbg_ticker, [field], [
                    ("BEST_FPERIOD_OVERRIDE", period),
                ])
                # Check if this is an actual (reported) vs estimate
                # Bloomberg returns the actual if the period has been reported
                # This is a simplification — ideally check BEST_ACTUAL flag
            except Exception:
                pass

    db_conn.commit()
    return count


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

    print(f"Sync Status ({today}):")
    print(f"  Tickers synced today:  {synced_today:,} / {total:,}")
    print(f"  Snapshots today:       {snapshots_today:,}")
    print(f"  Total snapshots:       {total_snapshots:,}")
    print(f"  Date range:            {date_range[0]} → {date_range[1]}")

    # Database size
    db_size = DB_PATH.stat().st_size / (1024 * 1024)
    print(f"  Database size:         {db_size:.1f} MB")


def main():
    parser = argparse.ArgumentParser(description="Bloomberg Global Consensus Sync")
    parser.add_argument("--kpi-only", action="store_true", help="Only companies with operating KPIs")
    parser.add_argument("--country", help="Filter by country code (e.g., US, HK, JP)")
    parser.add_argument("--sector", help="Filter by GICS sector name")
    parser.add_argument("--top", type=int, help="Top N by market cap")
    parser.add_argument("--resume", action="store_true", help="Skip tickers already synced today")
    parser.add_argument("--stats", action="store_true", help="Show sync progress")
    args = parser.parse_args()

    db_conn = connect_db()

    if args.stats:
        show_stats(db_conn)
        return

    periods = get_target_periods()
    tickers = get_tickers_to_sync(db_conn, args.kpi_only, args.country, args.sector, args.top, args.resume)

    print(f"Global sync: {len(tickers)} tickers, periods {', '.join(periods)}")
    print(f"Estimated time: ~{len(tickers) * len(periods) * 4 * RATE_LIMIT_SLEEP / 60:.0f} minutes\n")

    if not tickers:
        print("Nothing to sync (all done for today, or no tickers match filters).")
        return

    bbg_con = connect_bbg()
    start = time.time()
    total_snapshots = 0

    for i, bbg_ticker in enumerate(tickers):
        count = sync_ticker(bbg_con, db_conn, bbg_ticker, periods)
        total_snapshots += count

        if (i + 1) % 100 == 0:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed * 60
            remaining = (len(tickers) - i - 1) / rate if rate > 0 else 0
            print(f"  [{i + 1}/{len(tickers)}] {total_snapshots} snapshots, {rate:.0f} tickers/min, ~{remaining:.0f} min remaining")

    elapsed = time.time() - start
    print(f"\nDone. {total_snapshots} snapshots for {len(tickers)} tickers in {elapsed / 60:.1f} min.")

    bbg_con.stop()
    db_conn.close()


if __name__ == "__main__":
    main()
