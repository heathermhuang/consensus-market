import { execSync } from "node:child_process";

const baseUrl = (process.env.VALIDATE_BASE_URL || "").trim().replace(/\/$/, "");
const legacyBaseUrl = (process.env.VALIDATE_LEGACY_BASE_URL || "https://capital.markets").trim().replace(/\/$/, "");

function run(command, label) {
  console.log(`\n== ${label} ==`);
  execSync(command, {
    stdio: "inherit",
    shell: "/bin/bash",
    cwd: process.cwd(),
  });
}

async function fetchJson(url, label) {
  console.log(`\n== ${label} ==`);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  const body = await response.text();
  console.log(body);
  return JSON.parse(body);
}

async function fetchHeaders(url, label) {
  console.log(`\n== ${label} ==`);
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
  });
  const headers = Array.from(response.headers.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  console.log(headers);
  return headers.toLowerCase();
}

async function fetchRedirectLocation(url, label) {
  console.log(`\n== ${label} ==`);
  const response = await fetch(url, {
    redirect: "manual",
  });
  const headers = Array.from(response.headers.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  console.log(headers);
  return response.headers.get("location") || "";
}

async function main() {
  run("npm run frontend:build", "Build frontend");
  run("npm test", "Run contract tests");
  run("npm audit --omit=dev", "Audit production dependencies");
  run("node scripts/prepare-worker-assets.mjs", "Prepare worker assets");

  if (baseUrl) {
    const rootHeaders = await fetchHeaders(baseUrl, "Check live root headers");
    if (!rootHeaders.includes("content-security-policy:")) {
      throw new Error("Missing Content-Security-Policy on live root response.");
    }

    const runtime = await fetchJson(`${baseUrl}/runtime-config.json`, "Check runtime config");
    if (!Number.isFinite(Number(runtime.chainId))) {
      throw new Error("Runtime config is missing a valid chainId.");
    }

    const status = await fetchJson(`${baseUrl}/status.json`, "Check live status");
    if (!status.ok) {
      throw new Error("status.json did not report ok=true.");
    }

    const catalog = await fetchJson(`${baseUrl}/catalog.json`, "Check market catalog");
    if (!Array.isArray(catalog.markets) || catalog.markets.length < 20) {
      throw new Error(`Catalog should expose at least 20 live markets (found ${catalog.markets?.length ?? 0}).`);
    }

    const newsHeaders = await fetchHeaders(`${baseUrl}/news.json?market=lyft-rides`, "Check live news headers");
    if (!newsHeaders.includes("content-security-policy:")) {
      throw new Error("Missing Content-Security-Policy on live news response.");
    }

    const legacyRedirect = await fetchRedirectLocation(
      `${legacyBaseUrl}/status.json`,
      "Check legacy host redirect"
    );
    if (!legacyRedirect.startsWith(`${baseUrl}/status.json`)) {
      throw new Error(`Legacy host did not redirect to ${baseUrl}/status.json.`);
    }
  }

  console.log("\nProduction validation passed.");
}

await main();
