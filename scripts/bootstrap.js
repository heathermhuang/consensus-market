import { network } from "hardhat";
import marketSeeds from "../data/markets.json" with { type: "json" };

const { ethers } = await network.connect();

async function main() {
  const [owner, oracleSigner, alice, bob] = await ethers.getSigners();

  const EligibilityRegistry = await ethers.getContractFactory("EligibilityRegistry");
  const registry = await EligibilityRegistry.deploy(owner.address);
  await registry.waitForDeployment();

  const KpiOracle = await ethers.getContractFactory("KpiOracle");
  const oracle = await KpiOracle.deploy(owner.address);
  await oracle.waitForDeployment();

  const KpiPredictionMarket = await ethers.getContractFactory("KpiPredictionMarket");
  const market = await KpiPredictionMarket.deploy(
    owner.address,
    await registry.getAddress(),
    await oracle.getAddress()
  );
  await market.waitForDeployment();

  await registry.setEligible(alice.address, true);
  await registry.setEligible(bob.address, true);

  await market.grantDemoCredits(alice.address, 2500);
  await market.grantDemoCredits(bob.address, 2500);

  await oracle.setReporter(oracleSigner.address, true);
  await oracle.setSigner(oracleSigner.address, true);

  const now = Math.floor(Date.now() / 1000);

  for (const seed of marketSeeds) {
    await market.createMarket(
      ethers.id(seed.idSeed),
      seed.ticker,
      seed.metricName,
      seed.consensusValue,
      seed.consensusSource,
      seed.resolutionPolicy,
      now + seed.openOffsetHours * 3600,
      now + seed.lockOffsetHours * 3600,
      now + seed.announcementOffsetHours * 3600
    );
  }

  const networkData = await ethers.provider.getNetwork();

  console.log("Bootstrap complete");
  console.log("");
  console.log(`Owner:         ${owner.address}`);
  console.log(`Oracle signer: ${oracleSigner.address}`);
  console.log(`Trader Alice:  ${alice.address}`);
  console.log(`Trader Bob:    ${bob.address}`);
  console.log("");
  console.log(`Registry: ${await registry.getAddress()}`);
  console.log(`Oracle:   ${await oracle.getAddress()}`);
  console.log(`Market:   ${await market.getAddress()}`);
  console.log("");
  console.log("Sample .env values:");
  console.log(`VITE_CHAIN_ID=${networkData.chainId.toString()}`);
  console.log(`VITE_MARKET_ADDRESS=${await market.getAddress()}`);
  console.log(`VITE_ORACLE_ADDRESS=${await oracle.getAddress()}`);
  console.log(`VITE_REGISTRY_ADDRESS=${await registry.getAddress()}`);
  console.log(`VITE_OPERATOR_ADDRESS=${owner.address}`);
  console.log("");
  console.log("Market IDs:");
  for (const seed of marketSeeds) {
    console.log(`${seed.slug}: ${ethers.id(seed.idSeed)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
