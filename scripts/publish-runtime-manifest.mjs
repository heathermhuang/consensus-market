import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const manifestPath =
  process.env.RUNTIME_MANIFEST_PATH || path.resolve(process.cwd(), "config", "runtime-manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const env = {
  ...process.env,
  CF_CHAIN_ID: String(manifest.chainId),
  CF_MARKET_ADDRESS: manifest.marketAddress,
  CF_ORACLE_ADDRESS: manifest.oracleAddress,
  CF_REGISTRY_ADDRESS: manifest.registryAddress,
  CF_OPERATOR_ADDRESS: manifest.operatorAddress || "",
  CF_RPC_URL: manifest.rpcUrls?.[0] || "",
  CF_RPC_URLS: Array.isArray(manifest.rpcUrls) ? manifest.rpcUrls.join(",") : "",
};

execFileSync("node", ["scripts/set-worker-runtime-vars.mjs"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

console.log(`Published runtime manifest from ${manifestPath}`);
