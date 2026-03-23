import BrandAvatar from "./BrandAvatar";
import { getCompanyBrand } from "./brandSystem";
import { formatCompactNumber, formatNumber, shortAddress } from "./contracts";

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

export default function AccountPage({
  wallet,
  credits,
  systemStatus,
  runtimeModeLabel,
  walletOnExpectedChain,
  isBlacklisted,
  canAccessAdmin,
  positions,
  totalStaked,
  claimableCount,
  accountProfile,
  onProfileChange,
  onSaveProfile,
  onOpenMarket,
  onOpenAdmin,
  onOpenConnectModal,
  onDisconnectWallet,
}) {
  return (
    <main id="main-content" className="account-layout" aria-labelledby="account-page-title">
      <section className="account-main">
        <article className="surface-card account-hero-card">
          <div className="panel-heading">
            <div>
              <p className="section-label">Account</p>
              <h1 id="account-page-title">Positions and account settings</h1>
            </div>
            <span className="hero-pill">{wallet.account ? shortAddress(wallet.account) : "Wallet not connected"}</span>
          </div>

          <p className="panel-copy">
            This page keeps wallet state, open exposure, and saved account preferences in one place instead of scattering them
            across the board.
          </p>

          <div className="account-summary-grid">
            <article className="snapshot-card">
              <span className="field-label">Wallet status</span>
              <strong>{wallet.account ? "Connected" : "Disconnected"}</strong>
              <p>{wallet.account ? shortAddress(wallet.account) : "Connect with WalletConnect or a browser wallet to track positions."}</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Network</span>
              <strong>{wallet.account ? (walletOnExpectedChain ? "Ethereum ready" : "Wrong network") : "Waiting for wallet"}</strong>
              <p>{wallet.chainId ? `Chain ${wallet.chainId}` : "Mainnet connection is required for live actions."}</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Credits</span>
              <strong>{credits === null ? "Unavailable" : formatCompactNumber(credits)}</strong>
              <p>Closed-loop demo credits available to this address.</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Runtime</span>
              <strong>{runtimeModeLabel}</strong>
              <p>{systemStatus.rpcHealthy ? "Live reads are healthy." : "Scenario mode remains active until live sync returns."}</p>
            </article>
          </div>

          <div className="hero-actions">
            <button type="button" className="primary" onClick={onOpenConnectModal}>
              {wallet.account ? "Manage wallet" : "Connect wallet"}
            </button>
            {wallet.account && (
              <button type="button" className="ghost" onClick={onDisconnectWallet}>
                Disconnect
              </button>
            )}
            {canAccessAdmin && (
              <button type="button" className="ghost" onClick={onOpenAdmin}>
                Open admin portal
              </button>
            )}
          </div>

          {isBlacklisted && (
            <div className="account-alert account-alert-danger" role="status">
              This wallet appears on this browser's local restricted list. Direct on-chain denylist enforcement is not enabled yet.
            </div>
          )}
        </article>

        <article className="surface-card account-positions-card">
          <div className="panel-heading">
            <div>
              <p className="section-label">Positions</p>
              <h2>Live and archived exposure</h2>
            </div>
            <span className="hero-pill">{positions.length} positions</span>
          </div>

          <div className="account-summary-grid">
            <article className="snapshot-card">
              <span className="field-label">Total staked</span>
              <strong>{formatCompactNumber(totalStaked)}</strong>
              <p>Aggregate demo-credit exposure across visible positions.</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Claimable</span>
              <strong>{claimableCount}</strong>
              <p>Resolved markets with a user position that may have a claim or a post-resolution check remaining.</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Eligibility</span>
              <strong>{systemStatus.walletEligible ? "Eligible" : "Not eligible"}</strong>
              <p>Reported directly from the on-chain registry when live contracts are available.</p>
            </article>
            <article className="snapshot-card">
              <span className="field-label">Roles</span>
              <strong>{systemStatus.walletReporter || systemStatus.walletSigner ? "Privileged wallet" : "Trader wallet"}</strong>
              <p>
                Reporter {systemStatus.walletReporter ? "enabled" : "off"} · signer {systemStatus.walletSigner ? "enabled" : "off"}
              </p>
            </article>
          </div>

          <div className="account-position-list">
            {positions.map((position) => (
              <article key={position.slug} className="account-position-card">
                <div className="account-position-head">
                  <div className="board-company">
                    <BrandAvatar brand={getCompanyBrand(position.company)} label={position.company} />
                    <div className="table-market-copy">
                      <div className="market-identity">
                        <span className="ticker">{position.ticker}</span>
                        <span className={`status status-${position.statusClass}`}>{position.statusLabel}</span>
                        <span className="hero-pill">{position.reportingPeriod}</span>
                      </div>
                      <h3>{position.company}</h3>
                      <p>{position.metricName}</p>
                    </div>
                  </div>
                  <button type="button" className="ghost" onClick={() => onOpenMarket(position.slug)}>
                    Open market
                  </button>
                </div>

                <div className="account-position-metrics">
                  <article className="board-metric">
                    <span className="field-label">Side</span>
                    <strong className={position.side === "Beat" ? "tone-beat" : "tone-miss"}>{position.side}</strong>
                    <p>{formatNumber(position.stake)} credits staked</p>
                  </article>
                  <article className="board-metric">
                    <span className="field-label">Consensus</span>
                    <strong>{position.currentConsensusDisplay}</strong>
                    <p>{position.consensusMoveLabel}</p>
                  </article>
                  <article className="board-metric">
                    <span className="field-label">Report timing</span>
                    <strong>{formatTimestampWithYear(position.expectedAnnouncementAt)}</strong>
                    <p>{position.statusLabel}</p>
                  </article>
                  <article className="board-metric">
                    <span className="field-label">Outcome</span>
                    <strong>{position.settled ? (position.outcomeHit ? "Beat settled" : "Miss settled") : "Pending"}</strong>
                    <p>{position.settled ? "Resolution is on-chain." : "Waiting for issuer disclosure."}</p>
                  </article>
                </div>
              </article>
            ))}

            {positions.length === 0 && (
              <div className="empty-state">
                <strong>No positions yet.</strong>
                <p>Once a connected wallet takes a market view, it will show up here with stake size and settlement status.</p>
              </div>
            )}
          </div>
        </article>
      </section>

      <aside className="account-sidebar" aria-label="Account preferences">
        <article className="surface-card rail-card">
          <div className="panel-heading">
            <div>
              <p className="section-label">Profile</p>
              <h2>Saved account info</h2>
            </div>
            <span className="hero-pill">{accountProfile.displayName || "Private profile"}</span>
          </div>

          <div className="controls-grid">
            <label>
              Display name
              <input value={accountProfile.displayName} onChange={(event) => onProfileChange("displayName", event.target.value)} />
            </label>
            <label>
              Email
              <input
                type="email"
                value={accountProfile.email}
                onChange={(event) => onProfileChange("email", event.target.value)}
                placeholder="name@firm.com"
              />
            </label>
            <label>
              Coverage focus
              <input
                value={accountProfile.focus}
                onChange={(event) => onProfileChange("focus", event.target.value)}
                placeholder="Mobility, e-commerce, ad tech"
              />
            </label>
            <label>
              Default stake
              <input
                inputMode="numeric"
                value={accountProfile.defaultStake}
                onChange={(event) => onProfileChange("defaultStake", event.target.value.replace(/[^\d]/g, ""))}
              />
            </label>
          </div>

          <div className="hero-actions">
            <button type="button" className="primary full-width" onClick={onSaveProfile}>
              Save account settings
            </button>
          </div>
        </article>

        <article className="surface-card compliance-card">
          <div className="panel-heading panel-heading-compact">
            <div>
              <p className="section-label">Notes</p>
              <h2>Account handling</h2>
            </div>
          </div>
          <ul className="compliance-list">
            <li>Wallet identity stays self-custodied through WalletConnect or a browser wallet.</li>
            <li>Saved profile fields are stored locally in this browser until a real account backend is added.</li>
            <li>Positions are computed from live contract state when available, otherwise the page falls back cleanly to scenario mode.</li>
          </ul>
        </article>
      </aside>
    </main>
  );
}
