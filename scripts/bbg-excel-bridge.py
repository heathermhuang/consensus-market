#!/usr/bin/env python3
"""
Bloomberg Excel Bridge — KPI Data via Excel Add-in
=====================================================
Uses COM automation to inject BDP formulas into Excel, waits for
Bloomberg's Excel Add-in to resolve them, then reads the values back.

This bypasses the Desktop API's field limitations -- the Excel Add-in
has access to ALL BEst fields including operating KPIs that the socket
API returns as INVALID_FIELD.

Usage:
  python scripts/bbg-excel-bridge.py              # all 24 prediction market tickers
  python scripts/bbg-excel-bridge.py --ticker TSLA
  python scripts/bbg-excel-bridge.py --resume       # skip tickers already done today
  python scripts/bbg-excel-bridge.py --dry-run      # just prints formulas
  python scripts/bbg-excel-bridge.py --no-push      # skip D1 push, local log only

Prerequisites:
  - Bloomberg Terminal running with Excel Add-in enabled
  - pip install pywin32 requests
  - Excel must NOT have the workbook open already

Exit codes:
  0 = success
  1 = partial failure (some data retrieved, some errors)
  2 = fatal error (Excel/Bloomberg not available)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Load .env if present
ENV_PATH = Path(".env")
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())

INGEST_URL = os.environ.get('INGEST_URL', 'https://consensusmarket.com/api/ingest')
API_KEY = os.environ.get('INGEST_API_KEY', '')
LOG_PATH = Path("data/consensus-db/excel-sync.log")
KPI_MAP_PATH = Path("data/consensus-db/kpi-field-map.json")
STATE_PATH = Path("data/consensus-db/excel-sync-state.json")

# KPI fields to try per ticker via Excel BDP
KPI_PROBES = {
    'TSLA': [
        ('NUMBER_OF_VEHICLES_SOLD', 'Vehicle Deliveries'),
        ('BEST_EST_VEHICLE_DELIVERIES', 'Vehicle Deliveries'),
        ('TOT_VEHICLE_DLVRY', 'Vehicle Deliveries'),
    ],
    'UBER': [
        ('MONTHLY_ACTIVE_USERS', 'MAPC'),
        ('GROSS_BOOKINGS', 'Gross Bookings'),
        ('NUMBER_OF_TRIPS', 'Trips'),
    ],
    'DASH': [
        ('TOTAL_ORDERS', 'Marketplace Orders'),
        ('MARKETPLACE_GOV', 'Marketplace GOV'),
    ],
    'ABNB': [
        ('NIGHTS_AND_EXPERIENCES_BOOKED', 'Nights Booked'),
        ('GROSS_BOOKING_VALUE', 'GBV'),
    ],
    'SPOT': [
        ('MONTHLY_ACTIVE_USERS', 'MAU'),
        ('PREMIUM_SUBSCRIBERS', 'Premium Subs'),
    ],
    'NFLX': [
        ('GLOBAL_STREAMING_PAID_MEMBERSHIPS', 'Paid Subs'),
        ('TOTAL_PAID_SUBSCRIBERS', 'Paid Subs'),
    ],
    'META': [
        ('DAILY_ACTIVE_USERS', 'Family DAP'),
        ('FAMILY_DAILY_ACTIVE_PEOPLE', 'Family DAP'),
    ],
    'SNAP': [
        ('DAILY_ACTIVE_USERS', 'DAU'),
    ],
    'PINS': [
        ('MONTHLY_ACTIVE_USERS', 'MAU'),
    ],
    'RBLX': [
        ('DAILY_ACTIVE_USERS', 'DAU'),
        ('BOOKINGS', 'Bookings'),
    ],
    'RDDT': [
        ('DAILY_ACTIVE_UNIQUES', 'DAU'),
        ('DAILY_ACTIVE_USERS', 'DAU'),
    ],
    'AAPL': [
        ('IPHONE_UNIT_SALES', 'iPhone Units'),
        ('IPHONE_REVENUE', 'iPhone Revenue'),
    ],
    'LYFT': [
        ('NUMBER_OF_RIDES', 'Rides'),
        ('ACTIVE_RIDERS', 'Active Riders'),
    ],
    'BKNG': [
        ('ROOM_NIGHTS_SOLD', 'Room Nights'),
        ('GROSS_BOOKINGS', 'Gross Bookings'),
    ],
    'DIS': [
        ('TOTAL_PAID_SUBSCRIBERS', 'Disney+ Subs'),
        ('DISNEY_PLUS_SUBSCRIBERS', 'Disney+ Subs'),
    ],
    '1810.HK': [
        ('SMARTPHONE_SHIPMENTS', 'Phone Shipments'),
        ('FS265', 'Phone Shipments'),
    ],
    '0700.HK': [
        ('MONTHLY_ACTIVE_USERS', 'WeChat MAU'),
        ('COMBINED_MAU', 'Weixin+WeChat MAU'),
    ],
    'GRAB': [
        ('MONTHLY_TRANSACTING_USERS', 'MTU'),
    ],
    'SE': [
        ('GROSS_ORDERS', 'Gross Orders'),
    ],
    'MELI': [
        ('UNIQUE_ACTIVE_BUYERS', 'Active Buyers'),
    ],
    'COIN': [
        ('MONTHLY_TRANSACTING_USERS', 'MTU'),
    ],
    'SHOP': [
        ('GROSS_MERCHANDISE_VOLUME', 'GMV'),
    ],
    'MTCH': [
        ('TOTAL_PAYING_USERS', 'Payers'),
        ('TINDER_PAYING_USERS', 'Tinder Payers'),
    ],
    'ROKU': [
        ('ACTIVE_ACCOUNTS', 'Active Accounts'),
        ('STREAMING_HOURS', 'Streaming Hours'),
    ],
}

BBG_TICKERS = {
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

# Pull quarterly + FY to detect FY-only fields
YEAR = datetime.now().year
QUARTERLY_PERIODS = [f'{q}Q{YEAR}' for q in range(1, 5)]
FY_PERIOD = f'FY{YEAR}'
ALL_PERIODS = QUARTERLY_PERIODS + [FY_PERIOD]


def log(msg):
    """Print and flush immediately."""
    print(msg, flush=True)


def load_resume_state():
    """Load today's already-synced tickers from state file."""
    if not STATE_PATH.exists():
        return set()
    try:
        state = json.loads(STATE_PATH.read_text())
        if state.get('date') == datetime.now().strftime('%Y-%m-%d'):
            return set(state.get('synced', []))
    except Exception:
        pass
    return set()


