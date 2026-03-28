import { ethers } from "ethers";

export const marketAbi = [
  "function owner() view returns (address)",
  "function demoCredits(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function demoMode() view returns (bool)",
  "function stakingToken() view returns (address)",
  "function marketMode() view returns (string)",
  "function protocolFeeBps() view returns (uint16)",
  "function accumulatedFees() view returns (uint256)",
  "function minPositionSize() view returns (uint256)",
  "function getMarket(bytes32 marketId) view returns ((bool exists,bool cancelled,bool settled,bool outcomeHit,bytes32 marketId,string companyTicker,string metricName,string consensusSource,string resolutionPolicy,int256 consensusValue,uint64 opensAt,uint64 locksAt,uint64 expectedAnnouncementAt,uint256 hitPool,uint256 missPool,uint16 feeBpsSnapshot))",
  "function positions(bytes32 marketId, address trader) view returns (uint8)",
  "function stakes(bytes32 marketId, address trader) view returns (uint256)",
  "function grantDemoCredits(address trader, uint256 amount)",
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function createMarket(bytes32 marketId, string companyTicker, string metricName, int256 consensusValue, string consensusSource, string resolutionPolicy, uint64 opensAt, uint64 locksAt, uint64 expectedAnnouncementAt)",
  "function cancelMarket(bytes32 marketId)",
  "function takePosition(bytes32 marketId, uint8 side, uint256 amount)",
  "function settleMarket(bytes32 marketId)",
  "function claim(bytes32 marketId) returns (uint256 payout)",
  "function withdrawFees(address recipient)",
  "function setProtocolFeeBps(uint16 newFeeBps)",
  "function setMinPositionSize(uint256 newMin)",
];

export const oracleAbi = [
  "function owner() view returns (address)",
  "function authorizedReporters(address) view returns (bool)",
  "function authorizedSigners(address) view returns (bool)",
  "function setReporter(address reporter, bool authorized)",
  "function setSigner(address signer, bool authorized)",
  "function getResolution(bytes32 marketId) view returns (bool resolved,int256 actualValue,uint64 resolvedAt,uint64 observedAt,bytes32 sourceHash,bytes32 attestationDigest,address signer,string sourceUri)",
  "function publishSignedResolution((bytes32 marketId,int256 actualValue,bytes32 sourceHash,string sourceUri,uint64 observedAt,uint64 validAfter,uint64 validBefore,uint256 nonce) payload, bytes signature) returns (address signer, bytes32 digest)",
  "function publishResolution(bytes32 marketId, int256 actualValue, bytes32 sourceHash, string sourceUri)",
  "function hashResolutionPayload((bytes32 marketId,int256 actualValue,bytes32 sourceHash,string sourceUri,uint64 observedAt,uint64 validAfter,uint64 validBefore,uint256 nonce) payload) view returns (bytes32)"
];

export const registryAbi = [
  "function owner() view returns (address)",
  "function isEligible(address account) view returns (bool)",
  "function pendingRequests(address account) view returns (bool)",
  "function autoApprove() view returns (bool)",
  "function setEligible(address account, bool eligible)",
  "function requestAccess()",
  "function approveRequest(address account)",
  "function batchApprove(address[] accounts)",
  "function setAutoApprove(bool enabled)",
];

export const erc20Abi = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

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

export function buildMarketId(idSeed) {
  return ethers.id(idSeed);
}

export function buildResolutionPayload(marketId, form) {
  return {
    marketId,
    actualValue: BigInt(form.actualValue || "0"),
    sourceHash: ethers.id(form.sourceLabel || "empty-source"),
    sourceUri: form.sourceUri || "",
    observedAt: BigInt(form.observedAt || "0"),
    validAfter: BigInt(form.validAfter || "0"),
    validBefore: BigInt(form.validBefore || "0"),
    nonce: BigInt(form.nonce || "0"),
  };
}

export function buildResolutionDomain(chainId, oracleAddress) {
  return {
    name: "PRED KPI Oracle",
    version: "1",
    chainId,
    verifyingContract: oracleAddress,
  };
}

export function formatNumber(value) {
  try {
    return new Intl.NumberFormat("en-US").format(Number(value));
  } catch {
    return String(value);
  }
}

export function formatCompactNumber(value) {
  try {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
  } catch {
    return String(value);
  }
}

export function formatPercent(value) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(Number(value));
  } catch {
    return String(value);
  }
}

export function formatTimestamp(timestamp) {
  if (!timestamp) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Number(timestamp) * 1000));
}

export function shortAddress(address) {
  if (!address) return "No wallet";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
