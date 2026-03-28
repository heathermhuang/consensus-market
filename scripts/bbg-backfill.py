#!/usr/bin/env python3
"""
Bloomberg Historical Consensus Backfill
========================================
Builds a time-series database of consensus estimates for every market.
For each company KPI and each reporting period, captures weekly consensus
snapshots going back to when coverage began.

This creates the "Street path" — how the consensus estimate evolved over time
leading up to the actual report. This is the core data asset.

Setup:
  pip install blpapi pdblp pandas

Usage:
  python scripts/bbg-backfill.py                          # backfill all markets, all periods
  python scripts/bbg-backfill.py --ticker TSLA            # backfill one company
  python scripts/bbg-backfill.py --periods 4              # last 4 quarters only
  python scripts/bbg-backfill.py --interval 7             # weekly snapshots (default)
  python scripts/bbg-backfill.py --interval 1             # daily snapshots (slow, ~10K API calls)
  python scripts/bbg-backfill.py --resume                 # skip periods already in the database
  python scripts/bbg-backfill.py --dry-run                # print plan, no Bloomberg connection

Output:
  data/consensus-db/
    {slug}/
      actuals.json                    — all historical reported actuals
      consensus-history/
        {period}.json                 — time-series of consensus snapshots for each period
    _meta.json                        — database metadata
    _tickers.json                     — ticker → slug mapping

Database schema (per period file):
  {
    "slug": "tesla-deliveries",
    "ticker": "TSLA",
    "period": "2Q2025",
    "metric": "Vehicle deliveries",
    "actual": 384122,
    "actualReportedAt": "2025-07-02",
    "snapshots": [
      { "date": "2025-04-01", "weeksBeforeReport": 13, "consensus": 395000, "high": 420000, "low": 375000, "numAnalysts": 18 },
      { "date": "2025-04-08", "weeksBeforeReport": 12, "consensus": 397000, "high": 422000, "low": 376000, "numAnalysts": 18 },
      ...
    ]
  }
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

try:
    import pdblp
    import pandas as pd
except ImportError:
    print("ERROR: pip install blpapi pdblp pandas")
    sys.exit(1)

# ─── Market definitions (same as bloomberg-export.py) ─────────────────────────

MARKETS = [
    ("TSLA US Equity",  "BEST_EST_VEHICLE_DELIVERIES",     "tesla-deliveries",        "Vehicle deliveries",       "vehicles"),
    ("UBER US Equity",  "BEST_EST_TRIPS",                  "uber-trips",              "Trips",                    "trips"),
    ("DASH US Equity",  "BEST_EST_TOTAL_ORDERS",           "doordash-orders",         "Marketplace orders",       "orders"),
    ("ABNB US Equity",  "BEST_EST_NIGHTS_BOOKED",          "airbnb-nights",           "Nights booked",            "nights"),
    ("SPOT US Equity",  "BEST_EST_MAU",                    "spotify-maus",            "Monthly active users",     "users"),
    ("GRAB US Equity",  "BEST_EST_MTU",                    "grab-mtu",                "Monthly transacting users","users"),
    ("NFLX US Equity",  "BEST_EST_PAID_SUBSCRIBERS",       "netflix-paid-memberships", "Paid memberships",        "subscribers"),
    ("META US Equity",  "BEST_EST_DAP",                    "meta-dap",                "Family DAP",               "people"),
    ("SE US Equity",    "BEST_EST_GROSS_ORDERS",           "sea-gross-orders",        "Gross orders",             "orders"),
    ("PINS US Equity",  "BEST_EST_MAU",                    "pinterest-maus",          "Monthly active users",     "users"),
    ("MELI US Equity",  "BEST_EST_ACTIVE_BUYERS",          "meli-active-buyers",      "Unique active buyers",     "buyers"),
    ("COIN US Equity",  "BEST_EST_MTU",                    "coinbase-mtu",            "Monthly transacting users","users"),
    ("RBLX US Equity",  "BEST_EST_DAU",                    "roblox-dau",              "Daily active users",       "users"),
    ("LYFT US Equity",  "BEST_EST_RIDES",                  "lyft-rides",              "Rides",                    "rides"),
    ("BKNG US Equity",  "BEST_EST_ROOM_NIGHTS",            "booking-room-nights",     "Room nights",              "room nights"),
    ("DIS US Equity",   "BEST_EST_DTC_SUBSCRIBERS",        "disney-plus-subs",        "Disney+ subscribers",      "subscribers"),
    ("1810 HK Equity",  "BEST_EST_SMARTPHONE_SHIPMENTS",   "xiaomi-shipments",        "Smartphone shipments",     "units"),
    ("700 HK Equity",   "BEST_EST_WECHAT_MAU",            "tencent-wechat-mau",      "WeChat MAU",               "users"),
    ("AAPL US Equity",  "BEST_SALES",                      "apple-iphone-revenue",    "iPhone revenue",           "USD"),
    ("RDDT US Equity",  "BEST_EST_DAUQ",                   "reddit-dauq",             "Daily active uniques",     "users"),
    ("SNAP US Equity",  "BEST_EST_DAU",                    "snap-dau",                "Daily active users",       "users"),
    ("MTCH US Equity",  "BEST_EST_PAYERS",                 "match-payers",            "Total payers",             "payers"),
    ("ROKU US Equity",  "BEST_EST_ACTIVE_ACCOUNTS",        "roku-active-accounts",    "Active accounts",          "accounts"),
]


def generate_periods(num_quarters=8):
    """Generate fiscal period labels going back from current quarter."""
    now = datetime.now()
    q = (now.month - 1) // 3 + 1
    y = now.year
    periods = []
    for _ in range(num_quarters):
        periods.append(f"{q}Q{y}")
        q -= 1
        if q <= 0:
            q = 4
            y -= 1
    periods.reverse()
    return periods


def generate_snapshot_dates(report_date, weeks_before=16, interval_days=7):
    """Generate dates for consensus snapshots leading up to a report date."""
    start = report_date - timedelta(weeks=weeks_before)
    dates = []
    current = start
    while current <= report_date:
        dates.append(current)
        current += timedelta(days=interval_days)
    return dates


def connect():
    try:
        con = pdblp.BCon(debug=False, port=8194, timeout=15000)
        con.start()
        return con
    except Exception as e:
        print(f"ERROR: Cannot connect to Bloomberg: {e}")
        sys.exit(1)


def fetch_consensus_snapshot(con, bbg_ticker, kpi_field, period, snapshot_date):
    """Fetch the consensus estimate as of a specific date for a specific period."""
    date_str = snapshot_date.strftime("%Y%m%d")
    try:
        overrides = [
            ("BEST_FPERIOD_OVERRIDE", period),
            ("BEST_DATA_DT_OVERRIDE", date_str),
        ]
        # Mean
        data = con.ref(bbg_ticker, [kpi_field], overrides)
        mean_val = float(data.iloc[0]["value"]) if not data.empty and pd.notna(data.iloc[0]["value"]) else None

        if mean_val is None:
            return None

        # High
        try:
            h = con.ref(bbg_ticker, [f"{kpi_field}_HIGH"], overrides)
            high_val = float(h.iloc[0]["value"]) if not h.empty and pd.notna(h.iloc[0]["value"]) else None
        except Exception:
            high_val = None

        # Low
        try:
            lo = con.ref(bbg_ticker, [f"{kpi_field}_LOW"], overrides)
            low_val = float(lo.iloc[0]["value"]) if not lo.empty and pd.notna(lo.iloc[0]["value"]) else None
        except Exception:
            low_val = None

        # Analyst count
        try:
            ct = con.ref(bbg_ticker, ["BEST_EST_NUM_ANALYSTS"], overrides)
            count_val = int(ct.iloc[0]["value"]) if not ct.empty and pd.notna(ct.iloc[0]["value"]) else None
        except Exception:
            count_val = None

        return {
            "date": snapshot_date.strftime("%Y-%m-%d"),
            "consensus": mean_val,
            "high": high_val,
            "low": low_val,
            "numAnalysts": count_val,
        }
    except Exception:
        return None


def fetch_actual(con, bbg_ticker, kpi_field, period):
    """Fetch the actual reported value for a period."""
    try:
        data = con.ref(bbg_ticker, [kpi_field], [
            ("BEST_FPERIOD_OVERRIDE", period),
            ("BEST_DATA_DT_OVERRIDE", datetime.now().strftime("%Y%m%d")),
        ])
        if not data.empty and pd.notna(data.iloc[0]["value"]):
            return float(data.iloc[0]["value"])
    except Exception:
        pass
    return None


def fetch_earnings_date(con, bbg_ticker, period):
    """Try to get the actual earnings release date for a historical period."""
    try:
        # Use EARN_DT field with period override
        data = con.ref(bbg_ticker, ["BEST_ACTUAL_RELEASE_DT"], [
            ("BEST_FPERIOD_OVERRIDE", period),
        ])
        if not data.empty and pd.notna(data.iloc[0]["value"]):
            return str(data.iloc[0]["value"])[:10]
    except Exception:
        pass
    return None


def backfill_market(con, bbg_ticker, kpi_field, slug, metric_name, unit,
                    periods, interval_days, weeks_before, db_dir, resume):
    """Backfill all periods for a single market."""
    market_dir = db_dir / slug / "consensus-history"
    market_dir.mkdir(parents=True, exist_ok=True)

    actuals_list = []

    for period in periods:
        period_file = market_dir / f"{period}.json"

        if resume and period_file.exists():
            print(f"    {period}: exists (skipped)")
            # Still load the actual for the summary
            existing = json.loads(period_file.read_text())
            if existing.get("actual") is not None:
                actuals_list.append({
                    "period": period,
                    "actual": existing["actual"],
                    "reportedAt": existing.get("actualReportedAt"),
                })
            continue

        # Get the actual value and report date
        actual = fetch_actual(con, bbg_ticker, kpi_field, period)
        report_date_str = fetch_earnings_date(con, bbg_ticker, period)

        # Determine report date for snapshot scheduling
        if report_date_str:
            report_date = datetime.strptime(report_date_str, "%Y-%m-%d")
        else:
            # Estimate: assume ~45 days after quarter end
            q_num = int(period[0])
            q_year = int(period[2:])
            quarter_end_month = q_num * 3
            quarter_end = datetime(q_year, quarter_end_month, 28)
            report_date = quarter_end + timedelta(days=45)

        # Generate snapshot dates
        snapshot_dates = generate_snapshot_dates(report_date, weeks_before, interval_days)

        # Fetch each snapshot
        snapshots = []
        for sd in snapshot_dates:
            if sd > datetime.now():
                break  # Don't query future dates

            snap = fetch_consensus_snapshot(con, bbg_ticker, kpi_field, period, sd)
            if snap is not None:
                days_before = (report_date - sd).days
                snap["weeksBeforeReport"] = round(days_before / 7, 1)
                snapshots.append(snap)

            # Rate limit: Bloomberg API can be sensitive to rapid-fire requests
            time.sleep(0.1)

        # Save period file
        period_data = {
            "slug": slug,
            "ticker": bbg_ticker.split()[0],
            "period": period,
            "metric": metric_name,
            "unit": unit,
            "actual": actual,
            "actualReportedAt": report_date_str,
            "snapshots": snapshots,
            "exportedAt": datetime.utcnow().isoformat() + "Z",
        }
        period_file.write_text(json.dumps(period_data, indent=2))

        if actual is not None:
            actuals_list.append({
                "period": period,
                "actual": actual,
                "reportedAt": report_date_str,
            })

        filled = len(snapshots)
        print(f"    {period}: {filled} snapshots, actual={'%.0f' % actual if actual else 'pending'}")

    # Save actuals summary
    actuals_file = db_dir / slug / "actuals.json"
    actuals_data = {
        "slug": slug,
        "ticker": bbg_ticker.split()[0],
        "metric": metric_name,
        "unit": unit,
        "actuals": actuals_list,
        "exportedAt": datetime.utcnow().isoformat() + "Z",
    }
    actuals_file.write_text(json.dumps(actuals_data, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Bloomberg Historical Consensus Backfill")
    parser.add_argument("--ticker", help="Backfill only this ticker")
    parser.add_argument("--periods", type=int, default=8, help="Number of quarters to backfill (default: 8)")
    parser.add_argument("--interval", type=int, default=7, help="Days between snapshots (default: 7 = weekly)")
    parser.add_argument("--weeks-before", type=int, default=16, help="Weeks before report to start capturing (default: 16)")
    parser.add_argument("--resume", action="store_true", help="Skip periods already in the database")
    parser.add_argument("--dry-run", action="store_true", help="Print plan only")
    parser.add_argument("--output-dir", default="data/consensus-db", help="Database directory")
    args = parser.parse_args()

    markets = MARKETS
    if args.ticker:
        markets = [m for m in MARKETS if m[0].startswith(args.ticker.upper())]
        if not markets:
            print(f"ERROR: Ticker '{args.ticker}' not found.")
            sys.exit(1)

    periods = generate_periods(args.periods)
    snapshot_count = args.weeks_before * 7 // args.interval
    total_api_calls = len(markets) * len(periods) * snapshot_count * 4  # 4 fields per snapshot

    print(f"Backfill plan:")
    print(f"  Markets:   {len(markets)}")
    print(f"  Periods:   {len(periods)} ({periods[0]} → {periods[-1]})")
    print(f"  Snapshots: ~{snapshot_count} per period (every {args.interval}d, {args.weeks_before}w lookback)")
    print(f"  Est. API calls: ~{total_api_calls:,}")
    print(f"  Est. time: ~{total_api_calls * 0.15 / 60:.0f} minutes")
    print()

    if args.dry_run:
        print("Markets:")
        for bbg, field, slug, name, unit in markets:
            print(f"  {slug:30s} {bbg:20s} {field}")
        print(f"\nPeriods: {', '.join(periods)}")
        return

    db_dir = Path(args.output_dir)
    db_dir.mkdir(parents=True, exist_ok=True)

    print("Connecting to Bloomberg...")
    con = connect()
    print("Connected.\n")

    start_time = time.time()

    for bbg_ticker, kpi_field, slug, metric_name, unit in markets:
        print(f"── {slug} ({bbg_ticker}) ──")
        backfill_market(con, bbg_ticker, kpi_field, slug, metric_name, unit,
                        periods, args.interval, args.weeks_before, db_dir, args.resume)
        print()

    # Save metadata
    meta = {
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "periods": periods,
        "intervalDays": args.interval,
        "weeksLookback": args.weeks_before,
        "marketCount": len(markets),
        "elapsedSeconds": round(time.time() - start_time),
    }
    (db_dir / "_meta.json").write_text(json.dumps(meta, indent=2))

    # Save ticker mapping
    tickers = {m[2]: {"bbg": m[0], "field": m[1], "metric": m[3], "unit": m[4]} for m in markets}
    (db_dir / "_tickers.json").write_text(json.dumps(tickers, indent=2))

    elapsed = time.time() - start_time
    print(f"Backfill complete in {elapsed / 60:.1f} minutes.")
    print(f"Database: {db_dir}/")

    con.stop()


if __name__ == "__main__":
    main()
