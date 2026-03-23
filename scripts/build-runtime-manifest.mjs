import fs from "node:fs";
import path from "node:path";

const outputPath = process.env.RUNTIME_MANIFEST_PATH || path.resolve(process.cwd(), "config", "runtime-manifest.json");
const demoAddressesPath = process.env.RUNTIME_ADDRESSES_PATH || path.resolve(process.cwd(), "demo-live-addresses.json");

const demo = JSON.parse(fs.readFileSync(demoAddressesPath, "utf8"));
const rpcUrls = String(process.env.RUNTIME_RPC_URLS || process.env.RUNTIME_RPC_URL || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const manifest = {
  generatedAt: new Date().toISOString(),
  chainId: Number(process.env.RUNTIME_CHAIN_ID || demo.chainId),
  marketAddress: process.env.RUNTIME_MARKET_ADDRESS || demo.marketAddress,
  oracleAddress: process.env.RUNTIME_ORACLE_ADDRESS || demo.oracleAddress,
  registryAddress: process.env.RUNTIME_REGISTRY_ADDRESS || demo.registryAddress,
  operatorAddress: process.env.RUNTIME_OPERATOR_ADDRESS || demo.deployer,
  rpcUrls,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote runtime manifest to ${outputPath}`);
