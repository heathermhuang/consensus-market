#!/usr/bin/env python3
"""
Bloomberg Full Universe Sync
===============================
Pull BEST_SALES, BEST_EBITDA (+ high/low/analyst count), KPI fields,
actuals (trailing), and earnings calendar for all 86 tickers in
data/priority-universe.json. Push to D1 API in batches of 50.

Usage:
  python scripts/bbg-full-sync.py
  python scripts/bbg-full-sync.py --dry-run
  python scripts/bbg-full-sync.py --ticker TSLA
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import pdblp
    import pandas as pd
    import requests
except ImportError:
    print("ERROR: pip install blpapi pdblp pandas requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PRIORITY_FILE = Path("data/priority-universe.json")

API_BASE = "https://consensusmarket.com/api"
API_KEY = "cmk_aa38bde0474bbafbb9cb1c35ce2c448ddfb147f8e197467c"

BATCH_SIZE = 50
API_DELAY = 0.05  # 50ms between API calls

PERIODS = [
    "1Q2025", "2Q2025", "3Q2025", "4Q2025",
    "1Q2026", "2Q2026", "3Q2026", "4Q2026",
    "FY2025", "FY2026",
]

# Standard financial fields for every ticker
FINANCIAL_FIELDS = ["BEST_SALES", "BEST_EBITDA"]

# Per-ticker KPI fields (operating metrics)
KPI_MAP = {
    "TSLA US Equity":  ["NUMBER_OF_VEHICLES_SOLD"],
    "SPOT US Equity":  ["MONTHLY_ACTIVE_USERS"],
    "PINS US Equity":  ["MONTHLY_ACTIVE_USERS"],
    "700 HK Equity":   ["MONTHLY_ACTIVE_USERS"],
    "UBER US Equity":  ["MONTHLY_ACTIVE_USERS"],
    "COIN US Equity":  ["MONTHLY_ACTIVE_USERS"],
    "META US Equity":  ["DAILY_ACTIVE_USERS"],
    "RBLX US Equity":  ["DAILY_ACTIVE_USERS"],
    "1810 HK Equity":  ["FS265"],
    "DIS US Equity":   ["ROOM_NIGHTS"],
}

# Actuals fields
ACTUALS_FIELDS = ["TRAIL_12M_SALES", "TRAIL_12M_EBITDA", "IS_COMP_SALES"]


# ---------------------------------------------------------------------------
# Bloomberg connection
# ---------------------------------------------------------------------------

def connect_bbg():
    try:
        con = pdblp.BCon(debug=False, port=8194, timeout=15000)
        con.start()
        return con
    except Exception as e:
        print("ERROR connecting to Bloomberg: %s" % e)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Data pull helpers
# ---------------------------------------------------------------------------

def pull_consensus(con, bbg_ticker, ticker, name, fields, periods):
    """Pull consensus mean + high/low/analyst_count for each field/period."""
    rows = []
    today = datetime.now().strftime("%Y-%m-%d")

    for period in periods:
        for field in fields:
            try:
                overrides = [("BEST_FPERIOD_OVERRIDE", period)]
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

                # High
                try:
                    h_field = field + "_HIGH"
                    h = con.ref(bbg_ticker, [h_field],
                                [("BEST_FPERIOD_OVERRIDE", period),
                                 ("BEST_DATA_VALUE_OVERRIDE", "HIGH")])
                    if not h.empty and pd.notna(h.iloc[0]["value"]):
                        row["high"] = float(h.iloc[0]["value"])
                except Exception:
                    pass

                # Low
                try:
                    l_field = field + "_LOW"
                    l = con.ref(bbg_ticker, [l_field],
                                [("BEST_FPERIOD_OVERRIDE", period),
                                 ("BEST_DATA_VALUE_OVERRIDE", "LOW")])
                    if not l.empty and pd.notna(l.iloc[0]["value"]):
                        row["low"] = float(l.iloc[0]["value"])
                except Exception:
                    pass

                # Analyst count
                try:
                    num_field = field + "_NUM_EST"
                    ct = con.ref(bbg_ticker, [num_field], overrides)
                    if not ct.empty and pd.notna(ct.iloc[0]["value"]):
                        row["analyst_count"] = int(ct.iloc[0]["value"])
                except Exception:
                    pass

                rows.append(row)
                time.sleep(0.05)

            except Exception:
                continue

    return rows


def pull_actuals(con, bbg_ticker, ticker, name):
    """Pull trailing actuals for a ticker."""
    rows = []
    today = datetime.now().strftime("%Y-%m-%d")

    for field in ACTUALS_FIELDS:
        try:
            data = con.ref(bbg_ticker, [field])
            if data.empty or pd.isna(data.iloc[0]["value"]):
                continue
            rows.append({
                "ticker": ticker,
                "bbg_ticker": bbg_ticker,
                "company": name,
                "field": field,
                "value": float(data.iloc[0]["value"]),
                "as_of_date": today,
                "source": "Bloomberg BEst"
            })
            time.sleep(0.05)
        except Exception:
            continue

    return rows


def pull_calendar(con, bbg_ticker, ticker, name):
    """Pull next earnings date via EXPECTED_REPORT_DT and ERN_ANN_DT_AND_PER BDS."""
    result = {
        "ticker": ticker,
        "bbg_ticker": bbg_ticker,
        "company": name,
    }

    # Simple ref for next expected report date
    try:
        data = con.ref(bbg_ticker, ["EXPECTED_REPORT_DT"])
        if not data.empty and pd.notna(data.iloc[0]["value"]):
            result["next_earnings_date"] = str(data.iloc[0]["value"])[:10]
    except Exception:
        pass

    # Confirmed flag
    try:
        data = con.ref(bbg_ticker, ["EARN_ANN_DT_TIME_EST_CONFD"])
        if not data.empty and pd.notna(data.iloc[0]["value"]):
            result["confirmed"] = str(data.iloc[0]["value"])
    except Exception:
        pass

    # BDS call for historical earnings dates
    try:
        bds = con.bulkref(bbg_ticker, ["ERN_ANN_DT_AND_PER"])
        if not bds.empty:
            hist = []
            for _, r in bds.iterrows():
                hist.append({
                    "date": str(r.get("Announcement Date", ""))[:10],
                    "period": str(r.get("Period", "")),
                })
            if hist:
                result["history"] = hist[:8]  # last 8 entries
    except Exception:
        pass

    return result if "next_earnings_date" in result else None


# ---------------------------------------------------------------------------
# API push helpers
# ---------------------------------------------------------------------------

def post_batch(endpoint, records, label=""):
    """POST a batch of records to the D1 API."""
    if not records:
        return 0
    url = API_BASE + endpoint
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(url, json={"records": records}, headers=headers, timeout=30)
        if resp.status_code >= 400:
            print("  API %s %s -> HTTP %d: %s" % (
                label, endpoint, resp.status_code, resp.text[:200]))
        return resp.status_code
    except Exception as e:
        print("  API %s %s -> ERROR: %s" % (label, endpoint, e))
        return 0


def push_in_batches(endpoint, records, label=""):
    """Push records in batches of BATCH_SIZE with delays."""
    total = len(records)
    sent = 0
    for i in range(0, total, BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        post_batch(endpoint, batch, label)
        sent += len(batch)
        time.sleep(API_DELAY)
    return sent


def post_calendar(cal_entry):
    """POST a single calendar entry."""
    if not cal_entry:
        return
    url = API_BASE + "/ingest/calendar"
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(url, json=cal_entry, headers=headers, timeout=10)
        if resp.status_code >= 400:
            print("  API calendar -> HTTP %d: %s" % (resp.status_code, resp.text[:200]))
    except Exception as e:
        print("  API calendar -> ERROR: %s" % e)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Bloomberg Full Universe Sync")
    parser.add_argument("--dry-run", action="store_true", help="Show plan only")
    parser.add_argument("--ticker", help="Sync only this ticker")
    args = parser.parse_args()

    if not PRIORITY_FILE.exists():
        print("ERROR: data/priority-universe.json not found.")
        sys.exit(1)

    raw = json.loads(PRIORITY_FILE.read_text())
    companies = raw["companies"]

    if args.ticker:
        companies = [c for c in companies if c["ticker"].upper() == args.ticker.upper()]
        if not companies:
            print("ERROR: ticker %s not found in universe." % args.ticker)
            sys.exit(1)

    print("=" * 60)
    print("Bloomberg Full Universe Sync")
    print("=" * 60)
    print("  Tickers:     %d" % len(companies))
    print("  Periods:     %s" % ", ".join(PERIODS))
    print("  Fields:      BEST_SALES, BEST_EBITDA + KPI per ticker")
    print("  API target:  %s" % API_BASE)
    print("  Batch size:  %d" % BATCH_SIZE)
    print()

    if args.dry_run:
        for c in companies:
            bbg = c["bbg"]
            kpis = KPI_MAP.get(bbg, [])
            kpi_str = ", ".join(kpis) if kpis else "(none)"
            print("  %-10s %-22s KPIs: %s" % (c["ticker"], c["name"], kpi_str))
        print("\nDry run complete. %d tickers would be synced." % len(companies))
        return

    print("Connecting to Bloomberg...")
    con = connect_bbg()
    print("Connected.\n")

    start = time.time()
    total_consensus = 0
    total_actuals = 0
    total_calendar = 0
    all_consensus = []
    all_actuals = []
    all_calendar = []

    for i, company in enumerate(companies):
        bbg = company["bbg"]
        ticker = company["ticker"]
        name = company["name"]

        # Build field list: financial + KPIs
        fields = list(FINANCIAL_FIELDS)
        kpis = KPI_MAP.get(bbg, [])
        fields.extend(kpis)

        kpi_label = " + %s" % ",".join(kpis) if kpis else ""
        print("[%d/%d] %s (%s)%s" % (i + 1, len(companies), name, ticker, kpi_label))

        # 1. Consensus estimates
        consensus = pull_consensus(con, bbg, ticker, name, fields, PERIODS)
        all_consensus.extend(consensus)
        total_consensus += len(consensus)

        # 2. Actuals
        actuals = pull_actuals(con, bbg, ticker, name)
        all_actuals.extend(actuals)
        total_actuals += len(actuals)

        # 3. Calendar
        cal = pull_calendar(con, bbg, ticker, name)
        if cal:
            all_calendar.append(cal)
            total_calendar += 1

        # Push consensus in batches as we accumulate
        if len(all_consensus) >= BATCH_SIZE:
            pushed = push_in_batches("/ingest", all_consensus, ticker)
            print("    -> pushed %d consensus rows" % pushed)
            all_consensus = []
            time.sleep(API_DELAY)

        # Push actuals in batches
        if len(all_actuals) >= BATCH_SIZE:
            pushed = push_in_batches("/ingest/actuals", all_actuals, ticker)
            print("    -> pushed %d actuals rows" % pushed)
            all_actuals = []
            time.sleep(API_DELAY)

        # Push calendar immediately (one per ticker)
        if cal:
            post_calendar(cal)

        elapsed = time.time() - start
        rate = (i + 1) / elapsed * 60 if elapsed > 0 else 0
        remaining = (len(companies) - i - 1) / rate if rate > 0 else 0
        print("    %d consensus, %d actuals, cal=%s | %.0f tk/min, ~%.0f min left" % (
            len(consensus), len(actuals),
            "yes" if cal else "no",
            rate, remaining))

    # Flush remaining
    if all_consensus:
        pushed = push_in_batches("/ingest", all_consensus, "final")
        print("  -> pushed final %d consensus rows" % pushed)
    if all_actuals:
        pushed = push_in_batches("/ingest/actuals", all_actuals, "final")
        print("  -> pushed final %d actuals rows" % pushed)

    con.stop()

    elapsed = time.time() - start
    print()
    print("=" * 60)
    print("Sync complete in %.1f minutes." % (elapsed / 60))
    print("  Consensus records: %d" % total_consensus)
    print("  Actuals records:   %d" % total_actuals)
    print("  Calendar entries:  %d" % total_calendar)
    print("=" * 60)


if __name__ == "__main__":
    main()
