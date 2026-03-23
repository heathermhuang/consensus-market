import { Suspense, lazy, startTransition, useDeferredValue, useEffect, useState } from "react";
import { ethers } from "ethers";
import marketSeeds from "../data/markets.json";
import demoLiveAddresses from "../demo-live-addresses.json";
import AccountPage from "./AccountPage";
import AdminPortal from "./AdminPortal";
import BrandAvatar from "./BrandAvatar";
import ConnectModal from "./ConnectModal";
import marketHistory from "./market-history";
import { getMarketProfile } from "./market-profiles";
import { getCompanyBrand } from "./brandSystem";
import {
  connectInjectedWallet as connectInjectedProvider,
  connectWalletConnect as connectWalletConnectSession,
  disconnectWalletConnectProvider,
  getWalletConnectProvider,
  resetWalletSession,
} from "./walletConnect";
import {
  buildMarketId,
  buildResolutionDomain,
  buildResolutionPayload,
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  marketAbi,
  oracleAbi,
  registryAbi,
  resolutionTypes,
  shortAddress,
} from "./contracts";

const HistoricalChart = lazy(() => import("./HistoricalChart"));
const ConsensusPanel = lazy(() => import("./ConsensusPanel"));

const fallbackNow = Math.floor(Date.now() / 1000);
const uiStorageKey = "consensusmarket-ui";
const accountStorageKey = "consensusmarket-account";
const adminStorageKey = "consensusmarket-admin";
const walletConnectProjectId = "4d65711ac6253dc16225737fefa2e5ed";
const adminAllowlist = [
  "0xdd01283e8c4e87dd2c3aafa5dcf762903479f156",
  "0x41242bf2d454fd68391eeefd7a43c42439db5d8e",
];
const walletChoiceLabels = {
  browser: "Browser wallet",
  metamask: "MetaMask",
  rabby: "Rabby",
  coinbase: "Coinbase Wallet",
  mobile: "Mobile Wallet / QR",
};

function buildEmptyWallet() {
  return {
    provider: null,
    rawProvider: null,
    signer: null,
    account: "",
    chainId: null,
    connector: "",
  };
}

function deriveWindow(seed) {
  return {
    opensAt: fallbackNow + seed.openOffsetHours * 3600,
    locksAt: fallbackNow + seed.lockOffsetHours * 3600,
    expectedAnnouncementAt: fallbackNow + seed.announcementOffsetHours * 3600,
  };
}

function getStatusLabel(market) {
  const now = Math.floor(Date.now() / 1000);
  if (market.cancelled) return "Cancelled";
  if (market.settled) return market.outcomeHit ? "Resolved Beat" : "Resolved Miss";
  if (now < market.opensAt) return "Upcoming";
  if (now >= market.locksAt) return "Locked";
  return "Open";
}

function toHexChainId(chainId) {
  return `0x${Number(chainId).toString(16)}`;
}

function normalizeAddress(address) {
  return (address || "").toLowerCase();
}

function requireAddress(value, label) {
  const trimmed = String(value || "").trim();
  if (!ethers.isAddress(trimmed)) {
    throw new Error(`Enter a valid ${label} address.`);
  }
  return ethers.getAddress(trimmed);
}

function parseSlugFromHash() {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const slug = params.get("market");
  return marketSeeds.some((seed) => seed.slug === slug) ? slug : null;
}

function parseRouteFromHash() {
  if (typeof window === "undefined") {
    return { view: "board", slug: null };
  }

  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const page = params.get("page");
  const slug = parseSlugFromHash();

  if (page === "account") return { view: "account", slug };
  if (page === "admin") return { view: "admin", slug };
  if (slug) return { view: "market", slug };
  return { view: "board", slug: null };
}

function getShareUrl(slug) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}#market=${slug}`;
}

function jumpToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function buildCreateMarketForm(seed) {
  const window = deriveWindow(seed);
  return {
    idSeed: seed.idSeed,
    ticker: seed.ticker,
    metricName: seed.metricName,
    consensusValue: String(seed.consensusValue),
    consensusSource: seed.consensusSource,
    resolutionPolicy: seed.resolutionPolicy,
    opensAt: String(window.opensAt),
    locksAt: String(window.locksAt),
    expectedAnnouncementAt: String(window.expectedAnnouncementAt),
  };
}

function formatNewsTimestamp(value) {
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

function formatTimestampWithYear(timestamp) {
  if (!timestamp) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Number(timestamp) * 1000));
}

function getMediaLogoUrl(article) {
  const domain = article?.sourceDomain || "";
  if (!domain) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function parseReportingPeriod(idSeed) {
  const match = String(idSeed || "").match(/_Q([1-4])_(\d{4})_/i);
  if (!match) return "Current period";
  return `Q${match[1]} ${match[2]}`;
}

function extractConsensusUnit(consensusDisplay) {
  return String(consensusDisplay || "")
    .replace(/^[\d,.]+(?:\.\d+)?(?:[KMBT])?\s*/i, "")
    .trim();
}

function formatConsensusDisplay(value, consensusDisplay) {
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

function formatConsensusMoveLabel(changeRatio) {
  if (!Number.isFinite(changeRatio) || Math.abs(changeRatio) < 0.0005) {
    return "Flat versus first read";
  }
  return `${changeRatio > 0 ? "Up" : "Down"} ${formatPercent(Math.abs(changeRatio))} versus first read`;
}

function SectionLoadingState({ title, copy, cards = 2 }) {
  return (
    <div className="loading-state" aria-busy="true" aria-live="polite">
      <div className="loading-state-copy">
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
      <div className={`loading-state-grid ${cards === 1 ? "loading-state-grid-single" : ""}`}>
        {Array.from({ length: cards }).map((_, index) => (
          <article key={`${title}-${index}`} className="loading-card">
            <span className="loading-block loading-block-kicker" />
            <span className="loading-block loading-block-title" />
            <span className="loading-block loading-block-line" />
            <span className="loading-block loading-block-line loading-block-line-short" />
          </article>
        ))}
      </div>
    </div>
  );
}

function buildConsensusTimeline(market) {
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

    return {
      ...snapshot,
      changeFromPrior,
      changeRatioFromPrior,
      changeFromStart,
      changeRatioFromStart,
    };
  });
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

function buildAnalystEstimates(market, consensusTimeline) {
  const seedHash = Array.from(String(market.slug || "")).reduce(
    (total, character, index) => total + character.charCodeAt(0) * (index + 11),
    0
  );
  const currentConsensus = consensusTimeline[consensusTimeline.length - 1]?.value || Number(market.consensusValue || 0);
  const latestObservedAt = consensusTimeline[consensusTimeline.length - 1]?.observedAt || market.locksAt || fallbackNow;

  return Array.from({ length: 6 }, (_, index) => {
    const pair = analystFirmPool[(seedHash + index * 3) % analystFirmPool.length];
    const swingBasisPoints = ((seedHash + index * 17) % 41) - 20;
    const estimate = Math.round(currentConsensus * (1 + swingBasisPoints / 1000));
    return {
      firm: pair[0],
      analyst: pair[1],
      estimate,
      updatedAt: latestObservedAt - index * 3 * 86400,
    };
  }).sort((left, right) => left.estimate - right.estimate);
}

function formatCountdown(timestamp) {
  if (!timestamp) return "Not scheduled";

  const delta = Number(timestamp) - Math.floor(Date.now() / 1000);
  const absDelta = Math.abs(delta);
  const hours = Math.floor(absDelta / 3600);
  const minutes = Math.floor((absDelta % 3600) / 60);

  if (delta >= 0) {
    return `in ${hours}h ${minutes}m`;
  }

  return `${hours}h ${minutes}m ago`;
}

function calculateProbability(pool, totalPool) {
  if (totalPool === 0n) return 0;
  return Number(pool) / Number(totalPool);
}

function calculatePreviewPayout(market, side, stakeAmount) {
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

function formatResolvedDelta(actualValue, consensusValue) {
  if (actualValue === null || actualValue === undefined) return "Pending resolution";

  const delta = Number(actualValue) - Number(consensusValue);
  if (delta === 0) return "Exactly on consensus";
  if (delta > 0) return `Beat by ${formatNumber(delta)}`;
  return `Missed by ${formatNumber(Math.abs(delta))}`;
}

function getRpcHost(rpcUrl) {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "Not configured";
  }
}

function getConfiguredRpcUrls(runtimeConfig) {
  const candidates = [...(runtimeConfig.rpcUrls || []), runtimeConfig.rpcUrl || ""]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(candidates)];
}

