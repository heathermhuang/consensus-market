import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ethers } from "ethers";

const marketEvents = [
  "event DemoCreditsGranted(address indexed trader, uint256 amount)",
  "event MarketCreated(bytes32 indexed marketId, string companyTicker, string metricName, int256 consensusValue, string consensusSource, uint64 opensAt, uint64 locksAt, uint64 expectedAnnouncementAt)",
  "event MarketCancelled(bytes32 indexed marketId)",
  "event PositionTaken(bytes32 indexed marketId, address indexed trader, uint8 side, uint256 amount)",
  "event MarketSettled(bytes32 indexed marketId, bool outcomeHit, int256 actualValue)",
  "event Claimed(bytes32 indexed marketId, address indexed trader, uint256 payout)",
];

const oracleEvents = [
  "event ReporterUpdated(address indexed reporter, bool authorized)",
  "event SignerUpdated(address indexed signer, bool authorized)",
  "event MarketResolved(bytes32 indexed marketId, int256 actualValue, bytes32 indexed sourceHash, string sourceUri, uint64 resolvedAt)",
  "event SignedResolutionAccepted(bytes32 indexed marketId, address indexed signer, bytes32 indexed attestationDigest)",
];

const registryEvents = [
  "event EligibilityUpdated(address indexed account, bool isEligibleForMarkets)",
];

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function summarizeEvent(eventName, args) {
  if (eventName === "PositionTaken") {
    return `${args.trader} took ${Number(args.side) === 1 ? "Beat" : "Miss"} for ${args.amount.toString()} demo credits`;
  }
  if (eventName === "MarketCreated") {
    return `${args.companyTicker} ${args.metricName} created at consensus ${args.consensusValue.toString()}`;
  }
  if (eventName === "MarketSettled") {
    return `${args.outcomeHit ? "Beat" : "Miss"} settled at actual ${args.actualValue.toString()}`;
  }
  if (eventName === "Claimed") {
    return `${args.trader} claimed ${args.payout.toString()} demo credits`;
  }
  if (eventName === "EligibilityUpdated") {
    return `${args.account} eligibility set to ${args.isEligibleForMarkets}`;
  }
  if (eventName === "ReporterUpdated") {
    return `${args.reporter} reporter status set to ${args.authorized}`;
  }
  if (eventName === "SignerUpdated") {
    return `${args.signer} signer status set to ${args.authorized}`;
  }
  if (eventName === "MarketResolved") {
    return `Oracle resolved ${args.marketId} at ${args.actualValue.toString()}`;
  }
  if (eventName === "SignedResolutionAccepted") {
    return `${args.signer} signed attestation for ${args.marketId}`;
  }
  if (eventName === "DemoCreditsGranted") {
    return `${args.trader} received ${args.amount.toString()} demo credits`;
  }
  if (eventName === "MarketCancelled") {
    return `Cancelled market ${args.marketId}`;
  }
  return eventName;
}

async function indexContract(provider, address, abi, eventNames, contractName, fromBlock) {
  const contract = new ethers.Contract(address, abi, provider);
  const events = [];

  for (const eventName of eventNames) {
    const logs = await contract.queryFilter(eventName, fromBlock);

    for (const log of logs) {
      const block = await provider.getBlock(log.blockNumber);
      events.push({
        contract: contractName,
        eventName: log.fragment.name,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.index,
        timestamp: block?.timestamp || null,
        timestampLabel: block?.timestamp
          ? new Date(Number(block.timestamp) * 1000).toISOString()
          : "",
        summary: summarizeEvent(log.fragment.name, log.args),
        args: Object.fromEntries(
          Object.entries(log.args).filter(([key]) => Number.isNaN(Number(key))).map(([key, value]) => [
            key,
            typeof value === "bigint" ? value.toString() : value,
          ])
        ),
      });
    }
  }

  return events;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(getRequiredEnv("RPC_URL"));
  const fromBlock = Number(process.env.EVENTS_FROM_BLOCK || 0);
  const outputPath = process.env.EVENTS_OUTPUT_PATH || path.resolve(process.cwd(), "public", "activity.json");

  const [marketEventsIndexed, oracleEventsIndexed, registryEventsIndexed] = await Promise.all([
    indexContract(provider, getRequiredEnv("MARKET_ADDRESS"), marketEvents, ["DemoCreditsGranted", "MarketCreated", "MarketCancelled", "PositionTaken", "MarketSettled", "Claimed"], "market", fromBlock),
    indexContract(provider, getRequiredEnv("ORACLE_ADDRESS"), oracleEvents, ["ReporterUpdated", "SignerUpdated", "MarketResolved", "SignedResolutionAccepted"], "oracle", fromBlock),
    indexContract(provider, getRequiredEnv("REGISTRY_ADDRESS"), registryEvents, ["EligibilityUpdated"], "registry", fromBlock),
  ]);

  const events = [...marketEventsIndexed, ...oracleEventsIndexed, ...registryEventsIndexed].sort(
    (left, right) => right.blockNumber - left.blockNumber || right.logIndex - left.logIndex
  );

  const report = {
    generatedAt: new Date().toISOString(),
    fromBlock,
    count: events.length,
    events,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote indexed event report to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
