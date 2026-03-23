import { spawnSync } from "node:child_process";

const required = ["CF_CHAIN_ID", "CF_MARKET_ADDRESS", "CF_ORACLE_ADDRESS"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const entries = [
  ["CHAIN_ID", process.env.CF_CHAIN_ID],
  ["MARKET_ADDRESS", process.env.CF_MARKET_ADDRESS],
  ["ORACLE_ADDRESS", process.env.CF_ORACLE_ADDRESS],
];

if (process.env.CF_REGISTRY_ADDRESS) {
  entries.push(["REGISTRY_ADDRESS", process.env.CF_REGISTRY_ADDRESS]);
}

if (process.env.CF_OPERATOR_ADDRESS) {
  entries.push(["OPERATOR_ADDRESS", process.env.CF_OPERATOR_ADDRESS]);
}

if (process.env.CF_RPC_URL) {
  entries.push(["RPC_URL", process.env.CF_RPC_URL]);
}

if (process.env.CF_RPC_URLS) {
  entries.push(["RPC_URLS", process.env.CF_RPC_URLS]);
}

for (const [key, value] of entries) {
  console.log(`Setting ${key}...`);
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "put", key, "--config", "wrangler.worker.jsonc"],
    {
      input: String(value),
      stdio: ["pipe", "inherit", "inherit"],
      encoding: "utf8",
    }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to set ${key}.`);
  }
}

console.log("Worker runtime vars updated.");
