import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ethers } from "ethers";
import { marketAbi, oracleAbi, registryAbi } from "./lib/abis.js";
import { getRequiredEnv } from "./lib/env.js";

function usage() {
  console.log(`capital.markets operator CLI

Usage:
  npm run contracts:admin -- status [--account 0x...]
  npm run contracts:admin -- allowlist --account 0x... --eligible true
  npm run contracts:admin -- credits --account 0x... --amount 1000
  npm run contracts:admin -- reporter --account 0x... --authorized true
  npm run contracts:admin -- signer --account 0x... --authorized true
  npm run contracts:admin -- list-markets [--account 0x...]
  npm run contracts:admin -- create-market --seed tesla-deliveries
  npm run contracts:admin -- create-market --id-seed TSLA_Q3_2026_DELIVERIES --ticker TSLA --metric "Vehicle deliveries" --consensus-value 400000 --consensus-source "Visible Alpha" --resolution-policy "Use issuer press release" --opens-at 1774000000 --locks-at 1774086400 --announcement-at 1774090000
  npm run contracts:admin -- cancel-market --seed tesla-deliveries
  npm run contracts:admin -- take-position --seed tesla-deliveries --side hit --amount 100
  npm run contracts:admin -- settle-market --seed tesla-deliveries
  npm run contracts:admin -- claim --seed tesla-deliveries
  npm run contracts:admin -- resolve --seed tesla-deliveries --actual-value 425000 --source-label tesla-q2-release --source-uri https://ir.tesla.com

Required env:
  RPC_URL
  PRIVATE_KEY or OPERATOR_ACCOUNT
  MARKET_ADDRESS
  ORACLE_ADDRESS
  REGISTRY_ADDRESS
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const nextToken = rest[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      options[key] = "true";
      continue;
    }

    options[key] = nextToken;
    index += 1;
  }

  return { command, options };
}

function parseBoolean(value, label) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected ${label} to be true or false.`);
}

function parseBigInt(value, label) {
  if (!value) {
    throw new Error(`Missing required option: ${label}`);
  }
  return BigInt(value);
}

