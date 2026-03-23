// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";
import "./EligibilityRegistry.sol";
import "./KpiOracle.sol";

contract KpiPredictionMarket is Owned {
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
    }

    EligibilityRegistry public immutable eligibilityRegistry;
    KpiOracle public immutable oracle;

    bool public constant REDEMPTIONS_DISABLED = true;
    string public constant MARKET_MODE = "DEMO_POINTS_ONLY";

    mapping(address => uint256) public demoCredits;
    mapping(bytes32 => Market) private markets;
    mapping(bytes32 => mapping(address => Position)) public positions;
    mapping(bytes32 => mapping(address => uint256)) public stakes;
    mapping(bytes32 => mapping(address => bool)) public claimed;

    event DemoCreditsGranted(address indexed trader, uint256 amount);
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

    constructor(address initialOwner, EligibilityRegistry registry, KpiOracle marketOracle) Owned(initialOwner) {
        eligibilityRegistry = registry;
        oracle = marketOracle;
    }

    function grantDemoCredits(address trader, uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAmount();
        demoCredits[trader] += amount;
        emit DemoCreditsGranted(trader, amount);
    }

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
            missPool: 0
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

    function takePosition(bytes32 marketId, Position side, uint256 amount) external {
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

    function claim(bytes32 marketId) external returns (uint256 payout) {
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
                payout = userStake + ((loserPool * userStake) / winnerPool);
            }
        }

        demoCredits[msg.sender] += payout;
        emit Claimed(marketId, msg.sender, payout);
    }

    function getMarket(bytes32 marketId) external view returns (Market memory) {
        Market memory market = markets[marketId];
        if (!market.exists) revert MarketMissing();
        return market;
    }
}
