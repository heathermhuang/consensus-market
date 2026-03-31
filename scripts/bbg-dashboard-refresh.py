#!/usr/bin/env python3
"""
Regenerate the Bloomberg Pipeline Dashboard HTML from universe.db.
Usage: python scripts/bbg-dashboard-refresh.py
"""

import sqlite3
import json
import os
import sys
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_DIR, "data", "consensus-db", "universe.db")
TEMPLATE_PATH = os.path.join(PROJECT_DIR, "data", "consensus-db", "dashboard-template.html")
OUTPUT_PATH = os.path.join(PROJECT_DIR, "data", "consensus-db", "dashboard.html")
ENV_PATH = os.path.join(PROJECT_DIR, ".env")

def check_ingest_key():
    """Check if INGEST_API_KEY is set in .env"""
    if not os.path.exists(ENV_PATH):
        return False
    with open(ENV_PATH) as f:
        for line in f:
            if line.strip().startswith("INGEST_API_KEY="):
                val = line.strip().split("=", 1)[1].strip()
                return val != "" and val != "REPLACE_ME_WITH_REAL_KEY"
    return False

def check_scheduler():
    """Check if Windows Task Scheduler task exists"""
    try:
        import subprocess
        result = subprocess.run(
            ["schtasks", "/query", "/tn", "ConsensusMarket-BBG-Sync"],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False

def main():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        sys.exit(1)

    c = sqlite3.connect(DB_PATH)

    # Gather company data
    companies = []
    for r in c.execute("""
        SELECT t.ticker, t.name, t.bbg_ticker, t.country, t.sector, t.market_cap
        FROM tickers t ORDER BY t.ticker
    """).fetchall():
        ticker, name, bbg, country, sector, mcap = r

        sales = c.execute(
            'SELECT count(*) FROM consensus_snapshots WHERE bbg_ticker=? AND field="BEST_SALES"',
            (bbg,)
        ).fetchone()[0]

        ebitda = c.execute(
            'SELECT count(*) FROM consensus_snapshots WHERE bbg_ticker=? AND field="BEST_EBITDA"',
            (bbg,)
        ).fetchone()[0]

        periods = [p[0] for p in c.execute(
            'SELECT DISTINCT period FROM consensus_snapshots WHERE bbg_ticker=? ORDER BY period',
            (bbg,)
        ).fetchall()]

        latest = c.execute(
            'SELECT MAX(snapshot_date) FROM consensus_snapshots WHERE bbg_ticker=?',
            (bbg,)
        ).fetchone()[0]

        actuals_cnt = c.execute(
            'SELECT count(*) FROM actuals WHERE bbg_ticker=?',
            (bbg,)
        ).fetchone()[0]

        cal = c.execute(
            'SELECT next_earnings_date, confirmed FROM earnings_calendar WHERE bbg_ticker=?',
            (bbg,)
        ).fetchone()

        companies.append({
            "ticker": ticker, "name": name, "bbg": bbg,
            "country": country or "", "sector": sector or "", "mcap": mcap or 0,
            "sales_snapshots": sales, "ebitda_snapshots": ebitda,
            "periods": periods, "latest_snapshot": latest or "",
            "actuals_count": actuals_cnt,
            "earnings_date": cal[0] if cal else "",
            "earnings_confirmed": cal[1] if cal else ""
        })

    total_snapshots = c.execute("SELECT count(*) FROM consensus_snapshots").fetchone()[0]
    total_actuals = c.execute("SELECT count(*) FROM actuals").fetchone()[0]
    total_calendar = c.execute("SELECT count(*) FROM earnings_calendar").fetchone()[0]

    all_periods = [p[0] for p in c.execute(
        "SELECT DISTINCT period FROM consensus_snapshots ORDER BY period"
    ).fetchall()]

    has_historical = any(p.startswith(("1Q20", "2Q20", "3Q20", "4Q20")) and "2025" not in p
                         for p in all_periods)

    data = {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "summary": {
            "total_companies": len(companies),
            "total_snapshots": total_snapshots,
            "total_actuals": total_actuals,
            "total_calendar": total_calendar,
            "fields_discovered": 2,
            "kpi_fields": 0,
            "periods_covered": all_periods,
            "periods_missing": [p for p in ["1Q2026","2Q2026","3Q2026","4Q2026","FY2026","FY2027"]
                               if p not in all_periods],
            "historical_backfill": has_historical,
            "ingest_key_set": check_ingest_key(),
            "scheduler_active": check_scheduler()
        },
        "companies": companies
    }

    c.close()

    # Read template and inject data
    if os.path.exists(TEMPLATE_PATH):
        with open(TEMPLATE_PATH) as f:
            html = f.read()
    else:
        # Fallback: read existing dashboard and replace data
        with open(OUTPUT_PATH) as f:
            html = f.read()

    # Replace data placeholder or existing data
    import re
    html = re.sub(
        r'const DATA = .*?;',
        f'const DATA = {json.dumps(data)};',
        html,
        count=1,
        flags=re.DOTALL
    )

    with open(OUTPUT_PATH, "w") as f:
        f.write(html)

    print(f"Dashboard refreshed: {OUTPUT_PATH}")
    print(f"  Companies: {len(companies)}")
    print(f"  Snapshots: {total_snapshots}")
    print(f"  Actuals: {total_actuals}")
    print(f"  Calendar: {total_calendar}")
    print(f"  Periods: {all_periods}")
    print(f"  Ingest key: {'SET' if data['summary']['ingest_key_set'] else 'MISSING'}")
    print(f"  Scheduler: {'ACTIVE' if data['summary']['scheduler_active'] else 'INACTIVE'}")

if __name__ == "__main__":
    main()
