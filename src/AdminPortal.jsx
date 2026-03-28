import BrandAvatar from "./BrandAvatar";
import { getCompanyBrand } from "./brandSystem";
import { formatCompactNumber, formatTimestamp, shortAddress } from "./contracts";
import { formatTimestampWithYear } from "./lib/format-utils";

export default function AdminPortal({
  wallet,
  canOperate,
  runtimeModeLabel,
  runtimeConfig,
  configuredRpcUrls,
  activeRpcUrl,
  lastSyncAt,
  selectedMarket,
  allMarkets,
  onSelectMarket,
  onOpenMarket,
  onOpenConnectModal,
  onRefreshNow,
  copyRuntimeSummary,
  applyDemoPreset,
  prefillCreateMarketForm,
  operatorForm,
  updateOperatorForm,
  createMarketForm,
  updateCreateMarketForm,
  attestationForm,
  updateAttestation,
  blacklistDraft,
  updateBlacklistDraft,
  blacklist,
  addBlacklistedAddress,
  removeBlacklistedAddress,
  setEligibility,
  grantCredits,
  setReporter,
  setSigner,
  signAttestation,
  relayAttestation,
  publishDirectResolution,
  createMarket,
  cancelSelectedMarket,
  busyAction,
  signature,
  digest,
  systemStatus,
  isBlacklisted,
}) {
  const operatorAddress =
    runtimeConfig.operatorAddress || systemStatus.marketOwner || systemStatus.oracleOwner || systemStatus.registryOwner || "";

  return (
    <main id="main-content" className="admin-portal-layout" aria-labelledby="admin-page-title">
      <section className="admin-portal-main">
        <article className="surface-card admin-portal-hero">
          <div className="panel-heading">
            <div>
              <p className="section-label">Admin portal</p>
              <h1 id="admin-page-title">Market, user, and runtime operations</h1>
            </div>
            <span className="hero-pill">{canOperate ? "Operator wallet ready" : "Read-only mode"}</span>
          </div>

          <p className="panel-copy">
            This is the operational surface for running the product. Normal trading stays on market pages, while issuer resolution,
            user policy, market setup, and runtime checks live here.
          </p>

          <div className="account-summary-grid">
            <article className="snapshot-card">
              <span className="field-label">Connected wallet</span>
              <strong>{wallet.account ? shortAddress(wallet.account) : "Not connected"}</strong>
              <p>{wallet.account ? `Chain ${wallet.chainId || runtimeConfig.chainId}` : "Connect an operator wallet to unlock write actions."}</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Declared operator</span>
              <strong>{operatorAddress ? shortAddress(operatorAddress) : "Not configured"}</strong>
              <p>Runtime config wins when set, otherwise ownership falls back to contract state.</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Runtime</span>
              <strong>{runtimeModeLabel}</strong>
              <p>{activeRpcUrl ? `Active read source: ${activeRpcUrl}` : "No live RPC selected right now."}</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Policy</span>
              <strong>{blacklist.length} locally restricted wallets</strong>
              <p>
                {isBlacklisted
                  ? "The connected wallet is also on this browser's local restricted list."
                  : "This list is browser-local only. It is not an on-chain denylist yet."}
              </p>
            </article>
          </div>

          <div className="hero-actions">
            <button type="button" className="primary" onClick={onOpenConnectModal}>
              {wallet.account ? "Manage wallet" : "Connect operator wallet"}
            </button>
            <button type="button" className="ghost" onClick={onRefreshNow} disabled={busyAction !== ""}>
              Refresh admin data
            </button>
            <button type="button" className="ghost" onClick={copyRuntimeSummary}>
              Copy runtime summary
            </button>
          </div>
        </article>

        <article className="surface-card">
          <div className="panel-heading">
            <div>
              <p className="section-label">Market roster</p>
              <h2>Target a market for operations</h2>
            </div>
            <span className="hero-pill">{allMarkets.length} live markets</span>
          </div>

          <div className="admin-market-toolbar">
            <label>
              Active market
              <select value={selectedMarket?.slug || ""} onChange={(event) => onSelectMarket(event.target.value)}>
                {allMarkets.map((market) => (
                  <option key={market.slug} value={market.slug}>
                    {market.ticker} · {market.metricName} · {market.reportingPeriod}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="ghost" onClick={() => selectedMarket && onOpenMarket(selectedMarket.slug)} disabled={!selectedMarket}>
              Open market page
            </button>
            <button type="button" className="ghost" onClick={prefillCreateMarketForm} disabled={!selectedMarket}>
              Prefill create form
            </button>
            <button type="button" className="ghost" onClick={() => applyDemoPreset("owner")}>
              Load demo presets
            </button>
          </div>

          {selectedMarket && (
            <article className="admin-market-card">
              <div className="board-company admin-market-company">
                <BrandAvatar brand={getCompanyBrand(selectedMarket.company)} label={selectedMarket.company} className="brand-avatar-large" />
                <div className="table-market-copy">
                  <div className="market-identity">
                    <span className="ticker">{selectedMarket.ticker}</span>
                    <span className="hero-pill">{selectedMarket.reportingPeriod}</span>
                    <span className="hero-pill">{selectedMarket.focus}</span>
                    <span className={`status ${canOperate ? "status-open" : "status-locked"}`}>
                      {canOperate ? "Owner ready" : "Read-only"}
                    </span>
                  </div>
                  <h3>{selectedMarket.company}</h3>
                  <p>{selectedMarket.metricName}</p>
                  <p className="admin-market-context">
                    Active operator target for attestation, role management, and create or cancel presets.
                  </p>
                </div>
              </div>

              <div className="admin-market-stats">
                <article className="board-metric">
                  <span className="field-label">Consensus</span>
                  <strong>{selectedMarket.currentConsensusDisplay}</strong>
                  <p>{selectedMarket.consensusMoveLabel}</p>
                </article>
                <article className="board-metric">
                  <span className="field-label">Report date</span>
                  <strong>{formatTimestamp(selectedMarket.expectedAnnouncementAt)}</strong>
                  <p>{formatTimestampWithYear(selectedMarket.expectedAnnouncementAt)}</p>
                </article>
                <article className="board-metric">
                  <span className="field-label">Liquidity</span>
                  <strong>{formatCompactNumber(selectedMarket.hitPool + selectedMarket.missPool)}</strong>
                  <p>{selectedMarket.reportingPeriod} market depth</p>
                </article>
                <article className="board-metric">
                  <span className="field-label">Operator action</span>
                  <strong>{canOperate ? "Enabled" : "Restricted"}</strong>
                  <p>{canOperate ? "Owner checks pass." : "Connect the owner wallet to write."}</p>
                </article>
              </div>
            </article>
          )}
        </article>

        <section className="admin-portal-split">
          <article className="surface-card rail-card">
            <div className="panel-heading">
              <div>
                <p className="section-label">Resolution</p>
                <h2>Attestation and publish flow</h2>
              </div>
              <span className="hero-pill">{selectedMarket ? selectedMarket.ticker : "No market selected"}</span>
            </div>

            <div className="attestation-grid">
              <label>
                Actual value
                <input value={attestationForm.actualValue} inputMode="numeric" onChange={(event) => updateAttestation("actualValue", event.target.value.replace(/[^\d-]/g, ""))} />
              </label>
              <label>
                Source label
                <input value={attestationForm.sourceLabel} onChange={(event) => updateAttestation("sourceLabel", event.target.value)} />
              </label>
              <label className="full-span">
                Source URI
                <input value={attestationForm.sourceUri} onChange={(event) => updateAttestation("sourceUri", event.target.value)} />
              </label>
              <label>
                Observed at
                <input value={attestationForm.observedAt} inputMode="numeric" onChange={(event) => updateAttestation("observedAt", event.target.value.replace(/[^\d]/g, ""))} />
              </label>
              <label>
                Valid after
                <input value={attestationForm.validAfter} inputMode="numeric" onChange={(event) => updateAttestation("validAfter", event.target.value.replace(/[^\d]/g, ""))} />
              </label>
              <label>
                Valid before
                <input value={attestationForm.validBefore} inputMode="numeric" onChange={(event) => updateAttestation("validBefore", event.target.value.replace(/[^\d]/g, ""))} />
              </label>
              <label>
                Nonce
                <input value={attestationForm.nonce} inputMode="numeric" onChange={(event) => updateAttestation("nonce", event.target.value.replace(/[^\d]/g, ""))} />
              </label>
            </div>

            <div className="action-row">
              <button type="button" className="primary" disabled={busyAction !== "" || !selectedMarket} onClick={signAttestation}>
                {busyAction === "sign" ? "Signing..." : "Sign attestation"}
              </button>
              <button type="button" className="ghost" disabled={busyAction !== "" || !selectedMarket || !signature} onClick={relayAttestation}>
                {busyAction === "relay" ? "Relaying..." : "Relay signed attestation"}
              </button>
              <button type="button" className="ghost" disabled={busyAction !== "" || !selectedMarket} onClick={publishDirectResolution}>
                {busyAction === "direct-resolve" ? "Publishing..." : "Direct publish"}
              </button>
            </div>

            {(signature || digest) && (
              <div className="admin-code-blocks">
                {signature && <pre>{signature}</pre>}
                {digest && <pre>{digest}</pre>}
              </div>
            )}
          </article>

          <article className="surface-card rail-card">
            <div className="panel-heading">
              <div>
                <p className="section-label">Users</p>
                <h2>Eligibility, credits, and roles</h2>
              </div>
              <span className="hero-pill">{runtimeConfig.registryAddress ? "Registry attached" : "Scenario mode"}</span>
            </div>

            <div className="operator-stack">
              <label>
                Eligibility wallet
                <input value={operatorForm.eligibilityAddress} onChange={(event) => updateOperatorForm("eligibilityAddress", event.target.value)} />
              </label>
              <div className="action-row">
                <button type="button" className="primary" disabled={busyAction !== ""} onClick={() => setEligibility(true)}>
                  Allowlist wallet
                </button>
                <button type="button" className="ghost" disabled={busyAction !== ""} onClick={() => setEligibility(false)}>
                  Remove wallet
                </button>
              </div>

              <label>
                Credits wallet
                <input value={operatorForm.creditAddress} onChange={(event) => updateOperatorForm("creditAddress", event.target.value)} />
              </label>
              <label>
                Credit amount
                <input value={operatorForm.creditAmount} inputMode="numeric" onChange={(event) => updateOperatorForm("creditAmount", event.target.value.replace(/[^\d]/g, ""))} />
              </label>
              <button type="button" className="primary" disabled={busyAction !== ""} onClick={grantCredits}>
                Grant credits
              </button>

              <label>
                Reporter wallet
                <input value={operatorForm.reporterAddress} onChange={(event) => updateOperatorForm("reporterAddress", event.target.value)} />
              </label>
              <div className="action-row">
                <button type="button" className="ghost" disabled={busyAction !== ""} onClick={() => setReporter(true)}>
                  Add reporter
                </button>
                <button type="button" className="ghost" disabled={busyAction !== ""} onClick={() => setReporter(false)}>
                  Remove reporter
                </button>
              </div>

              <label>
                Signer wallet
                <input value={operatorForm.signerAddress} onChange={(event) => updateOperatorForm("signerAddress", event.target.value)} />
              </label>
              <div className="action-row">
                <button type="button" className="ghost" disabled={busyAction !== ""} onClick={() => setSigner(true)}>
                  Add signer
                </button>
                <button type="button" className="ghost" disabled={busyAction !== ""} onClick={() => setSigner(false)}>
                  Remove signer
                </button>
              </div>
            </div>
          </article>

        </section>

        <article className="surface-card rail-card">
          <div className="panel-heading">
            <div>
              <p className="section-label">Blacklist</p>
              <h2>Local risk policy</h2>
            </div>
            <span className="hero-pill">{blacklist.length} listed</span>
          </div>

          <p className="panel-copy">
            Until a contract-level blacklist exists, operators can use this local portal policy to block specific wallets from trade actions in the UI.
          </p>

          <label>
            Wallet address
            <input value={blacklistDraft} onChange={(event) => updateBlacklistDraft(event.target.value)} placeholder="0x..." />
          </label>

          <div className="action-row">
            <button type="button" className="primary" onClick={addBlacklistedAddress}>
              Add to blacklist
            </button>
          </div>

          <div className="chip-row">
            {blacklist.map((address) => (
              <button key={address} type="button" className="chip chip-removable" onClick={() => removeBlacklistedAddress(address)}>
                {shortAddress(address)}
              </button>
            ))}
          </div>

          {blacklist.length === 0 && (
            <div className="empty-state">
              <strong>No wallets are blacklisted.</strong>
              <p>Blocked wallets will appear here and can be removed with one click.</p>
            </div>
          )}
        </article>

        <article className="surface-card rail-card">
          <div className="panel-heading">
            <div>
              <p className="section-label">Market creation</p>
              <h2>Create or cancel markets</h2>
            </div>
            <span className="hero-pill">{configuredRpcUrls.length ? `${configuredRpcUrls.length} RPC route(s)` : "No RPC routes"}</span>
          </div>

          <div className="operator-form-grid">
            <label>
              Market id seed
              <input value={createMarketForm.idSeed} onChange={(event) => updateCreateMarketForm("idSeed", event.target.value)} />
            </label>
            <label>
              Ticker
              <input value={createMarketForm.ticker} onChange={(event) => updateCreateMarketForm("ticker", event.target.value.toUpperCase())} />
            </label>
            <label>
              Metric name
              <input value={createMarketForm.metricName} onChange={(event) => updateCreateMarketForm("metricName", event.target.value)} />
            </label>
            <label>
              Consensus value
              <input value={createMarketForm.consensusValue} inputMode="numeric" onChange={(event) => updateCreateMarketForm("consensusValue", event.target.value.replace(/[^\d-]/g, ""))} />
            </label>
            <label>
              Opens at
              <input value={createMarketForm.opensAt} inputMode="numeric" onChange={(event) => updateCreateMarketForm("opensAt", event.target.value.replace(/[^\d]/g, ""))} />
            </label>
            <label>
              Locks at
              <input value={createMarketForm.locksAt} inputMode="numeric" onChange={(event) => updateCreateMarketForm("locksAt", event.target.value.replace(/[^\d]/g, ""))} />
            </label>
            <label>
              Announcement at
              <input value={createMarketForm.expectedAnnouncementAt} inputMode="numeric" onChange={(event) => updateCreateMarketForm("expectedAnnouncementAt", event.target.value.replace(/[^\d]/g, ""))} />
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
            <button type="button" className="ghost" disabled={busyAction !== "" || !selectedMarket} onClick={cancelSelectedMarket}>
              {busyAction === "cancel-market" ? "Cancelling..." : "Cancel selected market"}
            </button>
          </div>
        </article>

        <article className="surface-card compliance-card">
          <div className="panel-heading panel-heading-compact">
            <div>
              <p className="section-label">Operational notes</p>
              <h2>Current platform boundaries</h2>
            </div>
          </div>
          <ul className="compliance-list">
            <li>Wallet access now supports WalletConnect and injected browser wallets on Ethereum mainnet.</li>
            <li>Blacklist controls are a local operator policy layer until a contract-native restriction is added.</li>
            <li>Runtime sync, registry, and oracle actions are still governed by the configured contract addresses and the connected owner wallet.</li>
            <li>Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "No successful live sync yet."}</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