def save_resume_state(synced_tickers):
    """Save synced tickers for resume capability."""
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps({
        'date': datetime.now().strftime('%Y-%m-%d'),
        'synced': list(synced_tickers),
    }))


def build_formulas(tickers):
    """Build list of (row, label, formula, ticker, field, period, override) tuples.
    Pulls all 4 quarters + FY to detect FY-only fields."""
    formulas = []
    row = 1
    for ticker in tickers:
        bbg = BBG_TICKERS.get(ticker, f'{ticker} US Equity')
        probes = KPI_PROBES.get(ticker, [])
        for field, label in probes:
            for period in ALL_PERIODS:
                # Mean estimate
                formula = f'=BDP("{bbg}","{field}","BEST_FPERIOD_OVERRIDE","{period}")'
                formulas.append((row, f'{ticker} {label} {period}', formula, ticker, field, period, 'MEAN'))
                row += 1
                # High
                formula_h = f'=BDP("{bbg}","{field}","BEST_FPERIOD_OVERRIDE","{period}","BEST_DATA_VALUE_OVERRIDE","HIGH")'
                formulas.append((row, f'{ticker} {label} {period} HIGH', formula_h, ticker, field, period, 'HIGH'))
                row += 1
                # Low
                formula_l = f'=BDP("{bbg}","{field}","BEST_FPERIOD_OVERRIDE","{period}","BEST_DATA_VALUE_OVERRIDE","LOW")'
                formulas.append((row, f'{ticker} {label} {period} LOW', formula_l, ticker, field, period, 'LOW'))
                row += 1
                # Analyst count
                formula_n = f'=BDP("{bbg}","{field}","BEST_FPERIOD_OVERRIDE","{period}","BEST_DATA_VALUE_OVERRIDE","NUM_EST")'
                formulas.append((row, f'{ticker} {label} {period} #EST', formula_n, ticker, field, period, 'NUM_EST'))
                row += 1
    return formulas


