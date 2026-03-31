#!/usr/bin/env python3
"""
Bloomberg Priority Backfill
=============================
Historical backfill for the 23 active prediction market tickers.
Pulls consensus snapshots and actuals for every quarter from 1Q2016 to 4Q2025
(40 quarters), plus earnings calendar data.

This is a one-time script to populate historical data. Run after field discovery.

Usage:
  python scripts/bbg-priority-backfill.py                  # backfill all 23 markets
  python scripts/bbg-priority-backfill.py --ticker TSLA    # backfill one ticker
  python scripts/bbg-priority-backfill.py --dry-run        # show plan only

Hit budget: ~23 tickers x 10 fields x 45 periods = ~10,350 hits + actuals (~10,350)
Total: ~20,700 hits (4% of daily limit)
Time: ~2-3 hours
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import pdblp
    import pandas as pd
    import requests
    from dotenv import load_dotenv
except ImportError:
    print("ERROR: pip install blpapi pdblp pandas requests python-dotenv")
    sys.exit(1)

load_dotenv()

PRIORITY_FILE = Path("data/priority-universe.json")
FIELD_MAP_FILE = Path("data/consensus-db/field-map.json")
OUTPUT_DIR = Path("data/consensus-db/backfill")

INGEST_URL = os.getenv("INGEST_URL", "")
INGEST_API_KEY = os.getenv("INGEST_API_KEY", "")

# The 23 active prediction market tickers
ACTIVE_MARKETS = {
    "TSLA", "UBER", "DASH", "ABNB", "SPOT", "NFLX", "META", "SNAP", "PINS",
    "RBLX", "RDDT", "AAPL", "LYFT", "BKNG", "DIS", "1810.HK", "0700.HK",
    "GRAB", "SE", "MELI", "COIN", "SHOP", "MTCH", "ROKU"
}

# Historical periods to backfill
def get_historical_periods():
    periods = []
    for year in range(2016, 2026):
        for q in range(1, 5):
            periods.append(f"{q}Q{year}")
    # Current year forward
    for q in range(1, 5):
        periods.append(f"{q}Q2026")
    periods.append("FY2026")
    periods.append("FY2027")
    return periods

FINANCIAL_FIELDS = [
    "BEST_SALES", "BEST_EPS", "BEST_EBITDA", "BEST_NET_INCOME",
    "BEST_GROSS_MARGIN", "BEST_OPER_MARGIN"
]


def connect():
    try:
        con = pdblp.BCon(debug=False, port=8194, timeout=15000)
        con.start()
        return con
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


def load_field_map():
    if not FIELD_MAP_FILE.exists():
        print("ERROR: field-map.json not found. Run bbg-discover-fields.py first.")
        sys.exit(1)
    return json.loads(FIELD_MAP_FILE.read_text())


def post_to_ingest(endpoint, payload):
    """POST data to Cloudflare Worker ingest endpoint."""
    if not INGEST_URL or INGEST_API_KEY == "REPLACE_ME_WITH_REAL_KEY":
        return None  # Skip HTTP push if not configured
    url = f"{INGEST_URL}{endpoint}"
    try:
        resp = requests.post(url, json=payload, headers={
            "Authorization": f"Bearer {INGEST_API_KEY}",
            "Content-Type": "application/json"
        }, timeout=10)
        return resp.status_code
    except Exception:
        return None


def backfill_ticker(con, bbg_ticker, ticker, name, fields, periods):
    """Backfill consensus + actuals for one ticker across all periods."""
    results = []
    today = datetime.now().strftime("%Y-%m-%d")

    for period in periods:
        overrides = [("BEST_FPERIOD_OVERRIDE", period)]
        for field in fields:
            try:
                data = con.ref(bbg_ticker, [field], overrides)
                if data.empty or pd.isna(data.iloc[0]["value"]):
                    continue

                value = float(data.iloc[0]["value"])
                if value == 0:
                    continue

                row = {
                    "ticker": ticker,
                    "bbg_ticker": bbg_ticker,
                    "company": name,
                    "period": period,
                    "field": field,
                    "value": value,
                    "snapshot_date": today,
                }

                # Try to get high/low/count
                try:
                    h = con.ref(bbg_ticker, [f"{field}_HIGH"], overrides)
                    if not h.empty and pd.notna(h.iloc[0]["value"]):
                        row["high"] = float(h.iloc[0]["value"])
                except Exception:
                    pass
                try:
                    lo = con.ref(bbg_ticker, [f"{field}_LOW"], overrides)
                    if not lo.empty and pd.notna(lo.iloc[0]["value"]):
                        row["low"] = float(lo.iloc[0]["value"])
                except Exception:
                    pass
                try:
                    ct = con.ref(bbg_ticker, ["BEST_EST_NUM_ANALYSTS"], overrides)
                    if not ct.empty and pd.notna(ct.iloc[0]["value"]):
                        row["analyst_count"] = int(ct.iloc[0]["value"])
                except Exception:
                    pass

                results.append(row)
                time.sleep(0.05)

            except Exception:
                continue

    return results


def backfill_actuals(con, bbg_ticker, ticker, name, fields):
    """Pull reported actuals for historical periods."""
    actuals = []
    # Actuals only make sense for past periods
    for year in range(2016, 2026):
        for q in range(1, 5):
            period = f"{q}Q{year}"
            overrides = [("BEST_FPERIOD_OVERRIDE", period)]
            for field in fields:
                try:
                    data = con.ref(bbg_ticker, [field], overrides)
                    if data.empty or pd.isna(data.iloc[0]["value"]):
                        continue
                    actuals.append({
                        "ticker": ticker,
                        "bbg_ticker": bbg_ticker,
                        "company": name,
                        "period": period,
                        "field": field,
                        "value": float(data.iloc[0]["value"]),
                        "source": "Bloomberg BEst"
                    })
                    time.sleep(0.05)
                except Exception:
                    continue
    return actuals


def backfill_calendar(con, bbg_ticker, ticker, name):
    """Pull earnings calendar for a ticker."""
    try:
        data = con.ref(bbg_ticker, [
            "EXPECTED_REPORT_DT",
            "EARN_ANN_DT_TIME_EST_CONFD"
        ])
        if data.empty:
            return None
        result = {
            "ticker": ticker,
            "bbg_ticker": bbg_ticker,
            "company": name,
        }
        for _, row in data.iterrows():
            field = row.get("field")
            value = row.get("value")
            if field == "EXPECTED_REPORT_DT" and pd.notna(value):
                result["next_earnings_date"] = str(value)[:10]
            elif field == "EARN_ANN_DT_TIME_EST_CONFD" and pd.notna(value):
                result["confirmed"] = str(value)
        return result if "next_earnings_date" in result else None
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Bloomberg Priority Backfill")
    parser.add_argument("--ticker", help="Backfill only this ticker")
    parser.add_argument("--dry-run", action="store_true", help="Show plan only")
    args = parser.parse_args()

    if not PRIORITY_FILE.exists():
        print("ERROR: data/priority-universe.json not found.")
        sys.exit(1)

    raw = json.loads(PRIORITY_FILE.read_text())
    field_map = load_field_map()

    # Filter to active market tickers
    companies = [c for c in raw["companies"] if c["ticker"] in ACTIVE_MARKETS]
    if args.ticker:
        companies = [c for c in companies if c["ticker"].upper() == args.ticker.upper()]

    periods = get_historical_periods()

    print(f"Priority Backfill Plan:")
    print(f"  Active market tickers: {len(companies)}")
    print(f"  Periods:               {len(periods)} ({periods[0]} to {periods[-1]})")
    print(f"  Est. time:             2-3 hours")
    print()

    if args.dry_run:
        for c in companies:
            bbg = c["bbg"]
            info = field_map.get(bbg, {})
            kpis = list(info.get("kpis", {}).keys())
            print(f"  {c['ticker']:10s} {c['name']:22s} {len(kpis)} KPIs: {', '.join(kpis[:3])}")
        return

    print("Connecting to Bloomberg...")
    con = connect()
    print("Connected.\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    start = time.time()
    all_consensus = []
    all_actuals = []
    all_calendar = []

    for i, company in enumerate(companies):
        bbg = company["bbg"]
        ticker = company["ticker"]
        name = company["name"]

        info = field_map.get(bbg, {})
        kpi_fields = list(info.get("kpis", {}).keys())
        fields = FINANCIAL_FIELDS + kpi_fields

        print(f"[{i+1}/{len(companies)}] {name:22s} ({len(fields)} fields x {len(periods)} periods)...")

        # Consensus backfill
        consensus = backfill_ticker(con, bbg, ticker, name, fields, periods)
        all_consensus.extend(consensus)

        # Actuals
        actuals = backfill_actuals(con, bbg, ticker, name, fields)
        all_actuals.extend(actuals)

        # Calendar
        cal = backfill_calendar(con, bbg, ticker, name)
        if cal:
            all_calendar.append(cal)

        # POST to ingest if configured
        if consensus:
            post_to_ingest("", {"records": consensus})
        if actuals:
            post_to_ingest("/actuals", {"records": actuals})
        if cal:
            post_to_ingest("/calendar", cal)

        elapsed = time.time() - start
        rate = (i + 1) / elapsed * 60
        print(f"    {len(consensus)} consensus, {len(actuals)} actuals, rate={rate:.0f} tickers/min")

    con.stop()

    # Save locally
    with open(OUTPUT_DIR / "consensus.json", "w") as f:
        json.dump(all_consensus, f, indent=2, default=str)
    with open(OUTPUT_DIR / "actuals.json", "w") as f:
        json.dump(all_actuals, f, indent=2, default=str)
    with open(OUTPUT_DIR / "calendar.json", "w") as f:
        json.dump(all_calendar, f, indent=2, default=str)

    elapsed = time.time() - start
    print(f"\nBackfill complete in {elapsed / 60:.1f} minutes.")
    print(f"  Consensus records: {len(all_consensus)}")
    print(f"  Actuals records:   {len(all_actuals)}")
    print(f"  Calendar entries:  {len(all_calendar)}")
    print(f"  Saved to:          {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
