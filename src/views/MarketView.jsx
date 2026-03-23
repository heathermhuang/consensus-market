import { Suspense, lazy } from "react";
import BrandAvatar from "../BrandAvatar";
import { getCompanyBrand } from "../brandSystem";
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  shortAddress,
  buildResolutionPayload,
} from "../contracts";
import {
  buildOutcomeQuestion,
  formatConsensusDisplay,
  formatCountdown,
  formatNewsTimestamp,
  formatTimestampWithYear,
  getMediaLogoUrl,
} from "../lib/market-utils";
import demoLiveAddresses from "../../demo-live-addresses.json";

const HistoricalChart = lazy(() => import("../HistoricalChart"));
const ConsensusPanel = lazy(() => import("../ConsensusPanel"));

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

export default function MarketView({
  // Market data
  selectedMarket,
  selectedStatus,
  selectedSignal,
  selectedHistory,
  heroSignalFacts,
  quickFacts,
  hitProbability,
  missProbability,
  hitPreview,
  missPreview,
  selectedPositionLabel,
  selectedOutcomeLabel,
  selectedCompanyProfile,
  selectedMajorHolders,
  activityFeed,
  companyNews,
  // Surface routing
  marketSurface,
  activeMarketSection,
  openMarketSurface,
  clearSelectedMarket,
  // Wallet
  wallet,
  walletOnExpectedChain,
  // Config / system
  runtimeConfig,
  systemStatus,
  activeRpcUrl,
  lastSyncAt,
  autoRefresh,
  expectedOperator,
  canOperate,
  canAccessAdmin,
  // Trade actions
  stakeAmount,
  setStakeAmount,
  busyAction,
  takePosition,
  settleMarket,
  claimPayout,
  connectDemoChain,
  setConnectModalOpen,
  refreshNow,
  copySelectedMarketLink,
  // Attestation
  attestationForm,
  updateAttestation,
  signAttestation,
  relayAttestation,
  publishDirectResolution,
  signature,
  digest,
  // Operator forms
  operatorForm,
  updateOperatorForm,
  setEligibility,
  grantCredits,
  setReporter,
  setSigner,
  createMarketForm,
  updateCreateMarketForm,
  createMarket,
  cancelSelectedMarket,
  prefillCreateMarketForm,
  applyDemoPreset,
  copyRuntimeSummary,
  // Admin blacklist
  blacklist,
  blacklistDraft,
  updateBlacklistDraft,
  addBlacklistedAddress,
  removeBlacklistedAddress,
}) {
  return (
    <main
      id="main-content"
      className={marketSurface === "overview" ? "market-layout" : "market-admin-layout"}
    >
      <section className="market-main">
        {/* ── Hero card ── */}
        <article id="market-overview" className="surface-card market-hero-card">
          <div className="market-story-top">
            <button type="button" className="ghost" onClick={clearSelectedMarket}>
              Back to board
            </button>
            <div className="hero-pill-row">
              <span className={`status status-${selectedStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                {selectedStatus}
              </span>
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
                <p className="eyebrow">
                  {selectedMarket.ticker} · {selectedMarket.company} · {selectedMarket.reportingPeriod}
                </p>
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
            {[
              { label: "Overview",     id: "market-overview",      surface: "overview" },
              { label: "Consensus",    id: "market-consensus",     surface: "overview" },
              { label: "Latest news",  id: "market-news",          surface: "overview" },
              { label: "History",      id: "market-history",       surface: "overview" },
              { label: "Activity",     id: "market-activity",      surface: "overview" },
              { label: "Trade ticket", id: "market-ticket",        surface: "overview" },
            ].map(({ label, id, surface }) => (
              <button
                key={id}
                type="button"
                className={`section-tab${activeMarketSection === id ? " active" : ""}`}
                aria-current={activeMarketSection === id ? "true" : undefined}
                onClick={() => openMarketSurface(surface, id)}
              >
                {label}
              </button>
            ))}
            {canAccessAdmin && (
              <button
                type="button"
                className={`section-tab${marketSurface === "admin" ? " active" : ""}`}
                aria-current={marketSurface === "admin" ? "true" : undefined}
                onClick={() => openMarketSurface("admin", "market-admin-status")}
              >
                Admin
              </button>
            )}
          </nav>

          {marketSurface === "overview" ? (
            <div className="market-hero-actions">
              <button type="button" className="secondary" onClick={copySelectedMarketLink}>
                Copy market link
              </button>
              <button type="button" className="ghost" onClick={refreshNow} disabled={busyAction !== ""}>
                Refresh market
              </button>
              <a
                className="ghost button-link"
                href={selectedMarket.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Issuer source
              </a>
            </div>
          ) : (
            <div className="admin-intro-grid">
              <article className="story-stat">
                <span className="field-label">Declared operator</span>
                <strong>{expectedOperator ? shortAddress(expectedOperator) : "Not configured"}</strong>
                <p>
                  {runtimeConfig.operatorAddress ||
                    "Falls back to the on-chain owner if not declared in runtime config."}
                </p>
              </article>
              <article className="story-stat">
                <span className="field-label">Connected wallet</span>
                <strong>{wallet.account ? shortAddress(wallet.account) : "Not connected"}</strong>
                <p>
                  {canOperate
                    ? "This wallet can execute owner actions."
                    : "Switch to the operator wallet for owner actions."}
                </p>
              </article>
              <article className="story-stat">
                <span className="field-label">Oracle</span>
                <strong>
                  {runtimeConfig.oracleAddress
                    ? shortAddress(runtimeConfig.oracleAddress)
                    : "No oracle address"}
                </strong>
                <p>Use this surface for resolution signing, relay, and market administration.</p>
              </article>
            </div>
          )}
        </article>

        {/* ── Overview panels ── */}
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
                  <h2>
                    {selectedMarket.company} {selectedMarket.reportingPeriod} coverage for{" "}
                    {selectedMarket.metricName.toLowerCase()}
                  </h2>
                </div>
                <span className="hero-pill">
                  {companyNews.loading ? "Refreshing feed" : "Recent coverage only · 180d"}
                </span>
              </div>

              <p className="panel-copy">
                Live headlines are filtered to recent KPI coverage only, so users see current reporting context
                instead of stale year-old articles.
                {!companyNews.loading && companyNews.updatedAt
                  ? ` Updated ${formatNewsTimestamp(companyNews.updatedAt)}.`
                  : ""}
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
                            <img
                              className="news-source-logo"
                              src={getMediaLogoUrl(article)}
                              alt=""
                              loading="lazy"
                            />
                          ) : null}
                          <span>{article.source || "Google News"}</span>
                        </span>
                        <span className="field-label">{formatNewsTimestamp(article.publishedAt)}</span>
                      </div>
                      <strong>{article.title}</strong>
                      <p>
                        {article.snippet ||
                          `${selectedMarket.reportingPeriod} · ${selectedMarket.metricName} · ${article.source || "Google News"}`}
                      </p>
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
                <HistoricalChart history={selectedHistory} reportingPeriod={selectedMarket.reportingPeriod} />
              </Suspense>
            </article>

            <article id="market-activity" className="surface-card activity-card-shell">
              <div className="panel-heading">
                <div>
                  <p className="section-label">Activity</p>
                  <h2>Recent on-chain events</h2>
                </div>
                <span className="hero-pill">
                  {activityFeed.length ? `${activityFeed.length} recent events` : "No report loaded"}
                </span>
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
          /* ── Admin panels ── */
          <section className="advanced-section">
            <div className="advanced-heading">
              <p className="section-label">Admin workspace</p>
              <h2>Runtime, oracle, and operator controls</h2>
              <p className="panel-copy">
                Separated from the main market flow so normal users are not forced through operational tooling.
              </p>
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
                  <strong>
                    {activeRpcUrl === "wallet"
                      ? "Wallet provider"
                      : systemStatus.rpcHealthy
                        ? "Public demo endpoint"
                        : "Offline"}
                  </strong>
                  <p>
                    {systemStatus.rpcHealthy
                      ? "Connected to the live demo chain feed."
                      : "No live demo endpoint is responding right now."}
                  </p>
                </article>
                <article className="note-card">
                  <span className="field-label">Last sync</span>
                  <strong>
                    {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "No successful sync yet"}
                  </strong>
                  <p>
                    Auto-refresh is {autoRefresh ? "enabled" : "paused"}.
                    {systemStatus.statusCheckedAt
                      ? ` Status checked at ${new Date(systemStatus.statusCheckedAt).toLocaleTimeString()}.`
                      : ""}
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
                  <p>
                    {runtimeConfig.operatorAddress ||
                      "Falls back to the on-chain owner if not declared in runtime config."}
                  </p>
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
                  <p className="panel-copy">
                    Quick access to the demo operator and trader accounts for local testing and walkthroughs.
                  </p>
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
                <span className="hero-pill">
                  {runtimeConfig.oracleAddress
                    ? shortAddress(runtimeConfig.oracleAddress)
                    : "No oracle address"}
                </span>
              </summary>

              <div className="attestation-grid">
                <label>
                  Actual KPI value
                  <input
                    value={attestationForm.actualValue}
                    onChange={(event) =>
                      updateAttestation("actualValue", event.target.value.replace(/[^\d]/g, ""))
                    }
                  />
                </label>
                <label>
                  Source label
                  <input
                    value={attestationForm.sourceLabel}
                    onChange={(event) => updateAttestation("sourceLabel", event.target.value)}
                  />
                </label>
                <label>
                  Source URI
                  <input
                    value={attestationForm.sourceUri}
                    onChange={(event) => updateAttestation("sourceUri", event.target.value)}
                  />
                </label>
                <label>
                  Observed at
                  <input
                    value={attestationForm.observedAt}
                    onChange={(event) =>
                      updateAttestation("observedAt", event.target.value.replace(/[^\d]/g, ""))
                    }
                  />
                </label>
                <label>
                  Valid before
                  <input
                    value={attestationForm.validBefore}
                    onChange={(event) =>
                      updateAttestation("validBefore", event.target.value.replace(/[^\d]/g, ""))
                    }
                  />
                </label>
                <label>
                  Nonce
                  <input
                    value={attestationForm.nonce}
                    onChange={(event) =>
                      updateAttestation("nonce", event.target.value.replace(/[^\d]/g, ""))
                    }
                  />
                </label>
              </div>

              <div className="action-row">
                <button type="button" className="primary" disabled={busyAction !== ""} onClick={signAttestation}>
                  {busyAction === "sign" ? "Signing..." : "Sign attestation"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busyAction !== "" || !signature}
                  onClick={relayAttestation}
                >
                  {busyAction === "relay" ? "Relaying..." : "Relay attestation"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busyAction !== ""}
                  onClick={publishDirectResolution}
                >
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
                    <button
                      type="button"
                      className="secondary"
                      disabled={busyAction !== ""}
                      onClick={() => setEligibility(true)}
                    >
                      Allowlist
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busyAction !== ""}
                      onClick={() => setEligibility(false)}
                    >
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
                      onChange={(event) =>
                        updateOperatorForm("creditAmount", event.target.value.replace(/[^\d]/g, ""))
                      }
                    />
                    <button
                      type="button"
                      className="primary"
                      disabled={busyAction !== ""}
                      onClick={grantCredits}
                    >
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
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyAction !== ""}
                        onClick={() => setReporter(true)}
                      >
                        Authorize reporter
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busyAction !== ""}
                        onClick={() => setReporter(false)}
                      >
                        Revoke
                      </button>
                    </div>
                    <div className="operator-row">
                      <input
                        value={operatorForm.signerAddress}
                        placeholder="Signer wallet"
                        onChange={(event) => updateOperatorForm("signerAddress", event.target.value)}
                      />
                      <button
                        type="button"
                        className="secondary"
                        disabled={busyAction !== ""}
                        onClick={() => setSigner(true)}
                      >
                        Authorize signer
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busyAction !== ""}
                        onClick={() => setSigner(false)}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                </article>

                <article className="note-card operator-form-card">
                  <div className="panel-heading">
                    <div>
                      <span className="field-label">Create market</span>
                      <p className="operator-copy">
                        Use this market as a template or edit each field manually.
                      </p>
                    </div>
                    <button type="button" className="ghost" onClick={prefillCreateMarketForm}>
                      Prefill from selected
                    </button>
                  </div>

                  <div className="operator-form-grid">
                    <label>
                      ID seed
                      <input
                        value={createMarketForm.idSeed}
                        onChange={(event) => updateCreateMarketForm("idSeed", event.target.value)}
                      />
                    </label>
                    <label>
                      Ticker
                      <input
                        value={createMarketForm.ticker}
                        onChange={(event) => updateCreateMarketForm("ticker", event.target.value)}
                      />
                    </label>
                    <label>
                      Metric name
                      <input
                        value={createMarketForm.metricName}
                        onChange={(event) => updateCreateMarketForm("metricName", event.target.value)}
                      />
                    </label>
                    <label>
                      Consensus value
                      <input
                        value={createMarketForm.consensusValue}
                        inputMode="numeric"
                        onChange={(event) =>
                          updateCreateMarketForm("consensusValue", event.target.value.replace(/[^\d]/g, ""))
                        }
                      />
                    </label>
                    <label>
                      Opens at (unix)
                      <input
                        value={createMarketForm.opensAt}
                        inputMode="numeric"
                        onChange={(event) =>
                          updateCreateMarketForm("opensAt", event.target.value.replace(/[^\d]/g, ""))
                        }
                      />
                    </label>
                    <label>
                      Locks at (unix)
                      <input
                        value={createMarketForm.locksAt}
                        inputMode="numeric"
                        onChange={(event) =>
                          updateCreateMarketForm("locksAt", event.target.value.replace(/[^\d]/g, ""))
                        }
                      />
                    </label>
                    <label>
                      Announcement at (unix)
                      <input
                        value={createMarketForm.expectedAnnouncementAt}
                        inputMode="numeric"
                        onChange={(event) =>
                          updateCreateMarketForm(
                            "expectedAnnouncementAt",
                            event.target.value.replace(/[^\d]/g, "")
                          )
                        }
                      />
                    </label>
                    <label>
                      Consensus source
                      <input
                        value={createMarketForm.consensusSource}
                        onChange={(event) => updateCreateMarketForm("consensusSource", event.target.value)}
                      />
                    </label>
                    <label className="full-span">
                      Resolution policy
                      <input
                        value={createMarketForm.resolutionPolicy}
                        onChange={(event) => updateCreateMarketForm("resolutionPolicy", event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="action-row">
                    <button
                      type="button"
                      className="primary"
                      disabled={busyAction !== ""}
                      onClick={createMarket}
                    >
                      {busyAction === "create-market" ? "Creating..." : "Create market"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busyAction !== ""}
                      onClick={cancelSelectedMarket}
                    >
                      {busyAction === "cancel-market" ? "Cancelling..." : "Cancel selected market"}
                    </button>
                  </div>
                </article>
              </div>
            </details>
          </section>
        )}
      </section>

      {/* ── Sidebar ── */}
      {marketSurface === "overview" ? (
        <aside className="market-sidebar" aria-label="Trade ticket and market summary">
          <article id="market-ticket" className="surface-card trade-panel sticky-panel">
            <div className="panel-heading">
              <div>
                <p className="section-label">Trade ticket</p>
                <h2>Take a position</h2>
              </div>
              <span className="hero-pill">
                {wallet.account ? shortAddress(wallet.account) : "Wallet not connected"}
              </span>
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
              <button
                type="button"
                className="primary action-buy-beat"
                disabled={busyAction !== ""}
                onClick={() => takePosition(1)}
              >
                {busyAction === "position-1" ? "Submitting..." : "Buy beat"}
              </button>
              <button
                type="button"
                className="secondary action-buy-miss"
                disabled={busyAction !== ""}
                onClick={() => takePosition(2)}
              >
                {busyAction === "position-2" ? "Submitting..." : "Buy miss"}
              </button>
            </div>

            <div className="action-row">
              <button
                type="button"
                className="ghost"
                disabled={busyAction !== ""}
                onClick={settleMarket}
              >
                {busyAction === "settle" ? "Settling..." : "Settle market"}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busyAction !== ""}
                onClick={claimPayout}
              >
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
                <p>
                  Locks {formatCountdown(selectedMarket.locksAt)}. Opens{" "}
                  {formatTimestamp(selectedMarket.opensAt)}.
                </p>
              </article>
              <article className="note-card">
                <span className="field-label">Consensus move</span>
                <strong>{selectedMarket.consensusMoveLabel}</strong>
                <p>
                  {selectedMarket.currentConsensusDisplay} now versus{" "}
                  {formatConsensusDisplay(
                    selectedMarket.openingConsensusSnapshot.value,
                    selectedMarket.consensusDisplay
                  )}{" "}
                  on the first street read.
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
                <p>
                  {canOperate
                    ? "Connected wallet matches the operator set."
                    : "Switch to the owner wallet to execute admin actions."}
                </p>
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
  );
}