function readStoredPreferences() {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(uiStorageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function readStoredAccountProfile() {
  if (typeof window === "undefined") {
    return {
      displayName: "",
      email: "",
      focus: "",
      defaultStake: "100",
    };
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
    return {
      displayName: "",
      email: "",
      focus: "",
      defaultStake: "100",
    };
  }
}

function readStoredAdminPolicy() {
  if (typeof window === "undefined") {
    return { blacklist: [] };
  }

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

function getStatusKey(market) {
  if (market.cancelled) return "cancelled";
  if (market.settled) return "resolved";
  const now = Math.floor(Date.now() / 1000);
  if (now < market.opensAt) return "upcoming";
  if (now >= market.locksAt) return "locked";
  return "open";
}

function compareMarkets(a, b, sortMode) {
  if (sortMode === "liquidity") {
    return Number(b.hitPool + b.missPool - (a.hitPool + a.missPool));
  }
  if (sortMode === "lock") {
    return a.locksAt - b.locksAt;
  }
  if (sortMode === "odds") {
    const aProbability = calculateProbability(a.hitPool, a.hitPool + a.missPool);
    const bProbability = calculateProbability(b.hitPool, b.hitPool + b.missPool);
    return bProbability - aProbability;
  }
  if (sortMode === "company") {
    return a.company.localeCompare(b.company);
  }
  return a.ticker.localeCompare(b.ticker);
}

function buildOutcomeQuestion(market) {
  if (!market) return "";
  return `Will ${market.company} beat Street consensus on ${market.metricName.toLowerCase()} in ${market.reportingPeriod}?`;
}

function getSignalLabel(probability) {
  if (probability >= 0.7) return "High-conviction beat";
  if (probability >= 0.55) return "Beat leaning";
  if (probability <= 0.3) return "High-conviction miss";
  if (probability <= 0.45) return "Miss leaning";
  return "Balanced market";
}

function buildMarketModel(seed, live) {
  const window = live ?? deriveWindow(seed);
  const consensusValue = Number(live?.consensusValue ?? seed.consensusValue);
  const consensusSource = live?.consensusSource || seed.consensusSource;
  const baseMarket = {
    ...seed,
    marketId: buildMarketId(seed.idSeed),
    ...window,
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
  const consensusMoveRatio = openingConsensusSnapshot.value ? consensusMoveValue / openingConsensusSnapshot.value : 0;
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

export default function App({ runtimeConfig }) {
  const initialRoute = parseRouteFromHash();
  const storedPreferences = readStoredPreferences();
  const [appView, setAppView] = useState(initialRoute.view);
  const [selectedSlug, setSelectedSlug] = useState(initialRoute.slug);
  const [query, setQuery] = useState(() => storedPreferences.query || "");
  const [statusFilter, setStatusFilter] = useState(() => storedPreferences.statusFilter || "all");
  const [sortMode, setSortMode] = useState(() => storedPreferences.sortMode || "liquidity");
  const [autoRefresh, setAutoRefresh] = useState(() => storedPreferences.autoRefresh ?? true);
  const [stakeAmount, setStakeAmount] = useState(() => readStoredAccountProfile().defaultStake || "100");
  const [wallet, setWallet] = useState(buildEmptyWallet);
  const [accountProfile, setAccountProfile] = useState(readStoredAccountProfile);
  const [adminPolicy, setAdminPolicy] = useState(readStoredAdminPolicy);
  const [blacklistDraft, setBlacklistDraft] = useState("");
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [marketState, setMarketState] = useState({});
  const [credits, setCredits] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [banner, setBanner] = useState("Loading runtime config...");
  const [signature, setSignature] = useState("");
  const [digest, setDigest] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [activeRpcUrl, setActiveRpcUrl] = useState("");
  const [activityFeed, setActivityFeed] = useState([]);
  const [companyNews, setCompanyNews] = useState({
    loading: false,
    articles: [],
    updatedAt: "",
    query: "",
    error: "",
  });
  const [systemStatus, setSystemStatus] = useState({
    rpcHealthy: false,
    marketOwner: "",
    oracleOwner: "",
    registryOwner: "",
    walletEligible: false,
    walletReporter: false,
    walletSigner: false,
    statusCheckedAt: null,
  });
  const [operatorForm, setOperatorForm] = useState({
    eligibilityAddress: "",
    creditAddress: "",
    creditAmount: "1000",
    reporterAddress: "",
    signerAddress: "",
  });
  const [createMarketForm, setCreateMarketForm] = useState(() => buildCreateMarketForm(marketSeeds[0]));
  const [attestationForm, setAttestationForm] = useState({
    actualValue: "425000",
    sourceLabel: "tesla-q2-2026-release",
    sourceUri: "https://ir.tesla.com",
    observedAt: String(fallbackNow),
    validAfter: "0",
    validBefore: String(fallbackNow + 86400),
    nonce: "1",
  });
  const [marketSurface, setMarketSurface] = useState("overview");
  const [pendingSectionId, setPendingSectionId] = useState("");

  const deferredQuery = useDeferredValue(query);
  const blacklist = adminPolicy.blacklist || [];
  const isWalletBlacklisted = Boolean(wallet.account) && blacklist.includes(normalizeAddress(wallet.account));
  const canAccessAccount = Boolean(wallet.account);
  const canAccessAdmin = Boolean(wallet.account) && adminAllowlist.includes(normalizeAddress(wallet.account));
  const catalog = marketSeeds
    .filter((seed) => {
      const haystack = `${seed.company} ${seed.ticker} ${seed.metricName} ${seed.focus}`.toLowerCase();
      return haystack.includes(deferredQuery.trim().toLowerCase());
    })
    .map((seed) => buildMarketModel(seed, marketState[seed.slug]))
    .filter((market) => statusFilter === "all" || getStatusKey(market) === statusFilter)
    .sort((left, right) => compareMarkets(left, right, sortMode));

  const allMarkets = marketSeeds.map((seed) => buildMarketModel(seed, marketState[seed.slug]));

  useEffect(() => {
    if (selectedSlug && !allMarkets.some((market) => market.slug === selectedSlug)) {
      setSelectedSlug(null);
    }
  }, [allMarkets, selectedSlug]);

  useEffect(() => {
    if (appView === "market" && !selectedSlug) {
      setAppView("board");
    }
  }, [appView, selectedSlug]);

  useEffect(() => {
    if (appView === "account" && !canAccessAccount) {
      setAppView(selectedSlug ? "market" : "board");
      setConnectModalOpen(true);
      setBanner("Connect a wallet to access the account page.");
      return;
    }

    if (appView === "admin" && !canAccessAdmin) {
      setAppView(selectedSlug ? "market" : "board");
      setBanner(
        wallet.account
          ? "This wallet is not authorized for the admin portal."
          : "Connect an authorized admin wallet to access the admin portal."
      );
    }
  }, [appView, canAccessAccount, canAccessAdmin, selectedSlug, wallet.account]);

  useEffect(() => {
    if (marketSurface === "admin" && !canAccessAdmin) {
      setMarketSurface("overview");
      setPendingSectionId("");
    }
  }, [canAccessAdmin, marketSurface]);

  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = parseRouteFromHash();
      setAppView(nextRoute.view);
      setSelectedSlug(nextRoute.slug);
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (appView === "board" && !selectedSlug) {
      if (window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      return;
    }

    let nextHash = "";
    if (appView === "market" && selectedSlug) {
      nextHash = `#market=${selectedSlug}`;
    } else if (appView === "account") {
      nextHash = "#page=account";
    } else if (appView === "admin") {
      nextHash = selectedSlug ? `#page=admin&market=${selectedSlug}` : "#page=admin";
    }

    if (!nextHash) return;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, [appView, selectedSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    jumpToTop();
  }, [appView, selectedSlug]);

  useEffect(() => {
    setMarketSurface("overview");
  }, [selectedSlug]);

  useEffect(() => {
    if (!selectedSlug) return;

    if (!pendingSectionId) {
      jumpToTop();
      return;
    }

    const timerId = window.setTimeout(() => {
      const section = document.getElementById(pendingSectionId);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        jumpToTop();
      }
      setPendingSectionId("");
    }, 40);

    return () => window.clearTimeout(timerId);
  }, [marketSurface, pendingSectionId, selectedSlug]);

  const selectedMarket = selectedSlug ? allMarkets.find((market) => market.slug === selectedSlug) ?? null : null;
  const adminMarket = selectedMarket ?? allMarkets[0] ?? null;
  const selectedHistory = selectedMarket ? marketHistory[selectedMarket.slug] || [] : [];
  const totalPool = selectedMarket ? selectedMarket.hitPool + selectedMarket.missPool : 0n;
  const hitProbability = selectedMarket ? calculateProbability(selectedMarket.hitPool, totalPool) : 0;
  const missProbability = selectedMarket ? calculateProbability(selectedMarket.missPool, totalPool) : 0;
  const hitPreview = selectedMarket ? calculatePreviewPayout(selectedMarket, 1, stakeAmount) : 0n;
  const missPreview = selectedMarket ? calculatePreviewPayout(selectedMarket, 2, stakeAmount) : 0n;
  const hasLiveContracts = Boolean(
    runtimeConfig.marketAddress && runtimeConfig.oracleAddress && runtimeConfig.registryAddress
  );
  const configuredRpcUrls = getConfiguredRpcUrls(runtimeConfig);
  const configuredRpcKey = configuredRpcUrls.join(",");
  const hasConfiguredRpc = Boolean(runtimeConfig.rpcConfigured || configuredRpcUrls.length > 0);
  const hasRuntimeRpc = configuredRpcUrls.length > 0;
  const walletOnExpectedChain = wallet.chainId === runtimeConfig.chainId;
  const ownerChecks = [systemStatus.marketOwner, systemStatus.oracleOwner, systemStatus.registryOwner].filter(Boolean);
  const expectedOperator = runtimeConfig.operatorAddress || ownerChecks[0] || "";
  const canOperate =
    canAccessAdmin &&
    normalizeAddress(expectedOperator) === normalizeAddress(wallet.account) &&
    (ownerChecks.length === 0 || ownerChecks.every((address) => normalizeAddress(address) === normalizeAddress(expectedOperator)));
  const marketCounts = allMarkets.reduce(
    (counts, market) => {
      counts[getStatusKey(market)] += 1;
      return counts;
    },
    { open: 0, locked: 0, upcoming: 0, resolved: 0, cancelled: 0 }
  );
  const focusFilters = [...new Set(allMarkets.map((market) => market.focus))].slice(0, 8);
  const positions = allMarkets
    .filter((market) => market.myPosition !== 0 || market.myStake > 0n)
    .map((market) => ({
      ...market,
      side: market.myPosition === 1 ? "Beat" : "Miss",
      statusLabel: getStatusLabel(market),
      statusClass: getStatusLabel(market).toLowerCase().replace(/\s+/g, "-"),
      stake: market.myStake,
    }))
    .sort((left, right) => right.expectedAnnouncementAt - left.expectedAnnouncementAt);
  const totalStaked = positions.reduce((total, position) => total + position.myStake, 0n);
  const claimableCount = positions.filter((position) => position.settled).length;
  const featuredMarket = catalog[0] ?? allMarkets[0];
  const nextCatalystMarket =
    [...allMarkets]
      .filter((market) => !market.cancelled && !market.settled)
      .sort((left, right) => left.expectedAnnouncementAt - right.expectedAnnouncementAt)[0] ?? featuredMarket;
  const selectedStatus = selectedMarket ? getStatusLabel(selectedMarket) : "Open";
  const selectedSignal = selectedMarket ? getSignalLabel(hitProbability) : "Balanced market";
  const selectedCompanyProfile = selectedMarket ? getMarketProfile(selectedMarket.company, selectedMarket.ticker) : null;
  const selectedMajorHolders = selectedCompanyProfile
    ? selectedCompanyProfile.majorHolders.length > 2
      ? `${selectedCompanyProfile.majorHolders.slice(0, 2).join(" · ")} +${selectedCompanyProfile.majorHolders.length - 2} more`
      : selectedCompanyProfile.majorHolders.join(" · ")
    : "";
  const quickFacts = selectedMarket
    ? [
        {
          label: "Reporting period",
          value: selectedMarket.reportingPeriod,
          detail: `Expected report ${formatTimestampWithYear(selectedMarket.expectedAnnouncementAt)}`,
        },
        {
          label: "Street consensus",
          value: selectedMarket.currentConsensusDisplay,
          detail: `${selectedMarket.consensusMoveLabel} · ${selectedMarket.currentConsensusSnapshot.label} ${formatTimestampWithYear(selectedMarket.currentConsensusSnapshot.observedAt)}`,
        },
        {
          label: "Lock reference",
          value: selectedMarket.frozenConsensusDisplay,
          detail: selectedMarket.frozenConsensusSource,
        },
        {
          label: "Pool depth",
          value: formatCompactNumber(totalPool),
          detail: `${formatPercent(hitProbability)} beat / ${formatPercent(missProbability)} miss · ${formatCountdown(selectedMarket.expectedAnnouncementAt)}`,
        },
      ]
    : [];
  const heroSignalFacts = selectedMarket
    ? [
        {
          label: "Signal",
          value: selectedSignal,
          detail: `${formatPercent(hitProbability)} beat pricing`,
          tone: hitProbability >= 0.5 ? "tone-beat" : "tone-miss",
        },
        {
          label: "Street now",
          value: selectedMarket.currentConsensusDisplay,
          detail: selectedMarket.consensusMoveLabel,
          tone: "tone-neutral",
        },
        {
          label: "Liquidity",
          value: formatCompactNumber(totalPool),
          detail: `${formatNumber(selectedMarket.hitPool)} beat / ${formatNumber(selectedMarket.missPool)} miss`,
          tone: "tone-neutral",
        },
      ]
    : [];
  const selectedPositionLabel = selectedMarket
    ? selectedMarket.myPosition === 1
      ? "Beat"
      : selectedMarket.myPosition === 2
        ? "Miss"
        : "No position"
    : "No position";
  const selectedOutcomeLabel = selectedMarket
    ? selectedMarket.actualValue === null
      ? "Pending"
      : formatNumber(selectedMarket.actualValue)
    : "Pending";
  const selectedDeltaLabel = selectedMarket
    ? formatResolvedDelta(selectedMarket.actualValue, selectedMarket.frozenConsensusValue)
    : "Pending resolution";
  const runtimeModeLabel = systemStatus.rpcHealthy ? "Live sync" : "Scenario mode";

  useEffect(() => {
    let cancelled = false;

    if (!selectedMarket) {
      setCompanyNews({
        loading: false,
        articles: [],
        updatedAt: "",
        query: "",
        error: "",
      });
      return () => {
        cancelled = true;
      };
    }

    async function loadCompanyNews() {
      setCompanyNews({
        loading: true,
        articles: [],
        updatedAt: "",
        query: "",
        error: "",
      });

      try {
        const response = await fetch(`/news.json?market=${selectedMarket.slug}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("News feed unavailable");
        }
        const data = await response.json();
        if (cancelled) return;
        setCompanyNews({
          loading: false,
          articles: Array.isArray(data.articles) ? data.articles.slice(0, 4) : [],
          updatedAt: data.updatedAt || "",
          query: data.query || "",
          error: "",
        });
      } catch {
        if (cancelled) return;
        setCompanyNews({
          loading: false,
          articles: [],
          updatedAt: "",
          query: "",
          error: "Live company news is unavailable right now.",
        });
      }
    }

    void loadCompanyNews();

    return () => {
      cancelled = true;
    };
  }, [selectedMarket?.slug]);

  useEffect(() => {
    const rawProvider = wallet.rawProvider;
    if (!rawProvider?.on) return undefined;

    const onAccountsChanged = () => {
      void refreshWalletFromConnector(rawProvider, wallet.connector || "injected");
    };
    const onChainChanged = () => {
      void refreshWalletFromConnector(rawProvider, wallet.connector || "injected");
    };
    const onDisconnect = () => {
      setWallet(buildEmptyWallet());
      setConnectModalOpen(false);
      setBanner("Wallet disconnected.");
    };

    rawProvider.on("accountsChanged", onAccountsChanged);
    rawProvider.on("chainChanged", onChainChanged);
    rawProvider.on?.("disconnect", onDisconnect);

    return () => {
      rawProvider.removeListener?.("accountsChanged", onAccountsChanged);
      rawProvider.removeListener?.("chainChanged", onChainChanged);
      rawProvider.removeListener?.("disconnect", onDisconnect);
    };
  }, [wallet.connector, wallet.rawProvider]);

  useEffect(() => {
    let cancelled = false;

    async function restoreWalletSession() {
      if (typeof window === "undefined") return;

      try {
        if (window.ethereum) {
          const restored = await refreshWalletFromConnector(window.ethereum, "injected");
          if (restored || cancelled) return;
        }
      } catch {
        // continue to WalletConnect restore
      }

      try {
        const walletConnectProvider = await getWalletConnectProvider({
          projectId: walletConnectProjectId,
          chainId: runtimeConfig.chainId || 1,
          rpcUrls: configuredRpcUrls,
        });
        if (cancelled) return;
        if (walletConnectProvider?.session && walletConnectProvider.accounts?.length) {
          await refreshWalletFromConnector(walletConnectProvider, "walletconnect");
        }
      } catch {
        // wallet connect is optional during restore
      }
    }

    void restoreWalletSession();
    return () => {
      cancelled = true;
    };
  }, [configuredRpcKey, runtimeConfig.chainId]);

  useEffect(() => {
    if (!hasLiveContracts) return undefined;

    void refreshOnChain();
    if (!autoRefresh) return undefined;

    const intervalId = window.setInterval(() => {
      void refreshOnChain();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [
    wallet.account,
    wallet.chainId,
    runtimeConfig.chainId,
    runtimeConfig.marketAddress,
    runtimeConfig.oracleAddress,
    runtimeConfig.registryAddress,
    runtimeConfig.rpcUrl,
    autoRefresh,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      uiStorageKey,
      JSON.stringify({
        query,
        statusFilter,
        sortMode,
        autoRefresh,
      })
    );
  }, [autoRefresh, query, sortMode, statusFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(accountStorageKey, JSON.stringify(accountProfile));
  }, [accountProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(adminStorageKey, JSON.stringify(adminPolicy));
  }, [adminPolicy]);

  useEffect(() => {
    let cancelled = false;

    async function loadActivity() {
      try {
        const response = await fetch("/activity.json", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setActivityFeed(Array.isArray(data.events) ? data.events.slice(0, 8) : []);
        }
      } catch {
        if (!cancelled) {
          setActivityFeed([]);
        }
      }
    }

    void loadActivity();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hasLiveContracts && systemStatus.rpcHealthy) {
      setBanner(
        `Live market contracts are online on Ethereum chain ${runtimeConfig.chainId}. Connect a wallet to trade, review positions, or use the admin portal.`
      );
      return;
    }
    if (hasLiveContracts && hasConfiguredRpc) {
      setBanner("Contracts are configured, but the live RPC is currently unavailable. The board is running in scenario mode until sync returns.");
      return;
    }
    if (runtimeConfig.marketAddress && runtimeConfig.oracleAddress) {
      setBanner("Market and oracle contracts are configured. Add the registry address and a healthy RPC URL to unlock the full operator workflow.");
      return;
    }
    setBanner("Frontend is live in scenario mode. Wallet connection is available, and live actions will switch on once contract addresses and RPC are healthy.");
  }, [
    hasLiveContracts,
    hasConfiguredRpc,
    hasRuntimeRpc,
    runtimeConfig.chainId,
    runtimeConfig.marketAddress,
    runtimeConfig.oracleAddress,
    systemStatus.rpcHealthy,
  ]);

async function refreshWalletFromConnector(rawProvider, connector, requestAccounts = false) {
    if (!rawProvider) {
      setWallet(buildEmptyWallet());
      return false;
    }

    const provider = new ethers.BrowserProvider(rawProvider);
    if (requestAccounts) {
      if (connector === "walletconnect" && typeof rawProvider.enable === "function") {
        await rawProvider.enable();
      } else {
        await provider.send("eth_requestAccounts", []);
      }
    }

    const accounts = await provider.listAccounts();
    const network = await provider.getNetwork();

    if (accounts.length === 0) {
      setWallet({
        provider,
        rawProvider,
        signer: null,
        account: "",
        chainId: Number(network.chainId),
        connector,
      });
      return false;
    }

    const signer = await provider.getSigner();
    setWallet({
      provider,
      rawProvider,
      signer,
      account: accounts[0].address,
      chainId: Number(network.chainId),
      connector,
    });
    return true;
  }

  async function ensureRuntimeChain(rawProvider = wallet.rawProvider) {
    if (!rawProvider) return;

    const chainIdHex = toHexChainId(runtimeConfig.chainId || 1);

    try {
      await rawProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
      return;
    } catch (error) {
      if (error?.code !== 4902 || !configuredRpcUrls.length) {
        throw error;
      }
    }

    await rawProvider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: "Ethereum Mainnet",
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: configuredRpcUrls,
        },
      ],
    });
  }

  async function refreshOnChain() {
    const readProviders = [];
    if (hasRuntimeRpc) {
      for (const rpcUrl of configuredRpcUrls) {
        readProviders.push({ provider: new ethers.JsonRpcProvider(rpcUrl), rpcUrl });
      }
    }
    if (wallet.provider && (walletOnExpectedChain || !hasRuntimeRpc)) {
      readProviders.push({ provider: wallet.provider, rpcUrl: "wallet" });
    }

    for (const candidate of readProviders) {
      try {
        const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, candidate.provider);
        const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, candidate.provider);
        const registryContract = new ethers.Contract(runtimeConfig.registryAddress, registryAbi, candidate.provider);
        const traderAccount = wallet.account || ethers.ZeroAddress;
        const nextState = {};

        for (const seed of marketSeeds) {
          const marketId = buildMarketId(seed.idSeed);
          const [marketData, resolution, myPosition, myStake] = await Promise.all([
            marketContract.getMarket(marketId),
            oracleContract.getResolution(marketId),
            marketContract.positions(marketId, traderAccount),
            marketContract.stakes(marketId, traderAccount),
          ]);

          nextState[seed.slug] = {
            exists: marketData.exists,
            cancelled: marketData.cancelled,
            settled: marketData.settled,
            outcomeHit: marketData.outcomeHit,
            consensusValue: Number(marketData.consensusValue),
            consensusSource: marketData.consensusSource,
            opensAt: Number(marketData.opensAt),
            locksAt: Number(marketData.locksAt),
            expectedAnnouncementAt: Number(marketData.expectedAnnouncementAt),
            hitPool: marketData.hitPool,
            missPool: marketData.missPool,
            actualValue: resolution.actualValue,
            sourceUri: resolution.sourceUri,
            attestationDigest: resolution.attestationDigest,
            signer: resolution.signer,
            myPosition: Number(myPosition),
            myStake,
          };
        }

        const [
          marketOwner,
          oracleOwner,
          registryOwner,
          walletEligible,
          walletReporter,
          walletSigner,
          nextCredits,
        ] = await Promise.all([
          marketContract.owner(),
          oracleContract.owner(),
          registryContract.owner(),
          wallet.account ? registryContract.isEligible(traderAccount) : false,
          wallet.account ? oracleContract.authorizedReporters(traderAccount) : false,
          wallet.account ? oracleContract.authorizedSigners(traderAccount) : false,
          wallet.account ? marketContract.demoCredits(traderAccount) : null,
        ]);

        setMarketState(nextState);
        setSystemStatus({
          rpcHealthy: true,
          marketOwner,
          oracleOwner,
          registryOwner,
          walletEligible,
          walletReporter,
          walletSigner,
          statusCheckedAt: Date.now(),
        });
        setActiveRpcUrl(candidate.rpcUrl);
        setCredits(nextCredits);
        setLastSyncAt(Date.now());
        return;
      } catch {
        continue;
      }
    }

    const nextState = {};
    for (const seed of marketSeeds) {
      nextState[seed.slug] = {
        ...deriveWindow(seed),
        hitPool: 0n,
        missPool: 0n,
        myPosition: 0,
        myStake: 0n,
      };
    }

    setMarketState(nextState);
    setSystemStatus({
      rpcHealthy: false,
      marketOwner: "",
      oracleOwner: "",
      registryOwner: "",
      walletEligible: false,
      walletReporter: false,
      walletSigner: false,
      statusCheckedAt: Date.now(),
    });
    setActiveRpcUrl("");
    setCredits(null);
    setLastSyncAt(null);
  }

  async function connectInjectedWallet(preferredWallet = "browser") {
    try {
      await resetWalletSession();
      const injectedProvider = await connectInjectedProvider({ preferredWallet });
      await refreshWalletFromConnector(injectedProvider, "injected", true);
      await ensureRuntimeChain(injectedProvider);
      await refreshWalletFromConnector(injectedProvider, "injected");
      setConnectModalOpen(false);
      const connectedLabel =
        preferredWallet === "metamask"
          ? "MetaMask"
          : preferredWallet === "rabby"
            ? "Rabby"
            : preferredWallet === "coinbase"
              ? "Coinbase Wallet"
              : "Browser wallet";
      setBanner(`${connectedLabel} connected on Ethereum. Account, market, and admin surfaces are now available.`);
      return true;
    } catch (error) {
      setBanner(error.message || "Wallet connection failed.");
      throw error;
    }
  }

  async function connectWalletConnect({ selectedWallet = "mobile", onDisplayUri } = {}) {
    try {
      await resetWalletSession();
      const walletConnectProvider = await connectWalletConnectSession({
        projectId: walletConnectProjectId,
        chainId: runtimeConfig.chainId || 1,
        rpcUrls: configuredRpcUrls,
        onDisplayUri,
        metadata: {
          name: "Consensus Market",
          description: "Prediction Market that bests Street Consensus",
          url: typeof window !== "undefined" ? window.location.origin : "https://consensusmarket.com",
          icons: [`${typeof window !== "undefined" ? window.location.origin : "https://consensusmarket.com"}/company-logos/coinbase.svg`],
        },
      });
      await refreshWalletFromConnector(walletConnectProvider, "walletconnect", true);
      await ensureRuntimeChain(walletConnectProvider);
      await refreshWalletFromConnector(walletConnectProvider, "walletconnect");
      setConnectModalOpen(false);
      setBanner(`${walletChoiceLabels[selectedWallet] || "WalletConnect"} session established on Ethereum. You can now review positions or trade where live actions are available.`);
      return true;
    } catch (error) {
      setBanner(error.message || "Wallet connection failed.");
      throw error;
    }
  }

  async function disconnectWallet() {
    try {
      if (wallet.connector === "walletconnect") {
        await disconnectWalletConnectProvider();
      }
      await resetWalletSession();
      setWallet(buildEmptyWallet());
      setConnectModalOpen(false);
      setBanner("Wallet disconnected.");
    } catch (error) {
      setBanner(error.message || "Could not disconnect the wallet cleanly.");
    }
  }

  async function connectDemoChain() {
    if (!wallet.rawProvider) {
      setBanner("Connect a wallet first.");
      return;
    }

    try {
      await ensureRuntimeChain(wallet.rawProvider);
      await refreshWalletFromConnector(wallet.rawProvider, wallet.connector || "injected");
      setBanner("Wallet switched to Ethereum.");
    } catch (error) {
      setBanner(error.message || "Network switch failed.");
    }
  }

  async function runMarketAction(label, callback) {
    if (!wallet.signer) {
      setBanner("Connect a wallet first.");
      return;
    }
    if (isWalletBlacklisted) {
      setBanner("This wallet is on this browser's local restricted list. On-chain denylist enforcement is not enabled yet.");
      return;
    }
    if (!hasLiveContracts) {
      setBanner("Add live contract addresses to the Worker runtime config to enable on-chain actions.");
      return;
    }
    if (hasRuntimeRpc && !walletOnExpectedChain) {
      setBanner(`Switch your wallet to chain ${runtimeConfig.chainId} before sending transactions.`);
      return;
    }

    try {
      setBusyAction(label);
      await callback();
      await refreshOnChain();
    } catch (error) {
      setBanner(error.shortMessage || error.message || "Transaction failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function runOperatorAction(label, callback) {
    if (!wallet.signer) {
      setBanner("Connect a wallet first.");
      return;
    }
    if (!hasLiveContracts) {
      setBanner("The operator console needs market, oracle, and registry addresses plus an RPC URL.");
      return;
    }
    if (hasRuntimeRpc && !walletOnExpectedChain) {
      setBanner(`Switch your wallet to chain ${runtimeConfig.chainId} before using operator actions.`);
      return;
    }
    if (!canOperate) {
      setBanner("The connected wallet is not the contract owner set. Switch to the operator wallet to use admin actions.");
      return;
    }

    try {
      setBusyAction(label);
      await callback();
      await refreshOnChain();
    } catch (error) {
      setBanner(error.shortMessage || error.message || "Operator action failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function takePosition(side) {
    await runMarketAction(`position-${side}`, async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.takePosition(selectedMarket.marketId, side, BigInt(stakeAmount || "0"));
      await tx.wait();
      setBanner(`Submitted a ${side === 1 ? "Beat" : "Miss"} position on ${selectedMarket.ticker}.`);
    });
  }

  async function settleMarket() {
    await runMarketAction("settle", async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.settleMarket(selectedMarket.marketId);
      await tx.wait();
      setBanner(`Settled ${selectedMarket.ticker} using the oracle resolution.`);
    });
  }

  async function claimPayout() {
    await runMarketAction("claim", async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.claim(selectedMarket.marketId);
      await tx.wait();
      setBanner(`Claimed demo-credit payout for ${selectedMarket.ticker}.`);
    });
  }

  async function signAttestation() {
    if (!wallet.signer) {
      setBanner("Connect a wallet to sign the EIP-712 attestation.");
      return;
    }
    if (!runtimeConfig.oracleAddress) {
      setBanner("Add a live oracle address to Worker runtime config before signing attestations.");
      return;
    }
    if (hasRuntimeRpc && !walletOnExpectedChain) {
      setBanner(`Switch your wallet to chain ${runtimeConfig.chainId} before signing the attestation.`);
      return;
    }

    try {
      setBusyAction("sign");
      const payload = buildResolutionPayload(selectedMarket.marketId, attestationForm);
      const signed = await wallet.signer.signTypedData(
        buildResolutionDomain(wallet.chainId || runtimeConfig.chainId, runtimeConfig.oracleAddress),
        resolutionTypes,
        payload
      );
      setSignature(signed);

      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.provider);
      const nextDigest = await oracleContract.hashResolutionPayload(payload);
      setDigest(nextDigest);
      setBanner("Resolution attestation signed locally. Any relayer can now submit it on-chain.");
    } catch (error) {
      setBanner(error.shortMessage || error.message || "Could not sign attestation.");
    } finally {
      setBusyAction("");
    }
  }

  async function relayAttestation() {
    if (!signature) {
      setBanner("Sign the attestation first.");
      return;
    }

    await runMarketAction("relay", async () => {
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.signer);
      const payload = buildResolutionPayload(selectedMarket.marketId, attestationForm);
      const tx = await oracleContract.publishSignedResolution(payload, signature);
      await tx.wait();
      setBanner(`Relayed signed oracle resolution for ${selectedMarket.ticker}.`);
    });
  }

  async function publishDirectResolution() {
    await runOperatorAction("direct-resolve", async () => {
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.signer);
      const tx = await oracleContract.publishResolution(
        selectedMarket.marketId,
        BigInt(attestationForm.actualValue || "0"),
        ethers.id(attestationForm.sourceLabel || "manual-resolution"),
        attestationForm.sourceUri || ""
      );
      await tx.wait();
      setBanner(`Published direct oracle resolution for ${selectedMarket.ticker}.`);
    });
  }

  async function setEligibility(eligible) {
    await runOperatorAction(`eligible-${eligible ? "on" : "off"}`, async () => {
      const targetAddress = requireAddress(operatorForm.eligibilityAddress, "eligibility wallet");
      const registryContract = new ethers.Contract(runtimeConfig.registryAddress, registryAbi, wallet.signer);
      const tx = await registryContract.setEligible(targetAddress, eligible);
      await tx.wait();
      setBanner(`${eligible ? "Allowlisted" : "Removed"} ${targetAddress} in the eligibility registry.`);
    });
  }

  async function grantCredits() {
    await runOperatorAction("grant-credits", async () => {
      const targetAddress = requireAddress(operatorForm.creditAddress, "credit recipient");
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.grantDemoCredits(
        targetAddress,
        BigInt(operatorForm.creditAmount || "0")
      );
      await tx.wait();
      setBanner(`Granted ${operatorForm.creditAmount} demo credits to ${targetAddress}.`);
    });
  }

  async function setReporter(authorized) {
    await runOperatorAction(`reporter-${authorized ? "on" : "off"}`, async () => {
      const targetAddress = requireAddress(operatorForm.reporterAddress, "reporter");
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.signer);
      const tx = await oracleContract.setReporter(targetAddress, authorized);
      await tx.wait();
      setBanner(`${authorized ? "Authorized" : "Revoked"} reporter ${targetAddress}.`);
    });
  }

  async function setSigner(authorized) {
    await runOperatorAction(`signer-${authorized ? "on" : "off"}`, async () => {
      const targetAddress = requireAddress(operatorForm.signerAddress, "signer");
      const oracleContract = new ethers.Contract(runtimeConfig.oracleAddress, oracleAbi, wallet.signer);
      const tx = await oracleContract.setSigner(targetAddress, authorized);
      await tx.wait();
      setBanner(`${authorized ? "Authorized" : "Revoked"} signer ${targetAddress}.`);
    });
  }

  async function createMarket() {
    await runOperatorAction("create-market", async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.createMarket(
        buildMarketId(createMarketForm.idSeed),
        createMarketForm.ticker,
        createMarketForm.metricName,
        BigInt(createMarketForm.consensusValue || "0"),
        createMarketForm.consensusSource,
        createMarketForm.resolutionPolicy,
        BigInt(createMarketForm.opensAt || "0"),
        BigInt(createMarketForm.locksAt || "0"),
        BigInt(createMarketForm.expectedAnnouncementAt || "0")
      );
      await tx.wait();
      setBanner(`Created market ${createMarketForm.ticker} · ${createMarketForm.metricName}.`);
    });
  }

  async function cancelSelectedMarket() {
    await runOperatorAction("cancel-market", async () => {
      const marketContract = new ethers.Contract(runtimeConfig.marketAddress, marketAbi, wallet.signer);
      const tx = await marketContract.cancelMarket(selectedMarket.marketId);
      await tx.wait();
      setBanner(`Cancelled ${selectedMarket.ticker} · ${selectedMarket.metricName}.`);
    });
  }

  async function refreshNow() {
    setBanner("Refreshing live market state...");
    await refreshOnChain();
    setBanner("Live market state refreshed.");
  }

  function applyDemoPreset(type) {
    if (type === "owner") {
      setOperatorForm((current) => ({
        ...current,
        eligibilityAddress: demoLiveAddresses.trader,
        creditAddress: demoLiveAddresses.trader2,
        reporterAddress: demoLiveAddresses.trader,
        signerAddress: demoLiveAddresses.trader2,
      }));
      setBanner("Loaded demo account presets into the operator console.");
      return;
    }

    if (type === "traderA") {
      setOperatorForm((current) => ({
        ...current,
        eligibilityAddress: demoLiveAddresses.trader,
        creditAddress: demoLiveAddresses.trader,
      }));
      setBanner("Loaded Trader A into the operator console.");
      return;
    }

    setOperatorForm((current) => ({
      ...current,
      eligibilityAddress: demoLiveAddresses.trader2,
      creditAddress: demoLiveAddresses.trader2,
    }));
    setBanner("Loaded Trader B into the operator console.");
  }

  async function copyRuntimeSummary() {
    const summary = JSON.stringify(
      {
        chainId: runtimeConfig.chainId,
        marketAddress: runtimeConfig.marketAddress,
        oracleAddress: runtimeConfig.oracleAddress,
        registryAddress: runtimeConfig.registryAddress,
        operatorAddress: runtimeConfig.operatorAddress,
        rpcUrl: runtimeConfig.rpcUrl,
        rpcUrls: configuredRpcUrls,
      },
      null,
      2
    );

    try {
      await navigator.clipboard.writeText(summary);
      setBanner("Copied runtime summary to clipboard.");
    } catch {
      setBanner("Clipboard access failed. Copy the runtime config from /runtime-config.json instead.");
    }
  }

  function updateAttestation(field, value) {
    setAttestationForm((current) => ({ ...current, [field]: value }));
  }

  function updateOperatorForm(field, value) {
    setOperatorForm((current) => ({ ...current, [field]: value }));
  }

  function updateCreateMarketForm(field, value) {
    setCreateMarketForm((current) => ({ ...current, [field]: value }));
  }

  function handleSelectMarket(market) {
    if (!market) return;
    jumpToTop();
    startTransition(() => {
      setAppView("market");
      setSelectedSlug(market.slug);
      setAttestationForm((current) => ({
        ...current,
        sourceUri: market.sourceUrl,
      }));
    });
  }

  function clearSelectedMarket() {
    jumpToTop();
    startTransition(() => {
      setAppView("board");
      setSelectedSlug(null);
    });
  }

  function openBoardView() {
    setPendingSectionId("");
    clearSelectedMarket();
  }

  function openAccountView() {
    if (!canAccessAccount) {
      setBanner("Connect a wallet to access the account page.");
      setConnectModalOpen(true);
      return;
    }
    jumpToTop();
    setConnectModalOpen(false);
    startTransition(() => {
      setAppView("account");
    });
  }

  function openAdminPortal() {
    if (!wallet.account) {
      setBanner("Connect an authorized admin wallet to access the admin portal.");
      setConnectModalOpen(true);
      return;
    }
    if (!canAccessAdmin) {
      setBanner("This wallet is not authorized for the admin portal.");
      return;
    }
    jumpToTop();
    setConnectModalOpen(false);
    startTransition(() => {
      setAppView("admin");
      if (!selectedSlug && allMarkets[0]) {
        setSelectedSlug(allMarkets[0].slug);
      }
    });
  }

  function saveAccountProfile() {
    setStakeAmount(accountProfile.defaultStake || "100");
    setBanner("Saved account preferences for this browser.");
  }

  function updateAccountProfile(field, value) {
    setAccountProfile((current) => ({ ...current, [field]: value }));
  }

  function updateBlacklistDraft(value) {
    setBlacklistDraft(value);
  }

  function addBlacklistedAddress() {
    let nextAddress = "";
    try {
      nextAddress = normalizeAddress(requireAddress(blacklistDraft, "restricted wallet"));
    } catch (error) {
      setBanner(error.message || "Enter a valid wallet address.");
      return;
    }
    setAdminPolicy((current) => ({
      ...current,
      blacklist: [...new Set([...(current.blacklist || []), nextAddress])],
    }));
    setBlacklistDraft("");
    setBanner(`Added ${nextAddress} to this browser's local restricted list.`);
  }

  function removeBlacklistedAddress(address) {
    setAdminPolicy((current) => ({
      ...current,
      blacklist: (current.blacklist || []).filter((entry) => entry !== normalizeAddress(address)),
    }));
    setBanner(`Removed ${address} from this browser's local restricted list.`);
  }

  function openMarketSurface(surface, sectionId = "") {
    if (surface === "admin" && !canAccessAdmin) {
      setBanner(
        wallet.account
          ? "This wallet is not authorized for admin controls."
          : "Connect an authorized admin wallet to open admin controls."
      );
      if (!wallet.account) {
        setConnectModalOpen(true);
      }
      return;
    }
    if (surface !== marketSurface) {
      startTransition(() => {
        setMarketSurface(surface);
      });
    }

    setPendingSectionId(sectionId);

    if (surface === marketSurface && sectionId) {
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        setPendingSectionId("");
      }
    }
  }

  function prefillCreateMarketForm() {
    const targetMarket = selectedMarket ?? adminMarket;
    if (!targetMarket) return;
    setCreateMarketForm(buildCreateMarketForm(targetMarket));
    setBanner(`Prefilled the operator market form from ${targetMarket.ticker}.`);
  }

  async function copySelectedMarketLink() {
    try {
      await navigator.clipboard.writeText(getShareUrl(selectedMarket.slug));
      setBanner(`Copied share link for ${selectedMarket.ticker}.`);
    } catch {
      setBanner("Clipboard access failed. Copy the URL from the browser address bar instead.");
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="topbar topbar-static">
        <div className="topbar-main">
          <div className="brand-lockup brand-lockup-premium">
            <div className="brand-mark" aria-hidden="true">
              <span className="brand-mark-frame">
                <span className="brand-mark-column brand-mark-column-left" />
                <span className="brand-mark-column brand-mark-column-mid" />
                <span className="brand-mark-column brand-mark-column-right" />
                <span className="brand-mark-spark" />
              </span>
            </div>
            <div className="brand-copy">
              <p className="brand-title">Consensus Market</p>
              <p className="brand-subtitle">Prediction Market that bests Street Consensus</p>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="hero-pill">{runtimeModeLabel}</span>
            <span className="hero-pill">{wallet.account ? shortAddress(wallet.account) : "Wallet disconnected"}</span>
            <button type="button" className="primary topbar-wallet" onClick={() => setConnectModalOpen(true)}>
              {wallet.account ? "Manage wallet" : "Connect wallet"}
            </button>
          </div>
        </div>

        <nav className="topbar-nav topbar-nav-band" aria-label="Primary">
          <button type="button" className={`nav-tab ${appView === "board" || appView === "market" ? "active" : ""}`} onClick={openBoardView}>
            Board
          </button>
          {selectedMarket && appView === "market" && (
            <button type="button"
              className="nav-tab active"
              onClick={() => openMarketSurface("overview", "market-overview")}
            >
              {selectedMarket.ticker} market
            </button>
          )}
          {canAccessAccount && (
            <button type="button" className={`nav-tab ${appView === "account" ? "active" : ""}`} onClick={openAccountView}>
              Account
            </button>
          )}
          {canAccessAdmin && (
            <button type="button" className={`nav-tab ${appView === "admin" ? "active" : ""}`} onClick={openAdminPortal}>
              Admin portal
            </button>
          )}
        </nav>
      </header>

      <section className="banner surface-card" aria-label="System status" role="status">
        {banner}
      </section>

      {appView === "account" ? (
        <AccountPage
          wallet={wallet}
          credits={credits}
          systemStatus={systemStatus}
          runtimeModeLabel={runtimeModeLabel}
          walletOnExpectedChain={walletOnExpectedChain}
          isBlacklisted={isWalletBlacklisted}
          canAccessAdmin={canAccessAdmin}
          positions={positions}
          totalStaked={totalStaked}
          claimableCount={claimableCount}
          accountProfile={accountProfile}
          onProfileChange={updateAccountProfile}
          onSaveProfile={saveAccountProfile}
          onOpenMarket={(slug) => handleSelectMarket(allMarkets.find((market) => market.slug === slug))}
          onOpenAdmin={openAdminPortal}
          onOpenConnectModal={() => setConnectModalOpen(true)}
          onDisconnectWallet={disconnectWallet}
        />
      ) : appView === "admin" ? (
        <AdminPortal
          wallet={wallet}
          canOperate={canOperate}
          runtimeModeLabel={runtimeModeLabel}
          runtimeConfig={runtimeConfig}
          configuredRpcUrls={configuredRpcUrls}
          activeRpcUrl={activeRpcUrl}
          lastSyncAt={lastSyncAt}
          selectedMarket={adminMarket}
          allMarkets={allMarkets}
          onSelectMarket={(slug) => setSelectedSlug(slug)}
          onOpenMarket={(slug) => handleSelectMarket(allMarkets.find((market) => market.slug === slug))}
          onOpenConnectModal={() => setConnectModalOpen(true)}
          onRefreshNow={refreshNow}
          copyRuntimeSummary={copyRuntimeSummary}
          applyDemoPreset={applyDemoPreset}
          prefillCreateMarketForm={prefillCreateMarketForm}
          operatorForm={operatorForm}
          updateOperatorForm={updateOperatorForm}
          createMarketForm={createMarketForm}
          updateCreateMarketForm={updateCreateMarketForm}
          attestationForm={attestationForm}
          updateAttestation={updateAttestation}
          blacklistDraft={blacklistDraft}
          updateBlacklistDraft={updateBlacklistDraft}
          blacklist={blacklist}
          addBlacklistedAddress={addBlacklistedAddress}
          removeBlacklistedAddress={removeBlacklistedAddress}
          setEligibility={setEligibility}
          grantCredits={grantCredits}
          setReporter={setReporter}
          setSigner={setSigner}
          signAttestation={signAttestation}
          relayAttestation={relayAttestation}
          publishDirectResolution={publishDirectResolution}
          createMarket={createMarket}
          cancelSelectedMarket={cancelSelectedMarket}
          busyAction={busyAction}
          signature={signature}
          digest={digest}
          systemStatus={systemStatus}
          isBlacklisted={isWalletBlacklisted}
        />
      ) : appView !== "market" || !selectedMarket ? (
        <main id="main-content" className="board-layout" aria-labelledby="board-page-title">
          <h1 id="board-page-title" className="sr-only">Market scanner</h1>
          <aside className="board-sidebar" aria-label="Board summary and filters">
            <section className="surface-card board-overview">
              <div className="board-overview-copy">
                <p className="section-label">Board</p>
                <h2>Scan first. Open only the market you want to work.</h2>
                <p className="panel-copy">
                  Keep the board dense and fast. Detailed research, trading, and operator actions stay inside each market page.
                </p>
              </div>

              <div className="meta-row">
                <span className="hero-pill">Showing {catalog.length} of {allMarkets.length}</span>
                <span className="hero-pill">{marketCounts.open} open now</span>
              </div>
            </section>

            <section className="surface-card filter-bar">
              <div className="panel-heading">
                <div>
                  <p className="section-label">Filters</p>
                  <h2>Refine the board</h2>
                </div>
                <button type="button"
                  className="ghost"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                    setSortMode("liquidity");
                  }}
                >
                  Reset
                </button>
              </div>

              <div className="controls-grid controls-grid-board">
                <label>
                  Search
                  <input
                    className="search"
                    placeholder="Ticker, company, metric, focus"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label>
                  Status
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="locked">Locked</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="resolved">Resolved</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  Sort
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                    <option value="liquidity">Liquidity</option>
                    <option value="lock">Report timing</option>
                    <option value="odds">Beat odds</option>
                    <option value="company">Company</option>
                    <option value="ticker">Ticker</option>
                  </select>
                </label>
              </div>

              <div className="chip-row">
                <button type="button" className={`chip ${query === "" ? "active" : ""}`} onClick={() => setQuery("")}>
                  All sectors
                </button>
                {focusFilters.map((focus) => (
                  <button type="button"
                    key={focus}
                    className={`chip ${query === focus ? "active" : ""}`}
                    onClick={() => setQuery((current) => (current === focus ? "" : focus))}
                  >
                    {focus}
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="surface-card board-main">
            <div className="panel-heading">
              <div>
                <p className="section-label">Markets</p>
                <h2 className="board-title">Market scanner</h2>
                <p className="panel-copy">A compact roster for comparing signal, Street consensus, liquidity, and report timing at a glance.</p>
              </div>
              <div className="meta-row board-main-meta">
                <span className="hero-pill">{systemStatus.rpcHealthy ? "Trading available" : "Scenario board"}</span>
                <span className="hero-pill">
                  {nextCatalystMarket
                    ? `${nextCatalystMarket.ticker} ${formatCountdown(nextCatalystMarket.expectedAnnouncementAt)}`
                    : "No catalyst queued"}
                </span>
                <button type="button" className="ghost" onClick={() => setAutoRefresh((current) => !current)}>
                  Auto-refresh {autoRefresh ? "on" : "off"}
                </button>
                <button type="button" className="ghost" onClick={refreshNow} disabled={busyAction !== ""}>
                  Refresh
                </button>
                <button type="button" className="primary" onClick={() => setConnectModalOpen(true)}>
                  {wallet.account ? `Connected ${shortAddress(wallet.account)}` : "Connect wallet"}
                </button>
              </div>
            </div>

            <section className="surface-card board-mobile-toolbar" aria-label="Mobile filters">
              <div className="controls-grid controls-grid-board">
                <label>
                  Search
                  <input
                    className="search"
                    placeholder="Ticker, company, metric"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label>
                  Status
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="locked">Locked</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="resolved">Resolved</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  Sort
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                    <option value="liquidity">Liquidity</option>
                    <option value="lock">Report timing</option>
                    <option value="odds">Beat odds</option>
                    <option value="company">Company</option>
                    <option value="ticker">Ticker</option>
                  </select>
                </label>
              </div>

              <div className="mobile-toolbar-actions">
                <button type="button" className="primary" onClick={() => setConnectModalOpen(true)}>
                  {wallet.account ? `Connected ${shortAddress(wallet.account)}` : "Connect wallet"}
                </button>
                <button type="button"
                  className="ghost"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                    setSortMode("liquidity");
                  }}
                >
                  Reset filters
                </button>
              </div>
            </section>

            <div className="board-stack">
              <div className="scanner-header" aria-hidden="true">
                <span>Market</span>
                <span>Signal</span>
                <span>Consensus</span>
                <span>Liquidity</span>
                <span>Report</span>
                <span />
              </div>
              {catalog.map((market) => {
                const probability = calculateProbability(market.hitPool, market.hitPool + market.missPool);
                const totalLiquidity = market.hitPool + market.missPool;
                const marketStatus = getStatusLabel(market);

                return (
                  <article key={market.slug} className="board-row">
                    <div className="scanner-grid">
                      <div className="scanner-company">
                        <div className="board-company">
                          <BrandAvatar brand={getCompanyBrand(market.company)} label={market.company} />
                          <div className="table-market-copy">
                            <div className="market-identity">
                              <span className="ticker">{market.ticker}</span>
                              <span className={`status status-${marketStatus.toLowerCase().replace(/\s+/g, "-")}`}>{marketStatus}</span>
                              <span className="hero-pill">{market.reportingPeriod}</span>
                              <span className="hero-pill">{market.focus}</span>
                            </div>
                            <h3>{market.company}</h3>
                            <p>{market.metricName}</p>
                          </div>
                        </div>
                      </div>
                      <div className="scanner-cell">
                        <span className="field-label">Signal</span>
                        <strong>{formatPercent(probability)}</strong>
                        <p>{getSignalLabel(probability)}</p>
                      </div>
                      <div className="scanner-cell">
                        <span className="field-label">Consensus</span>
                        <strong>{market.currentConsensusDisplay}</strong>
                        <p>{market.reportingPeriod} · {market.consensusMoveLabel}</p>
                      </div>
                      <div className="scanner-cell">
                        <span className="field-label">Liquidity</span>
                        <strong>{formatCompactNumber(totalLiquidity)}</strong>
                        <p>{formatNumber(market.hitPool)} beat / {formatNumber(market.missPool)} miss</p>
                      </div>
                      <div className="scanner-cell">
                        <span className="field-label">Report</span>
                        <strong>{formatTimestamp(market.expectedAnnouncementAt)}</strong>
                        <p>{market.reportingPeriod} · {formatCountdown(market.expectedAnnouncementAt)}</p>
                      </div>
                      <div className="scanner-action">
                        <button type="button" className="secondary" onClick={() => handleSelectMarket(market)}>
                          Open market
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {catalog.length === 0 && (
                <div className="empty-state">
                  <strong>No markets match the current filters.</strong>
                  <p>Try widening the search or clearing the current sector and status filters.</p>
                </div>
              )}
            </div>
          </section>
        </main>
      ) : (
        <main id="main-content" className={marketSurface === "overview" ? "market-layout" : "market-admin-layout"}>
          <section className="market-main">
            <article id="market-overview" className="surface-card market-hero-card">
              <div className="market-story-top">
                <button type="button" className="ghost" onClick={clearSelectedMarket}>
                  Back to board
                </button>
                <div className="hero-pill-row">
                  <span className={`status status-${selectedStatus.toLowerCase().replace(/\s+/g, "-")}`}>{selectedStatus}</span>
                  <span className="hero-pill">{selectedMarket.reportingPeriod}</span>
                  <span className="hero-pill">{selectedMarket.focus}</span>
                </div>
              </div>

              <div className="market-headline-copy">
                <div className="market-title-lockup">
                  <BrandAvatar
                    brand={getCompanyBrand(selectedMarket.company)}
                    label={selectedMarket.company}
                    className="brand-avatar-large"
                  />
                  <div className="market-title-copy">
                    <p className="eyebrow">{selectedMarket.ticker} · {selectedMarket.company} · {selectedMarket.reportingPeriod}</p>
                    <h1 className="market-question">{buildOutcomeQuestion(selectedMarket)}</h1>
                  </div>
                </div>
                <p className="hero-text">{selectedMarket.marketNarrative}</p>
              </div>

              <div className="market-signal-strip" aria-label="Current market summary">
                {heroSignalFacts.map((fact) => (
                  <article key={fact.label} className="market-signal-card">
                    <span className="field-label">{fact.label}</span>
                    <strong className={fact.tone}>{fact.value}</strong>
                    <p>{fact.detail}</p>
                  </article>
                ))}
              </div>

              <nav className="market-section-nav" aria-label="Market sections">
                <button type="button" className="section-tab" onClick={() => openMarketSurface("overview", "market-overview")}>
                  Overview
                </button>
                <button type="button" className="section-tab" onClick={() => openMarketSurface("overview", "market-consensus")}>
                  Consensus
                </button>
                <button type="button" className="section-tab" onClick={() => openMarketSurface("overview", "market-news")}>
                  Latest news
                </button>
                <button type="button" className="section-tab" onClick={() => openMarketSurface("overview", "market-history")}>
                  History
                </button>
                <button type="button" className="section-tab" onClick={() => openMarketSurface("overview", "market-activity")}>
                  Activity
                </button>
                <button type="button" className="section-tab" onClick={() => openMarketSurface("overview", "market-ticket")}>
                  Trade ticket
                </button>
                {canAccessAdmin && (
                  <button type="button" className="section-tab" onClick={() => openMarketSurface("admin", "market-admin-status")}>
                    Admin
                  </button>
                )}
              </nav>

              {marketSurface === "overview" ? (
                <div className="market-hero-actions">
                  <button type="button" className="primary" onClick={copySelectedMarketLink}>
                    Copy market link
                  </button>
                  <button type="button" className="ghost" onClick={refreshNow} disabled={busyAction !== ""}>
                    Refresh market
                  </button>
                  <a className="ghost button-link" href={selectedMarket.sourceUrl} target="_blank" rel="noopener noreferrer">
                    Issuer source
                  </a>
                </div>
              ) : (
                <div className="admin-intro-grid">
                  <article className="story-stat">
                    <span className="field-label">Declared operator</span>
                    <strong>{expectedOperator ? shortAddress(expectedOperator) : "Not configured"}</strong>
                    <p>{runtimeConfig.operatorAddress || "Falls back to the on-chain owner if not declared in runtime config."}</p>
                  </article>
                  <article className="story-stat">
                    <span className="field-label">Connected wallet</span>
                    <strong>{wallet.account ? shortAddress(wallet.account) : "Not connected"}</strong>
                    <p>{canOperate ? "This wallet can execute owner actions." : "Switch to the operator wallet for owner actions."}</p>
                  </article>
                  <article className="story-stat">
                    <span className="field-label">Oracle</span>
                    <strong>{runtimeConfig.oracleAddress ? shortAddress(runtimeConfig.oracleAddress) : "No oracle address"}</strong>
                    <p>Use this surface for resolution signing, relay, and market administration.</p>
                  </article>
                </div>
              )}
            </article>

            {marketSurface === "overview" ? (
              <>
                <article className="surface-card market-brief-card">
                  <div className="market-summary-head">
                    <div className="market-summary-copy">
                      <p className="section-label">Company and market setup</p>
                      <strong className="market-summary-title">{selectedCompanyProfile.primaryListing}</strong>
                      <p className="panel-copy">{selectedCompanyProfile.profile}</p>
                    </div>
                    <div className="market-profile-meta" aria-label="Company profile details">
                      <span>{selectedMarket.ticker}</span>
                      <span>{selectedCompanyProfile.exchange}</span>
                      <span>{selectedCompanyProfile.headquarters}</span>
                      <span>{selectedMajorHolders}</span>
                    </div>
                  </div>

                  <div className="market-brief-grid market-brief-grid-compact">
                    {quickFacts.map((fact) => (
                      <article key={fact.label} className="story-stat market-brief-stat">
                        <span className="field-label">{fact.label}</span>
                        <strong>{fact.value}</strong>
                        <p>{fact.detail}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article id="market-consensus" className="surface-card consensus-card">
                  <Suspense
                    fallback={
                      <SectionLoadingState
                        title="Loading Street consensus."
                        copy="Preparing the revision curve, current read, and contributing firm view."
                      />
                    }
                  >
                    <ConsensusPanel market={selectedMarket} />
                  </Suspense>
                </article>

                <article id="market-news" className="surface-card news-card">
                  <div className="panel-heading">
                    <div>
                      <p className="section-label">Latest news</p>
                      <h2>{selectedMarket.company} {selectedMarket.reportingPeriod} coverage for {selectedMarket.metricName.toLowerCase()}</h2>
                    </div>
                    <span className="hero-pill">{companyNews.loading ? "Refreshing feed" : "Recent coverage only · 180d"}</span>
                  </div>

                  <p className="panel-copy">
                    Live headlines are filtered to recent KPI coverage only, so users see current reporting context instead of stale year-old articles.
                    {!companyNews.loading && companyNews.updatedAt ? ` Updated ${formatNewsTimestamp(companyNews.updatedAt)}.` : ""}
                  </p>

                  <div className="news-grid">
                    {companyNews.loading && (
                      <SectionLoadingState
                        title="Loading live company news."
                        copy="Filtering recent KPI-specific coverage and publisher context."
                      />
                    )}

                    {!companyNews.loading &&
                      companyNews.articles.map((article) => (
                        <a
                          key={`${article.link}-${article.publishedAt}`}
                          className="news-card-item"
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div className="meta-row">
                            <span className="news-source">
                              {getMediaLogoUrl(article) ? (
                                <img className="news-source-logo" src={getMediaLogoUrl(article)} alt="" loading="lazy" />
                              ) : null}
                              <span>{article.source || "Google News"}</span>
                            </span>
                            <span className="field-label">{formatNewsTimestamp(article.publishedAt)}</span>
                          </div>
                          <strong>{article.title}</strong>
                          <p>{article.snippet || `${selectedMarket.reportingPeriod} · ${selectedMarket.metricName} · ${article.source || "Google News"}`}</p>
                        </a>
                      ))}

                    {!companyNews.loading && companyNews.error && (
                      <div className="empty-state">
                        <strong>{companyNews.error}</strong>
                        <p>Try refreshing the market again in a moment.</p>
                      </div>
                    )}

                    {!companyNews.loading && !companyNews.error && companyNews.articles.length === 0 && (
                      <div className="empty-state">
                        <strong>No KPI-specific headlines were returned.</strong>
                        <p>The live feed is up, but nothing matched this company and metric right now.</p>
                      </div>
                    )}
                  </div>
                </article>

                <article id="market-history" className="surface-card history-card">
                  <div className="panel-heading">
                    <div>
                      <p className="section-label">History</p>
                      <h2>{selectedMarket.reportingPeriod} archive and consensus path</h2>
                    </div>
                    <span className="hero-pill">{selectedHistory.length} archived periods · newest first</span>
                  </div>
                  <Suspense
                    fallback={
                      <SectionLoadingState
                        title="Loading archive history."
                        copy="Preparing the comparison chart and archived Street path."
                      />
                    }
                  >
                    <HistoricalChart
                      history={selectedHistory}
                      reportingPeriod={selectedMarket.reportingPeriod}
                    />
                  </Suspense>
                </article>

                <article id="market-activity" className="surface-card activity-card-shell">
                  <div className="panel-heading">
                    <div>
                      <p className="section-label">Activity</p>
                      <h2>Recent on-chain events</h2>
                    </div>
                    <span className="hero-pill">{activityFeed.length ? `${activityFeed.length} recent events` : "No report loaded"}</span>
                  </div>

                  <div className="activity-feed">
                    {activityFeed.map((event) => (
                      <article key={`${event.transactionHash}-${event.logIndex}`} className="activity-card">
                        <span className="field-label">{event.eventName}</span>
                        <strong>{event.summary}</strong>
                        <p>{event.timestampLabel || "Unknown time"} · block {event.blockNumber}</p>
                      </article>
                    ))}

                    {activityFeed.length === 0 && (
                      <div className="empty-state">
                        <strong>No indexed activity report found yet.</strong>
                        <p>Run the event indexer to publish a curated feed into `public/activity.json`.</p>
                      </div>
                    )}
                  </div>
                </article>
              </>
            ) : (
              <section className="advanced-section">
                <div className="advanced-heading">
                  <p className="section-label">Admin workspace</p>
                  <h2>Runtime, oracle, and operator controls</h2>
                  <p className="panel-copy">Separated from the main market flow so normal users are not forced through operational tooling.</p>
                </div>

                <article id="market-admin-status" className="surface-card rail-card">
                  <div className="panel-heading">
                    <div>
                      <p className="section-label">System status</p>
                      <h2>Runtime configuration and access checks</h2>
                    </div>
                    <span className="hero-pill">{systemStatus.rpcHealthy ? "RPC online" : "RPC offline"}</span>
                  </div>

                  <div className="notes-grid">
                    <article className="note-card">
                      <span className="field-label">Live data source</span>
                      <strong>{activeRpcUrl === "wallet" ? "Wallet provider" : systemStatus.rpcHealthy ? "Public demo endpoint" : "Offline"}</strong>
                      <p>
                        {systemStatus.rpcHealthy ? "Connected to the live demo chain feed." : "No live demo endpoint is responding right now."}
                        {configuredRpcUrls.length > 1 ? ` ${configuredRpcUrls.length} RPC candidates are configured for failover.` : ""}
                      </p>
                    </article>
                    <article className="note-card">
                      <span className="field-label">Last sync</span>
                      <strong>{lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "No successful sync yet"}</strong>
                      <p>
                        Auto-refresh is {autoRefresh ? "enabled" : "paused"}.
                        {systemStatus.statusCheckedAt ? ` Status checked at ${new Date(systemStatus.statusCheckedAt).toLocaleTimeString()}.` : ""}
                      </p>
                    </article>
                    <article className="note-card">
                      <span className="field-label">Connected wallet</span>
                      <strong>{wallet.account ? shortAddress(wallet.account) : "Not connected"}</strong>
                      <p>
                        {wallet.account
                          ? `${systemStatus.walletEligible ? "Eligible" : "Not eligible"} · ${
                              systemStatus.walletSigner ? "signer" : "not signer"
                            } · ${systemStatus.walletReporter ? "reporter" : "not reporter"}`
                          : "Connect a wallet to inspect eligibility and oracle roles."}
                      </p>
                    </article>
                    <article className="note-card">
                      <span className="field-label">Declared operator</span>
                      <strong>{expectedOperator ? shortAddress(expectedOperator) : "Not configured"}</strong>
                      <p>{runtimeConfig.operatorAddress || "Falls back to the on-chain owner if not declared in runtime config."}</p>
                    </article>
                  </div>
                </article>

                <details className="surface-card disclosure-card" open>
                  <summary>
                    <div>
                      <p className="section-label">Demo onboarding</p>
                      <h2>Accounts and runtime shortcuts</h2>
                    </div>
                    <span className="hero-pill">Presets and addresses</span>
                  </summary>

                  <div className="panel-heading">
                    <div>
                      <p className="panel-copy">Quick access to the demo operator and trader accounts for local testing and walkthroughs.</p>
                    </div>
                    <button type="button" className="ghost" onClick={copyRuntimeSummary}>
                      Copy runtime
                    </button>
                  </div>

                  <div className="notes-grid">
                    <article className="note-card">
                      <span className="field-label">Owner wallet</span>
                      <strong>{shortAddress(demoLiveAddresses.deployer)}</strong>
                      <p>{demoLiveAddresses.deployer}</p>
                    </article>
                    <article className="note-card">
                      <span className="field-label">Trader A</span>
                      <strong>{shortAddress(demoLiveAddresses.trader)}</strong>
                      <p>{demoLiveAddresses.trader}</p>
                    </article>
                    <article className="note-card">
                      <span className="field-label">Trader B</span>
                      <strong>{shortAddress(demoLiveAddresses.trader2)}</strong>
                      <p>{demoLiveAddresses.trader2}</p>
                    </article>
                    <article className="note-card">
                      <span className="field-label">Registry</span>
                      <strong>{shortAddress(demoLiveAddresses.registryAddress)}</strong>
                      <p>{demoLiveAddresses.registryAddress}</p>
                    </article>
                  </div>

                  <div className="action-row">
                    <button type="button" className="ghost" onClick={() => applyDemoPreset("owner")}>
                      Load owner presets
                    </button>
                    <button type="button" className="ghost" onClick={() => applyDemoPreset("traderA")}>
                      Load Trader A
                    </button>
                    <button type="button" className="ghost" onClick={() => applyDemoPreset("traderB")}>
                      Load Trader B
                    </button>
                  </div>
                </details>

                <details className="surface-card disclosure-card">
                  <summary>
                    <div>
                      <p className="section-label">Oracle attestation</p>
                      <h2>Sign off-chain and relay on-chain</h2>
                    </div>
                    <span className="hero-pill">{runtimeConfig.oracleAddress ? shortAddress(runtimeConfig.oracleAddress) : "No oracle address"}</span>
                  </summary>

                  <div className="attestation-grid">
                    <label>
                      Actual KPI value
                      <input
                        value={attestationForm.actualValue}
                        onChange={(event) => updateAttestation("actualValue", event.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                    <label>
                      Source label
                      <input value={attestationForm.sourceLabel} onChange={(event) => updateAttestation("sourceLabel", event.target.value)} />
                    </label>
                    <label>
                      Source URI
                      <input value={attestationForm.sourceUri} onChange={(event) => updateAttestation("sourceUri", event.target.value)} />
                    </label>
                    <label>
                      Observed at
                      <input
                        value={attestationForm.observedAt}
                        onChange={(event) => updateAttestation("observedAt", event.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                    <label>
                      Valid before
                      <input
                        value={attestationForm.validBefore}
                        onChange={(event) => updateAttestation("validBefore", event.target.value.replace(/[^\d]/g, ""))}
                      />
                    </label>
                    <label>
                      Nonce
                      <input value={attestationForm.nonce} onChange={(event) => updateAttestation("nonce", event.target.value.replace(/[^\d]/g, ""))} />
                    </label>
                  </div>

                  <div className="action-row">
                    <button type="button" className="primary" disabled={busyAction !== ""} onClick={signAttestation}>
                      {busyAction === "sign" ? "Signing..." : "Sign attestation"}
                    </button>
                    <button type="button" className="secondary" disabled={busyAction !== "" || !signature} onClick={relayAttestation}>
                      {busyAction === "relay" ? "Relaying..." : "Relay attestation"}
                    </button>
                    <button type="button" className="ghost" disabled={busyAction !== ""} onClick={publishDirectResolution}>
                      {busyAction === "direct-resolve" ? "Publishing..." : "Direct reporter resolve"}
                    </button>
                  </div>

                  <div className="code-panels">
                    <div>
                      <span className="field-label">Typed payload</span>
                      <pre>
                        {JSON.stringify(
                          buildResolutionPayload(selectedMarket.marketId, attestationForm),
                          (_, value) => (typeof value === "bigint" ? value.toString() : value),
                          2
                        )}
                      </pre>
                    </div>
                    <div>
                      <span className="field-label">Digest + signature</span>
                      <pre>{digest || "Digest will appear after signing."}</pre>
                      <pre>{signature || "Signature will appear here after a signer approves the payload."}</pre>
                    </div>
                  </div>
                </details>

                <details className="surface-card disclosure-card">
                  <summary>
                    <div>
                      <p className="section-label">Operator console</p>
                      <h2>Eligibility, credits, roles, and market creation</h2>
                    </div>
                    <span className="hero-pill">{canOperate ? "Owner connected" : "Owner wallet required"}</span>
                  </summary>

                  <div className="operator-stack">
                    <article className="note-card">
                      <span className="field-label">Eligibility registry</span>
                      <div className="operator-row">
                        <input
                          value={operatorForm.eligibilityAddress}
                          placeholder="0x wallet"
                          onChange={(event) => updateOperatorForm("eligibilityAddress", event.target.value)}
                        />
                        <button type="button" className="secondary" disabled={busyAction !== ""} onClick={() => setEligibility(true)}>
                          Allowlist
                        </button>
                        <button type="button" className="ghost" disabled={busyAction !== ""} onClick={() => setEligibility(false)}>
                          Remove
                        </button>
                      </div>
                    </article>

                    <article className="note-card">
                      <span className="field-label">Grant demo credits</span>
                      <div className="operator-row">
                        <input
                          value={operatorForm.creditAddress}
                          placeholder="0x wallet"
                          onChange={(event) => updateOperatorForm("creditAddress", event.target.value)}
                        />
                        <input
                          value={operatorForm.creditAmount}
                          inputMode="numeric"
                          placeholder="Amount"
                          onChange={(event) => updateOperatorForm("creditAmount", event.target.value.replace(/[^\d]/g, ""))}
                        />
                        <button type="button" className="primary" disabled={busyAction !== ""} onClick={grantCredits}>
                          Grant
                        </button>
                      </div>
                    </article>

                    <article className="note-card">
                      <span className="field-label">Oracle role management</span>
                      <div className="operator-grid">
                        <div className="operator-row">
                          <input
                            value={operatorForm.reporterAddress}
                            placeholder="Reporter wallet"
                            onChange={(event) => updateOperatorForm("reporterAddress", event.target.value)}
                          />
                          <button type="button" className="secondary" disabled={busyAction !== ""} onClick={() => setReporter(true)}>
                            Authorize reporter
                          </button>
                          <button type="button" className="ghost" disabled={busyAction !== ""} onClick={() => setReporter(false)}>
                            Revoke
                          </button>
                        </div>
                        <div className="operator-row">
                          <input
                            value={operatorForm.signerAddress}
                            placeholder="Signer wallet"
                            onChange={(event) => updateOperatorForm("signerAddress", event.target.value)}
                          />
                          <button type="button" className="secondary" disabled={busyAction !== ""} onClick={() => setSigner(true)}>
                            Authorize signer
                          </button>
                          <button type="button" className="ghost" disabled={busyAction !== ""} onClick={() => setSigner(false)}>
                            Revoke
                          </button>
                        </div>
                      </div>
                    </article>

                    <article className="note-card operator-form-card">
                      <div className="panel-heading">
                        <div>
                          <span className="field-label">Create market</span>
                          <p className="operator-copy">Use this market as a template or edit each field manually.</p>
                        </div>
                        <button type="button" className="ghost" onClick={prefillCreateMarketForm}>
                          Prefill from selected
                        </button>
                      </div>

                      <div className="operator-form-grid">
                        <label>
                          ID seed
                          <input value={createMarketForm.idSeed} onChange={(event) => updateCreateMarketForm("idSeed", event.target.value)} />
                        </label>
                        <label>
                          Ticker
                          <input value={createMarketForm.ticker} onChange={(event) => updateCreateMarketForm("ticker", event.target.value)} />
                        </label>
                        <label>
                          Metric name
                          <input value={createMarketForm.metricName} onChange={(event) => updateCreateMarketForm("metricName", event.target.value)} />
                        </label>
                        <label>
                          Consensus value
                          <input
                            value={createMarketForm.consensusValue}
                            inputMode="numeric"
                            onChange={(event) => updateCreateMarketForm("consensusValue", event.target.value.replace(/[^\d]/g, ""))}
                          />
                        </label>
                        <label>
                          Opens at (unix)
                          <input
                            value={createMarketForm.opensAt}
                            inputMode="numeric"
                            onChange={(event) => updateCreateMarketForm("opensAt", event.target.value.replace(/[^\d]/g, ""))}
                          />
                        </label>
                        <label>
                          Locks at (unix)
                          <input
                            value={createMarketForm.locksAt}
                            inputMode="numeric"
                            onChange={(event) => updateCreateMarketForm("locksAt", event.target.value.replace(/[^\d]/g, ""))}
                          />
                        </label>
                        <label>
                          Announcement at (unix)
                          <input
                            value={createMarketForm.expectedAnnouncementAt}
                            inputMode="numeric"
                            onChange={(event) => updateCreateMarketForm("expectedAnnouncementAt", event.target.value.replace(/[^\d]/g, ""))}
                          />
                        </label>
                        <label>
                          Consensus source
                          <input value={createMarketForm.consensusSource} onChange={(event) => updateCreateMarketForm("consensusSource", event.target.value)} />
                        </label>
                        <label className="full-span">
                          Resolution policy
                          <input value={createMarketForm.resolutionPolicy} onChange={(event) => updateCreateMarketForm("resolutionPolicy", event.target.value)} />
                        </label>
                      </div>

                      <div className="action-row">
                        <button type="button" className="primary" disabled={busyAction !== ""} onClick={createMarket}>
                          {busyAction === "create-market" ? "Creating..." : "Create market"}
                        </button>
                        <button type="button" className="ghost" disabled={busyAction !== ""} onClick={cancelSelectedMarket}>
                          {busyAction === "cancel-market" ? "Cancelling..." : "Cancel selected market"}
                        </button>
                      </div>
                    </article>
                  </div>
                </details>
              </section>
            )}
          </section>

          {marketSurface === "overview" ? (
            <aside className="market-sidebar" aria-label="Trade ticket and market summary">
              <article id="market-ticket" className="surface-card trade-panel sticky-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-label">Trade ticket</p>
                    <h2>Take a position</h2>
                  </div>
                  <span className="hero-pill">{wallet.account ? shortAddress(wallet.account) : "Wallet not connected"}</span>
                </div>

                <label>
                  Stake amount
                  <input
                    className="stake-input"
                    aria-label="Stake amount"
                    placeholder="Enter demo credits"
                    value={stakeAmount}
                    onChange={(event) => setStakeAmount(event.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                  />
                </label>

                <div className="trade-quote-grid">
                  <article className="trade-quote trade-quote-beat">
                    <span className="field-label">Beat payout</span>
                    <strong>{formatNumber(hitPreview)}</strong>
                    <p>{formatPercent(hitProbability)} implied probability</p>
                  </article>
                  <article className="trade-quote trade-quote-miss">
                    <span className="field-label">Miss payout</span>
                    <strong>{formatNumber(missPreview)}</strong>
                    <p>{formatPercent(missProbability)} implied probability</p>
                  </article>
                </div>

                <p className="helper-copy">
                  {wallet.account
                    ? "Use demo credits to express a view. Resolution only depends on the issuer-reported KPI."
                    : "Connect a wallet when you are ready to place a demo trade."}
                </p>

                <div className="action-row action-row-trade">
                  <button type="button" className="primary action-buy-beat" disabled={busyAction !== ""} onClick={() => takePosition(1)}>
                    {busyAction === "position-1" ? "Submitting..." : "Buy beat"}
                  </button>
                  <button type="button" className="secondary action-buy-miss" disabled={busyAction !== ""} onClick={() => takePosition(2)}>
                    {busyAction === "position-2" ? "Submitting..." : "Buy miss"}
                  </button>
                </div>

                <div className="action-row">
                  <button type="button" className="ghost" disabled={busyAction !== ""} onClick={settleMarket}>
                    {busyAction === "settle" ? "Settling..." : "Settle market"}
                  </button>
                  <button type="button" className="ghost" disabled={busyAction !== ""} onClick={claimPayout}>
                    {busyAction === "claim" ? "Claiming..." : "Claim payout"}
                  </button>
                </div>

                {!wallet.account && (
                  <button type="button" className="ghost full-width" onClick={() => setConnectModalOpen(true)}>
                    Connect wallet
                  </button>
                )}

                {!walletOnExpectedChain && wallet.account && (
                  <button type="button" className="ghost full-width" onClick={connectDemoChain}>
                    Switch to Ethereum
                  </button>
                )}
              </article>

              <article className="surface-card rail-card">
                <div className="panel-heading panel-heading-compact">
                  <div>
                    <p className="section-label">Market brief</p>
                    <h2>Position, consensus, and pool view</h2>
                  </div>
                </div>
                <div className="rail-card-grid">
                  <article className="snapshot-card">
                    <span className="field-label">My position</span>
                    <strong>{selectedPositionLabel}</strong>
                    <p>{formatNumber(selectedMarket.myStake)} demo credits currently staked.</p>
                  </article>
                  <article className="snapshot-card">
                    <span className="field-label">Locked reference</span>
                    <strong>{selectedMarket.frozenConsensusSource}</strong>
                    <p>The market resolves against the benchmark frozen at lock.</p>
                  </article>
                  <article className="snapshot-card">
                    <span className="field-label">Trading window</span>
                    <strong>{formatTimestamp(selectedMarket.locksAt)}</strong>
                    <p>Locks {formatCountdown(selectedMarket.locksAt)}. Opens {formatTimestamp(selectedMarket.opensAt)}.</p>
                  </article>
                  <article className="note-card">
                    <span className="field-label">Consensus move</span>
                    <strong>{selectedMarket.consensusMoveLabel}</strong>
                    <p>
                      {selectedMarket.currentConsensusDisplay} now versus {formatConsensusDisplay(
                        selectedMarket.openingConsensusSnapshot.value,
                        selectedMarket.consensusDisplay
                      )} on the first street read.
                    </p>
                  </article>
                  <article className="note-card">
                    <span className="field-label">Oracle outcome</span>
                    <strong>{selectedOutcomeLabel}</strong>
                    <p>{selectedMarket.sourceUri || "Waiting for a signed source URI."}</p>
                  </article>
                  <article className="note-card">
                    <span className="field-label">Resolution policy</span>
                    <strong>Issuer disclosure only</strong>
                    <p>{selectedMarket.resolutionPolicy}</p>
                  </article>
                  <article className="note-card">
                    <span className="field-label">Beat pool</span>
                    <strong className="tone-beat">{formatNumber(selectedMarket.hitPool)}</strong>
                    <p>{formatPercent(hitProbability)} of current liquidity is on beat.</p>
                  </article>
                  <article className="note-card">
                    <span className="field-label">Miss pool</span>
                    <strong className="tone-miss">{formatNumber(selectedMarket.missPool)}</strong>
                    <p>{formatPercent(missProbability)} of current liquidity is on miss.</p>
                  </article>
                </div>
              </article>

              <article className="surface-card compliance-card compliance-card-quiet">
                <p className="section-label">Demo boundary</p>
                <ul className="compliance-list">
                  <li>Only issuer-reported KPIs can resolve a market.</li>
                  <li>Users trade closed-loop demo credits, not withdrawable assets.</li>
                  <li>Every resolution can be traced to a signed payload, source hash, and URI.</li>
                  <li>Markets stay binary: beat or miss against a documented consensus snapshot.</li>
                </ul>
              </article>
            </aside>
          ) : (
            <aside className="market-sidebar admin-sidebar" aria-label="Admin summary">
              <article className="surface-card rail-card">
                <div className="panel-heading panel-heading-compact">
                  <div>
                    <p className="section-label">Admin snapshot</p>
                    <h2>Access and role state</h2>
                  </div>
                </div>
                <div className="rail-card-grid">
                  <article className="snapshot-card">
                    <span className="field-label">Owner access</span>
                    <strong>{canOperate ? "Enabled" : "Restricted"}</strong>
                    <p>{canOperate ? "Connected wallet matches the operator set." : "Switch to the owner wallet to execute admin actions."}</p>
                  </article>
                  <article className="snapshot-card">
                    <span className="field-label">Eligibility</span>
                    <strong>{systemStatus.walletEligible ? "Eligible" : "Not eligible"}</strong>
                    <p>Current wallet eligibility as reported by the registry.</p>
                  </article>
                  <article className="snapshot-card">
                    <span className="field-label">Reporter role</span>
                    <strong>{systemStatus.walletReporter ? "Authorized" : "Not authorized"}</strong>
                    <p>Reporter permission on the active oracle contract.</p>
                  </article>
                  <article className="snapshot-card">
                    <span className="field-label">Signer role</span>
                    <strong>{systemStatus.walletSigner ? "Authorized" : "Not authorized"}</strong>
                    <p>Signer permission on the active oracle contract.</p>
                  </article>
                </div>
              </article>

              <article className="surface-card compliance-card">
                <div className="panel-heading panel-heading-compact">
                  <div>
                    <p className="section-label">Scope</p>
                    <h2>Admin surface</h2>
                  </div>
                </div>
                <ul className="compliance-list">
                  <li>Use overview for normal trading and analysis.</li>
                  <li>Use admin for runtime diagnostics, attestation, and operator actions.</li>
                  <li>Separating these surfaces reduces confusion for non-operator users.</li>
                </ul>
              </article>
            </aside>
          )}
        </main>
      )}

      <ConnectModal
        open={connectModalOpen}
        wallet={wallet}
        walletOnExpectedChain={walletOnExpectedChain}
        isBlacklisted={isWalletBlacklisted}
        onClose={() => setConnectModalOpen(false)}
        onConnectWalletConnect={connectWalletConnect}
        onConnectInjected={connectInjectedWallet}
        onSwitchNetwork={connectDemoChain}
        onDisconnect={disconnectWallet}
        onOpenAccount={openAccountView}
      />
    </div>
  );
}
