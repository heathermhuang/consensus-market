import BrandAvatar from "../../BrandAvatar";
import { getCompanyBrand } from "../../brandSystem";
import { shortAddress } from "../../contracts";
import { useWalletContext } from "../../contexts/WalletContext";
import { useRuntimeContext } from "../../contexts/RuntimeContext";
import { buildOutcomeQuestion } from "../../lib/market-utils";

export default function MarketHero({
  selectedMarket,
  selectedStatus,
  heroSignalFacts,
  selectedCompanyProfile,
  selectedMajorHolders,
  quickFacts,
  marketSurface,
  activeMarketSection,
  openMarketSurface,
  clearSelectedMarket,
  canAccessAdmin,
  busyAction,
  refreshNow,
  copySelectedMarketLink,
}) {
  const { wallet } = useWalletContext();
  const { runtimeConfig, canOperate, expectedOperator } = useRuntimeContext();

  return (
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
  );
}
