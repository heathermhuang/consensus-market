import { shortAddress, buildResolutionPayload } from "../../contracts";
import { useWalletContext } from "../../contexts/WalletContext";
import { useRuntimeContext } from "../../contexts/RuntimeContext";
import demoLiveAddresses from "../../../demo-live-addresses.json";

export function MarketAdminSidebar() {
  const { systemStatus, canOperate } = useRuntimeContext();

  return (
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
  );
}

export default function MarketAdmin({
  selectedMarket,
  busyAction,
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
}) {
  const { wallet } = useWalletContext();
  const { runtimeConfig, systemStatus, activeRpcUrl, lastSyncAt, autoRefresh, canOperate, expectedOperator } = useRuntimeContext();

  return (
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
  );
}
