/**
 * market-utils.js
 *
 * Pure helper functions and constants shared across App, BoardView, and MarketView.
 * No side-effects, no React state. Safe to import anywhere.
 */

import { ethers } from "ethers";
import marketSeeds from "../../data/markets.json";
import { buildMarketId, formatNumber, formatPercent } from "../contracts";

export const fallbackNow = Math.floor(Date.now() / 1000);
export const uiStorageKey = "consensusmarket-ui";
export const accountStorageKey = "consensusmarket-account";
export const adminStorageKey = "consensusmarket-admin";

export function buildEmptyWallet() {
  return {
    provider: null,
    rawProvider: null,
    signer: null,
    account: "",
    chainId: null,
    connector: "",
  };
}

export function deriveWindow(seed) {
  return {
    opensAt: fallbackNow + seed.openOffsetHours * 3600,
    locksAt: fallbackNow + seed.lockOffsetHours * 3600,
    expectedAnnouncementAt: fallbackNow + seed.announcementOffsetHours * 3600,
  };
}

export function getStatusLabel(market) {
  const now = Math.floor(Date.now() / 1000);
  if (market.cancelled) return "Cancelled";
  if (market.settled) return market.outcomeHit ? "Resolved Beat" : "Resolved Miss";
  if (now < market.opensAt) return "Upcoming";
  if (now >= market.locksAt) return "Locked";
  return "Open";
}

export function toHexChainId(chainId) {
  return `0x${Number(chainId).toString(16)}`;
}

export function normalizeAddress(address) {
  return (address || "").toLowerCase();
}

export function requireAddress(value, label) {
  const trimmed = String(value || "").trim();
  if (!ethers.isAddress(trimmed)) {
    throw new Error(`Enter a valid ${label} address.`);
  }
  return ethers.getAddress(trimmed);
}

export function parseSlugFromHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const slug = params.get("market");
  return marketSeeds.some((seed) => seed.slug === slug) ? slug : null;
}

export function parseRouteFromHash() {
  if (typeof window === "undefined") return { view: "board", slug: null };
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const page = params.get("page");
  const slug = parseSlugFromHash();
  if (page === "account") return { view: "account", slug };
  if (page === "admin") return { view: "admin", slug };
  if (slug) return { view: "market", slug };
  return { view: "board", slug: null };
}

export function getShareUrl(slug) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}#market=${slug}`;
}

export function jumpToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function buildCreateMarketForm(seed) {
  const win = deriveWindow(seed);
  return {
    idSeed: seed.idSeed,
    ticker: seed.ticker,
    metricName: seed.metricName,
    consensusValue: String(seed.consensusValue),
    consensusSource: seed.consensusSource,
    resolutionPolicy: seed.resolutionPolicy,
    opensAt: String(win.opensAt),
    locksAt: String(win.locksAt),
    expectedAnnouncementAt: String(win.expectedAnnouncementAt),
  };
}

export function formatNewsTimestamp(value) {
  if (!value) return "Latest coverage";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Latest coverage";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTimestampWithYear(timestamp) {
  if (!timestamp) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Number(timestamp) * 1000));
}

export function getMediaLogoUrl(article) {
  const domain = article?.sourceDomain || "";
  if (!domain) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export function parseReportingPeriod(idSeed) {
  const match = String(idSeed || "").match(/_Q([1-4])_(\d{4})_/i);
  if (!match) return "Current period";
  return `Q${match[1]} ${match[2]}`;
}

export function extractConsensusUnit(consensusDisplay) {
  return String(consensusDisplay || "")
    .replace(/^[\d,.]+(?:\.\d+)?(?:[KMBT])?\s*/i, "")
    .trim();
}

export function formatConsensusDisplay(value, consensusDisplay) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return consensusDisplay || "Consensus unavailable";
  const absValue = Math.abs(numericValue);
  const formattedValue =
    absValue >= 1_000_000
      ? new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: absValue >= 1_000_000_000 ? 2 : 1,
        }).format(numericValue)
      : formatNumber(numericValue);
  const unit = extractConsensusUnit(consensusDisplay);
  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

export function formatConsensusMoveLabel(changeRatio) {
  if (!Number.isFinite(changeRatio) || Math.abs(changeRatio) < 0.0005) {
    return "Flat versus first read";
  }
  return `${changeRatio > 0 ? "Up" : "Down"} ${formatPercent(Math.abs(changeRatio))} versus first read`;
}

export function formatCountdown(timestamp) {
  if (!timestamp) return "Not scheduled";
  const delta = Number(timestamp) - Math.floor(Date.now() / 1000);
  const absDelta = Math.abs(delta);
  const hours = Math.floor(absDelta / 3600);
  const minutes = Math.floor((absDelta % 3600) / 60);
  if (delta >= 0) return `in ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m ago`;
}

export function calculateProbability(pool, totalPool) {
  if (totalPool === 0n) return 0;
  return Number(pool) / Number(totalPool);
}

