/**
 * monitor-healthz.mjs
 *
 * Polls the Consensus Market Worker health endpoints and logs state transitions.
 * Sends a non-zero exit on persistent failure (useful in CI or cron).
 *
 * Usage:
 *   node scripts/monitor-healthz.mjs
 *   MONITOR_BASE_URL=https://consensusmarket.com MONITOR_INTERVAL=30 node scripts/monitor-healthz.mjs
 *
 * Env:
 *   MONITOR_BASE_URL      — Worker base URL (default: https://consensusmarket.com)
 *   MONITOR_INTERVAL      — Poll interval in seconds (default: 60)
 *   MONITOR_FAILURE_LIMIT — Consecutive failures before exit(1) (default: 3)
 *   MONITOR_ONCE          — If set to "1", run one check and exit (useful for cron)
 */

import process from "node:process";

const BASE_URL = process.env.MONITOR_BASE_URL || "https://consensusmarket.com";
const INTERVAL_MS = Number(process.env.MONITOR_INTERVAL || "60") * 1000;
const FAILURE_LIMIT = Number(process.env.MONITOR_FAILURE_LIMIT || "3");
const ONCE = process.env.MONITOR_ONCE === "1";

const ENDPOINTS = [
  { path: "/healthz",            name: "healthz",        parse: "text" },
  { path: "/status.json",        name: "status",         parse: "json" },
  { path: "/runtime-config.json", name: "runtime-config", parse: "json" },
];

let consecutiveFailures = 0;
let lastHealthState = null; // "healthy" | "degraded" | "down"

function ts() {
  return new Date().toISOString();
}

function log(level, message, data) {
  const entry = { ts: ts(), level, message };
  if (data !== undefined) entry.data = data;
  const line = JSON.stringify(entry);
  if (level === "ERROR" || level === "WARN") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

async function checkEndpoint({ path, name, parse }) {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ConsensusMarket-Monitor/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return { name, ok: false, status: res.status, latencyMs };
    }

    let body;
    try {
      body = parse === "json" ? await res.json() : await res.text();
    } catch {
      return { name, ok: false, status: res.status, latencyMs, error: "parse_error" };
    }

    return { name, ok: true, status: res.status, latencyMs, body };
  } catch (error) {
    return { name, ok: false, latencyMs: Date.now() - start, error: error.message };
  }
}

async function runCheck() {
  const results = await Promise.all(ENDPOINTS.map(checkEndpoint));
  const allOk = results.every((r) => r.ok);
  const anyDown = results.some((r) => !r.ok);

  // Determine health state
  const healthState = allOk ? "healthy" : anyDown && !allOk ? "degraded" : "down";

  // Log summary
  const summary = results.map((r) => ({
    endpoint: r.name,
    ok: r.ok,
    status: r.status,
    latencyMs: r.latencyMs,
    ...(r.error ? { error: r.error } : {}),
  }));

  if (healthState !== lastHealthState) {
    const level = healthState === "healthy" ? "INFO" : "ERROR";
    log(level, `Health state changed: ${lastHealthState ?? "initial"} → ${healthState}`, { summary });
    lastHealthState = healthState;
  } else if (healthState !== "healthy") {
    log("WARN", `Health check: ${healthState}`, { summary });
  } else {
    log("INFO", "Health check: ok", { summary });
  }

  // Specific checks on status.json
  const statusResult = results.find((r) => r.name === "status");
  if (statusResult?.ok && statusResult.body) {
    const s = statusResult.body;
    if (s.rpcHealthy === false) {
      log("WARN", "RPC is unhealthy according to /status.json", { rpcUrl: s.rpcUrl });
    }
    if (s.marketAddress && s.marketAddress === "0x0000000000000000000000000000000000000000") {
      log("WARN", "Market contract address is zero — runtime config may not be published");
    }
  }

  // Track consecutive failures
  if (!allOk) {
    consecutiveFailures++;
    log("ERROR", `Consecutive failure count: ${consecutiveFailures} / ${FAILURE_LIMIT}`);
    if (consecutiveFailures >= FAILURE_LIMIT) {
      log("ERROR", "FAILURE_LIMIT reached — exiting with code 1");
      process.exit(1);
    }
  } else {
    if (consecutiveFailures > 0) {
      log("INFO", `Recovered after ${consecutiveFailures} consecutive failures`);
    }
    consecutiveFailures = 0;
  }

  return allOk;
}

async function main() {
  log("INFO", "Monitor started", {
    baseUrl: BASE_URL,
    intervalSec: INTERVAL_MS / 1000,
    failureLimit: FAILURE_LIMIT,
    once: ONCE,
  });

  await runCheck();

  if (ONCE) {
    process.exit(consecutiveFailures > 0 ? 1 : 0);
  }

  setInterval(async () => {
    try {
      await runCheck();
    } catch (error) {
      log("ERROR", "Unexpected error in health check loop", { error: error.message });
    }
  }, INTERVAL_MS);
}

main().catch((error) => {
  log("ERROR", "Fatal monitor error", { error: error.message });
  process.exit(1);
});
