import { useState, useDeferredValue } from "react";
import marketSeeds from "../data/markets.json";
import AccountPage from "./AccountPage";
import AdminPortal from "./AdminPortal";
import LegalPage from "./views/LegalPage";
import ConnectModal from "./ConnectModal";
import { WalletProvider } from "./contexts/WalletContext";
import { RuntimeProvider } from "./contexts/RuntimeContext";
import marketHistory from "./market-history";
import { getMarketProfile } from "./market-profiles";
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  shortAddress,
} from "./contracts";
import {
  buildMarketModel,
  calculatePreviewPayout,
  calculateProbability,
  compareMarkets,
  formatCountdown,
  formatTimestampWithYear,
  getConfiguredRpcUrls,
  getSignalLabel,
  getStatusKey,
  getStatusLabel,
  normalizeAddress,
} from "./lib/market-utils";
import BoardView from "./views/BoardView";
import MarketView from "./views/MarketView";
import useFormState from "./hooks/useFormState";
import useDataFetchers from "./hooks/useDataFetchers";
import useRouting from "./hooks/useRouting";
import useWallet from "./hooks/useWallet";
import useOnChainSync from "./hooks/useOnChainSync";
import useMarketActions from "./hooks/useMarketActions";

// Admin allowlist loaded from runtime config (Worker env var ADMIN_ALLOWLIST)
// Falls back to empty — no admin access unless the Worker provides the list