def detect_fy_only(results):
    """Given results dict keyed by (ticker, field, period), detect FY-only fields.
    Returns a set of (ticker, field) tuples that are FY-only."""
    fy_only = set()

    # Group by (ticker, field)
    field_groups = {}
    for (ticker, field, period), data in results.items():
        key = (ticker, field)
        if key not in field_groups:
            field_groups[key] = {}
        field_groups[key][period] = data.get('value')

    for (ticker, field), period_values in field_groups.items():
        quarterly_vals = [period_values.get(p) for p in QUARTERLY_PERIODS
                         if period_values.get(p) is not None and period_values.get(p) > 0]
        if len(quarterly_vals) >= 2 and len(set(quarterly_vals)) == 1:
            # All quarterly values are identical -> FY-only
            fy_only.add((ticker, field))

    return fy_only


def run_excel_bridge(tickers, dry_run=False, timeout_sec=300, push=True):
    """Main entry: open Excel, inject formulas, wait, read back, push to API."""
    formulas = build_formulas(tickers)
    log(f"Total BDP formulas to inject: {len(formulas)}")
    log(f"Tickers: {', '.join(tickers)}")
    log(f"Periods: {', '.join(ALL_PERIODS)}")
    log("")

    if dry_run:
        for row, label, formula, *_ in formulas[:30]:
            log(f"  Row {row:4d}: {label:40s} {formula}")
        if len(formulas) > 30:
            log(f"  ... and {len(formulas) - 30} more")
        return []

    try:
        import win32com.client
    except ImportError:
        log("ERROR: pip install pywin32")
        sys.exit(2)

    # Try to connect to Excel
    log("Opening Excel...")
    try:
        xl = win32com.client.Dispatch('Excel.Application')
    except Exception as e:
        log(f"ERROR: Cannot connect to Excel: {e}")
        log("Make sure Bloomberg Terminal and Excel are running.")
        sys.exit(2)

    xl.Visible = True
    xl.DisplayAlerts = False

    try:
        wb = xl.Workbooks.Add()
    except Exception as e:
        log(f"ERROR: Cannot create workbook: {e}")
        log("Bloomberg Excel Add-in may not be loaded.")
        sys.exit(2)

    ws = wb.ActiveSheet
    ws.Name = 'BBG Bridge'

    # Inject all formulas
    log(f"Injecting {len(formulas)} BDP formulas...")
    for row, label, formula, *_ in formulas:
        ws.Cells(row, 1).Value = label
        ws.Cells(row, 2).Formula = formula

    xl.Calculate()
    log(f"Formulas injected. Waiting for Bloomberg to resolve (max {timeout_sec}s)...")

    # Poll until values appear
    start = time.time()
    last_pending = len(formulas)
    stable_count = 0

    while time.time() - start < timeout_sec:
        time.sleep(10)
        xl.Calculate()

        pending = 0
        resolved = 0
        errors = 0
        for row, label, formula, *_ in formulas:
            val = ws.Cells(row, 2).Value
            if val is None:
                pending += 1
            elif isinstance(val, str) and ('#N/A' in val or 'Requesting' in val):
                pending += 1
            elif isinstance(val, str) and '#' in val:
                errors += 1
            else:
                resolved += 1

        elapsed = int(time.time() - start)
        log(f"  {elapsed:3d}s: {resolved} resolved, {pending} pending, {errors} errors")

        if pending == 0:
            log("All formulas resolved!")
            break

        if pending == last_pending:
            stable_count += 1
            if stable_count >= 6:  # 60s with no progress
                log(f"No progress for 60s with {pending} still pending. Moving on.")
                break
        else:
            stable_count = 0
            last_pending = pending

    # Read values back
    log("\nReading values back...")
    results = {}  # key: (ticker, field, period) -> {value, high, low, num_est}
    for row, label, formula, ticker, field, period, override in formulas:
        val = ws.Cells(row, 2).Value
        if val is None or (isinstance(val, str) and '#' in val):
            continue
        try:
            val = float(val)
        except (ValueError, TypeError):
            continue

        key = (ticker, field, period)
        if key not in results:
            results[key] = {'ticker': ticker, 'field': field, 'period': period,
                           'value': None, 'high': None, 'low': None, 'analyst_count': None}

        if override == 'MEAN':
            results[key]['value'] = val
        elif override == 'HIGH':
            results[key]['high'] = val
        elif override == 'LOW':
            results[key]['low'] = val
        elif override == 'NUM_EST':
            results[key]['analyst_count'] = int(val) if val and val > 0 else None

    # Close workbook (keep Excel running for Bloomberg)
    wb.Close(SaveChanges=False)

    # Filter to valid results (must have mean value)
    valid_all = {k: v for k, v in results.items() if v['value'] is not None and v['value'] > 0}

    # Detect FY-only fields
    fy_only_fields = detect_fy_only(valid_all)
    if fy_only_fields:
        log(f"\nFY-only fields detected (quarterly = same value):")
        for ticker, field in sorted(fy_only_fields):
            log(f"  {ticker:10s} {field}")

    # Build final payload: skip quarterly rows for FY-only fields, keep FY row
    today = datetime.now().strftime('%Y-%m-%d')
    payload = []
    discovered_fields = {}  # ticker -> {field, metric, source}

    for (ticker, field, period), r in valid_all.items():
        if (ticker, field) in fy_only_fields:
            # FY-only: only keep the FY period row
            if period != FY_PERIOD:
                continue

        payload.append({
            'ticker': ticker,
            'bbg_ticker': BBG_TICKERS.get(ticker, ticker),
            'company': ticker,
            'period': period,
            'field': field,
            'value': r['value'],
            'high': r['high'],
            'low': r['low'],
            'analyst_count': r['analyst_count'],
            'snapshot_date': today,
        })

        # Track discovered fields
        if ticker not in discovered_fields or r['value'] > discovered_fields[ticker].get('_best_val', 0):
            label = next((lbl for f, lbl in KPI_PROBES.get(ticker, []) if f == field), field)
            discovered_fields[ticker] = {
                'field': field,
                'metric': label,
                'source': 'excel',
                '_best_val': r['value'],
            }

    log(f"\nValid KPI estimates: {len(payload)}")
    for r in payload:
        log(f"  {r['ticker']:10s} {r['field']:35s} {r['period']:8s} = {r['value']:>15,.0f}"
              f"  (low={r.get('low','?')} high={r.get('high','?')} #est={r.get('analyst_count','?')})")

    if not payload:
        log("\nNo valid KPI data retrieved. The Excel Add-in may not be connected.")
        log("Try: Open Bloomberg Terminal -> Excel -> type =BDP(\"TSLA US Equity\",\"PX_LAST\") manually")
        return []

    # Update kpi-field-map.json with newly discovered fields
    update_kpi_field_map(discovered_fields)

    # Push to D1
    if push and API_KEY:
        log(f"\nPushing {len(payload)} KPI records to D1...")
        push_to_d1(payload)
    elif not API_KEY:
        log("\nWARNING: No INGEST_API_KEY set, skipping D1 push")

    # Save to log
    log_results(payload, fy_only_fields)

    return payload


