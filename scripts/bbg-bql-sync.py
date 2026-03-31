#!/usr/bin/env python3
"""
Bloomberg BQL Sync -- Quarterly KPI Consensus + Per-Firm Estimates
===================================================================
Uses COM automation to inject BQL formulas into Excel. BQL (Bloomberg
Query Language) returns proper quarterly breakdowns and per-firm estimates
that BDP with BEST_FPERIOD_OVERRIDE cannot.

This is the correct way to fetch operating KPI consensus data from Bloomberg.

Data fetched per ticker:
  1. Quarterly consensus (mean) for Q1-Q4 2026
  2. High/Low consensus per quarter
  3. Number of analysts per quarter
  4. Per-firm estimates with analyst name and date

Usage:
  python scripts/bbg-bql-sync.py                    # all market tickers
  python scripts/bbg-bql-sync.py --ticker TSLA      # single ticker
  python scripts/bbg-bql-sync.py --dry-run           # print formulas only
  python scripts/bbg-bql-sync.py --no-push           # skip D1 push

Prerequisites:
  - Bloomberg Terminal running with Excel + BQL Add-in
  - pip install pywin32 requests

Exit codes:
  0 = success, 1 = partial failure, 2 = fatal (Excel/Terminal not available)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Load .env
ENV_PATH = Path(".env")
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())

INGEST_URL = os.environ.get('INGEST_URL', 'https://consensusmarket.com/api/ingest')
API_KEY = os.environ.get('INGEST_API_KEY', '')

# Market definitions: ticker -> {bbg, field, metric, periods}
# From markets.json + kpi-field-map.json
MARKETS = {
    'TSLA': {'bbg': 'TSLA US Equity', 'field': 'NUMBER_OF_VEHICLES_SOLD', 'metric': 'Vehicle Deliveries'},
    'UBER': {'bbg': 'UBER US Equity', 'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'MAPC'},
    'DASH': {'bbg': 'DASH US Equity', 'field': 'TOTAL_ORDERS', 'metric': 'Marketplace Orders'},
    'ABNB': {'bbg': 'ABNB US Equity', 'field': 'NIGHTS_AND_EXPERIENCES_BOOKED', 'metric': 'Nights Booked'},
    'SPOT': {'bbg': 'SPOT US Equity', 'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'MAU'},
    'GRAB': {'bbg': 'GRAB US Equity', 'field': 'MONTHLY_TRANSACTING_USERS', 'metric': 'MTU'},
    'NFLX': {'bbg': 'NFLX US Equity', 'field': 'GLOBAL_STREAMING_PAID_MEMBERSHIPS', 'metric': 'Paid Subs'},
    'META': {'bbg': 'META US Equity', 'field': 'DAILY_ACTIVE_USERS', 'metric': 'Family DAP'},
    'SE':   {'bbg': 'SE US Equity',   'field': 'GROSS_ORDERS', 'metric': 'Gross Orders'},
    'PINS': {'bbg': 'PINS US Equity', 'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'MAU'},
    'MELI': {'bbg': 'MELI US Equity', 'field': 'UNIQUE_ACTIVE_BUYERS', 'metric': 'Active Buyers'},
    'COIN': {'bbg': 'COIN US Equity', 'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'MTU'},
    'RBLX': {'bbg': 'RBLX US Equity', 'field': 'DAILY_ACTIVE_USERS', 'metric': 'DAU'},
    'LYFT': {'bbg': 'LYFT US Equity', 'field': 'NUMBER_OF_RIDES', 'metric': 'Rides'},
    'BKNG': {'bbg': 'BKNG US Equity', 'field': 'ROOM_NIGHTS_SOLD', 'metric': 'Room Nights'},
    'DIS':  {'bbg': 'DIS US Equity',  'field': 'TOTAL_PAID_SUBSCRIBERS', 'metric': 'Disney+ Subs'},
    '1810.HK': {'bbg': '1810 HK Equity', 'field': 'FS265', 'metric': 'Phone Shipments'},
    '0700.HK': {'bbg': '700 HK Equity',  'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'WeChat MAU'},
    'AAPL': {'bbg': 'AAPL US Equity', 'field': 'IPHONE_UNIT_SALES', 'metric': 'iPhone Shipments'},
    'RDDT': {'bbg': 'RDDT US Equity', 'field': 'DAILY_ACTIVE_UNIQUES', 'metric': 'DAU'},
    'SNAP': {'bbg': 'SNAP US Equity', 'field': 'DAILY_ACTIVE_USERS', 'metric': 'DAU'},
    'SHOP': {'bbg': 'SHOP US Equity', 'field': 'GROSS_MERCHANDISE_VOLUME', 'metric': 'GMV'},
    'MTCH': {'bbg': 'MTCH US Equity', 'field': 'TOTAL_PAYING_USERS', 'metric': 'Payers'},
    'ROKU': {'bbg': 'ROKU US Equity', 'field': 'ACTIVE_ACCOUNTS', 'metric': 'Active Accounts'},
}

QUARTERS = ['1Q', '2Q', '3Q', '4Q']
YEAR = 2026


def log(msg):
    print(msg, flush=True)


def bql_consensus(bbg, field, quarter):
    """BQL formula for quarterly consensus mean."""
    return f'=BQL("{bbg}","{field}","FPT=Q","FPO={quarter}","FA_ACT_EST_DATA=E","FS=MRC","CURRENCY=USD")'


def bql_high(bbg, field, quarter):
    """BQL formula for high consensus."""
    return f'=BQL("{bbg}","{field}","FPT=Q","FPO={quarter}","FA_ACT_EST_DATA=E","FS=HI","CURRENCY=USD")'


def bql_low(bbg, field, quarter):
    """BQL formula for low consensus."""
    return f'=BQL("{bbg}","{field}","FPT=Q","FPO={quarter}","FA_ACT_EST_DATA=E","FS=LO","CURRENCY=USD")'


def bql_count(bbg, field, quarter):
    """BQL formula for number of estimates."""
    return f'=BQL("{bbg}","{field}","FPT=Q","FPO={quarter}","FA_ACT_EST_DATA=E","FS=CN","CURRENCY=USD")'


def build_formulas(tickers):
    """Build all BQL formulas for consensus data.
    Returns list of (row, label, formula, ticker, quarter, stat_type) tuples."""
    formulas = []
    row = 2  # row 1 = headers
    for ticker in tickers:
        m = MARKETS[ticker]
        bbg = m['bbg']
        field = m['field']
        for q in QUARTERS:
            period = f"{q}{YEAR}"
            # Mean consensus
            formulas.append((row, f'{ticker} {q} mean', bql_consensus(bbg, field, q), ticker, period, 'mean'))
            row += 1
            # High
            formulas.append((row, f'{ticker} {q} high', bql_high(bbg, field, q), ticker, period, 'high'))
            row += 1
            # Low
            formulas.append((row, f'{ticker} {q} low', bql_low(bbg, field, q), ticker, period, 'low'))
            row += 1
            # Count
            formulas.append((row, f'{ticker} {q} count', bql_count(bbg, field, q), ticker, period, 'count'))
            row += 1
    return formulas


def run_bql_sync(tickers, dry_run=False, push=True, timeout_sec=600):
    """Main: open Excel, inject BQL formulas, wait, read back, push."""
    formulas = build_formulas(tickers)
    log(f"BQL formulas to inject: {len(formulas)}")
    log(f"Tickers: {', '.join(tickers)}")
    log(f"Quarters: {', '.join(f'{q}{YEAR}' for q in QUARTERS)}")
    log("")

    if dry_run:
        for row, label, formula, *_ in formulas[:40]:
            log(f"  Row {row:4d}: {label:30s} {formula}")
        if len(formulas) > 40:
            log(f"  ... and {len(formulas) - 40} more")
        return

    try:
        import win32com.client
    except ImportError:
        log("ERROR: pip install pywin32")
        sys.exit(2)

    # Connect to running Excel
    log("Connecting to Excel...")
    try:
        xl = win32com.client.GetActiveObject('Excel.Application')
        log("Connected to running Excel instance")
    except Exception:
        try:
            xl = win32com.client.Dispatch('Excel.Application')
            xl.Visible = True
            log("Launched new Excel instance")
        except Exception as e:
            log(f"ERROR: Cannot connect to Excel: {e}")
            sys.exit(2)

    xl.DisplayAlerts = False
    wb = xl.Workbooks.Add()
    ws = wb.ActiveSheet
    ws.Name = 'BQL Sync'

    # Headers
    ws.Cells(1, 1).Value = 'Label'
    ws.Cells(1, 2).Value = 'Value'

    # Inject formulas
    log(f"Injecting {len(formulas)} BQL formulas...")
    for row, label, formula, *_ in formulas:
        ws.Cells(row, 1).Value = label
        ws.Cells(row, 2).Formula = formula

    xl.Calculate()
    log(f"Waiting for BQL to resolve (max {timeout_sec}s)...")

    # Poll
    start = time.time()
    last_pending = len(formulas)
    stable_count = 0

    while time.time() - start < timeout_sec:
        time.sleep(10)
        xl.Calculate()

        pending = resolved = errors = 0
        for row, *_ in formulas:
            val = ws.Cells(row, 2).Value
            if val is None:
                pending += 1
            elif isinstance(val, str) and ('#N/A' in val or 'Requesting' in val or 'Calc' in val):
                pending += 1
            elif isinstance(val, str) and '#' in val:
                errors += 1
            else:
                resolved += 1

        elapsed = int(time.time() - start)
        log(f"  {elapsed:3d}s: {resolved} resolved, {pending} pending, {errors} errors")

        if pending == 0:
            log("All resolved!")
            break

        if pending == last_pending:
            stable_count += 1
            if stable_count >= 6:
                log(f"No progress for 60s. Moving on with {resolved} resolved.")
                break
        else:
            stable_count = 0
            last_pending = pending

    # Read values back
    log("\nReading values...")
    results = {}  # (ticker, period) -> {value, high, low, count}
    for row, label, formula, ticker, period, stat_type in formulas:
        val = ws.Cells(row, 2).Value
        if val is None or (isinstance(val, str) and '#' in val):
            continue
        try:
            val = float(val)
        except (ValueError, TypeError):
            continue

        key = (ticker, period)
        if key not in results:
            results[key] = {'ticker': ticker, 'period': period, 'value': None, 'high': None, 'low': None, 'analyst_count': None}

        if stat_type == 'mean':
            results[key]['value'] = val
        elif stat_type == 'high':
            results[key]['high'] = val
        elif stat_type == 'low':
            results[key]['low'] = val
        elif stat_type == 'count':
            results[key]['analyst_count'] = int(val) if val > 0 else None

    wb.Close(SaveChanges=False)

    # Filter valid
    valid = [r for r in results.values() if r['value'] is not None and r['value'] > 0]
    log(f"\nValid quarterly estimates: {len(valid)}")
    for r in sorted(valid, key=lambda x: (x['ticker'], x['period'])):
        m = MARKETS.get(r['ticker'], {})
        lo = f"{r['low']:>12,.0f}" if r['low'] else '?'
        hi = f"{r['high']:>12,.0f}" if r['high'] else '?'
        est = r.get('analyst_count', '?')
        log(f"  {r['ticker']:10s} {r['period']:8s} {m.get('metric',''):20s} = {r['value']:>12,.0f}  (lo={lo}  hi={hi}  #est={est})")

    if not valid:
        log("\nNo valid data. Is Bloomberg BQL Add-in loaded in Excel?")
        return []

    # Push to D1
    today = datetime.now().strftime('%Y-%m-%d')
    payload = []
    for r in valid:
        m = MARKETS.get(r['ticker'], {})
        payload.append({
            'ticker': r['ticker'],
            'bbg_ticker': m.get('bbg', ''),
            'company': r['ticker'],
            'period': r['period'],
            'field': m.get('field', ''),
            'value': r['value'],
            'high': r['high'],
            'low': r['low'],
            'analyst_count': r['analyst_count'],
            'snapshot_date': today,
        })

    if push and API_KEY and payload:
        log(f"\nPushing {len(payload)} records to D1...")
        push_to_d1(payload, INGEST_URL)
    elif not API_KEY:
        log("\nWARNING: No INGEST_API_KEY, skipping push")

    # Save locally
    outfile = Path('data/consensus-db/bql-consensus.json')
    outfile.parent.mkdir(parents=True, exist_ok=True)
    outfile.write_text(json.dumps(payload, indent=2, default=str))
    log(f"Saved to {outfile}")

    return valid


def push_to_d1(records, url):
    try:
        import requests
    except ImportError:
        log("WARNING: requests not installed")
        return
    headers = {'Content-Type': 'application/json', 'X-API-Key': API_KEY}
    batch_size = 50
    total = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            resp = requests.post(url, headers=headers, json=batch, timeout=30)
            if resp.ok:
                r = resp.json()
                total += r.get('inserted', 0)
                log(f"  Batch {i // batch_size + 1}: {r.get('inserted', 0)} rows")
            else:
                log(f"  Batch {i // batch_size + 1}: HTTP {resp.status_code}")
        except Exception as e:
            log(f"  Batch {i // batch_size + 1}: {str(e)[:60]}")
        time.sleep(0.05)
    log(f"  D1: {total} rows pushed")


def main():
    parser = argparse.ArgumentParser(description='Bloomberg BQL Sync for KPI consensus')
    parser.add_argument('--ticker', help='Single ticker')
    parser.add_argument('--dry-run', action='store_true', help='Print formulas only')
    parser.add_argument('--no-push', action='store_true', help='Skip D1 push')
    parser.add_argument('--timeout', type=int, default=600, help='Max wait seconds (default: 600)')
    args = parser.parse_args()

    if args.ticker:
        t = args.ticker.upper()
        if t not in MARKETS:
            log(f"ERROR: {t} not in market list")
            sys.exit(1)
        tickers = [t]
    else:
        tickers = list(MARKETS.keys())

    log("=" * 60)
    log("Bloomberg BQL Sync -- Quarterly KPI Consensus")
    log("=" * 60)
    log(f"  Date:     {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    log(f"  Tickers:  {len(tickers)}")
    log(f"  Quarters: {QUARTERS}")
    log(f"  Timeout:  {args.timeout}s")
    log("")

    results = run_bql_sync(tickers, dry_run=args.dry_run,
                           push=not args.no_push, timeout_sec=args.timeout)

    if not results and not args.dry_run:
        sys.exit(1)


if __name__ == '__main__':
    main()
