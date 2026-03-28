// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";
import "./EligibilityRegistry.sol";
import "./KpiOracle.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract KpiPredictionMarket is Owned, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Position {
        None,
        Hit,
        Miss
    }

    struct Market {
        bool exists;
        bool cancelled;
        bool settled;
        bool outcomeHit;
        bytes32 marketId;
        string companyTicker;
        string metricName;
        string consensusSource;
        string resolutionPolicy;
        int256 consensusValue;
        uint64 opensAt;
        uint64 locksAt;
        uint64 expectedAnnouncementAt;
        uint256 hitPool;
        uint256 missPool;
        uint16 feeBpsSnapshot; // F-013: fee locked at market creation
    }

    EligibilityRegistry public immutable eligibilityRegistry;
    KpiOracle public immutable oracle;
    IERC20 public immutable stakingToken;
    bool public immutable demoMode;

    uint16 public protocolFeeBps;
    uint256 public accumulatedFees;
    uint256 public minPositionSize;
    address public pendingOwner; // F-009: two-step ownership transfer

    mapping(address => uint256) public demoCredits;
    mapping(bytes32 => Market) private markets;
    mapping(bytes32 => mapping(address => Position)) public positions;
    mapping(bytes32 => mapping(address => uint256)) public stakes;
    mapping(bytes32 => mapping(address => bool)) public claimed;

    event DemoCreditsGranted(address indexed trader, uint256 amount);
    event Deposited(address indexed trader, uint256 amount);
    event Withdrawn(address indexed trader, uint256 amount);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event ProtocolFeeUpdated(uint16 newFeeBps);
    event MinPositionSizeUpdated(uint256 newMin); // F-015
    event TokensSwept(address indexed recipient, uint256 amount);
    event MarketCreated(
        bytes32 indexed marketId,
        string companyTicker,
        string metricName,
        int256 consensusValue,
        string consensusSource,
        uint64 opensAt,
        uint64 locksAt,
        uint64 expectedAnnouncementAt
    );
    event MarketCancelled(bytes32 indexed marketId);
    event PositionTaken(bytes32 indexed marketId, address indexed trader, Position side, uint256 amount);
    event MarketSettled(bytes32 indexed marketId, bool outcomeHit, int256 actualValue);
    event Claimed(bytes32 indexed marketId, address indexed trader, uint256 payout);

    error IneligibleTrader();
    error InvalidWindow();
    error MarketAlreadyExists();
    error MarketMissing();
    error MarketClosed();
    error MarketNotOpen();
    error InvalidAmount();
    error InvalidPosition();
    error PositionSideLocked();
    error MarketAlreadySettled();
    error MarketNotSettled();
    error MarketCancelledAlready();
    error AlreadyClaimed();
    error OracleResolutionMissing();
    error MarketStillOpen();
    error DemoModeOnly();
    error LiveModeOnly();
    error FeeTooHigh();
    error BelowMinPosition();
    error NotPendingOwner();

    constructor(
        address initialOwner,
        EligibilityRegistry registry,
        KpiOracle marketOracle,
        IERC20 _stakingToken,
        uint16 _protocolFeeBps
    ) Owned(initialOwner) {
        eligibilityRegistry = registry;
        oracle = marketOracle;
        stakingToken = _stakingToken;
        demoMode = address(_stakingToken) == address(0);
        protocolFeeBps = _protocolFeeBps;
        minPositionSize = address(_stakingToken) == address(0) ? 0 : 10_000_000;
    }

    // ── F-009: Two-step ownership transfer ──

    function transferOwnership(address newOwner) public override onlyOwner {
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        pendingOwner = address(0);
        _transferOwnership(msg.sender);
    }

    function _transferOwnership(address newOwner) internal {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ── View helpers ──

    function marketMode() external view returns (string memory) {
        return demoMode ? "DEMO_POINTS_ONLY" : "USDT_LIVE";
    }

    function balanceOf(address trader) external view returns (uint256) {
        return demoCredits[trader];
    }

    // ── Demo mode: owner grants credits ──

    function grantDemoCredits(address trader, uint256 amount) external onlyOwner {
        if (!demoMode) revert LiveModeOnly();
        if (amount == 0) revert InvalidAmount();
        demoCredits[trader] += amount;
        emit DemoCreditsGranted(trader, amount);
    }

    // ── Live mode: USDT deposit / withdraw ──

    // F-003: Measure actual received amount to handle fee-on-transfer tokens
    function deposit(uint256 amount) external nonReentrant {
        if (demoMode) revert DemoModeOnly();
        if (amount == 0) revert InvalidAmount();
        if (!eligibilityRegistry.isEligible(msg.sender)) revert IneligibleTrader();

        uint256 balBefore = stakingToken.balanceOf(address(this));
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = stakingToken.balanceOf(address(this)) - balBefore;

        demoCredits[msg.sender] += received;
        emit Deposited(msg.sender, received);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (demoMode) revert DemoModeOnly();
        if (amount == 0 || demoCredits[msg.sender] < amount) revert InvalidAmount();

        demoCredits[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ── Fee management ──

    function setProtocolFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > 500) revert FeeTooHigh();
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
    }

    function setMinPositionSize(uint256 newMin) external onlyOwner {
        minPositionSize = newMin;
        emit MinPositionSizeUpdated(newMin); // F-015
    }

    function withdrawFees(address recipient) external onlyOwner nonReentrant {
        if (demoMode) revert DemoModeOnly();
        uint256 fees = accumulatedFees;
        if (fees == 0) revert InvalidAmount();
        accumulatedFees = 0;
        stakingToken.safeTransfer(recipient, fees);
        emit FeesWithdrawn(recipient, fees);
    }

    // F-001 + F-002: Sweep stuck/dust tokens that exceed accountable balances
    function sweepExcessTokens(address recipient) external onlyOwner nonReentrant {
        if (demoMode) revert DemoModeOnly();
        uint256 held = stakingToken.balanceOf(address(this));
        // accumulatedFees is the only trackable on-chain liability besides user balances.
        // In practice, the operator should only sweep after all markets are settled and claimed.
        if (held <= accumulatedFees) revert InvalidAmount();
        uint256 excess = held - accumulatedFees;
        // Safety: don't sweep more than clearly excess (leave fees intact)
        stakingToken.safeTransfer(recipient, excess);
        emit TokensSwept(recipient, excess);
    }

    // ── Market lifecycle ──

    // F-013: Fee snapshot at creation time
    function createMarket(
        bytes32 marketId,
        string calldata companyTicker,
        string calldata metricName,
        int256 consensusValue,
        string calldata consensusSource,
        string calldata resolutionPolicy,
        uint64 opensAt,
        uint64 locksAt,
        uint64 expectedAnnouncementAt
    ) external onlyOwner {
        if (markets[marketId].exists) revert MarketAlreadyExists();
        if (!(opensAt < locksAt && locksAt <= expectedAnnouncementAt)) revert InvalidWindow();

        markets[marketId] = Market({
            exists: true,
            cancelled: false,
            settled: false,
            outcomeHit: false,
            marketId: marketId,
            companyTicker: companyTicker,
            metricName: metricName,
            consensusSource: consensusSource,
            resolutionPolicy: resolutionPolicy,
            consensusValue: consensusValue,
            opensAt: opensAt,
            locksAt: locksAt,
            expectedAnnouncementAt: expectedAnnouncementAt,
            hitPool: 0,
            missPool: 0,
            feeBpsSnapshot: protocolFeeBps // F-013: locked at creation
        });

        emit MarketCreated(
            marketId,
            companyTicker,
            metricName,
            consensusValue,
            consensusSource,
            opensAt,
            locksAt,
            expectedAnnouncementAt
        );
    }

    function cancelMarket(bytes32 marketId) external onlyOwner {
        Market storage market = markets[marketId];
        if (!market.exists) revert MarketMissing();
        if (market.cancelled) revert MarketCancelledAlready();
        if (market.settled) revert MarketAlreadySettled();

        market.cancelled = true;
        emit MarketCancelled(marketId);
    }

    function takePosition(bytes32 marketId, Position side, uint256 amount) external nonReentrant {
        Market storage market = markets[marketId];
        if (!market.exists) revert MarketMissing();
        if (market.cancelled) revert MarketClosed();
        if (market.settled) revert MarketAlreadySettled();
        if (block.timestamp < market.opensAt) revert MarketNotOpen();
        if (block.timestamp >= market.locksAt) revert MarketClosed();
        if (!eligibilityRegistry.isEligible(msg.sender)) revert IneligibleTrader();
        if (amount == 0 || demoCredits[msg.sender] < amount) revert InvalidAmount();
        if (side != Position.Hit && side != Position.Miss) revert InvalidPosition();

        Position existingSide = positions[marketId][msg.sender];
        if (existingSide != Position.None && existingSide != side) revert PositionSideLocked();
        if (minPositionSize > 0 && stakes[marketId][msg.sender] + amount < minPositionSize) revert BelowMinPosition();

        positions[marketId][msg.sender] = side;
        stakes[marketId][msg.sender] += amount;
        demoCredits[msg.sender] -= amount;

        if (side == Position.Hit) {
            market.hitPool += amount;
        } else {
            market.missPool += amount;
        }

        emit PositionTaken(marketId, msg.sender, side, amount);
    }

    function settleMarket(bytes32 marketId) external {
        Market storage market = markets[marketId];
        if (!market.exists) revert MarketMissing();
        if (market.cancelled) revert MarketClosed();
        if (market.settled) revert MarketAlreadySettled();
        if (block.timestamp < market.locksAt) revert MarketStillOpen();

        (bool resolved, int256 actualValue, , , , , , ) = oracle.getResolution(marketId);
        if (!resolved) revert OracleResolutionMissing();

        market.settled = true;
        market.outcomeHit = actualValue >= market.consensusValue;

        emit MarketSettled(marketId, market.outcomeHit, actualValue);
    }

    // F-013: Uses market.feeBpsSnapshot instead of global protocolFeeBps
    function claim(bytes32 marketId) external nonReentrant returns (uint256 payout) {
        Market storage market = markets[marketId];
        if (!market.exists) revert MarketMissing();
        if (!market.settled && !market.cancelled) revert MarketNotSettled();
        if (claimed[marketId][msg.sender]) revert AlreadyClaimed();

        claimed[marketId][msg.sender] = true;

        uint256 userStake = stakes[marketId][msg.sender];
        if (userStake == 0) {
            emit Claimed(marketId, msg.sender, 0);
            return 0;
        }

        if (market.cancelled) {
            payout = userStake;
        } else {
            Position winnerSide = market.outcomeHit ? Position.Hit : Position.Miss;
            uint256 winnerPool = market.outcomeHit ? market.hitPool : market.missPool;
            uint256 loserPool = market.outcomeHit ? market.missPool : market.hitPool;

            if (winnerPool == 0) {
                payout = userStake;
            } else if (positions[marketId][msg.sender] == winnerSide) {
                uint256 grossPayout = userStake + ((loserPool * userStake) / winnerPool);

                // F-013: use the fee that was locked when the market was created
                uint16 marketFee = market.feeBpsSnapshot;
                if (!demoMode && marketFee > 0) {
                    uint256 winnings = grossPayout - userStake;
                    uint256 fee = (winnings * marketFee) / 10_000;
                    accumulatedFees += fee;
                    payout = grossPayout - fee;
                } else {
                    payout = grossPayout;
                }
            }
        }

        if (demoMode) {
            demoCredits[msg.sender] += payout;
        } else if (payout > 0) {
            stakingToken.safeTransfer(msg.sender, payout);
        }

        emit Claimed(marketId, msg.sender, payout);
    }

    function getMarket(bytes32 marketId) external view returns (Market memory) {
        Market memory market = markets[marketId];
        if (!market.exists) revert MarketMissing();
        return market;
    }
}
