import { startTransition, useEffect, useState, useDeferredValue } from "react";
import { ethers } from "ethers";
import marketSeeds from "../data/markets.json";
import demoLiveAddresses from "../demo-live-addresses.json";
import AccountPage from "./AccountPage";
import AdminPortal from "./AdminPortal";
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
import BoardView from "./views/BoardView";
import MarketView from "./views/MarketView";
import {
  accountStorageKey,
  adminStorageKey,
  buildCreateMarketForm,
  buildEmptyWallet,
  buildMarketModel,
  calculatePreviewPayout,
  calculateProbability,
  compareMarkets,
  deriveWindow,
  fallbackNow,
  formatConsensusDisplay,
  formatCountdown,
  formatResolvedDelta,
  formatTimestampWithYear,
  getConfiguredRpcUrls,
  getSignalLabel,
  getStatusKey,
  getStatusLabel,
  jumpToTop,
  normalizeAddress,
  parseRouteFromHash,
  readStoredAccountProfile,
  readStoredAdminPolicy,
  readStoredPreferences,
  requireAddress,
  toHexChainId,
  uiStorageKey,
} from "./lib/market-utils";

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";
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

export default function App({ runtimeConfig }) {
  const initialRoute = parseRouteFromHash();
  const storedPreferences = readStoredPreferences();

  // ── Routing ──
  const [appView, setAppView] = useState(initialRoute.view);
  const [selectedSlug, setSelectedSlug] = useState(initialRoute.slug);

  // ── Board filters ──
  const [query, setQuery] = useState(() => storedPreferences.query || "");
  const [statusFilter, setStatusFilter] = useState(() => storedPreferences.statusFilter || "all");
  const [sortMode, setSortMode] = useState(() => storedPreferences.sortMode || "liquidity");
  const [autoRefresh, setAutoRefresh] = useState(() => storedPreferences.autoRefresh ?? true);

  // ── Wallet ──
  const [wallet, setWallet] = useState(buildEmptyWallet);
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  // ── Account / admin ──
  const [stakeAmount, setStakeAmount] = useState(() => readStoredAccountProfile().defaultStake || "100");
  const [accountProfile, setAccountProfile] = useState(readStoredAccountProfile);
  const [adminPolicy, setAdminPolicy] = useState(readStoredAdminPolicy);
  const [blacklistDraft, setBlacklistDraft] = useState("");

  // ── On-chain state ──
  const [marketState, setMarketState] = useState({});
  const [credits, setCredits] = useState(null);
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
  const [activeRpcUrl, setActiveRpcUrl] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // ── UI ──
  const [busyAction, setBusyAction] = useState("");
  const [banner, setBanner] = useState("Loading runtime config...");
  const [activityFeed, setActivityFeed] = useState([]);
  const [companyNews, setCompanyNews] = useState({
    loading: false,
    articles: [],
    updatedAt: "",
    query: "",
    error: "",
  });
  const [marketSurface, setMarketSurface] = useState("overview");
  const [pendingSectionId, setPendingSectionId] = useState("");
  const [activeMarketSection, setActiveMarketSection] = useState("market-overview");

  // ── Oracle / admin forms ──
  const [signature, setSignature] = useState("");
  const [digest, setDigest] = useState("");
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

  // ── Derived values ──
  const deferredQuery = useDeferredValue(query);
  const blacklist = adminPolicy.blacklist || [];
  const isWalletBlacklisted =
    Boolean(wallet.account) && blacklist.includes(normalizeAddress(wallet.account));
  const canAccessAccount = Boolean(wallet.account);
  const canAccessAdmin =
    Boolean(wallet.account) && adminAllowlist.includes(normalizeAddress(wallet.account));

  const catalog = marketSeeds
    .filter((seed) => {
      const haystack =
        `${seed.company} ${seed.ticker} ${seed.metricName} ${seed.focus}`.toLowerCase();
      return haystack.includes(deferredQuery.trim().toLowerCase());
    })
    .map((seed) => buildMarketModel(seed, marketState[seed.slug]))
    .filter((market) => statusFilter === "all" || getStatusKey(market) === statusFilter)
    .sort((left, right) => compareMarkets(left, right, sortMode));

  const allMarkets = marketSeeds.map((seed) => buildMarketModel(seed, marketState[seed.slug]));
  const selectedMarket = selectedSlug
    ? allMarkets.find((market) => market.slug === selectedSlug) ?? null
    : null;
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
  const ownerChecks = [
    systemStatus.marketOwner,
    systemStatus.oracleOwner,
    systemStatus.registryOwner,
  ].filter(Boolean);
  const expectedOperator = runtimeConfig.operatorAddress || ownerChecks[0] || "";
  const canOperate =
    canAccessAdmin &&
    normalizeAddress(expectedOperator) === normalizeAddress(wallet.account) &&
    (ownerChecks.length === 0 ||
      ownerChecks.every(
        (address) => normalizeAddress(address) === normalizeAddress(expectedOperator)
      ));
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
      .sort((left, right) => left.expectedAnnouncementAt - right.expectedAnnouncementAt)[0] ??
    featuredMarket;
  const selectedStatus = selectedMarket ? getStatusLabel(selectedMarket) : "Open";
  const selectedSignal = selectedMarket ? getSignalLabel(hitProbability) : "Balanced market";
  const selectedCompanyProfile = selectedMarket
    ? getMarketProfile(selectedMarket.company, selectedMarket.ticker)
    : null;
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
  const runtimeModeLabel = systemStatus.rpcHealthy ? "Live sync" : "Scenario mode";

  // ── Effects ──

  useEffect(() => {
    if (selectedSlug && !allMarkets.some((market) => market.slug === selectedSlug)) {
      setSelectedSlug(null);
    }
  }, [allMarkets, selectedSlug]);

  useEffect(() => {
    if (appView === "market" && !selectedSlug) setAppView("board");
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
    if (appView === "market" && selectedSlug) nextHash = `#market=${selectedSlug}`;
    else if (appView === "account") nextHash = "#page=account";
    else if (appView === "admin")
      nextHash = selectedSlug ? `#page=admin&market=${selectedSlug}` : "#page=admin";
    if (!nextHash) return;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${nextHash}`
      );
    }
  }, [appView, selectedSlug]);

  useEffect(() => {
    if (typeof window !== "undefined") jumpToTop();
  }, [appView, selectedSlug]);

  useEffect(() => {
    setMarketSurface("overview");
  }, [selectedSlug]);

  useEffect(() => {
    if (!selectedSlug) return;
    if (!pendingSectionId) { jumpToTop(); return; }
    const timerId = window.setTimeout(() => {
      const section = document.getElementById(pendingSectionId);
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      else jumpToTop();
      setPendingSectionId("");
    }, 40);
    return () => window.clearTimeout(timerId);
  }, [marketSurface, pendingSectionId, selectedSlug]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedMarket) {
      setCompanyNews({ loading: false, articles: [], updatedAt: "", query: "", error: "" });
      return () => { cancelled = true; };
    }
    async function loadCompanyNews() {
      setCompanyNews({ loading: true, articles: [], updatedAt: "", query: "", error: "" });
      try {
        const response = await fetch(`/news.json?market=${selectedMarket.slug}`, { cache: "no-store" });
        if (!response.ok) throw new Error("News feed unavailable");
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
    return () => { cancelled = true; };
  }, [selectedMarket?.slug]);

  useEffect(() => {
    const rawProvider = wallet.rawProvider;
    if (!rawProvider?.on) return undefined;
    const onAccountsChanged = () => void refreshWalletFromConnector(rawProvider, wallet.connector || "injected");
    const onChainChanged = () => void refreshWalletFromConnector(rawProvider, wallet.connector || "injected");
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
      } catch { /* continue to WalletConnect restore */ }
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
      } catch { /* optional */ }
    }
    void restoreWalletSession();
    return () => { cancelled = true; };
  }, [configuredRpcKey, runtimeConfig.chainId]);

  useEffect(() => {
    if (!hasLiveContracts) return undefined;
    void refreshOnChain();
    if (!autoRefresh) return undefined;
    const intervalId = window.setInterval(() => void refreshOnChain(), 15000);
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
      JSON.stringify({ query, statusFilter, sortMode, autoRefresh })
    );
  }, [autoRefresh, query, sortMode, statusFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(accountStorageKey, JSON.stringify(accountProfile));
    }
  }, [accountProfile]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(adminStorageKey, JSON.stringify(adminPolicy));
    }
  }, [adminPolicy]);

  useEffect(() => {
    let cancelled = false;
    async function loadActivity() {
      try {
        const response = await fetch("/activity.json", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setActivityFeed(Array.isArray(data.events) ? data.events.slice(0, 8) : []);
      } catch {
        if (!cancelled) setActivityFeed([]);
      }
    }
    void loadActivity();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (hasLiveContracts && systemStatus.rpcHealthy) {
      setBanner(
        `Live market contracts are online on Ethereum chain ${runtimeConfig.chainId}. Connect a wallet to trade, review positions, or use the admin portal.`
      );
      return;
    }
    if (hasLiveContracts && hasConfiguredRpc) {
      setBanner(
        "Contracts are configured, but the live RPC is currently unavailable. The board is running in scenario mode until sync returns."
      );
      return;
    }
    if (runtimeConfig.marketAddress && runtimeConfig.oracleAddress) {
      setBanner(
        "Market and oracle contracts are configured. Add the registry address and a healthy RPC URL to unlock the full operator workflow."
      );
      return;
    }
    setBanner(
      "Frontend is live in scenario mode. Wallet connection is available, and live actions will switch on once contract addresses and RPC are healthy."
    );
  }, [
    hasLiveContracts,
    hasConfiguredRpc,
    hasRuntimeRpc,
    runtimeConfig.chainId,
    runtimeConfig.marketAddress,
    runtimeConfig.oracleAddress,
    systemStatus.rpcHealthy,
  ]);

  // ── Wallet helpers ──

  async function refreshWalletFromConnector(rawProvider, connector, requestAccounts = false) {
    if (!rawProvider) { setWallet(buildEmptyWallet()); return false; }
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
      setWallet({ provider, rawProvider, signer: null, account: "", chainId: Number(network.chainId), connector });
      return false;
    }
    const signer = await provider.getSigner();
    setWallet({ provider, rawProvider, signer, account: accounts[0].address, chainId: Number(network.chainId), connector });
    return true;
  }

  async function ensureRuntimeChain(rawProvider = wallet.rawProvider) {
    if (!rawProvider) return;
    const chainIdHex = toHexChainId(runtimeConfig.chainId || 1);
    try {
      await rawProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
      return;
    } catch (error) {
      if (error?.code !== 4902 || !configuredRpcUrls.length) throw error;
    }
    await rawProvider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainIdHex,
        chainName: "Ethereum Mainnet",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: configuredRpcUrls,
      }],
    });
  }

  // ── On-chain sync ──

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
          marketOwner, oracleOwner, registryOwner,
          walletEligible, walletReporter, walletSigner, nextCredits,
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
          rpcHealthy: true, marketOwner, oracleOwner, registryOwner,
          walletEligible, walletReporter, walletSigner, statusCheckedAt: Date.now(),
        });
        setActiveRpcUrl(candidate.rpcUrl);
        setCredits(nextCredits);
        setLastSyncAt(Date.now());
        return;
      } catch { continue; }
    }

    // All candidates failed — fall back to scenario mode
    const nextState = {};
    for (const seed of marketSeeds) {
      nextState[seed.slug] = { ...deriveWindow(seed), hitPool: 0n, missPool: 0n, myPosition: 0, myStake: 0n };
    }
    setMarketState(nextState);
    setSystemStatus({
      rpcHealthy: false, marketOwner: "", oracleOwner: "", registryOwner: "",
      walletEligible: false, walletReporter: false, walletSigner: false, statusCheckedAt: Date.now(),
    });
    setActiveRpcUrl("");
    setCredits(null);
    setLastSyncAt(null);
  }

  // ── Wallet actions ──

  async function connectInjectedWallet(preferredWallet = "browser") {
    try {
      await resetWalletSession();
      const injectedProvider = await connectInjectedProvider({ preferredWallet });
      await refreshWalletFromConnector(injectedProvider, "injected", true);
      await ensureRuntimeChain(injectedProvider);
      await refreshWalletFromConnector(injectedProvider, "injected");
      setConnectModalOpen(false);
      const connectedLabel =
        preferredWallet === "metamask" ? "MetaMask"
        : preferredWallet === "rabby" ? "Rabby"
        : preferredWallet === "coinbase" ? "Coinbase Wallet"
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
      if (wallet.connector === "walletconnect") await disconnectWalletConnectProvider();
      await resetWalletSession();
      setWallet(buildEmptyWallet());
      setConnectModalOpen(false);
      setBanner("Wallet disconnected.");
    } catch (error) {
      setBanner(error.message || "Could not disconnect the wallet cleanly.");
    }
  }

  async function connectDemoChain() {
    if (!wallet.rawProvider) { setBanner("Connect a wallet first."); return; }
    try {
      await ensureRuntimeChain(wallet.rawProvider);
      await refreshWalletFromConnector(wallet.rawProvider, wallet.connector || "injected");
      setBanner("Wallet switched to Ethereum.");
    } catch (error) {
      setBanner(error.message || "Network switch failed.");
    }
  }

  // ── Market actions ──

  async function runMarketAction(label, callback) {
    if (!wallet.signer) { setBanner("Connect a wallet first."); return; }
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
    if (!wallet.signer) { setBanner("Connect a wallet first."); return; }
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
    if (!wallet.signer) { setBanner("Connect a wallet to sign the EIP-712 attestation."); return; }
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
    if (!signature) { setBanner("Sign the attestation first."); return; }
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

  // ── Operator actions ──

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
      const tx = await marketContract.grantDemoCredits(targetAddress, BigInt(operatorForm.creditAmount || "0"));
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

  // ── UI helpers ──

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
    const summary = JSON.stringify({
      chainId: runtimeConfig.chainId,
      marketAddress: runtimeConfig.marketAddress,
      oracleAddress: runtimeConfig.oracleAddress,
      registryAddress: runtimeConfig.registryAddress,
      operatorAddress: runtimeConfig.operatorAddress,
      rpcUrl: runtimeConfig.rpcUrl,
      rpcUrls: configuredRpcUrls,
    }, null, 2);
    try {
      await navigator.clipboard.writeText(summary);
      setBanner("Copied runtime summary to clipboard.");
    } catch {
      setBanner("Clipboard access failed. Copy the runtime config from /runtime-config.json instead.");
    }
  }

  async function copySelectedMarketLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${window.location.pathname}#market=${selectedMarket.slug}`
      );
      setBanner(`Copied share link for ${selectedMarket.ticker}.`);
    } catch {
      setBanner("Clipboard access failed. Copy the URL from the browser address bar instead.");
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
      setAttestationForm((current) => ({ ...current, sourceUri: market.sourceUrl }));
    });
  }

  function clearSelectedMarket() {
    jumpToTop();
    startTransition(() => { setAppView("board"); setSelectedSlug(null); });
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
    startTransition(() => setAppView("account"));
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
      if (!selectedSlug && allMarkets[0]) setSelectedSlug(allMarkets[0].slug);
    });
  }

  function saveAccountProfile() {
    setStakeAmount(accountProfile.defaultStake || "100");
    setBanner("Saved account preferences for this browser.");
  }

  function updateAccountProfile(field, value) {
    setAccountProfile((current) => ({ ...current, [field]: value }));
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
      if (!wallet.account) setConnectModalOpen(true);
      return;
    }
    if (surface !== marketSurface) startTransition(() => setMarketSurface(surface));
    if (sectionId) setActiveMarketSection(sectionId);
    setPendingSectionId(sectionId);
    if (surface === marketSurface && sectionId) {
      const section = document.getElementById(sectionId);
      if (section) { section.scrollIntoView({ behavior: "smooth", block: "start" }); setPendingSectionId(""); }
    }
  }

  function prefillCreateMarketForm() {
    const targetMarket = selectedMarket ?? adminMarket;
    if (!targetMarket) return;
    setCreateMarketForm(buildCreateMarketForm(targetMarket));
    setBanner(`Prefilled the operator market form from ${targetMarket.ticker}.`);
  }

  // ── Render ──

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />
      <a className="skip-link" href="#main-content">Skip to main content</a>

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
            <span className="hero-pill">
              {wallet.account ? shortAddress(wallet.account) : "Wallet disconnected"}
            </span>
            <button type="button" className="primary topbar-wallet" onClick={() => setConnectModalOpen(true)}>
              {wallet.account ? "Manage wallet" : "Connect wallet"}
            </button>
          </div>
        </div>

        <nav className="topbar-nav topbar-nav-band" aria-label="Primary">
          <button
            type="button"
            className={`nav-tab ${appView === "board" || appView === "market" ? "active" : ""}`}
            onClick={openBoardView}
          >
            Board
          </button>
          {selectedMarket && appView === "market" && (
            <button
              type="button"
              className="nav-tab active"
              onClick={() => openMarketSurface("overview", "market-overview")}
            >
              {selectedMarket.ticker} market
            </button>
          )}
          {canAccessAccount && (
            <button
              type="button"
              className={`nav-tab ${appView === "account" ? "active" : ""}`}
              onClick={openAccountView}
            >
              Account
            </button>
          )}
          {canAccessAdmin && (
            <button
              type="button"
              className={`nav-tab ${appView === "admin" ? "active" : ""}`}
              onClick={openAdminPortal}
            >
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
          updateBlacklistDraft={setBlacklistDraft}
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
        <BoardView
          catalog={catalog}
          allMarkets={allMarkets}
          marketCounts={marketCounts}
          nextCatalystMarket={nextCatalystMarket}
          query={query}
          setQuery={setQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sortMode={sortMode}
          setSortMode={setSortMode}
          focusFilters={focusFilters}
          autoRefresh={autoRefresh}
          setAutoRefresh={setAutoRefresh}
          busyAction={busyAction}
          refreshNow={refreshNow}
          wallet={wallet}
          systemStatus={systemStatus}
          handleSelectMarket={handleSelectMarket}
          setConnectModalOpen={setConnectModalOpen}
        />
      ) : (
        <MarketView
          selectedMarket={selectedMarket}
          selectedStatus={selectedStatus}
          selectedSignal={selectedSignal}
          selectedHistory={selectedHistory}
          heroSignalFacts={heroSignalFacts}
          quickFacts={quickFacts}
          hitProbability={hitProbability}
          missProbability={missProbability}
          hitPreview={hitPreview}
          missPreview={missPreview}
          selectedPositionLabel={selectedPositionLabel}
          selectedOutcomeLabel={selectedOutcomeLabel}
          selectedCompanyProfile={selectedCompanyProfile}
          selectedMajorHolders={selectedMajorHolders}
          activityFeed={activityFeed}
          companyNews={companyNews}
          marketSurface={marketSurface}
          activeMarketSection={activeMarketSection}
          openMarketSurface={openMarketSurface}
          clearSelectedMarket={clearSelectedMarket}
          wallet={wallet}
          walletOnExpectedChain={walletOnExpectedChain}
          runtimeConfig={runtimeConfig}
          systemStatus={systemStatus}
          activeRpcUrl={activeRpcUrl}
          lastSyncAt={lastSyncAt}
          autoRefresh={autoRefresh}
          expectedOperator={expectedOperator}
          canOperate={canOperate}
          canAccessAdmin={canAccessAdmin}
          stakeAmount={stakeAmount}
          setStakeAmount={setStakeAmount}
          busyAction={busyAction}
          takePosition={takePosition}
          settleMarket={settleMarket}
          claimPayout={claimPayout}
          connectDemoChain={connectDemoChain}
          setConnectModalOpen={setConnectModalOpen}
          refreshNow={refreshNow}
          copySelectedMarketLink={copySelectedMarketLink}
          attestationForm={attestationForm}
          updateAttestation={updateAttestation}
          signAttestation={signAttestation}
          relayAttestation={relayAttestation}
          publishDirectResolution={publishDirectResolution}
          signature={signature}
          digest={digest}
          operatorForm={operatorForm}
          updateOperatorForm={updateOperatorForm}
          setEligibility={setEligibility}
          grantCredits={grantCredits}
          setReporter={setReporter}
          setSigner={setSigner}
          createMarketForm={createMarketForm}
          updateCreateMarketForm={updateCreateMarketForm}
          createMarket={createMarket}
          cancelSelectedMarket={cancelSelectedMarket}
          prefillCreateMarketForm={prefillCreateMarketForm}
          applyDemoPreset={applyDemoPreset}
          copyRuntimeSummary={copyRuntimeSummary}
          blacklist={blacklist}
          blacklistDraft={blacklistDraft}
          updateBlacklistDraft={setBlacklistDraft}
          addBlacklistedAddress={addBlacklistedAddress}
          removeBlacklistedAddress={removeBlacklistedAddress}
        />
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

      <footer className="app-footer" aria-label="Site info">
        <span className="app-footer-version">
          v{__APP_VERSION__} · {__GIT_HASH__}
        </span>
        <span className="app-footer-sep" aria-hidden="true">·</span>
        <span className="app-footer-legal">Demo credits only — no real money</span>
        <span className="app-footer-sep" aria-hidden="true">·</span>
        <a
          className="app-footer-link"
          href="https://consensusmarket.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          consensusmarket.com
        </a>
      </footer>
    </div>
  );
}
