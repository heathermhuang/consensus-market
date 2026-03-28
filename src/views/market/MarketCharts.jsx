import { Suspense, lazy } from "react";
import SectionLoadingState from "./SectionLoadingState";

const HistoricalChart = lazy(() => import("../../HistoricalChart"));
const ConsensusPanel = lazy(() => import("../../ConsensusPanel"));

export default function MarketCharts({
  selectedMarket,
  selectedCompanyProfile,
  selectedMajorHolders,
  quickFacts,
  selectedHistory,
}) {
  return (
    <>
      <article className="surface-card market-brief-card">
        <div className="market-summary-head">
          <div className="market-summary-copy">
            <p className="section-label">Company and market setup</p>
            <h2 className="market-summary-title">{selectedMarket.company}</h2>
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
    </>
  );
}