def update_kpi_field_map(discovered_fields):
    """Update kpi-field-map.json with newly discovered working fields."""
    if not discovered_fields:
        return

    try:
        if KPI_MAP_PATH.exists():
            kpi_data = json.loads(KPI_MAP_PATH.read_text())
        else:
            kpi_data = {
                'version': datetime.now().strftime('%Y-%m-%d'),
                'description': 'Bloomberg field names for operating KPI consensus estimates.',
                'found_via_api': {},
                'found_via_excel': {},
            }

        # Add/update found_via_excel section
        if 'found_via_excel' not in kpi_data:
            kpi_data['found_via_excel'] = {}

        for ticker, info in discovered_fields.items():
            # Don't overwrite API-discovered fields
            if ticker in kpi_data.get('found_via_api', {}):
                continue
            kpi_data['found_via_excel'][ticker] = {
                'field': info['field'],
                'metric': info['metric'],
                'source': 'excel',
            }
            # Remove from needs_manual if present
            if ticker in kpi_data.get('needs_manual_or_excel', {}):
                del kpi_data['needs_manual_or_excel'][ticker]

        kpi_data['version'] = datetime.now().strftime('%Y-%m-%d')
        KPI_MAP_PATH.write_text(json.dumps(kpi_data, indent=2))
        log(f"Updated {KPI_MAP_PATH} with {len(discovered_fields)} field(s)")
    except Exception as e:
        log(f"WARNING: Could not update kpi-field-map.json: {e}")


