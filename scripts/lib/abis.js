/**
 * Shared ABI definitions used across operator, oracle, and event-indexing scripts.
 *
 * - marketAbi / oracleAbi / registryAbi  — function ABIs for contract calls
 * - marketEvents / oracleEvents / registryEvents — event-only ABIs for log queries
 * - resolutionTypes — EIP-712 typed-data definition for oracle attestations
 */

import { ethers } from "ethers";

// ---------------------------------------------------------------------------
// Function ABIs (operator-actions, oracle-resolve)
// ---------------------------------------------------------------------------

export const marketAbi = [
  "function owner() view returns (address)",
  "function demoCredits(address) view returns (uint256)",
  "function createMarket(bytes32 marketId, string companyTicker, string metricName, int256 consensusValue, string consensusSource, string resolutionPolicy, uint64 opensAt, uint64 locksAt, uint64 expectedAnnouncementAt)",
  "function cancelMarket(bytes32 marketId)",
  "function grantDemoCredits(address trader, uint256 amount)",
  "function getMarket(bytes32 marketId) view returns ((bool exists,bool cancelled,bool settled,bool outcomeHit,bytes32 marketId,string companyTicker,string metricName,string consensusSource,string resolutionPolicy,int256 consensusValue,uint64 opensAt,uint64 locksAt,uint64 expectedAnnouncementAt,uint256 hitPool,uint256 missPool))",
  "function positions(bytes32 marketId, address trader) view returns (uint8)",
  "function stakes(bytes32 marketId, address trader) view returns (uint256)",
  "function takePosition(bytes32 marketId, uint8 side, uint256 amount)",
  "function settleMarket(bytes32 marketId)",
  "function claim(bytes32 marketId) returns (uint256 payout)",
];

export const oracleAbi = [
  "function owner() view returns (address)",
  "function authorizedReporters(address) view returns (bool)",
  "function authorizedSigners(address) view returns (bool)",
  "function setReporter(address reporter, bool authorized)",
  "function setSigner(address signer, bool authorized)",
  "function publishResolution(bytes32 marketId, int256 actualValue, bytes32 sourceHash, string sourceUri)",
  "function getResolution(bytes32 marketId) view returns (bool resolved, int256 actualValue, uint64 resolvedAt, uint64 observedAt, bytes32 sourceHash, bytes32 attestationDigest, address signer, string sourceUri)",
  "function hashResolutionPayload((bytes32 marketId,int256 actualValue,bytes32 sourceHash,string sourceUri,uint64 observedAt,uint64 validAfter,uint64 validBefore,uint256 nonce) payload) view returns (bytes32)",
  "function publishSignedResolution((bytes32 marketId,int256 actualValue,bytes32 sourceHash,string sourceUri,uint64 observedAt,uint64 validAfter,uint64 validBefore,uint256 nonce) payload, bytes signature) returns (address signer, bytes32 digest)",
];

export const registryAbi = [
  "function owner() view returns (address)",
  "function isEligible(address account) view returns (bool)",
  "function setEligible(address account, bool eligible)",
];

// ---------------------------------------------------------------------------
// Event ABIs (index-events)
// ---------------------------------------------------------------------------

export const marketEvents = [
  "event DemoCreditsGranted(address indexed trader, uint256 amount)",
  "event MarketCreated(bytes32 indexed marketId, string companyTicker, string metricName, int256 consensusValue, string consensusSource, uint64 opensAt, uint64 locksAt, uint64 expectedAnnouncementAt)",
  "event MarketCancelled(bytes32 indexed marketId)",
  "event PositionTaken(bytes32 indexed marketId, address indexed trader, uint8 side, uint256 amount)",
  "event MarketSettled(bytes32 indexed marketId, bool outcomeHit, int256 actualValue)",
  "event Claimed(bytes32 indexed marketId, address indexed trader, uint256 payout)",
];

export const oracleEvents = [
  "event ReporterUpdated(address indexed reporter, bool authorized)",
  "event SignerUpdated(address indexed signer, bool authorized)",
  "event MarketResolved(bytes32 indexed marketId, int256 actualValue, bytes32 indexed sourceHash, string sourceUri, uint64 resolvedAt)",
  "event SignedResolutionAccepted(bytes32 indexed marketId, address indexed signer, bytes32 indexed attestationDigest)",
];

export const registryEvents = [
  "event EligibilityUpdated(address indexed account, bool isEligibleForMarkets)",
];

// ---------------------------------------------------------------------------
// EIP-712 typed-data definition (oracle-resolve)
// ---------------------------------------------------------------------------

export const resolutionTypes = {
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
