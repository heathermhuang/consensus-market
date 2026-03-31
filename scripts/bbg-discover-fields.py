#!/usr/bin/env python3
"""
Bloomberg Field Discovery
==========================
Auto-probes each ticker to find which BEst fields actually return data.
Replaces 1-2 hours of manual terminal lookup with a 15-minute script.

For each company in priority-universe.json:
  1. Probes all known BEst field patterns
  2. Reports which fields return real data vs. which are dead
  3. Suggests the correct field name if our guess was wrong
  4. Updates priority-universe.json with verified fields

Usage:
  python scripts/bbg-discover-fields.py                    # probe all 120 companies
  python scripts/bbg-discover-fields.py --ticker TSLA      # probe one company
  python scripts/bbg-discover-fields.py --dry-run          # show what would be probed
  python scripts/bbg-discover-fields.py --apply            # auto-update priority-universe.json
  python scripts/bbg-discover-fields.py --export           # export field map as CSV

Hit budget: ~120 companies × ~50 field probes × 1 hit = ~6,000 hits (1.2% of daily limit)
Time: ~15 minutes
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
except ImportError:
    print("ERROR: pip install blpapi pdblp pandas")
    sys.exit(1)

PRIORITY_FILE = Path("data/priority-universe.json")
FIELD_MAP_FILE = Path("data/consensus-db/field-map.json")

# ── Every known Bloomberg BEst field pattern to probe ──────────────────────────
# These cover financials + operating KPIs across all sectors.
# Bloomberg assigns company-specific field names, so we probe broadly.

PROBE_FIELDS = [
    # ── Standard financials (available for almost every covered company) ──
    "BEST_SALES",
    "BEST_EPS",
    "BEST_EBITDA",
    "BEST_NET_INCOME",
    "BEST_OPER_INCOME",
    "BEST_GROSS_PROFIT",
    "BEST_GROSS_MARGIN",
    "BEST_OPER_MARGIN",
    "BEST_NET_MARGIN",
    "BEST_FCF",
    "BEST_CAPEX",
    "BEST_DIV",
    "BEST_ROE",
    "BEST_ROA",
    "BEST_BPS",
    "BEST_CPS",

    # ── User / engagement metrics ──
    "BEST_EST_MAU",
    "BEST_EST_DAU",
    "BEST_EST_DAUQ",
    "BEST_EST_DAP",
    "BEST_EST_MTU",
    "BEST_EST_MAPC",
    "BEST_EST_MAPCS",
    "BEST_EST_ACTIVE_USERS",
    "BEST_EST_MONTHLY_ACTIVE_USERS",
    "BEST_EST_DAILY_ACTIVE_USERS",
    "BEST_EST_ACTIVE_ACCOUNTS",
    "BEST_EST_ACTIVE_CUSTOMERS",
    "BEST_EST_ACTIVE_BUYERS",
    "BEST_EST_UNIQUE_ACTIVE_BUYERS",
    "BEST_EST_ACTIVE_RIDERS",
    "BEST_EST_ANNUAL_ACTIVE_CONSUMERS",

    # ── Subscriber metrics ──
    "BEST_EST_SUBSCRIBERS",
    "BEST_EST_PAID_SUBSCRIBERS",
    "BEST_EST_PREMIUM_SUBSCRIBERS",
    "BEST_EST_DTC_SUBSCRIBERS",
    "BEST_EST_STREAMING_SUBSCRIBERS",
    "BEST_EST_PAYERS",
    "BEST_EST_PAYING_USERS",
    "BEST_EST_TOTAL_PAYERS",

    # ── Transaction / order volume ──
    "BEST_EST_TRIPS",
    "BEST_EST_RIDES",
    "BEST_EST_TOTAL_ORDERS",
    "BEST_EST_GROSS_ORDERS",
    "BEST_EST_ORDERS",
    "BEST_EST_MARKETPLACE_ORDERS",
    "BEST_EST_TRANSACTIONS",
    "BEST_EST_TOTAL_TRANSACTIONS",

    # ── Accommodation / travel ──
    "BEST_EST_ROOM_NIGHTS",
    "BEST_EST_NIGHTS_BOOKED",
    "BEST_EST_NIGHTS_AND_EXPERIENCES_BOOKED",
    "BEST_EST_GROSS_BOOKINGS",
    "BEST_EST_TOTAL_BOOKINGS",

    # ── Hardware / shipments ──
    "BEST_EST_VEHICLE_DELIVERIES",
    "BEST_EST_DELIVERIES",
    "BEST_EST_TOTAL_DELIVERIES",
    "BEST_EST_SMARTPHONE_SHIPMENTS",
    "BEST_EST_UNIT_SHIPMENTS",
    "BEST_EST_UNITS_SHIPPED",
    "BEST_EST_INSTALLED_BASE",
    "BEST_EST_PROCEDURES",

    # ── GMV / bookings value ──
    "BEST_EST_GMV",
    "BEST_EST_GROSS_MERCHANDISE_VOLUME",
    "BEST_EST_GMS",
    "BEST_EST_MARKETPLACE_GOV",
    "BEST_EST_GOV",
    "BEST_EST_GTV",
    "BEST_EST_TPV",
    "BEST_EST_TOTAL_PAYMENT_VOLUME",
    "BEST_EST_GPV",

    # ── Revenue segments ──
    "BEST_EST_AD_REVENUE",
    "BEST_EST_ADVERTISING_REVENUE",
    "BEST_EST_SUBSCRIPTION_REVENUE",
    "BEST_EST_SERVICES_REVENUE",
    "BEST_EST_CLOUD_REVENUE",
    "BEST_EST_DTC_REVENUE",
    "BEST_EST_ECOMMERCE_REVENUE",
    "BEST_EST_MOBILITY_REVENUE",
    "BEST_EST_DELIVERY_REVENUE",
    "BEST_EST_AUTO_REVENUE",
    "BEST_EST_ENERGY_REVENUE",
    "BEST_EST_IPHONE_REVENUE",
    "BEST_EST_GAMES_REVENUE",
    "BEST_EST_GAMING_REVENUE",
    "BEST_EST_RL_REVENUE",
    "BEST_EST_SEARCH_REVENUE",
    "BEST_EST_YOUTUBE_REVENUE",

    # ── SaaS / recurring ──
    "BEST_EST_ARR",
    "BEST_EST_MRR",
    "BEST_EST_NRR",
    "BEST_EST_NET_RETENTION_RATE",
    "BEST_EST_CRPO",
    "BEST_EST_RPO",
    "BEST_EST_CUSTOMERS",
    "BEST_EST_CUSTOMERS_GT_100K",
    "BEST_EST_CUSTOMERS_GT_100K_ARR",

    # ── Engagement ──
    "BEST_EST_HOURS_ENGAGED",
    "BEST_EST_STREAMING_HOURS",
    "BEST_EST_ENGAGEMENT_HOURS",
    "BEST_EST_ARPU",
    "BEST_EST_ARM",
    "BEST_EST_ARPAC",

    # ── Store / location counts ──
    "BEST_EST_STORE_COUNT",
    "BEST_EST_TOTAL_STORES",
    "BEST_EST_SAME_STORE_SALES",
    "BEST_EST_SSS",
    "BEST_EST_COMP_SALES",

    # ── Messaging platform ──
    "BEST_EST_WECHAT_MAU",
    "BEST_EST_WEIXIN_MAU",

    # ── Trading ──
    "BEST_EST_TRADING_VOLUME",
    "BEST_EST_MTU",

    # ── Other ──
    "BEST_EST_NET_BOOKINGS",
    "BEST_EST_PRODUCT_REVENUE",
    "BEST_EST_PLATFORM_REVENUE",
    "BEST_EST_DATA_CENTER_REVENUE",
    "BEST_EST_GOVERNMENT_REVENUE",
    "BEST_EST_COMMERCIAL_REVENUE",
    "BEST_EST_COMMERCIAL_CUSTOMERS",
]


def connect():
    try:
        con = pdblp.BCon(debug=False, port=8194, timeout=15000)
        con.start()
        return con
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


def probe_ticker(con, bbg_ticker, target_period="2Q2026"):
    """Probe all fields for a ticker. Returns dict of field → value for fields that work."""
    found = {}
    overrides = [("BEST_FPERIOD_OVERRIDE", target_period)]

    # Batch probe: test fields in groups of 10 to reduce API calls
    # Bloomberg ref() can handle multiple fields in one call
    batch_size = 10
    for i in range(0, len(PROBE_FIELDS), batch_size):
        batch = PROBE_FIELDS[i:i + batch_size]
        try:
            data = con.ref(bbg_ticker, batch, overrides)
            for _, row in data.iterrows():
                field = row.get("field")
                value = row.get("value")
                if field and pd.notna(value) and value != 0 and value != "":
                    found[field] = float(value) if isinstance(value, (int, float)) else str(value)
        except Exception:
            # If batch fails, try individual fields
            for field in batch:
                try:
                    data = con.ref(bbg_ticker, [field], overrides)
                    if not data.empty and pd.notna(data.iloc[0]["value"]):
                        val = data.iloc[0]["value"]
                        if val != 0 and val != "":
                            found[field] = float(val) if isinstance(val, (int, float)) else str(val)
                except Exception:
                    pass
                time.sleep(0.02)

        time.sleep(0.05)

    return found


def format_value(value):
    """Format a number for display."""
    if isinstance(value, str):
        return value
    v = abs(value)
    if v >= 1e12:
        return f"{value/1e12:.2f}T"
    if v >= 1e9:
        return f"{value/1e9:.2f}B"
    if v >= 1e6:
        return f"{value/1e6:.1f}M"
    if v >= 1e3:
        return f"{value/1e3:.1f}K"
    return f"{value:.2f}"


def categorize_field(field):
    """Categorize a field for display."""
    if field in ("BEST_SALES", "BEST_EPS", "BEST_EBITDA", "BEST_NET_INCOME",
                 "BEST_OPER_INCOME", "BEST_GROSS_PROFIT", "BEST_FCF", "BEST_CAPEX",
                 "BEST_DIV", "BEST_BPS", "BEST_CPS"):
        return "Financial"
    if field in ("BEST_GROSS_MARGIN", "BEST_OPER_MARGIN", "BEST_NET_MARGIN",
                 "BEST_ROE", "BEST_ROA"):
        return "Margin/Ratio"
    if "REVENUE" in field:
        return "Revenue Segment"
    if any(k in field for k in ("MAU", "DAU", "MTU", "MAPC", "ACTIVE", "SUBSCRIBER",
                                 "PAYER", "BUYER", "RIDER", "USER", "CUSTOMER", "DAP")):
        return "User/Engagement"
    if any(k in field for k in ("ORDER", "TRIP", "RIDE", "TRANSACTION", "ROOM_NIGHT",
                                 "NIGHT", "DELIVERY", "SHIPMENT", "PROCEDURE", "UNIT")):
        return "Volume/Transaction"
    if any(k in field for k in ("GMV", "GMS", "GOV", "GTV", "TPV", "GPV", "BOOKING")):
        return "GMV/Bookings"
    if any(k in field for k in ("ARR", "MRR", "NRR", "RPO", "CRPO")):
        return "SaaS/Recurring"
    if any(k in field for k in ("ARPU", "ARM", "ARPAC")):
        return "ARPU"
    if any(k in field for k in ("STORE", "SSS", "COMP_SALES")):
        return "Retail"
    return "Other"


def main():
    parser = argparse.ArgumentParser(description="Bloomberg Field Discovery")
    parser.add_argument("--ticker", help="Probe only this ticker")
    parser.add_argument("--period", default="2Q2026", help="Target period (default: 2Q2026)")
    parser.add_argument("--dry-run", action="store_true", help="Show plan only")
    parser.add_argument("--apply", action="store_true", help="Update priority-universe.json with verified fields")
    parser.add_argument("--export", action="store_true", help="Export field map as CSV to stdout")
    args = parser.parse_args()

    if not PRIORITY_FILE.exists():
        print("ERROR: data/priority-universe.json not found.")
        sys.exit(1)

    raw = json.loads(PRIORITY_FILE.read_text())
    companies = [c for c in raw["companies"] if "ticker" in c]

    if args.ticker:
        companies = [c for c in companies
                     if c["bbg"].startswith(args.ticker.upper()) or c["name"].upper().startswith(args.ticker.upper())]
        if not companies:
            print(f"ERROR: '{args.ticker}' not found.")
            sys.exit(1)

    est_hits = len(companies) * len(PROBE_FIELDS) // 10  # Batched in groups of 10
    print(f"Field Discovery Plan:")
    print(f"  Companies:  {len(companies)}")
    print(f"  Fields:     {len(PROBE_FIELDS)} to probe per company")
    print(f"  Est. hits:  ~{est_hits:,} ({est_hits/5000:.0f}% of daily limit)")
    print(f"  Est. time:  ~{len(companies) * 0.12:.0f} minutes")
    print(f"  Period:     {args.period}")
    print()

    if args.dry_run:
        for c in companies:
            print(f"  {c['bbg']:22s} {c['name']:22s} guessed: {', '.join(c.get('metrics', []))}")
        return

    print("Connecting to Bloomberg...")
    con = connect()
    print("Connected.\n")

    field_map = {}
    all_results = []
    start = time.time()

    for i, company in enumerate(companies):
        bbg = company["bbg"]
        name = company["name"]
        guessed_metrics = company.get("metrics", [])

        found = probe_ticker(con, bbg, args.period)

        # Categorize findings
        financials = {k: v for k, v in found.items() if categorize_field(k) == "Financial"}
        margins = {k: v for k, v in found.items() if categorize_field(k) == "Margin/Ratio"}
        kpis = {k: v for k, v in found.items() if categorize_field(k) not in ("Financial", "Margin/Ratio")}

        # Print results
        kpi_str = ", ".join(f"{k.replace('BEST_EST_', '')}={format_value(v)}" for k, v in sorted(kpis.items()))
        fin_count = len(financials)
        print(f"[{i+1}/{len(companies)}] {name:22s} {fin_count} financials, {len(kpis)} KPIs: {kpi_str or '(none)'}")

        # Check which guessed metrics were wrong
        for metric in guessed_metrics:
            guessed_field = None
            if metric in ("Revenue", "EPS", "EBITDA", "Net income", "Gross margin", "Operating margin"):
                continue  # Financial fields, always work
            # Check if any found field matches what we guessed
            guessed_field = "BEST_EST_" + metric.upper().replace(" ", "_").replace(">", "GT_").replace("$", "")
            if guessed_field not in found:
                # Find closest match
                close = [k for k in kpis if any(word in k for word in metric.upper().split())]
                if close:
                    print(f"    WARN  '{metric}' -> guessed {guessed_field}, but found {close[0]}={format_value(found[close[0]])}")
                else:
                    print(f"    MISS  '{metric}' -> {guessed_field} returned nothing")

        field_map[bbg] = {
            "name": name,
            "ticker": company["ticker"],
            "financials": financials,
            "kpis": kpis,
            "margins": margins,
            "discoveredAt": datetime.utcnow().isoformat() + "Z",
        }

        all_results.append({
            "bbg": bbg, "name": name, "ticker": company["ticker"],
            "fields": found, "guessed": guessed_metrics,
        })

        time.sleep(0.3)

    elapsed = time.time() - start
    con.stop()

    # Save field map
    FIELD_MAP_FILE.parent.mkdir(parents=True, exist_ok=True)
    FIELD_MAP_FILE.write_text(json.dumps(field_map, indent=2, default=str))
    print(f"\nField map saved to {FIELD_MAP_FILE}")
    print(f"Discovery complete in {elapsed/60:.1f} minutes.\n")

    # Summary
    total_kpis = sum(len(v["kpis"]) for v in field_map.values())
    companies_with_kpis = sum(1 for v in field_map.values() if v["kpis"])
    print(f"Summary:")
    print(f"  Companies probed:       {len(field_map)}")
    print(f"  Companies with KPIs:    {companies_with_kpis}")
    print(f"  Total KPI fields found: {total_kpis}")
    print(f"  Avg KPIs per company:   {total_kpis / max(len(field_map), 1):.1f}")

    # Export CSV
    if args.export:
        print("\nticker,bbg,name,category,field,value")
        for bbg, info in field_map.items():
            for field, value in {**info["financials"], **info["kpis"], **info["margins"]}.items():
                cat = categorize_field(field)
                print(f"{info['ticker']},{bbg},{info['name']},{cat},{field},{value}")

    # Apply: update priority-universe.json with discovered fields
    if args.apply:
        updated = 0
        for company in raw["companies"]:
            if "ticker" not in company:
                continue
            bbg = company["bbg"]
            if bbg not in field_map:
                continue
            info = field_map[bbg]
            # Replace metrics with verified ones
            new_metrics = []
            # Always include financials
            for f in ("BEST_SALES", "BEST_EPS", "BEST_EBITDA"):
                if f in info["financials"]:
                    label = {"BEST_SALES": "Revenue", "BEST_EPS": "EPS", "BEST_EBITDA": "EBITDA"}[f]
                    new_metrics.append(label)
            # Add discovered KPIs
            for field, value in info["kpis"].items():
                label = field.replace("BEST_EST_", "").replace("_", " ").title()
                new_metrics.append(label)
            if new_metrics != company.get("metrics"):
                company["metrics"] = new_metrics
                updated += 1

        PRIORITY_FILE.write_text(json.dumps(raw, indent=2))
        print(f"\nUpdated {updated} companies in {PRIORITY_FILE}")


if __name__ == "__main__":
    main()