export default function App({ runtimeConfig }) {
  // ── Shared UI state ──
  const [banner, setBanner] = useState("Loading runtime config...");

  // ── Derived config ──
  const configuredRpcUrls = getConfiguredRpcUrls(runtimeConfig);
  const hasLiveContracts = Boolean(
    runtimeConfig.marketAddress && runtimeConfig.oracleAddress && runtimeConfig.registryAddress
  );
  const hasConfiguredRpc = Boolean(runtimeConfig.rpcConfigured || configuredRpcUrls.length > 0);
  const hasRuntimeRpc = configuredRpcUrls.length > 0;

  // ── Hooks ──

  const forms = useFormState({ setBanner });
  const {
    query, setQuery,
    statusFilter, setStatusFilter,
    sortMode, setSortMode,
    autoRefresh, setAutoRefresh,
    stakeAmount, setStakeAmount,
    accountProfile,
    adminPolicy,
    blacklistDraft, setBlacklistDraft,
    operatorForm,
    createMarketForm,
    attestationForm, setAttestationForm,
    updateAttestation,
    updateOperatorForm,
    updateCreateMarketForm,
    updateAccountProfile,
    saveAccountProfile,
    applyDemoPreset,
    addBlacklistedAddress,
    removeBlacklistedAddress,
    prefillCreateMarketForm,
  } = forms;

  const {
    wallet,
    connectModalOpen, setConnectModalOpen,
    connectInjectedWallet,
    connectWalletConnect,
    disconnectWallet,
    connectDemoChain,
  } = useWallet({ runtimeConfig, configuredRpcUrls, setBanner });

  // ── Derived wallet/access values ──
  const blacklist = adminPolicy.blacklist || [];
  const isWalletBlacklisted =
    Boolean(wallet.account) && blacklist.includes(normalizeAddress(wallet.account));
  const canAccessAccount = Boolean(wallet.account);
  const adminAllowlist = runtimeConfig.adminAllowlist || [];
  const canAccessAdmin =
    Boolean(wallet.account) && adminAllowlist.includes(normalizeAddress(wallet.account));
  const walletOnExpectedChain = wallet.chainId === runtimeConfig.chainId;

  const {
    marketState,
    credits,
    systemStatus,
    activeRpcUrl,
    lastSyncAt,
    refreshOnChain,
  } = useOnChainSync({ wallet, runtimeConfig, autoRefresh, hasLiveContracts, configuredRpcUrls, hasConfiguredRpc, hasRuntimeRpc, setBanner });

  // ── Market catalog + derived values ──
  const deferredQuery = useDeferredValue(query);
  const allMarkets = marketSeeds.map((seed) => buildMarketModel(seed, marketState[seed.slug]));

  const routing = useRouting({
    canAccessAccount, canAccessAdmin, wallet, setBanner, setConnectModalOpen,
    allMarkets, setAttestationForm,
  });
  const {
    appView,
    selectedSlug, setSelectedSlug,
    marketSurface,
    activeMarketSection,
    handleSelectMarket,
    clearSelectedMarket,
    openBoardView,
    openAccountView,
    openAdminPortal,
    openMarketSurface,
  } = routing;

  const selectedMarket = selectedSlug
    ? allMarkets.find((market) => market.slug === selectedSlug) ?? null
    : null;
  const adminMarket = selectedMarket ?? allMarkets[0] ?? null;

  const { activityFeed, companyNews } = useDataFetchers({ selectedMarketSlug: selectedMarket?.slug });

  // ── Owner / operator checks ──
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

  const {
    busyAction,
    signature,
    digest,
    takePosition,
    settleMarket,
    claimPayout,
    signAttestation,
    relayAttestation,
    publishDirectResolution,
    setEligibility,
    grantCredits,
    setReporter,
    setSigner,
    createMarket,
    cancelSelectedMarket,
  } = useMarketActions({
    wallet,
    runtimeConfig,
    configuredRpcUrls,
    hasLiveContracts,
    hasRuntimeRpc,
    canOperate,
    isWalletBlacklisted,
    setBanner,
    refreshOnChain,
    getSelectedMarket: () => selectedMarket ?? adminMarket,
    getAttestationForm: () => attestationForm,
    getOperatorForm: () => operatorForm,
    getCreateMarketForm: () => createMarketForm,
    getStakeAmount: () => stakeAmount,
  });

  // ── Derived display values ──
  const catalog = marketSeeds
    .filter((seed) => {
      const haystack =
        `${seed.company} ${seed.ticker} ${seed.metricName} ${seed.focus}`.toLowerCase();
      return haystack.includes(deferredQuery.trim().toLowerCase());
    })
    .map((seed) => buildMarketModel(seed, marketState[seed.slug]))
    .filter((market) => statusFilter === "all" || getStatusKey(market) === statusFilter)
    .sort((left, right) => compareMarkets(left, right, sortMode));

  const selectedHistory = selectedMarket ? marketHistory[selectedMarket.slug] || [] : [];
  const totalPool = selectedMarket ? selectedMarket.hitPool + selectedMarket.missPool : 0n;
  const hitProbability = selectedMarket ? calculateProbability(selectedMarket.hitPool, totalPool) : 0;
  const missProbability = selectedMarket ? calculateProbability(selectedMarket.missPool, totalPool) : 0;
  const hitPreview = selectedMarket ? calculatePreviewPayout(selectedMarket, 1, stakeAmount) : 0n;
  const missPreview = selectedMarket ? calculatePreviewPayout(selectedMarket, 2, stakeAmount) : 0n;

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

  // ── UI helpers ──

  async function refreshNow() {
    setBanner("Refreshing live market state...");
    await refreshOnChain();
    setBanner("Live market state refreshed.");
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

  // ── Context values ──
  const walletCtx = {
    wallet,
    connectModalOpen,
    setConnectModalOpen,
    walletOnExpectedChain,
    isWalletBlacklisted,
    disconnectWallet,
    connectDemoChain,
  };

  const runtimeCtx = {
    runtimeConfig,
    systemStatus,
    activeRpcUrl,
    lastSyncAt,
    autoRefresh,
    hasLiveContracts,
    canOperate,
    configuredRpcUrls,
    runtimeModeLabel,
    expectedOperator,
  };

  // ── Render ──

  return (
    <WalletProvider value={walletCtx}>
    <RuntimeProvider value={runtimeCtx}>
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

      {appView === "terms" || appView === "privacy" ? (
        <LegalPage page={appView} />
      ) : appView === "account" ? (
        <AccountPage
          credits={credits}
          canAccessAdmin={canAccessAdmin}
          positions={positions}
          totalStaked={totalStaked}
          claimableCount={claimableCount}
          accountProfile={accountProfile}
          onProfileChange={updateAccountProfile}
          onSaveProfile={saveAccountProfile}
          onOpenMarket={(slug) => handleSelectMarket(allMarkets.find((market) => market.slug === slug))}
          onOpenAdmin={openAdminPortal}
        />
      ) : appView === "admin" ? (
        <AdminPortal
          selectedMarket={adminMarket}
          allMarkets={allMarkets}
          onSelectMarket={(slug) => setSelectedSlug(slug)}
          onOpenMarket={(slug) => handleSelectMarket(allMarkets.find((market) => market.slug === slug))}
          onRefreshNow={refreshNow}
          copyRuntimeSummary={copyRuntimeSummary}
          applyDemoPreset={applyDemoPreset}
          prefillCreateMarketForm={() => prefillCreateMarketForm(selectedMarket ?? adminMarket)}
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
          setAutoRefresh={setAutoRefresh}
          busyAction={busyAction}
          refreshNow={refreshNow}
          handleSelectMarket={handleSelectMarket}
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
          canAccessAdmin={canAccessAdmin}
          stakeAmount={stakeAmount}
          setStakeAmount={setStakeAmount}
          busyAction={busyAction}
          takePosition={takePosition}
          settleMarket={settleMarket}
          claimPayout={claimPayout}
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
          prefillCreateMarketForm={() => prefillCreateMarketForm(selectedMarket ?? adminMarket)}
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
        onClose={() => setConnectModalOpen(false)}
        onConnectWalletConnect={connectWalletConnect}
        onConnectInjected={connectInjectedWallet}
        onOpenAccount={openAccountView}
      />

      <footer className="app-footer" aria-label="Site info">
        <span className="app-footer-version">
          v{__APP_VERSION__} · {__GIT_HASH__}
        </span>
        <span className="app-footer-sep" aria-hidden="true">·</span>
        <span className="app-footer-legal">Prediction markets carry risk of total loss</span>
        <span className="app-footer-sep" aria-hidden="true">·</span>
        <a className="app-footer-link" href="#page=terms">Terms</a>
        <span className="app-footer-sep" aria-hidden="true">·</span>
        <a className="app-footer-link" href="#page=privacy">Privacy</a>
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
    </RuntimeProvider>
    </WalletProvider>
  );
}
