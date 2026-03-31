#!/usr/bin/env python3
"""
Bloomberg Analyst Firm Estimates Scraper
=========================================
Pulls per-firm analyst recommendations + target prices for all 24
prediction market tickers via BEST_ANALYST_RECS_BULK (BDS).

Pushes to: POST /api/ingest/analysts

Usage:
  python scripts/bbg-analyst-firms.py
  python scripts/bbg-analyst-firms.py --ticker TSLA
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime

INGEST_URL = os.environ.get('INGEST_URL', 'https://consensusmarket.com/api/ingest/analysts')
API_KEY = os.environ.get('INGEST_API_KEY', 'cmk_aa38bde0474bbafbb9cb1c35ce2c448ddfb147f8e197467c')

TICKERS = {
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ticker', help='Single ticker')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    import pdblp
    import pandas as pd
    import requests

    con = pdblp.BCon(debug=False, port=8194, timeout=30000)
    con.start()

    tickers = {args.ticker: TICKERS[args.ticker]} if args.ticker else TICKERS
    today = datetime.now().strftime('%Y-%m-%d')

    print("=" * 60)
    print("Bloomberg Analyst Firm Estimates")
    print("=" * 60)
    print(f"  Tickers: {len(tickers)}")
    print()

    all_analysts = []

    for ticker, bbg in tickers.items():
        try:
            data = con.bulkref(bbg, 'BEST_ANALYST_RECS_BULK')
        except Exception as e:
            print(f"  {ticker}: ERROR - {str(e)[:80]}")
            continue

        # Group by position
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

            # Skip invalid entries
            if not firm or firm == '':
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

        print(f"  {ticker:10s}: {count} analysts")
        time.sleep(0.2)

    con.stop()

    print(f"\nTotal analyst records: {len(all_analysts)}")

    if args.dry_run:
        # Print sample
        for a in all_analysts[:10]:
            print(f"  {a['ticker']:10s} {a['firm']:35s} {a['analyst']:25s} "
                  f"rec={a['recommendation']:20s} TP={a.get('target_price','?')}")
        return

    # Save locally
    outfile = 'data/consensus-db/analyst-firms.json'
    os.makedirs(os.path.dirname(outfile), exist_ok=True)
    with open(outfile, 'w') as f:
        json.dump(all_analysts, f, indent=2, default=str)
    print(f"Saved to {outfile}")

    # Push to API
    print(f"\nPushing to {INGEST_URL}...")
    headers = {'Content-Type': 'application/json', 'X-API-Key': API_KEY}
    batch_size = 100
    total = 0
    for i in range(0, len(all_analysts), batch_size):
        batch = all_analysts[i:i+batch_size]
        try:
            resp = requests.post(INGEST_URL, headers=headers, json=batch)
            if resp.ok:
                r = resp.json()
                total += r.get('inserted', len(batch))
                print(f"  Batch {i//batch_size+1}: {r.get('inserted', '?')} rows")
            else:
                print(f"  Batch {i//batch_size+1}: HTTP {resp.status_code} - saving locally only")
        except Exception as e:
            print(f"  Batch {i//batch_size+1}: Network error - {str(e)[:60]}")
        time.sleep(0.1)

    print(f"\nDone! {total} analyst records processed.")


if __name__ == '__main__':
    main()
