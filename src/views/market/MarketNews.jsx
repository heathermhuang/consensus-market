import SectionLoadingState from "./SectionLoadingState";
import { formatNewsTimestamp, getMediaLogoUrl } from "../../lib/market-utils";

export default function MarketNews({ selectedMarket, companyNews }) {
  return (
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
  );
}
