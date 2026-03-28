import { useState } from "react";
import BrandAvatar from "../BrandAvatar";
import { getCompanyBrand } from "../brandSystem";
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTimestamp,
  shortAddress,
} from "../contracts";
import { useWalletContext } from "../contexts/WalletContext";
import { useRuntimeContext } from "../contexts/RuntimeContext";
import {
  calculateProbability,
  formatCountdown,
  getSignalLabel,
  getStatusLabel,
} from "../lib/market-utils";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "locked", label: "Locked" },
  { value: "upcoming", label: "Upcoming" },
  { value: "resolved", label: "Resolved" },
  { value: "cancelled", label: "Cancelled" },
];

const SORT_OPTIONS = [
  { value: "liquidity", label: "Liquidity", description: "Most active first" },
  { value: "lock", label: "Report date", description: "Soonest report first" },
  { value: "odds", label: "Beat odds", description: "Strongest signal first" },
  { value: "company", label: "Company", description: "Alphabetical" },
  { value: "ticker", label: "Ticker", description: "Alphabetical" },
  { value: "industry", label: "Industry", description: "Group by sector" },
];

function getStatusCount(allMarkets, status) {
  if (status === "all") return allMarkets.length;
  return allMarkets.filter((m) => {
    const label = getStatusLabel(m).toLowerCase().replace(/\s+/g, "-");
    return label === status;
  }).length;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function UpcomingReports({ allMarkets, onOpenMarket }) {
  const now = Date.now() / 1000;

  // Next 8 upcoming reports, sorted by date
  const upcoming = allMarkets
    .filter((m) => m.expectedAnnouncementAt > 0)
    .sort((a, b) => a.expectedAnnouncementAt - b.expectedAnnouncementAt)
    .slice(0, 8);

  if (upcoming.length === 0) return null;

  return (
    <div className="upcoming-reports">
      <p className="filter-section-label">Upcoming reports</p>
      <div className="upcoming-list">
        {upcoming.map((market) => {
          const d = new Date(market.expectedAnnouncementAt * 1000);
          const isPast = market.expectedAnnouncementAt < now;
          const daysAway = Math.ceil((market.expectedAnnouncementAt - now) / 86400);
          const dateStr = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
          const countdown = isPast ? "Reported" : daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway}d`;

          return (
            <button
              type="button"
              key={market.slug}
              className={`upcoming-row ${isPast ? "upcoming-past" : ""}`}
              onClick={() => onOpenMarket(market)}
            >
              <BrandAvatar brand={getCompanyBrand(market.company)} label={market.company} className="upcoming-avatar" />
              <span className="upcoming-info">
                <strong>{market.ticker}</strong>
                <span>{market.metricName}</span>
              </span>
              <span className="upcoming-date">
                <strong>{countdown}</strong>
                <span>{dateStr}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BoardView({
  catalog,
  allMarkets,
  marketCounts,
  nextCatalystMarket,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  sortMode,
  setSortMode,
  focusFilters,
  setAutoRefresh,
  busyAction,
  refreshNow,
  handleSelectMarket,
}) {
  const { wallet, setConnectModalOpen } = useWalletContext();
  const { systemStatus, autoRefresh } = useRuntimeContext();

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const hasActiveFilter = query !== "" || statusFilter !== "all" || sortMode !== "liquidity";

  // Early access waitlist state
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(() => {
    try { return localStorage.getItem("cm-waitlist-submitted") === "1"; } catch { return false; }
  });
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistWallet, setWaitlistWallet] = useState("");
  const [waitlistBet, setWaitlistBet] = useState(null);
  const [waitlistMarkets, setWaitlistMarkets] = useState([]);
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [waitlistError, setWaitlistError] = useState("");

  async function submitWaitlist(event) {
    event.preventDefault();
    if (!waitlistEmail || waitlistBusy) return;
    setWaitlistBusy(true);
    setWaitlistError("");
    try {
      const response = await fetch("/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: waitlistEmail,
          wallet: waitlistWallet || wallet.account || "",
          wouldBet: waitlistBet === true,
          markets: waitlistMarkets,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        setWaitlistSubmitted(true);
        setWaitlistCount(data.count || 0);
        try { localStorage.setItem("cm-waitlist-submitted", "1"); } catch {}
      } else {
        setWaitlistError(data.error || "Something went wrong");
      }
    } catch {
      setWaitlistError("Network error — try again");
    }
    setWaitlistBusy(false);
  }

  const totalLiquidityAll = allMarkets.reduce((sum, m) => sum + (m.hitPool || 0) + (m.missPool || 0), 0);
  const activePositions = allMarkets.filter((m) => (m.hitPool || 0) + (m.missPool || 0) > 0).length;

  const filterPanel = (
    <div className="board-filter-inner">
      {/* Summary stats */}
      <div className="filter-section">
        <div className="filter-stats-grid">
          <div className="filter-stat">
            <span className="filter-stat-value">{allMarkets.length}</span>
            <span className="filter-stat-label">Markets</span>
          </div>
          <div className="filter-stat">
            <span className="filter-stat-value">{marketCounts.open}</span>
            <span className="filter-stat-label">Open</span>
          </div>
          <div className="filter-stat">
            <span className="filter-stat-value">{activePositions}</span>
            <span className="filter-stat-label">Active</span>
          </div>
          <div className="filter-stat">
            <span className="filter-stat-value">{formatCompactNumber(totalLiquidityAll)}</span>
            <span className="filter-stat-label">Total vol.</span>
          </div>
        </div>
      </div>

      {/* Next catalyst */}
      {nextCatalystMarket && (
        <div className="filter-section filter-catalyst">
          <p className="filter-section-label">Next catalyst</p>
          <div className="filter-catalyst-row">
            <BrandAvatar brand={getCompanyBrand(nextCatalystMarket.company)} label={nextCatalystMarket.company} className="filter-catalyst-avatar" />
            <div>
              <strong>{nextCatalystMarket.ticker}</strong>
              <p>{formatCountdown(nextCatalystMarket.expectedAnnouncementAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="filter-section">
        <label className="filter-section-label" htmlFor="board-search">Search</label>
        <input
          id="board-search"
          className="search filter-search"
          placeholder="Ticker, company, metric..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {/* Status */}
      <div className="filter-section">
        <p className="filter-section-label">Status</p>
        <div className="filter-chip-grid">
          {STATUS_OPTIONS.map((opt) => {
            const count = getStatusCount(allMarkets, opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                className={`filter-chip ${statusFilter === opt.value ? "active" : ""}`}
                onClick={() => setStatusFilter(opt.value)}
              >
                <span>{opt.label}</span>
                <span className="filter-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sector */}
      <div className="filter-section">
        <p className="filter-section-label">Sector</p>
        <div className="filter-chip-grid filter-chip-grid-sectors">
          <button
            type="button"
            className={`filter-chip ${query === "" ? "active" : ""}`}
            onClick={() => setQuery("")}
          >
            All
          </button>
          {focusFilters.map((focus) => (
            <button
              type="button"
              key={focus}
              className={`filter-chip ${query === focus ? "active" : ""}`}
              onClick={() => setQuery((current) => (current === focus ? "" : focus))}
            >
              {focus}
            </button>
          ))}
        </div>
      </div>

      {/* Sort */}
      <div className="filter-section">
        <p className="filter-section-label">Sort by</p>
        <div className="filter-sort-list">
          {SORT_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={`filter-sort-item ${sortMode === opt.value ? "active" : ""}`}
              onClick={() => setSortMode(opt.value)}
            >
              <span className="filter-sort-name">{opt.label}</span>
              <span className="filter-sort-desc">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reset */}
      {hasActiveFilter && (
        <div className="filter-section">
          <button
            type="button"
            className="ghost filter-reset-btn"
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
              setSortMode("liquidity");
            }}
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );

  return (
    <main id="main-content" className="board-layout" aria-labelledby="board-page-title">
      <h1 id="board-page-title" className="sr-only">Market scanner</h1>

      {/* Left filter sidebar */}
      <aside className="board-sidebar" aria-label="Filters">
        <div className="surface-card board-filter-panel">
          <div className="board-filter-header">
            <h2>Filters</h2>
            <span className="hero-pill">{catalog.length} result{catalog.length !== 1 ? "s" : ""}</span>
          </div>
          {filterPanel}
        </div>
        <div className="surface-card board-filter-panel">
          <UpcomingReports allMarkets={allMarkets} onOpenMarket={handleSelectMarket} />
        </div>
      </aside>

      {/* Mobile filter toggle */}
      <div className="board-mobile-filter-bar">
        <button
          type="button"
          className="secondary board-mobile-filter-toggle"
          onClick={() => setMobileFiltersOpen((o) => !o)}
        >
          Filters {hasActiveFilter ? `(${catalog.length})` : ""}
        </button>
        <button type="button" className="primary" onClick={() => setConnectModalOpen(true)}>
          {wallet.account ? shortAddress(wallet.account) : "Connect wallet"}
        </button>
      </div>
      {mobileFiltersOpen && (
        <div className="board-mobile-filter-drawer surface-card">
          {filterPanel}
        </div>
      )}

      {/* Main content */}
      <section className="surface-card board-main">
        {/* Compact early access banner */}
        {!waitlistSubmitted ? (
          <form className="ea-banner" onSubmit={submitWaitlist}>
            <span className="ea-banner-text">Get early access to KPI predictions</span>
            <input type="email" className="ea-banner-email" placeholder="Email" value={waitlistEmail} onChange={(e) => setWaitlistEmail(e.target.value)} required />
            <input type="text" className="ea-banner-wallet" placeholder={wallet.account || "0x... (optional)"} value={waitlistWallet} onChange={(e) => setWaitlistWallet(e.target.value)} />
            <div className="ea-banner-bet">
              <span>Would you predict with $50?</span>
              <button type="button" className={`ea-bet-btn ${waitlistBet === true ? "active" : ""}`} onClick={() => setWaitlistBet(true)}>Yes</button>
              <button type="button" className={`ea-bet-btn ${waitlistBet === false ? "active" : ""}`} onClick={() => setWaitlistBet(false)}>No</button>
            </div>
            <button type="submit" className="ea-banner-submit" disabled={waitlistBusy || !waitlistEmail}>{waitlistBusy ? "..." : "Join"}</button>
            {waitlistError && <span className="ea-banner-error">{waitlistError}</span>}
          </form>
        ) : (
          <div className="ea-banner ea-banner-done">
            <span className="ea-banner-text">You're in. We'll notify you when real predictions go live.{waitlistCount > 0 ? ` ${waitlistCount} waiting.` : ""}</span>
          </div>
        )}

        <div className="board-topbar">
          <div className="board-topbar-left">
            <h2 className="board-title">Markets</h2>
          </div>
          <div className="board-topbar-right">
            <span className="hero-pill">
              {systemStatus.rpcHealthy ? "Live" : "Scenario mode"}
            </span>
            <button type="button" className="ghost" onClick={() => setAutoRefresh((current) => !current)}>
              Auto-refresh {autoRefresh ? "on" : "off"}
            </button>
            <button type="button" className="ghost" onClick={refreshNow} disabled={busyAction !== ""}>
              Refresh
            </button>
            <button type="button" className="primary board-connect-desktop" onClick={() => setConnectModalOpen(true)}>
              {wallet.account ? shortAddress(wallet.account) : "Connect wallet"}
            </button>
          </div>
        </div>

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
                          <span className={`status status-${marketStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                            {marketStatus}
                          </span>
                          <span className="hero-pill">{market.reportingPeriod}</span>
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
                    {totalLiquidity > 0 ? (
                      <>
                        <strong>{formatCompactNumber(totalLiquidity)}</strong>
                        <p>{formatNumber(market.hitPool)} beat / {formatNumber(market.missPool)} miss</p>
                      </>
                    ) : (
                      <>
                        <strong className="tone-muted">No positions yet</strong>
                        <p className="tone-invite">Be the first to trade</p>
                      </>
                    )}
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
  );
}