def push_to_d1(records):
    """Push records to D1 ingest API in batches."""
    try:
        import requests
    except ImportError:
        log("WARNING: requests not installed, skipping D1 push")
        return

    headers = {'Content-Type': 'application/json', 'X-API-Key': API_KEY}
    batch_size = 50
    total_pushed = 0

    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            resp = requests.post(INGEST_URL, headers=headers, json=batch, timeout=30)
            if resp.ok:
                result = resp.json()
                total_pushed += result.get('inserted', 0)
                log(f"  Batch {i // batch_size + 1}: {result.get('inserted', 0)} rows pushed")
            else:
                log(f"  Batch {i // batch_size + 1}: ERROR {resp.status_code} {resp.text[:200]}")
        except Exception as e:
            log(f"  Batch {i // batch_size + 1}: Network error - {str(e)[:60]}")
        time.sleep(0.1)

    log(f"\nD1 push complete: {total_pushed} KPI records.")


def log_results(payload, fy_only_fields):
    """Write structured JSON log for debugging and auditing."""
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        'timestamp': datetime.now().isoformat(),
        'records': len(payload),
        'fy_only_fields': [{'ticker': t, 'field': f} for t, f in sorted(fy_only_fields)],
        'tickers': sorted(set(r['ticker'] for r in payload)),
        'fields': sorted(set(r['field'] for r in payload)),
    }
    # Append to log
    with open(LOG_PATH, 'a') as f:
        f.write(json.dumps(entry) + '\n')


def main():
    parser = argparse.ArgumentParser(description='Bloomberg Excel Bridge for KPI data')
    parser.add_argument('--ticker', help='Single ticker to process')
    parser.add_argument('--resume', action='store_true', help='Skip tickers already synced today')
    parser.add_argument('--dry-run', action='store_true', help='Print formulas without running')
    parser.add_argument('--no-push', action='store_true', help='Skip D1 push')
    parser.add_argument('--timeout', type=int, default=300, help='Max wait time in seconds (default: 300)')
    args = parser.parse_args()

    if args.ticker:
        tickers = [args.ticker.upper()]
    else:
        tickers = list(KPI_PROBES.keys())

    # Resume: skip tickers already done today
    if args.resume:
        already_done = load_resume_state()
        before = len(tickers)
        tickers = [t for t in tickers if t not in already_done]
        if before != len(tickers):
            log(f"Resume: skipping {before - len(tickers)} already-synced tickers")

    if not tickers:
        log("Nothing to sync (all tickers already done today).")
        return

    log("=" * 60)
    log("Bloomberg Excel Bridge")
    log("=" * 60)
    log(f"  Date:     {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    log(f"  Tickers:  {len(tickers)}")
    log(f"  Periods:  {', '.join(ALL_PERIODS)}")
    log(f"  Timeout:  {args.timeout}s")
    log(f"  D1 push:  {'yes' if not args.no_push and API_KEY else 'no'}")
    log("")

    results = run_excel_bridge(tickers, dry_run=args.dry_run,
                               timeout_sec=args.timeout,
                               push=not args.no_push)

    # Update resume state
    if results and not args.dry_run:
        synced = load_resume_state()
        synced.update(r['ticker'] for r in results)
        save_resume_state(synced)

    # Exit code
    if not results and not args.dry_run:
        sys.exit(1)


if __name__ == '__main__':
    main()
