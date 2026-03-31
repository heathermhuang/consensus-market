#!/usr/bin/env python3
"""
Bloomberg BQL Backfill — 12 Quarters KPI + Financial Consensus + Actuals
==========================================================================
Uses BQL via Excel COM to pull quarterly estimates and actuals.

BQL fields:
  KPI: NUMBER_OF_VEHICLES_SOLD, MONTHLY_ACTIVE_USERS, etc. (actual units)
  Financial: IS_COMP_SALES, EBITDA (actual USD, not millions)

Uses FPO relative offsets from current quarter (Q1 2026):
  FPO=0Q = Q1 2026, FPO=-1Q = Q4 2025, FPO=-8Q = Q1 2024, FPO=3Q = Q4 2026

Usage:
  python scripts/bbg-bql-backfill.py                    # all tickers
  python scripts/bbg-bql-backfill.py --ticker TSLA
  python scripts/bbg-bql-backfill.py --kpi-only          # just KPI fields
  python scripts/bbg-bql-backfill.py --dry-run
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

ENV_PATH = Path(".env")
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())

INGEST_URL = os.environ.get('INGEST_URL', 'https://consensusmarket.com/api/ingest')
ACTUALS_URL = INGEST_URL + '/actuals' if INGEST_URL.endswith('/ingest') else INGEST_URL.rstrip('/') + '/actuals'
API_KEY = os.environ.get('INGEST_API_KEY', '')

# KPI fields (confirmed working via BQL)
KPI_TICKERS = {
    'TSLA': {'bbg': 'TSLA US Equity', 'field': 'NUMBER_OF_VEHICLES_SOLD', 'metric': 'Vehicle Deliveries'},
    'UBER': {'bbg': 'UBER US Equity', 'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'MAPC'},
    'SPOT': {'bbg': 'SPOT US Equity', 'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'MAU'},
    'META': {'bbg': 'META US Equity', 'field': 'DAILY_ACTIVE_USERS', 'metric': 'Family DAP'},
    'PINS': {'bbg': 'PINS US Equity', 'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'MAU'},
    'SNAP': {'bbg': 'SNAP US Equity', 'field': 'DAILY_ACTIVE_USERS', 'metric': 'DAU'},
    'RBLX': {'bbg': 'RBLX US Equity', 'field': 'DAILY_ACTIVE_USERS', 'metric': 'DAU'},
    'COIN': {'bbg': 'COIN US Equity', 'field': 'MONTHLY_ACTIVE_USERS', 'metric': 'MTU'},
}

# Financial fields use IS_COMP_SALES and EBITDA via BQL (not BEST_SALES)
FIN_FIELDS = [
    ('IS_COMP_SALES', 'BEST_SALES', 'Revenue'),
    ('EBITDA', 'BEST_EBITDA', 'EBITDA'),
]

# Load priority universe for all 86 tickers
UNIVERSE_PATH = Path('data/priority-universe.json')

# 12 quarters: Q1 2024 -> Q4 2026
# Current = Q1 2026 = offset 0
BASE_YEAR, BASE_Q = 2026, 1
OFFSETS = []
LABELS = []
for y in range(2024, 2027):
    for q in range(1, 5):
        offset = (y - BASE_YEAR) * 4 + (q - BASE_Q)
        OFFSETS.append(offset)
        LABELS.append(f"{q}Q{y}")


def log(msg):
    print(msg, flush=True)


def load_universe():
    """Load all tickers from priority-universe.json."""
    if not UNIVERSE_PATH.exists():
        return {}
    data = json.loads(UNIVERSE_PATH.read_text())
    tickers = {}
    items = data if isinstance(data, list) else data.get('companies', data.get('tickers', []))
    for item in items:
        t = item.get('ticker', '')
        bbg = item.get('bbg', '')
        if t and bbg:
            tickers[t] = {'bbg': bbg, 'name': item.get('name', t)}
    return tickers


def build_formulas(kpi_tickers, fin_tickers, kpi_only=False):
    """Build all BQL formulas."""
    formulas = []
    row = 2

    # KPI estimates + actuals
    for ticker, m in kpi_tickers.items():
        for offset, label in zip(OFFSETS, LABELS):
            # Estimate
            f = f'=BQL("{m["bbg"]}","{m["field"]}","FPT=Q","FPO={offset}Q","FA_ACT_EST_DATA=E","FS=MRC")'
            formulas.append((row, ticker, label, m['field'], 'estimate', f))
            row += 1
            # Actual (past quarters only)
            if offset < 0:
                f = f'=BQL("{m["bbg"]}","{m["field"]}","FPT=Q","FPO={offset}Q","FA_ACT_EST_DATA=A","FS=MRC")'
                formulas.append((row, ticker, label, m['field'], 'actual', f))
                row += 1

    if kpi_only:
        return formulas

    # Financial estimates + actuals for all tickers
    for ticker, info in fin_tickers.items():
        bbg = info['bbg']
        for bql_field, store_field, _ in FIN_FIELDS:
            for offset, label in zip(OFFSETS, LABELS):
                # Estimate
                f = f'=BQL("{bbg}","{bql_field}","FPT=Q","FPO={offset}Q","FA_ACT_EST_DATA=E","FS=MRC")'
                formulas.append((row, ticker, label, store_field, 'estimate', f))
                row += 1
                # Actual (past only)
                if offset < 0:
                    f = f'=BQL("{bbg}","{bql_field}","FPT=Q","FPO={offset}Q","FA_ACT_EST_DATA=A","FS=MRC")'
                    formulas.append((row, ticker, label, store_field, 'actual', f))
                    row += 1

    return formulas


def run_backfill(formulas, dry_run=False, push=True, timeout_sec=300):
    if dry_run:
        for row, ticker, period, field, dtype, formula in formulas[:30]:
            log(f"  {ticker:10s} {period:8s} {field:30s} {dtype:8s} {formula[:80]}")
        if len(formulas) > 30:
            log(f"  ... and {len(formulas) - 30} more")
        return

    try:
        import win32com.client
    except ImportError:
        log("ERROR: pip install pywin32")
        sys.exit(2)

    log("Connecting to Excel...")
    try:
        xl = win32com.client.GetActiveObject('Excel.Application')
    except Exception:
        xl = win32com.client.Dispatch('Excel.Application')
        xl.Visible = True
    xl.DisplayAlerts = False

    today = datetime.now().strftime('%Y-%m-%d')
    estimates = {}
    actuals = {}

    # Process in batches
    batch_size = 500
    for batch_start in range(0, len(formulas), batch_size):
        batch = formulas[batch_start:batch_start + batch_size]
        batch_num = batch_start // batch_size + 1
        total_batches = (len(formulas) + batch_size - 1) // batch_size
        log(f"\n--- Batch {batch_num}/{total_batches}: {len(batch)} formulas ---")

        wb = xl.Workbooks.Add()
        ws = wb.ActiveSheet

        for i, (row, ticker, period, field, dtype, formula) in enumerate(batch):
            ws.Cells(i + 2, 1).Value = f'{ticker} {period} {field} {dtype}'
            ws.Cells(i + 2, 2).Formula = formula

        xl.Calculate()
        start = time.time()
        last_pending = len(batch)
        stable = 0

        while time.time() - start < timeout_sec:
            time.sleep(10)
            xl.Calculate()
            pending = 0
            for i in range(len(batch)):
                v = ws.Cells(i + 2, 2).Value
                if v is None or (isinstance(v, str) and ('#N/A' in v or 'Requesting' in v or 'Calc' in v)):
                    pending += 1
            resolved = len(batch) - pending
            elapsed = int(time.time() - start)
            log(f"  {elapsed:3d}s: {resolved}/{len(batch)} resolved")

            if pending == 0:
                break
            if pending == last_pending:
                stable += 1
                if stable >= 6:
                    break
            else:
                stable = 0
                last_pending = pending

        # Read values
        for i, (row, ticker, period, field, dtype, formula) in enumerate(batch):
            val = ws.Cells(i + 2, 2).Value
            if val is None or (isinstance(val, str) and '#' in val):
                continue
            try:
                val = float(val)
            except (ValueError, TypeError):
                continue
            if val == 0:
                continue

            key = (ticker, period, field)
            if dtype == 'estimate':
                estimates[key] = val
            elif dtype == 'actual':
                actuals[key] = val

        wb.Close(SaveChanges=False)

    # Report
    log(f"\n{'='*60}")
    log(f"BACKFILL RESULTS: {len(estimates)} estimates, {len(actuals)} actuals")
    log(f"{'='*60}")

    # Group by ticker for display
    by_ticker = {}
    for (ticker, period, field), val in estimates.items():
        if ticker not in by_ticker:
            by_ticker[ticker] = {}
        if field not in by_ticker[ticker]:
            by_ticker[ticker][field] = {}
        by_ticker[ticker][field][period] = {'est': val}
    for (ticker, period, field), val in actuals.items():
        if ticker not in by_ticker:
            by_ticker[ticker] = {}
        if field not in by_ticker[ticker]:
            by_ticker[ticker][field] = {}
        if period not in by_ticker[ticker][field]:
            by_ticker[ticker][field][period] = {}
        by_ticker[ticker][field][period]['act'] = val

    # Show KPI tickers detail
    for ticker in sorted(set(by_ticker.keys()) & set(KPI_TICKERS.keys())):
        for field, periods in by_ticker[ticker].items():
            if field in ('BEST_SALES', 'BEST_EBITDA'):
                continue
            log(f"\n  {ticker} {field}:")
            for period in LABELS:
                d = periods.get(period, {})
                parts = []
                if 'est' in d:
                    parts.append(f"est={d['est']:>14,.0f}")
                if 'act' in d:
                    parts.append(f"act={d['act']:>14,.0f}")
                if 'est' in d and 'act' in d:
                    diff = (d['act'] - d['est']) / d['est'] * 100
                    parts.append(f"{'BEAT' if d['act']>d['est'] else 'MISS'} {diff:+.1f}%")
                if parts:
                    log(f"    {period:8s} {' | '.join(parts)}")

    # Build payloads
    consensus_payload = []
    actuals_payload = []

    all_tickers = {**KPI_TICKERS}
    universe = load_universe()
    for t, info in universe.items():
        if t not in all_tickers:
            all_tickers[t] = info

    for (ticker, period, field), val in estimates.items():
        m = all_tickers.get(ticker, {})
        # Financial fields from BQL are in actual USD; store as-is
        # But D1 already has BEST_SALES in millions from BDP — store BQL value with field name
        consensus_payload.append({
            'ticker': ticker,
            'bbg_ticker': m.get('bbg', ''),
            'company': ticker,
            'period': period,
            'field': field,
            'value': val,
            'high': None,
            'low': None,
            'analyst_count': None,
            'snapshot_date': today,
        })

    for (ticker, period, field), val in actuals.items():
        m = all_tickers.get(ticker, {})
        actuals_payload.append({
            'ticker': ticker,
            'bbg_ticker': m.get('bbg', ''),
            'company': ticker,
            'period': period,
            'field': field,
            'value': val,
            'source': 'Bloomberg BQL',
        })

    # Save
    outdir = Path('data/consensus-db')
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / 'bql-backfill-estimates.json').write_text(json.dumps(consensus_payload, indent=2, default=str))
    (outdir / 'bql-backfill-actuals.json').write_text(json.dumps(actuals_payload, indent=2, default=str))
    log(f"\nSaved to {outdir}/bql-backfill-*.json")

    # Push
    if push and API_KEY:
        if consensus_payload:
            log(f"\nPushing {len(consensus_payload)} consensus...")
            push_to_d1(consensus_payload, INGEST_URL, 'consensus')
        if actuals_payload:
            log(f"Pushing {len(actuals_payload)} actuals...")
            push_to_d1(actuals_payload, ACTUALS_URL, 'actuals')


def push_to_d1(records, url, label):
    try:
        import requests
    except ImportError:
        return
    headers = {'Content-Type': 'application/json', 'X-API-Key': API_KEY}
    total = 0
    for i in range(0, len(records), 50):
        batch = records[i:i + 50]
        try:
            resp = requests.post(url, headers=headers, json=batch, timeout=30)
            if resp.ok:
                r = resp.json()
                total += r.get('inserted', r.get('upserted', 0))
            else:
                log(f"  {label} batch {i//50+1}: HTTP {resp.status_code}")
        except Exception as e:
            log(f"  {label} batch {i//50+1}: {str(e)[:60]}")
        time.sleep(0.05)
    log(f"  D1 {label}: {total} rows")


def main():
    parser = argparse.ArgumentParser(description='BQL Backfill')
    parser.add_argument('--ticker', help='Single ticker')
    parser.add_argument('--kpi-only', action='store_true', help='Only KPI fields, skip financials')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--no-push', action='store_true')
    parser.add_argument('--timeout', type=int, default=300)
    args = parser.parse_args()

    universe = load_universe()
    kpi_tickers = dict(KPI_TICKERS)

    if args.ticker:
        t = args.ticker.upper()
        kpi_tickers = {t: KPI_TICKERS[t]} if t in KPI_TICKERS else {}
        universe = {t: universe[t]} if t in universe else {}

    fin_tickers = universe if not args.kpi_only else {}

    formulas = build_formulas(kpi_tickers, fin_tickers, kpi_only=args.kpi_only)

    log("=" * 60)
    log("Bloomberg BQL Backfill")
    log("=" * 60)
    log(f"  Date:     {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    log(f"  KPI:      {len(kpi_tickers)} tickers")
    log(f"  Financial:{len(fin_tickers)} tickers x {len(FIN_FIELDS)} fields")
    log(f"  Periods:  {LABELS[0]} - {LABELS[-1]} ({len(LABELS)} quarters)")
    log(f"  Formulas: {len(formulas)}")
    log("")

    run_backfill(formulas, dry_run=args.dry_run, push=not args.no_push, timeout_sec=args.timeout)


if __name__ == '__main__':
    main()
