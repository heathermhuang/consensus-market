import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();
const SECP256K1N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");

describe("KpiPredictionMarket", function () {
  async function deployFixture({ usdt = false, feeBps = 0 } = {}) {
    const [owner, reporter, alice, bob, charlie] = await ethers.getSigners();

    const EligibilityRegistry = await ethers.getContractFactory("EligibilityRegistry");
    const registry = await EligibilityRegistry.deploy(owner.address);
    await registry.waitForDeployment();

    const KpiOracle = await ethers.getContractFactory("KpiOracle");
    const oracle = await KpiOracle.deploy(owner.address);
    await oracle.waitForDeployment();

    await oracle.connect(owner).setReporter(reporter.address, true);
    await oracle.connect(owner).setSigner(reporter.address, true);

    let mockToken = null;
    let tokenAddress = ethers.ZeroAddress;

    if (usdt) {
      const MockUSDT = await ethers.getContractFactory("MockUSDT");
      mockToken = await MockUSDT.deploy();
      await mockToken.waitForDeployment();
      tokenAddress = await mockToken.getAddress();
    }

    const KpiPredictionMarket = await ethers.getContractFactory("KpiPredictionMarket");
    const market = await KpiPredictionMarket.deploy(
      owner.address,
      await registry.getAddress(),
      await oracle.getAddress(),
      tokenAddress,
      feeBps
    );
    await market.waitForDeployment();

    const now = await ethers.provider.getBlock("latest");
    const opensAt = BigInt(now.timestamp - 5);
    const locksAt = BigInt(now.timestamp + 3600);
    const expectedAnnouncementAt = BigInt(now.timestamp + 7200);
    const marketId = ethers.id("TSLA_Q2_2026_DELIVERIES");

    await registry.connect(owner).setEligible(alice.address, true);
    await registry.connect(owner).setEligible(bob.address, true);

    if (usdt) {
      // Mint USDT to traders and approve
      await mockToken.mint(alice.address, 10_000);
      await mockToken.mint(bob.address, 10_000);
      await mockToken.connect(alice).approve(await market.getAddress(), ethers.MaxUint256);
      await mockToken.connect(bob).approve(await market.getAddress(), ethers.MaxUint256);
      // Deposit into market contract
      await market.connect(alice).deposit(1_000);
      await market.connect(bob).deposit(1_000);
      // Disable min position for unit tests (tested separately)
      await market.connect(owner).setMinPositionSize(0);
    } else {
      await market.connect(owner).grantDemoCredits(alice.address, 1_000);
      await market.connect(owner).grantDemoCredits(bob.address, 1_000);
    }

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

    return { owner, reporter, alice, bob, charlie, registry, oracle, market, marketId, mockToken };
  }

  // Helper: sign and publish oracle resolution
  async function resolveOracle(reporter, oracle, marketId, actualValue = 425_000, nonce = 1) {
    const networkData = await ethers.provider.getNetwork();
    const oracleAddress = await oracle.getAddress();

    const payload = {
      marketId,
      actualValue,
      sourceHash: ethers.id("tesla-q2-2026-release"),
      sourceUri: "https://ir.tesla.com",
      observedAt: 1_720_000_000,
      validAfter: 0,
      validBefore: 0,
      nonce,
    };

    const signature = await reporter.signTypedData(
      { name: "PRED KPI Oracle", version: "1", chainId: networkData.chainId, verifyingContract: oracleAddress },
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

    return { payload, signature };
  }

  // ── Demo mode tests (backward compatible) ──

  it("settles a hit market and redistributes losing stakes to winners", async function () {
    const { reporter, alice, bob, market, oracle, marketId } = await deployFixture();

    await market.connect(alice).takePosition(marketId, 1, 600);
    await market.connect(bob).takePosition(marketId, 2, 400);

    const { payload, signature } = await resolveOracle(reporter, oracle, marketId);
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
      { name: "PRED KPI Oracle", version: "1", chainId: networkData.chainId, verifyingContract: await oracle.getAddress() },
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

    const { payload, signature } = await resolveOracle(reporter, oracle, marketId, 425_000, 7);
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
      { name: "PRED KPI Oracle", version: "1", chainId: networkData.chainId, verifyingContract: await oracle.getAddress() },
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

  describe("commit-reveal", function () {
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

      await oracle.connect(reporter).commitResolution(marketId, digest);
      expect(await oracle.resolutionCommits(marketId)).to.equal(digest);

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

      const committedPayload = await makePayload(marketId, 60);
      const committedDigest = await oracle.hashResolutionPayload(committedPayload);
      await oracle.connect(reporter).commitResolution(marketId, committedDigest);

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

      expect(await oracle.resolutionCommits(marketId)).to.equal(ethers.ZeroHash);

      const payload = await makePayload(marketId, 70);
      const signature = await reporter.signTypedData(domain, TYPES, payload);

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

  // ── USDT mode tests ──

  describe("USDT mode", function () {
    it("settles a hit market with USDT and applies protocol fee", async function () {
      const { reporter, alice, bob, market, oracle, marketId, mockToken } =
        await deployFixture({ usdt: true, feeBps: 100 });

      await market.connect(alice).takePosition(marketId, 1, 600);
      await market.connect(bob).takePosition(marketId, 2, 400);

      const { payload, signature } = await resolveOracle(reporter, oracle, marketId, 425_000, 20);
      await oracle.connect(alice).publishSignedResolution(payload, signature);

      await ethers.provider.send("evm_increaseTime", [3605]);
      await ethers.provider.send("evm_mine", []);

      await market.connect(alice).settleMarket(marketId);

      // Alice claims: gross = 600 + 400 = 1000, winnings = 400, fee = 4 (1%), net = 996
      await market.connect(alice).claim(marketId);
      // Bob claims: loser, payout = 0
      await market.connect(bob).claim(marketId);

      // Alice: 9000 remaining in wallet + 996 claimed
      const aliceWallet = await mockToken.balanceOf(alice.address);
      expect(aliceWallet).to.equal(9_000 + 996);

      // Bob: 9000 remaining in wallet + 0 claimed
      const bobWallet = await mockToken.balanceOf(bob.address);
      expect(bobWallet).to.equal(9_000);

      // Protocol fees: 4
      expect(await market.accumulatedFees()).to.equal(4);
    });

    it("deposit and withdraw work correctly", async function () {
      const { alice, market, mockToken } = await deployFixture({ usdt: true });

      // Alice started with 10000, deposited 1000 in fixture
      expect(await market.balanceOf(alice.address)).to.equal(1_000);
      expect(await mockToken.balanceOf(alice.address)).to.equal(9_000);

      // Deposit more
      await market.connect(alice).deposit(500);
      expect(await market.balanceOf(alice.address)).to.equal(1_500);
      expect(await mockToken.balanceOf(alice.address)).to.equal(8_500);

      // Withdraw
      await market.connect(alice).withdraw(300);
      expect(await market.balanceOf(alice.address)).to.equal(1_200);
      expect(await mockToken.balanceOf(alice.address)).to.equal(8_800);
    });

    it("grantDemoCredits reverts in USDT mode", async function () {
      const { owner, alice, market } = await deployFixture({ usdt: true });

      await expect(market.connect(owner).grantDemoCredits(alice.address, 100))
        .to.be.revertedWithCustomError(market, "LiveModeOnly");
    });

    it("deposit reverts for ineligible trader", async function () {
      const { charlie, market, mockToken } = await deployFixture({ usdt: true });

      await mockToken.mint(charlie.address, 1_000);
      await mockToken.connect(charlie).approve(await market.getAddress(), ethers.MaxUint256);

      await expect(market.connect(charlie).deposit(100))
        .to.be.revertedWithCustomError(market, "IneligibleTrader");
    });

    it("withdrawFees transfers accumulated fees", async function () {
      const { owner, reporter, alice, bob, market, oracle, marketId, mockToken } =
        await deployFixture({ usdt: true, feeBps: 200 });

      await market.connect(alice).takePosition(marketId, 1, 600);
      await market.connect(bob).takePosition(marketId, 2, 400);

      const { payload, signature } = await resolveOracle(reporter, oracle, marketId, 425_000, 30);
      await oracle.connect(alice).publishSignedResolution(payload, signature);

      await ethers.provider.send("evm_increaseTime", [3605]);
      await ethers.provider.send("evm_mine", []);

      await market.connect(alice).settleMarket(marketId);
      await market.connect(alice).claim(marketId);

      // Fee = 2% of 400 winnings = 8
      const fees = await market.accumulatedFees();
      expect(fees).to.equal(8);

      const ownerBalBefore = await mockToken.balanceOf(owner.address);
      await market.connect(owner).withdrawFees(owner.address);
      const ownerBalAfter = await mockToken.balanceOf(owner.address);

      expect(ownerBalAfter - ownerBalBefore).to.equal(8);
      expect(await market.accumulatedFees()).to.equal(0);
    });

    it("fee cap at 5% is enforced", async function () {
      const { owner, market } = await deployFixture({ usdt: true });

      await expect(market.connect(owner).setProtocolFeeBps(501))
        .to.be.revertedWithCustomError(market, "FeeTooHigh");

      await market.connect(owner).setProtocolFeeBps(500);
      expect(await market.protocolFeeBps()).to.equal(500);
    });

    it("enforces minimum position size", async function () {
      const { owner, alice, market, marketId } = await deployFixture({ usdt: true });

      // Set minimum to 500
      await market.connect(owner).setMinPositionSize(500);

      // Below minimum should revert
      await expect(market.connect(alice).takePosition(marketId, 1, 100))
        .to.be.revertedWithCustomError(market, "BelowMinPosition");

      // At minimum should succeed
      await market.connect(alice).takePosition(marketId, 1, 500);

      // Adding more above existing position is fine (total = 600 > 500)
      await market.connect(alice).takePosition(marketId, 1, 100);
    });

    it("cancelled market refunds USDT", async function () {
      const { owner, alice, market, marketId, mockToken } = await deployFixture({ usdt: true });

      await market.connect(alice).takePosition(marketId, 1, 500);
      expect(await mockToken.balanceOf(alice.address)).to.equal(9_000); // unchanged, funds in contract

      await market.connect(owner).cancelMarket(marketId);
      await market.connect(alice).claim(marketId);

      // Refund goes directly to wallet in USDT mode
      expect(await mockToken.balanceOf(alice.address)).to.equal(9_000 + 500);
    });
  });

  // ── Self-service allowlist tests ──

  describe("EligibilityRegistry self-service", function () {
    it("requestAccess with autoApprove grants immediate eligibility", async function () {
      const { owner, charlie, registry } = await deployFixture();

      await registry.connect(owner).setAutoApprove(true);
      expect(await registry.isEligible(charlie.address)).to.be.false;

      await registry.connect(charlie).requestAccess();
      expect(await registry.isEligible(charlie.address)).to.be.true;
    });

    it("requestAccess without autoApprove creates pending request", async function () {
      const { owner, charlie, registry } = await deployFixture();

      expect(await registry.autoApprove()).to.be.false;
      await registry.connect(charlie).requestAccess();
      expect(await registry.isEligible(charlie.address)).to.be.false;
      expect(await registry.pendingRequests(charlie.address)).to.be.true;

      await registry.connect(owner).approveRequest(charlie.address);
      expect(await registry.isEligible(charlie.address)).to.be.true;
      expect(await registry.pendingRequests(charlie.address)).to.be.false;
    });

    it("batchApprove approves multiple pending requests", async function () {
      const { owner, alice, charlie, registry } = await deployFixture();

      // Remove alice's existing eligibility for this test
      await registry.connect(owner).setEligible(alice.address, false);

      await registry.connect(alice).requestAccess();
      await registry.connect(charlie).requestAccess();

      await registry.connect(owner).batchApprove([alice.address, charlie.address]);

      expect(await registry.isEligible(alice.address)).to.be.true;
      expect(await registry.isEligible(charlie.address)).to.be.true;
    });
  });
});
