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
  return (
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
            <button
              type="button"
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
            <button
              type="button"
              className={`chip ${query === "" ? "active" : ""}`}
              onClick={() => setQuery("")}
            >
              All sectors
            </button>
            {focusFilters.map((focus) => (
              <button
                type="button"
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
            <p className="panel-copy">
              A compact roster for comparing signal, Street consensus, liquidity, and report timing at a glance.
            </p>
          </div>
          <div className="meta-row board-main-meta">
            <span className="hero-pill">
              {systemStatus.rpcHealthy ? "Trading available" : "Scenario board"}
            </span>
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
            <button
              type="button"
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
  );
}
