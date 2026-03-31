"""
BQNT Script: Per-Firm KPI Estimate Extraction
================================================
RUN THIS INSIDE BLOOMBERG TERMINAL:
  1. Type BQNT <GO> on the terminal
  2. Click "New Notebook" -> Python 3
  3. Paste this ENTIRE script into one cell
  4. Press Shift+Enter to run
  5. Output JSON will be saved to your desktop

This script extracts per-firm operating KPI estimates
that are NOT available via the Desktop API or Excel BQL.
"""

# Cell 1: Setup and query
import bql
import pandas as pd
import json
from datetime import datetime

bq = bql.Service()

# Tickers and their KPI fields
TICKERS = [
    ('TSLA US Equity', 'NUMBER_OF_VEHICLES_SOLD', 'TSLA', 'Vehicle Deliveries'),
    ('UBER US Equity', 'MONTHLY_ACTIVE_USERS', 'UBER', 'MAPC'),
    ('SPOT US Equity', 'MONTHLY_ACTIVE_USERS', 'SPOT', 'MAU'),
    ('META US Equity', 'DAILY_ACTIVE_USERS', 'META', 'Family DAP'),
    ('PINS US Equity', 'MONTHLY_ACTIVE_USERS', 'PINS', 'MAU'),
    ('SNAP US Equity', 'DAILY_ACTIVE_USERS', 'SNAP', 'DAU'),
    ('RBLX US Equity', 'DAILY_ACTIVE_USERS', 'RBLX', 'DAU'),
    ('COIN US Equity', 'MONTHLY_ACTIVE_USERS', 'COIN', 'MTU'),
]

all_results = []

for bbg, field, ticker, metric in TICKERS:
    print(f"\n{'='*50}")
    print(f"{ticker} - {metric} ({field})")
    print('='*50)

    # Approach 1: Try bql.Request with contributor grouping
    try:
        req = bql.Request(bbg, {
            'value': bq.data[field](
                fa_period_type='Q',
                fa_period_offset='1Q',
                fa_act_est_data='E'
            )
        })
        resp = bq.execute(req)
        df = resp[0].df()
        print(f"  Basic query: {df.to_dict()}")
    except Exception as e:
        print(f"  Basic query error: {e}")

    # Approach 2: Try with group by contributor
    for group_by in ['CONTRIBUTOR', 'BROKER', 'BROKER_NAME', 'ANALYST']:
        try:
            req = bql.Request(bbg, {
                'value': bq.func.group(
                    bq.data[field](
                        fa_period_type='Q',
                        fa_period_offset='1Q',
                        fa_act_est_data='E'
                    ),
                    group_by
                )
            })
            resp = bq.execute(req)
            df = resp[0].df()
            if not df.empty and len(df) > 1:
                print(f"  group({group_by}): SUCCESS - {len(df)} rows")
                print(df.head(5))
                for _, row in df.iterrows():
                    all_results.append({
                        'ticker': ticker,
                        'metric': metric,
                        'field': field,
                        'firm': str(row.get(group_by, row.get('GROUP', ''))),
                        'value': float(row.get('value', 0)),
                        'period': '1Q2026',
                    })
                break
            else:
                print(f"  group({group_by}): {len(df)} rows (not expanded)")
        except Exception as e:
            print(f"  group({group_by}): {e}")

    # Approach 3: Try unpack
    try:
        req = bql.Request(bbg, {
            'value': bq.func.unpack(
                bq.data[field](
                    fa_period_type='Q',
                    fa_period_offset='1Q',
                    fa_act_est_data='E'
                )
            )
        })
        resp = bq.execute(req)
        df = resp[0].df()
        if not df.empty and len(df) > 1:
            print(f"  unpack: SUCCESS - {len(df)} rows")
            print(df.head(5))
    except Exception as e:
        print(f"  unpack: {e}")

    # Approach 4: Try getting high/low/count directly
    try:
        req = bql.Request(bbg, {
            'mean': bq.data[field](fa_period_type='Q', fa_period_offset='1Q', fa_act_est_data='E'),
            'high': bq.func.max(bq.data[field](fa_period_type='Q', fa_period_offset='1Q', fa_act_est_data='E')),
            'low': bq.func.min(bq.data[field](fa_period_type='Q', fa_period_offset='1Q', fa_act_est_data='E')),
            'count': bq.func.count(bq.data[field](fa_period_type='Q', fa_period_offset='1Q', fa_act_est_data='E')),
        })
        resp = bq.execute(req)
        for item in resp:
            df = item.df()
            print(f"  stats: {df.to_dict()}")
    except Exception as e:
        print(f"  stats: {e}")

# Output
print(f"\n\n{'='*60}")
print(f"TOTAL RESULTS: {len(all_results)} per-firm estimates")
print('='*60)

if all_results:
    df = pd.DataFrame(all_results)
    print(df.to_string())

    # Save to file
    import os
    outpath = os.path.expanduser('~/Desktop/bqnt-per-firm-estimates.json')
    with open(outpath, 'w') as f:
        json.dump(all_results, f, indent=2)
    print(f"\nSaved to: {outpath}")

    # Also print as CSV for easy copy
    print("\n--- CSV FORMAT (copy this) ---")
    print("ticker,metric,firm,value,period")
    for r in all_results:
        print(f"{r['ticker']},{r['metric']},{r['firm']},{r['value']},{r['period']}")
else:
    print("\nNo per-firm data found.")
    print("\nTry exploring available BQL functions:")
    print("  print(dir(bq.data))")
    print("  print(dir(bq.func))")
    print("  help(bq.data.NUMBER_OF_VEHICLES_SOLD)")
