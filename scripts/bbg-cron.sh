#!/bin/bash
# Bloomberg Auto-Sync Cron Job
# =============================
# Runs on the Bloomberg terminal machine. Exports consensus data,
# pushes to the Cloudflare Worker KV store, and optionally rebuilds the site.
#
# Setup (run once):
#   1. Clone the repo on the Bloomberg machine
#   2. pip install blpapi pdblp pandas requests
#   3. Set env vars in ~/.bbg-sync-env (see below)
#   4. Add to crontab:
#      # Run at 6:30 AM HKT every weekday (catches overnight consensus revisions)
#      30 6 * * 1-5 /path/to/repo/scripts/bbg-cron.sh >> /tmp/bbg-sync.log 2>&1
#      # Run again at 6:30 PM HKT (catches intraday revisions after US market hours)
#      30 18 * * 1-5 /path/to/repo/scripts/bbg-cron.sh >> /tmp/bbg-sync.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load env vars
ENV_FILE="$HOME/.bbg-sync-env"
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

# Required env vars:
#   CF_ACCOUNT_ID    — Cloudflare account ID
#   CF_API_TOKEN     — Cloudflare API token (needs Workers KV write permission)
#   CF_KV_NAMESPACE  — KV namespace ID (the CACHE namespace from wrangler.worker.jsonc)
#   ADMIN_SECRET     — consensusmarket.com admin secret (for the /consensus-update endpoint)

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — Bloomberg sync starting"

cd "$REPO_DIR"

# Step 1: Export from Bloomberg
echo "  Exporting from Bloomberg..."
python3 scripts/bloomberg-export.py --output-dir data/bloomberg 2>&1 | sed 's/^/    /'

# Check if export succeeded
if [ ! -f "data/bloomberg/consensus.json" ]; then
  echo "  ERROR: Bloomberg export failed. No consensus.json found."
  exit 1
fi

# Step 1b: Append today's snapshot to the consensus database
echo "  Appending to consensus database..."
python3 scripts/bbg-snapshot-append.py 2>&1 | sed 's/^/    /'

# Step 2: Sync to markets.json
echo "  Syncing to markets.json..."
node scripts/sync-bloomberg-data.mjs 2>&1 | sed 's/^/    /'

# Step 3: Push consensus data directly to Cloudflare KV
# This makes the data available immediately without a full site rebuild
if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ACCOUNT_ID:-}" ] && [ -n "${CF_KV_NAMESPACE:-}" ]; then
  echo "  Pushing to Cloudflare KV..."

  # Push consensus.json
  curl -s -X PUT \
    "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE}/values/bbg:consensus" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary @data/bloomberg/consensus.json \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print('    KV consensus:', 'OK' if r.get('success') else r.get('errors','FAIL'))"

  # Push actuals.json
  if [ -f "data/bloomberg/actuals.json" ]; then
    curl -s -X PUT \
      "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE}/values/bbg:actuals" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data-binary @data/bloomberg/actuals.json \
      | python3 -c "import sys,json; r=json.load(sys.stdin); print('    KV actuals:', 'OK' if r.get('success') else r.get('errors','FAIL'))"
  fi

  # Push earnings dates
  if [ -f "data/bloomberg/earnings-dates.json" ]; then
    curl -s -X PUT \
      "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE}/values/bbg:earnings-dates" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data-binary @data/bloomberg/earnings-dates.json \
      | python3 -c "import sys,json; r=json.load(sys.stdin); print('    KV earnings:', 'OK' if r.get('success') else r.get('errors','FAIL'))"
  fi

  # Push revisions
  if [ -f "data/bloomberg/revisions.json" ]; then
    curl -s -X PUT \
      "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE}/values/bbg:revisions" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data-binary @data/bloomberg/revisions.json \
      | python3 -c "import sys,json; r=json.load(sys.stdin); print('    KV revisions:', 'OK' if r.get('success') else r.get('errors','FAIL'))"
  fi

  echo "  KV push complete."
else
  echo "  SKIP: No Cloudflare credentials set. Data saved locally only."
  echo "  Set CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE in ~/.bbg-sync-env"
fi

# Step 4: Git commit the updated data (optional — keeps repo in sync)
if git diff --quiet data/markets.json data/bloomberg/ 2>/dev/null; then
  echo "  No data changes to commit."
else
  echo "  Committing data update..."
  git add data/markets.json data/bloomberg/
  git commit -m "data: Bloomberg consensus sync $(date -u +%Y-%m-%d)" --no-verify 2>&1 | sed 's/^/    /'
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) — Bloomberg sync complete"
