import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ethers } from "ethers";

const marketAbi = [
  "function getMarket(bytes32 marketId) view returns ((bool exists,bool cancelled,bool settled,bool outcomeHit,bytes32 marketId,string companyTicker,string metricName,string consensusSource,string resolutionPolicy,int256 consensusValue,uint64 opensAt,uint64 locksAt,uint64 expectedAnnouncementAt,uint256 hitPool,uint256 missPool))",
  "function createMarket(bytes32 marketId, string companyTicker, string metricName, int256 consensusValue, string consensusSource, string resolutionPolicy, uint64 opensAt, uint64 locksAt, uint64 expectedAnnouncementAt)",
];

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(getRequiredEnv("RPC_URL"));
  const signer = process.env.OPERATOR_ACCOUNT
    ? await provider.getSigner(process.env.OPERATOR_ACCOUNT)
    : new ethers.Wallet(getRequiredEnv("PRIVATE_KEY"), provider);
  const market = new ethers.Contract(getRequiredEnv("MARKET_ADDRESS"), marketAbi, signer);
  const seeds = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "data", "markets.json"), "utf8"));
  const now = Math.floor(Date.now() / 1000);

  let created = 0;

  for (const seed of seeds) {
    const marketId = ethers.id(seed.idSeed);
    let exists = false;

    try {
      const marketData = await market.getMarket(marketId);
      exists = Boolean(marketData.exists);
    } catch {
      exists = false;
    }

    if (exists) {
      console.log(`skip ${seed.slug}`);
      continue;
    }

    const tx = await market.createMarket(
      marketId,
      seed.ticker,
      seed.metricName,
      BigInt(seed.consensusValue),
      seed.consensusSource,
      seed.resolutionPolicy,
      BigInt(now + seed.openOffsetHours * 3600),
      BigInt(now + seed.lockOffsetHours * 3600),
      BigInt(now + seed.announcementOffsetHours * 3600)
    );
    await tx.wait();
    created += 1;
    console.log(`created ${seed.slug} ${marketId}`);
  }

  console.log(`seed sync complete; created ${created} markets`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
