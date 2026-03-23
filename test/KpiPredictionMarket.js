import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();
const SECP256K1N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");

describe("KpiPredictionMarket", function () {
  async function deployFixture() {
    const [owner, reporter, alice, bob, charlie] = await ethers.getSigners();

    const EligibilityRegistry = await ethers.getContractFactory("EligibilityRegistry");
    const registry = await EligibilityRegistry.deploy(owner.address);
    await registry.waitForDeployment();

    const KpiOracle = await ethers.getContractFactory("KpiOracle");
    const oracle = await KpiOracle.deploy(owner.address);
    await oracle.waitForDeployment();

    await oracle.connect(owner).setReporter(reporter.address, true);
    await oracle.connect(owner).setSigner(reporter.address, true);

    const KpiPredictionMarket = await ethers.getContractFactory("KpiPredictionMarket");
    const market = await KpiPredictionMarket.deploy(owner.address, await registry.getAddress(), await oracle.getAddress());
    await market.waitForDeployment();

    const now = await ethers.provider.getBlock("latest");
    const opensAt = BigInt(now.timestamp - 5);
    const locksAt = BigInt(now.timestamp + 3600);
    const expectedAnnouncementAt = BigInt(now.timestamp + 7200);
    const marketId = ethers.id("TSLA_Q2_2026_DELIVERIES");

    await registry.connect(owner).setEligible(alice.address, true);
    await registry.connect(owner).setEligible(bob.address, true);

    await market.connect(owner).grantDemoCredits(alice.address, 1_000);
    await market.connect(owner).grantDemoCredits(bob.address, 1_000);

    await market.connect(owner).createMarket(
      marketId,
      "TSLA",
      "Vehicle deliveries",
      410_000,
      "Visible Alpha consensus as of lock time",
      "Use issuer press release or Form 8-K. If the company restates, first official release governs.",
      opensAt,
      locksAt,
      expectedAnnouncementAt
    );

    return { owner, reporter, alice, bob, charlie, registry, oracle, market, marketId };
  }

  it("settles a hit market and redistributes losing stakes to winners", async function () {
    const { reporter, alice, bob, market, oracle, marketId } = await deployFixture();

    await market.connect(alice).takePosition(marketId, 1, 600);
    await market.connect(bob).takePosition(marketId, 2, 400);

    const networkData = await ethers.provider.getNetwork();
    const oracleAddress = await oracle.getAddress();

    const payload = {
      marketId,
      actualValue: 425_000,
      sourceHash: ethers.id("tesla-q2-2026-release"),
      sourceUri: "https://ir.tesla.com",
      observedAt: 1_720_000_000,
      validAfter: 0,
      validBefore: 0,
      nonce: 1,
    };

    const signature = await reporter.signTypedData(
      {
        name: "PRED KPI Oracle",
        version: "1",
        chainId: networkData.chainId,
        verifyingContract: oracleAddress,
      },
      {
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
      },
      payload
    );

    await oracle.connect(alice).publishSignedResolution(payload, signature);

    await ethers.provider.send("evm_increaseTime", [3605]);
    await ethers.provider.send("evm_mine", []);

    await market.connect(alice).settleMarket(marketId);
    await market.connect(alice).claim(marketId);
    await market.connect(bob).claim(marketId);

    expect(await market.demoCredits(alice.address)).to.equal(1_400);
    expect(await market.demoCredits(bob.address)).to.equal(600);
  });

  it("blocks non-allowlisted traders", async function () {
    const { charlie, market, marketId } = await deployFixture();

    await expect(market.connect(charlie).takePosition(marketId, 1, 10)).to.be.revertedWithCustomError(
      market,
      "IneligibleTrader"
    );
  });

  it("refunds a cancelled market", async function () {
    const { owner, alice, market, marketId } = await deployFixture();

    await market.connect(alice).takePosition(marketId, 1, 500);
    await market.connect(owner).cancelMarket(marketId);
    await market.connect(alice).claim(marketId);

    expect(await market.demoCredits(alice.address)).to.equal(1_000);
  });

  it("rejects a signed resolution from an unauthorized signer", async function () {
    const { alice, charlie, oracle, marketId } = await deployFixture();

    const networkData = await ethers.provider.getNetwork();
    const payload = {
      marketId,
      actualValue: 390_000,
      sourceHash: ethers.id("bad-actor-payload"),
      sourceUri: "https://example.com/untrusted",
      observedAt: 1_720_000_000,
      validAfter: 0,
      validBefore: 0,
      nonce: 2,
    };

    const signature = await charlie.signTypedData(
      {
        name: "PRED KPI Oracle",
        version: "1",
        chainId: networkData.chainId,
        verifyingContract: await oracle.getAddress(),
      },
      {
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
      },
      payload
    );

    await expect(oracle.connect(alice).publishSignedResolution(payload, signature)).to.be.revertedWithCustomError(
      oracle,
      "NotAuthorizedSigner"
    );
  });

  it("does not allow markets to settle before the lock time and blocks new positions after settlement", async function () {
    const { reporter, alice, market, oracle, marketId } = await deployFixture();

    await market.connect(alice).takePosition(marketId, 1, 100);

    const networkData = await ethers.provider.getNetwork();
    const payload = {
      marketId,
      actualValue: 425_000,
      sourceHash: ethers.id("tesla-q2-2026-release"),
      sourceUri: "https://ir.tesla.com/q2-2026",
      observedAt: 1_720_000_000,
      validAfter: 0,
      validBefore: 0,
      nonce: 7,
    };

    const signature = await reporter.signTypedData(
      {
        name: "PRED KPI Oracle",
        version: "1",
        chainId: networkData.chainId,
        verifyingContract: await oracle.getAddress(),
      },
      {
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
      },
      payload
    );

    await oracle.connect(alice).publishSignedResolution(payload, signature);

    await expect(market.connect(alice).settleMarket(marketId)).to.be.revertedWithCustomError(
      market,
      "MarketStillOpen"
    );

    await ethers.provider.send("evm_increaseTime", [3605]);
    await ethers.provider.send("evm_mine", []);

    await market.connect(alice).settleMarket(marketId);

    await expect(market.connect(alice).takePosition(marketId, 1, 10)).to.be.revertedWithCustomError(
      market,
      "MarketAlreadySettled"
    );
  });

  describe("commit-reveal", function () {
    // Shared EIP-712 domain + type helpers
    async function makePayload(marketId, nonce = 42) {
      return {
        marketId,
        actualValue: 425_000,
        sourceHash: ethers.id("tesla-q2-2026-release"),
        sourceUri: "https://ir.tesla.com/q2-2026",
        observedAt: 1_720_000_000,
        validAfter: 0,
        validBefore: 0,
        nonce,
      };
    }

    const TYPES = {
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

    it("commit then reveal succeeds when digest matches", async function () {
      const { reporter, alice, oracle, marketId } = await deployFixture();

      const networkData = await ethers.provider.getNetwork();
      const oracleAddress = await oracle.getAddress();
      const domain = { name: "PRED KPI Oracle", version: "1", chainId: networkData.chainId, verifyingContract: oracleAddress };

      const payload = await makePayload(marketId, 50);
      const digest = await oracle.hashResolutionPayload(payload);

      // Signer pre-commits the digest before lock
      await oracle.connect(reporter).commitResolution(marketId, digest);
      expect(await oracle.resolutionCommits(marketId)).to.equal(digest);

      // Reveal: signed payload whose digest matches the commit
      const signature = await reporter.signTypedData(domain, TYPES, payload);
      await oracle.connect(alice).publishSignedResolution(payload, signature);

      const [resolved, actualValue] = await oracle.getResolution(marketId);
      expect(resolved).to.be.true;
      expect(actualValue).to.equal(425_000);
    });

    it("reverts CommitMismatch when payload digest differs from commit", async function () {
      const { reporter, alice, oracle, marketId } = await deployFixture();

      const networkData = await ethers.provider.getNetwork();
      const oracleAddress = await oracle.getAddress();
      const domain = { name: "PRED KPI Oracle", version: "1", chainId: networkData.chainId, verifyingContract: oracleAddress };

      // Commit a digest for one payload
      const committedPayload = await makePayload(marketId, 60);
      const committedDigest = await oracle.hashResolutionPayload(committedPayload);
      await oracle.connect(reporter).commitResolution(marketId, committedDigest);

      // Attempt to reveal a *different* payload (different actualValue)
      const differentPayload = { ...committedPayload, actualValue: 300_000, nonce: 61 };
      const signature = await reporter.signTypedData(domain, TYPES, differentPayload);

      await expect(oracle.connect(alice).publishSignedResolution(differentPayload, signature))
        .to.be.revertedWithCustomError(oracle, "CommitMismatch");
    });

    it("no commit → existing signed resolution flow is unaffected", async function () {
      const { reporter, alice, oracle, marketId } = await deployFixture();

      const networkData = await ethers.provider.getNetwork();
      const oracleAddress = await oracle.getAddress();
      const domain = { name: "PRED KPI Oracle", version: "1", chainId: networkData.chainId, verifyingContract: oracleAddress };

      // No commitResolution call — commit slot is zero
      expect(await oracle.resolutionCommits(marketId)).to.equal(ethers.ZeroHash);

      const payload = await makePayload(marketId, 70);
      const signature = await reporter.signTypedData(domain, TYPES, payload);

      // Should resolve normally without a prior commit
      await oracle.connect(alice).publishSignedResolution(payload, signature);
      const [resolved] = await oracle.getResolution(marketId);
      expect(resolved).to.be.true;
    });

    it("non-signer cannot commit", async function () {
      const { alice, oracle, marketId } = await deployFixture();

      const fakeDigest = ethers.id("arbitrary-digest");
      await expect(oracle.connect(alice).commitResolution(marketId, fakeDigest))
        .to.be.revertedWithCustomError(oracle, "NotAuthorizedSigner");
    });
  });

  it("rejects malleable high-s oracle signatures", async function () {
    const { alice, reporter, oracle, marketId } = await deployFixture();

    const networkData = await ethers.provider.getNetwork();
    const payload = {
      marketId,
      actualValue: 425_000,
      sourceHash: ethers.id("tesla-q2-2026-release"),
      sourceUri: "https://ir.tesla.com/q2-2026",
      observedAt: 1_720_000_000,
      validAfter: 0,
      validBefore: 0,
      nonce: 9,
    };

    const signature = await reporter.signTypedData(
      {
        name: "PRED KPI Oracle",
        version: "1",
        chainId: networkData.chainId,
        verifyingContract: await oracle.getAddress(),
      },
      {
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
      },
      payload
    );

    const parsed = ethers.Signature.from(signature);
    const flippedV = parsed.v === 27 ? 28 : 27;
    const malleableSignature = ethers.concat([
      parsed.r,
      ethers.toBeHex(SECP256K1N - BigInt(parsed.s), 32),
      ethers.toBeArray(flippedV),
    ]);

    await expect(oracle.connect(alice).publishSignedResolution(payload, malleableSignature)).to.be.revertedWithCustomError(
      oracle,
      "InvalidSignature"
    );
  });
});
