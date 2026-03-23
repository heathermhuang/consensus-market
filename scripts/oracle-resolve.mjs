/**
 * oracle-resolve.mjs
 *
 * Automated oracle resolution pipeline:
 *   1. Fetch the issuer source document
 *   2. Compute keccak256 hash of the raw content for auditability
 *   3. Build an EIP-712 signed attestation payload
 *   4. Sign it with the oracle signer key
 *   5. Publish on-chain via publishSignedResolution
 *
 * Usage:
 *   RPC_URL=... PRIVATE_KEY=... ORACLE_ADDRESS=0x... \
 *   node scripts/oracle-resolve.mjs \
 *     --seed tesla-deliveries \
 *     --actual-value 425000 \
 *     --source-url https://ir.tesla.com/news-releases/... \
 *     [--dry-run]
 *
 * Or with a manual source label (when you've already fetched and archived):
 *   --source-label tesla-q2-2026-press-release \
 *   --source-url https://ir.tesla.com/...
 *
 * Env:
 *   RPC_URL          — JSON-RPC endpoint
 *   PRIVATE_KEY      — signer private key (authorized in KpiOracle)
 *   ORACLE_ADDRESS   — deployed KpiOracle contract address
 *   CHAIN_ID         — optional, defaults to eth_chainId from RPC
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ethers } from "ethers";

const oracleAbi = [
  "function authorizedSigners(address) view returns (bool)",
  "function getResolution(bytes32 marketId) view returns (bool resolved, int256 actualValue, uint64 resolvedAt, uint64 observedAt, bytes32 sourceHash, bytes32 attestationDigest, address signer, string sourceUri)",
  "function hashResolutionPayload((bytes32 marketId,int256 actualValue,bytes32 sourceHash,string sourceUri,uint64 observedAt,uint64 validAfter,uint64 validBefore,uint256 nonce) payload) view returns (bytes32)",
  "function publishSignedResolution((bytes32 marketId,int256 actualValue,bytes32 sourceHash,string sourceUri,uint64 observedAt,uint64 validAfter,uint64 validBefore,uint256 nonce) payload, bytes signature) returns (address signer, bytes32 digest)",
];

const resolutionTypes = {
  ResolutionPayload: [
    { name: "marketId", type: "bytes32" },
    { name: "actualValue", type: "int256" },
    { name: "sourceHash", type: "bytes32" },
    { name: "sourceUri", type: "string" },
    { name: "observedAt", type: "uint64" },
    { name: "validAfter", type: "uint64" },
    { name: "validBefore", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function fetchAndHashSource(sourceUrl) {
  console.log(`Fetching source document: ${sourceUrl}`);
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "ConsensusMarketOracle/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Source fetch failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  const byteLength = Buffer.byteLength(body, "utf8");
  const hash = ethers.keccak256(ethers.toUtf8Bytes(body));

  console.log(`  Document: ${byteLength} bytes`);
  console.log(`  keccak256: ${hash}`);

  return { body, hash };
}

function loadMarketSeeds() {
  const seedPath = path.resolve(process.cwd(), "data/markets.json");
  return JSON.parse(fs.readFileSync(seedPath, "utf8"));
}

function buildMarketId(idSeed) {
  return ethers.id(idSeed);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const help = args.help || args.h;
  if (help) {
    console.log(`oracle-resolve.mjs — automated EIP-712 oracle resolution

Usage:
  RPC_URL=... PRIVATE_KEY=... ORACLE_ADDRESS=0x... \\
  node scripts/oracle-resolve.mjs \\
    --seed tesla-deliveries \\
    --actual-value 425000 \\
    --source-url https://ir.tesla.com/news-releases/...

Options:
  --seed <slug>          Market slug from data/markets.json
  --id-seed <ID_SEED>    Market id seed (alternative to --seed)
  --actual-value <n>     Reported KPI value (integer)
  --source-url <url>     URL of official issuer document (will be fetched and hashed)
  --source-label <str>   Human label for source (default: derived from URL)
  --dry-run              Build and sign the payload but do not publish on-chain
  --nonce <n>            EIP-712 nonce (default: 1)
  --valid-window <secs>  Seconds the attestation stays valid (default: 86400)
`);
    process.exit(0);
  }

  // Validate required env
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const oracleAddress = process.env.ORACLE_ADDRESS;

  if (!rpcUrl) throw new Error("RPC_URL env var is required");
  if (!privateKey) throw new Error("PRIVATE_KEY env var is required");
  if (!oracleAddress) throw new Error("ORACLE_ADDRESS env var is required");

  if (!args.actualValue) throw new Error("--actual-value is required");
  if (!args.sourceUrl) throw new Error("--source-url is required");
  if (!args.seed && !args.idSeed) throw new Error("--seed or --id-seed is required");

  // Resolve market id
  let marketId;
  if (args.idSeed) {
    marketId = buildMarketId(args.idSeed);
  } else {
    const seeds = loadMarketSeeds();
    const seed = seeds.find((s) => s.slug === args.seed);
    if (!seed) throw new Error(`Market seed not found: ${args.seed}`);
    marketId = buildMarketId(seed.idSeed);
    console.log(`Market: ${seed.ticker} · ${seed.metricName} (${seed.idSeed})`);
  }

  // Fetch and hash source
  const { hash: sourceHash } = await fetchAndHashSource(args.sourceUrl);
  const sourceLabel = args.sourceLabel || new URL(args.sourceUrl).hostname;

  // Connect
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const network = await provider.getNetwork();
  const chainId = Number(process.env.CHAIN_ID || network.chainId);

  console.log(`Chain: ${chainId}`);
  console.log(`Signer: ${signer.address}`);

  // Verify signer is authorized
  const oracle = new ethers.Contract(oracleAddress, oracleAbi, signer);
  const isAuthorized = await oracle.authorizedSigners(signer.address);
  if (!isAuthorized) {
    throw new Error(`${signer.address} is not an authorized signer in KpiOracle`);
  }

  // Check for existing resolution
  const existing = await oracle.getResolution(marketId);
  if (existing.resolved) {
    console.warn(`WARNING: Market already has a resolution (actualValue=${existing.actualValue}, signer=${existing.signer})`);
    if (!args.force) {
      throw new Error("Market is already resolved. Use --force to override.");
    }
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validWindow = BigInt(args.validWindow || "86400");
  const nonce = BigInt(args.nonce || "1");

  const payload = {
    marketId,
    actualValue: BigInt(args.actualValue),
    sourceHash,
    sourceUri: args.sourceUrl,
    observedAt: now,
    validAfter: 0n,
    validBefore: now + validWindow,
    nonce,
  };

  const domain = {
    name: "PRED KPI Oracle",
    version: "1",
    chainId,
    verifyingContract: oracleAddress,
  };

  console.log(`\nPayload:`);
  console.log(`  marketId:    ${payload.marketId}`);
  console.log(`  actualValue: ${payload.actualValue}`);
  console.log(`  sourceHash:  ${payload.sourceHash}`);
  console.log(`  sourceUri:   ${payload.sourceUri}`);
  console.log(`  observedAt:  ${payload.observedAt}`);
  console.log(`  validBefore: ${payload.validBefore}`);
  console.log(`  nonce:       ${payload.nonce}`);

  // Sign
  const signature = await signer.signTypedData(domain, resolutionTypes, payload);
  console.log(`\nSignature: ${signature.slice(0, 20)}...`);

  // Verify digest matches on-chain hash
  const expectedDigest = await oracle.hashResolutionPayload(payload);
  console.log(`Expected digest: ${expectedDigest}`);

  if (args.dryRun) {
    console.log("\nDry run — payload signed but not published.");
    console.log("Set PRIVATE_KEY and remove --dry-run to publish on-chain.");

    // Write payload to artifacts for reference
    const artifactPath = path.resolve(process.cwd(), `artifacts/oracle-payload-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify({
      marketId,
      actualValue: String(payload.actualValue),
      sourceHash,
      sourceUri: args.sourceUrl,
      sourceLabel,
      observedAt: String(payload.observedAt),
      validAfter: String(payload.validAfter),
      validBefore: String(payload.validBefore),
      nonce: String(payload.nonce),
      signature,
      expectedDigest,
      chainId,
      oracleAddress,
      signerAddress: signer.address,
      createdAt: new Date().toISOString(),
    }, null, 2));
    console.log(`Payload written to: ${artifactPath}`);
    return;
  }

  // Publish
  console.log("\nPublishing signed resolution on-chain...");
  const tx = await oracle.publishSignedResolution(payload, signature);
  console.log(`Transaction: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`\nResolution published successfully.`);
  console.log(`  Market:       ${marketId}`);
  console.log(`  Actual value: ${payload.actualValue}`);
  console.log(`  Source:       ${sourceLabel} (${args.sourceUrl})`);
  console.log(`  Signer:       ${signer.address}`);
  console.log(`  Block:        ${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  process.exit(1);
});