export function calculatePreviewPayout(market, side, stakeAmount) {
  try {
    const amount = BigInt(stakeAmount || "0");
    if (amount <= 0n) return 0n;
    const hitPool = market.hitPool + (side === 1 ? amount : 0n);
    const missPool = market.missPool + (side === 2 ? amount : 0n);
    const winnerPool = side === 1 ? hitPool : missPool;
    const loserPool = side === 1 ? missPool : hitPool;
    if (winnerPool === 0n) return amount;
    return amount + (loserPool * amount) / winnerPool;
  } catch {
    return 0n;
  }
}

export function formatResolvedDelta(actualValue, consensusValue) {
  if (actualValue === null || actualValue === undefined) return "Pending resolution";
  const delta = Number(actualValue) - Number(consensusValue);
  if (delta === 0) return "Exactly on consensus";
  if (delta > 0) return `Beat by ${formatNumber(delta)}`;
  return `Missed by ${formatNumber(Math.abs(delta))}`;
}

export function getConfiguredRpcUrls(runtimeConfig) {
  const candidates = [...(runtimeConfig.rpcUrls || []), runtimeConfig.rpcUrl || ""]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(candidates)];
}

export function readStoredPreferences() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(uiStorageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function readStoredAccountProfile() {
  if (typeof window === "undefined") {
    return { displayName: "", email: "", focus: "", defaultStake: "100" };
  }
  try {
    const raw = window.localStorage.getItem(accountStorageKey);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      displayName: saved.displayName || "",
      email: saved.email || "",
      focus: saved.focus || "",
      defaultStake: saved.defaultStake || "100",
    };
  } catch {
    return { displayName: "", email: "", focus: "", defaultStake: "100" };
  }
}

export function readStoredAdminPolicy() {
  if (typeof window === "undefined") return { blacklist: [] };
  try {
    const raw = window.localStorage.getItem(adminStorageKey);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      blacklist: Array.isArray(saved.blacklist) ? saved.blacklist.map(normalizeAddress).filter(Boolean) : [],
    };
  } catch {
    return { blacklist: [] };
  }
}

export function getStatusKey(market) {
  if (market.cancelled) return "cancelled";
  if (market.settled) return "resolved";
  const now = Math.floor(Date.now() / 1000);
  if (now < market.opensAt) return "upcoming";
  if (now >= market.locksAt) return "locked";
  return "open";
}

export function compareMarkets(a, b, sortMode) {
  if (sortMode === "liquidity") return Number(b.hitPool + b.missPool - (a.hitPool + a.missPool));
  if (sortMode === "lock") return a.locksAt - b.locksAt;
  if (sortMode === "odds") {
    const aP = calculateProbability(a.hitPool, a.hitPool + a.missPool);
    const bP = calculateProbability(b.hitPool, b.hitPool + b.missPool);
    return bP - aP;
  }
  if (sortMode === "company") return a.company.localeCompare(b.company);
  return a.ticker.localeCompare(b.ticker);
}

export function buildOutcomeQuestion(market) {
  if (!market) return "";
  return `Will ${market.company} beat Street consensus on ${market.metricName.toLowerCase()} in ${market.reportingPeriod}?`;
}

export function getSignalLabel(probability) {
  if (probability >= 0.7) return "High-conviction beat";
  if (probability >= 0.55) return "Beat leaning";
  if (probability <= 0.3) return "High-conviction miss";
  if (probability <= 0.45) return "Miss leaning";
  return "Balanced market";
}

const analystFirmPool = [
  ["Morgan Stanley", "Adam Jonas"],
  ["Goldman Sachs", "Mark Delaney"],
  ["JPMorgan", "Doug Anmuth"],
  ["UBS", "Joseph Spak"],
  ["Barclays", "Ross Sandler"],
  ["Wells Fargo", "Ken Gawrelski"],
  ["Deutsche Bank", "Edison Yu"],
  ["BofA Securities", "Justin Post"],
  ["Evercore ISI", "Mark Mahaney"],
  ["Bernstein", "Toni Sacconaghi"],
];