function loadSeeds() {
  const file = path.resolve(process.cwd(), "data", "markets.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveSeed(seedOrSlug) {
  if (!seedOrSlug) return null;
  return loadSeeds().find((seed) => seed.slug === seedOrSlug || seed.idSeed === seedOrSlug) || null;
}

function deriveWindow(seed) {
  const now = Math.floor(Date.now() / 1000);
  return {
    opensAt: now + seed.openOffsetHours * 3600,
    locksAt: now + seed.lockOffsetHours * 3600,
    announcementAt: now + seed.announcementOffsetHours * 3600,
  };
}

function resolveMarketArgs(options) {
  const seed = resolveSeed(options.seed);

  if (seed) {
    const window = deriveWindow(seed);
    return {
      idSeed: seed.idSeed,
      ticker: seed.ticker,
      metricName: seed.metricName,
      consensusValue: BigInt(seed.consensusValue),
      consensusSource: seed.consensusSource,
      resolutionPolicy: seed.resolutionPolicy,
      opensAt: BigInt(options["opens-at"] || window.opensAt),
      locksAt: BigInt(options["locks-at"] || window.locksAt),
      announcementAt: BigInt(options["announcement-at"] || window.announcementAt),
    };
  }

  return {
    idSeed: options["id-seed"],
    ticker: options.ticker,
    metricName: options.metric,
    consensusValue: parseBigInt(options["consensus-value"], "consensus-value"),
    consensusSource: options["consensus-source"],
    resolutionPolicy: options["resolution-policy"],
    opensAt: parseBigInt(options["opens-at"], "opens-at"),
    locksAt: parseBigInt(options["locks-at"], "locks-at"),
    announcementAt: parseBigInt(options["announcement-at"], "announcement-at"),
  };
}

function resolveMarketId(options) {
  const seed = resolveSeed(options.seed);
  return seed ? ethers.id(seed.idSeed) : options["market-id"];
}

function parseSide(value) {
  if (!value) throw new Error("Provide --side hit or --side miss");
  if (value === "hit") return 1;
  if (value === "miss") return 2;
  throw new Error("Expected --side to be hit or miss");
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  const provider = new ethers.JsonRpcProvider(getRequiredEnv("RPC_URL"));
  const signer = process.env.OPERATOR_ACCOUNT
    ? await provider.getSigner(process.env.OPERATOR_ACCOUNT)
    : new ethers.Wallet(getRequiredEnv("PRIVATE_KEY"), provider);
  const market = new ethers.Contract(getRequiredEnv("MARKET_ADDRESS"), marketAbi, signer);
  const oracle = new ethers.Contract(getRequiredEnv("ORACLE_ADDRESS"), oracleAbi, signer);
  const registry = new ethers.Contract(getRequiredEnv("REGISTRY_ADDRESS"), registryAbi, signer);

  if (command === "status") {
    const inspectAccount = options.account || signer.address;
    const [network, marketOwner, oracleOwner, registryOwner, credits, eligible, reporter, authSigner] =
      await Promise.all([
        provider.getNetwork(),
        market.owner(),
        oracle.owner(),
        registry.owner(),
        market.demoCredits(inspectAccount).catch(() => 0n),
        registry.isEligible(inspectAccount).catch(() => false),
        oracle.authorizedReporters(inspectAccount).catch(() => false),
        oracle.authorizedSigners(inspectAccount).catch(() => false),
      ]);

    console.log(
      JSON.stringify(
        {
          chainId: Number(network.chainId),
          signer: signer.address,
          inspectAccount,
          marketOwner,
          oracleOwner,
          registryOwner,
          credits: credits.toString(),
          eligible,
          reporter,
          signerAuthorized: authSigner,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "list-markets") {
    const inspectAccount = options.account || signer.address;
    const seeds = loadSeeds();
    const results = [];

    for (const seed of seeds) {
      const marketId = ethers.id(seed.idSeed);
      try {
        const [marketData, position, stake] = await Promise.all([
          market.getMarket(marketId),
          market.positions(marketId, inspectAccount),
          market.stakes(marketId, inspectAccount),
        ]);

        results.push({
          slug: seed.slug,
          marketId,
          ticker: marketData.companyTicker,
          metricName: marketData.metricName,
          exists: marketData.exists,
          cancelled: marketData.cancelled,
          settled: marketData.settled,
          hitPool: marketData.hitPool.toString(),
          missPool: marketData.missPool.toString(),
          position: Number(position),
          stake: stake.toString(),
        });
      } catch {
        results.push({
          slug: seed.slug,
          marketId,
          exists: false,
        });
      }
    }

    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (command === "allowlist") {
    const tx = await registry.setEligible(options.account, parseBoolean(options.eligible, "eligible"));
    await tx.wait();
    console.log(`Updated eligibility for ${options.account}`);
    return;
  }

  if (command === "credits") {
    const tx = await market.grantDemoCredits(options.account, parseBigInt(options.amount, "amount"));
    await tx.wait();
    console.log(`Granted demo credits to ${options.account}`);
    return;
  }

  if (command === "reporter") {
    const tx = await oracle.setReporter(options.account, parseBoolean(options.authorized, "authorized"));
    await tx.wait();
    console.log(`Updated reporter status for ${options.account}`);
    return;
  }

  if (command === "signer") {
    const tx = await oracle.setSigner(options.account, parseBoolean(options.authorized, "authorized"));
    await tx.wait();
    console.log(`Updated signer status for ${options.account}`);
    return;
  }

  if (command === "create-market") {
    const args = resolveMarketArgs(options);
    const tx = await market.createMarket(
      ethers.id(args.idSeed),
      args.ticker,
      args.metricName,
      args.consensusValue,
      args.consensusSource,
      args.resolutionPolicy,
      args.opensAt,
      args.locksAt,
      args.announcementAt
    );
    await tx.wait();
    console.log(`Created market ${args.ticker} · ${args.metricName}`);
    console.log(`marketId=${ethers.id(args.idSeed)}`);
    return;
  }

  if (command === "cancel-market") {
    const marketId = resolveMarketId(options);
    if (!marketId) {
      throw new Error("Provide --seed or --market-id");
    }

    const tx = await market.cancelMarket(marketId);
    await tx.wait();
    console.log(`Cancelled market ${marketId}`);
    return;
  }

  if (command === "take-position") {
    const marketId = resolveMarketId(options);
    if (!marketId) {
      throw new Error("Provide --seed or --market-id");
    }

    const tx = await market.takePosition(marketId, parseSide(options.side), parseBigInt(options.amount, "amount"));
    await tx.wait();
    console.log(`Placed position on ${marketId}`);
    return;
  }

  if (command === "settle-market") {
    const marketId = resolveMarketId(options);
    if (!marketId) {
      throw new Error("Provide --seed or --market-id");
    }

    const tx = await market.settleMarket(marketId);
    await tx.wait();
    console.log(`Settled market ${marketId}`);
    return;
  }

  if (command === "claim") {
    const marketId = resolveMarketId(options);
    if (!marketId) {
      throw new Error("Provide --seed or --market-id");
    }

    const tx = await market.claim(marketId);
    const receipt = await tx.wait();
    console.log(`Claimed payout for ${marketId} in tx ${receipt.hash}`);
    return;
  }

  if (command === "resolve") {
    const marketId = resolveMarketId(options);
    if (!marketId) {
      throw new Error("Provide --seed or --market-id");
    }

    const actualValue = parseBigInt(options["actual-value"], "actual-value");
    const sourceLabel = options["source-label"] || "manual-resolution";
    const sourceUri = options["source-uri"] || "";
    const tx = await oracle.publishResolution(marketId, actualValue, ethers.id(sourceLabel), sourceUri);
    await tx.wait();
    console.log(`Published direct oracle resolution for ${marketId}`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