export function buildConsensusTimeline(market) {
  const frozenConsensusValue = Number(market.consensusValue || 0);
  const seedHash = Array.from(String(market.slug || "")).reduce(
    (total, character, index) => total + character.charCodeAt(0) * (index + 1),
    0
  );
  const trendUp = seedHash % 2 === 0;
  const maxShift = 0.014 + (seedHash % 5) * 0.004;
  const multipliers = trendUp
    ? [1 - maxShift, 1 - maxShift * 0.56, 1 - maxShift * 0.2, 1]
    : [1 + maxShift, 1 + maxShift * 0.58, 1 + maxShift * 0.18, 1];
  const finalSnapshotAt = market.locksAt || market.expectedAnnouncementAt || fallbackNow;
  const snapshotTimes = [
    finalSnapshotAt - 45 * 86400,
    finalSnapshotAt - 28 * 86400,
    finalSnapshotAt - 10 * 86400,
    finalSnapshotAt,
  ];
  const snapshotLabels = [
    "Initial street read",
    "Mid-quarter revision",
    "Pre-lock refresh",
    Math.floor(Date.now() / 1000) >= (market.locksAt || 0) ? "Frozen at market lock" : "Latest street read",
  ];
  const snapshotSources = [
    "First composite sell-side read",
    "Analyst revision sweep",
    "Late pre-lock refresh",
    market.consensusSource,
  ];
  const snapshots = multipliers.map((multiplier, index) => ({
    label: snapshotLabels[index],
    observedAt: snapshotTimes[index],
    value: Math.round(frozenConsensusValue * multiplier),
    source: snapshotSources[index],
    sourceUrl: market.sourceUrl,
  }));
  return snapshots.map((snapshot, index) => {
    const previousSnapshot = snapshots[index - 1] || snapshot;
    const openingSnapshot = snapshots[0] || snapshot;
    const changeFromPrior = snapshot.value - previousSnapshot.value;
    const changeRatioFromPrior = previousSnapshot.value ? changeFromPrior / previousSnapshot.value : 0;
    const changeFromStart = snapshot.value - openingSnapshot.value;
    const changeRatioFromStart = openingSnapshot.value ? changeFromStart / openingSnapshot.value : 0;
    return { ...snapshot, changeFromPrior, changeRatioFromPrior, changeFromStart, changeRatioFromStart };
  });
}

export function buildAnalystEstimates(market, consensusTimeline) {
  const seedHash = Array.from(String(market.slug || "")).reduce(
    (total, character, index) => total + character.charCodeAt(0) * (index + 11),
    0
  );
  const currentConsensus =
    consensusTimeline[consensusTimeline.length - 1]?.value || Number(market.consensusValue || 0);
  const latestObservedAt =
    consensusTimeline[consensusTimeline.length - 1]?.observedAt || market.locksAt || fallbackNow;
  return Array.from({ length: 6 }, (_, index) => {
    const pair = analystFirmPool[(seedHash + index * 3) % analystFirmPool.length];
    const swingBasisPoints = ((seedHash + index * 17) % 41) - 20;
    const estimate = Math.round(currentConsensus * (1 + swingBasisPoints / 1000));
    return { firm: pair[0], analyst: pair[1], estimate, updatedAt: latestObservedAt - index * 3 * 86400 };
  }).sort((left, right) => left.estimate - right.estimate);
}

export function buildMarketModel(seed, live) {
  const win = live ?? deriveWindow(seed);
  const consensusValue = Number(live?.consensusValue ?? seed.consensusValue);
  const consensusSource = live?.consensusSource || seed.consensusSource;
  const baseMarket = {
    ...seed,
    marketId: buildMarketId(seed.idSeed),
    ...win,
    exists: live?.exists ?? false,
    cancelled: live?.cancelled ?? false,
    settled: live?.settled ?? false,
    outcomeHit: live?.outcomeHit ?? false,
    hitPool: live?.hitPool ?? 0n,
    missPool: live?.missPool ?? 0n,
    actualValue: live?.actualValue ?? null,
    sourceUri: live?.sourceUri ?? seed.sourceUrl,
    attestationDigest: live?.attestationDigest ?? "",
    oracleSigner: live?.signer ?? "",
    myPosition: live?.myPosition ?? 0,
    myStake: live?.myStake ?? 0n,
    consensusValue,
    consensusSource,
  };
  const reportingPeriod = parseReportingPeriod(seed.idSeed);
  const consensusTimeline = buildConsensusTimeline(baseMarket);
  const openingConsensusSnapshot = consensusTimeline[0] || {
    label: "Initial street read",
    observedAt: baseMarket.opensAt,
    value: consensusValue,
    source: consensusSource,
    sourceUrl: seed.sourceUrl,
    changeFromPrior: 0,
    changeRatioFromPrior: 0,
    changeFromStart: 0,
    changeRatioFromStart: 0,
  };
  const currentConsensusSnapshot = consensusTimeline[consensusTimeline.length - 1] || openingConsensusSnapshot;
  const consensusMoveValue = currentConsensusSnapshot.value - openingConsensusSnapshot.value;
  const consensusMoveRatio = openingConsensusSnapshot.value
    ? consensusMoveValue / openingConsensusSnapshot.value
    : 0;
  const analystEstimates = buildAnalystEstimates(baseMarket, consensusTimeline);

  return {
    ...baseMarket,
    reportingPeriod,
    consensusTimeline,
    openingConsensusSnapshot,
    currentConsensusSnapshot,
    currentConsensusValue: currentConsensusSnapshot.value,
    currentConsensusDisplay: formatConsensusDisplay(currentConsensusSnapshot.value, seed.consensusDisplay),
    frozenConsensusValue: consensusValue,
    frozenConsensusDisplay: formatConsensusDisplay(consensusValue, seed.consensusDisplay),
    frozenConsensusSource: consensusSource,
    consensusDisplay: formatConsensusDisplay(currentConsensusSnapshot.value, seed.consensusDisplay),
    consensusMoveValue,
    consensusMoveRatio,
    consensusMoveLabel: formatConsensusMoveLabel(consensusMoveRatio),
    analystEstimates,
  };
}
