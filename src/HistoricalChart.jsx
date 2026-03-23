import { useEffect, useState } from "react";
import { formatNumber } from "./contracts";

function getMobileHistoryView() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 760px)").matches;
}

function parsePeriodKey(period) {
  const match = String(period || "").match(/^Q([1-4])'(\d{2})$/);
  if (!match) return 0;
  return Number(`20${match[2]}`) * 4 + Number(match[1]);
}

function buildPath(points, width, height, minValue, maxValue, valueKey) {
  const innerWidth = width - 48;
  const innerHeight = height - 42;
  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const range = Math.max(maxValue - minValue, 1);

  return points
    .map((point, index) => {
      const x = 24 + index * xStep;
      const y = 18 + innerHeight - ((point[valueKey] - minValue) / range) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildAreaPath(points, width, height, minValue, maxValue, highKey, lowKey) {
  const innerWidth = width - 48;
  const innerHeight = height - 42;
  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const range = Math.max(maxValue - minValue, 1);

  const topEdge = points.map((point, index) => {
    const x = 24 + index * xStep;
    const y = 18 + innerHeight - ((point[highKey] - minValue) / range) * innerHeight;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const bottomEdge = [...points].reverse().map((point, index) => {
    const originalIndex = points.length - 1 - index;
    const x = 24 + originalIndex * xStep;
    const y = 18 + innerHeight - ((point[lowKey] - minValue) / range) * innerHeight;
    return `L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  return [...topEdge, ...bottomEdge, "Z"].join(" ");
}

function buildDots(points, width, height, minValue, maxValue, valueKey) {
  const innerWidth = width - 48;
  const innerHeight = height - 42;
  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const range = Math.max(maxValue - minValue, 1);

  return points.map((point, index) => {
    const x = 24 + index * xStep;
    const y = 18 + innerHeight - ((point[valueKey] - minValue) / range) * innerHeight;
    return { x, y, label: point.period, value: point[valueKey] };
  });
}

export default function HistoricalChart({ history, reportingPeriod }) {
  const [mobileView, setMobileView] = useState(getMobileHistoryView);
  const [expanded, setExpanded] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState({});

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const handleChange = (event) => {
      setMobileView(event.matches);
      if (!event.matches) {
        setExpanded(false);
      }
    };

    setMobileView(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    setExpandedPeriods({});
  }, [reportingPeriod]);

  if (!history || history.length === 0) {
    return (
      <div className="empty-state">
        <strong>No history is available for this market yet.</strong>
        <p>Add archived consensus and actual points to render the comparison chart.</p>
      </div>
    );
  }

  const chronologicalHistory = [...(history || [])].sort((left, right) => parsePeriodKey(left.period) - parsePeriodKey(right.period));
  const descendingHistory = [...chronologicalHistory].sort((left, right) => parsePeriodKey(right.period) - parsePeriodKey(left.period));
  const visiblePeriodCount = mobileView && !expanded ? Math.min(6, descendingHistory.length) : descendingHistory.length;
  const visibleDescendingHistory = descendingHistory.slice(0, visiblePeriodCount);
  const visibleChronologicalHistory = [...visibleDescendingHistory].sort(
    (left, right) => parsePeriodKey(left.period) - parsePeriodKey(right.period)
  );
  const canToggleArchive = mobileView && descendingHistory.length > 6;

  // Derive Street estimate range (high/low) from the revision trail
  const historyWithBand = visibleChronologicalHistory.map((point) => {
    const revVals = (point.revisions || []).map((r) => r.value).filter(Number.isFinite);
    return {
      ...point,
      consensusHigh: revVals.length ? Math.max(...revVals) : point.consensus,
      consensusLow:  revVals.length ? Math.min(...revVals) : point.consensus,
    };
  });

  const allValues = historyWithBand.flatMap((p) => [p.consensus, p.actual, p.consensusHigh, p.consensusLow]);
  const minValue = allValues.length ? Math.min(...allValues) * 0.96 : 0;
  const maxValue = allValues.length ? Math.max(...allValues) * 1.04 : 1;
  const width = 640;
  const height = 260;
  const consensusBandPath = buildAreaPath(historyWithBand, width, height, minValue, maxValue, "consensusHigh", "consensusLow");
  const consensusPath = buildPath(historyWithBand, width, height, minValue, maxValue, "consensus");
  const actualPath = buildPath(historyWithBand, width, height, minValue, maxValue, "actual");
  const consensusDots = buildDots(historyWithBand, width, height, minValue, maxValue, "consensus");
  const actualDots = buildDots(historyWithBand, width, height, minValue, maxValue, "actual");
  const beatCount = visibleChronologicalHistory.filter((point) => point.actual >= point.consensus).length;
  const archiveTone =
    beatCount >= Math.ceil(Math.max(visibleChronologicalHistory.length, 1) / 2)
      ? "hero-pill history-pill-beat"
      : "hero-pill history-pill-miss";

  return (
    <div className="history-chart-shell">
      {visibleChronologicalHistory.length > 0 && (
        <>
          <div className="history-chart-header">
            <div className="history-chart-legend">
              <span className="legend-item">
                <i className="legend-swatch legend-band" />
                Street range
              </span>
              <span className="legend-item">
                <i className="legend-swatch legend-consensus" />
                Consensus
              </span>
              <span className="legend-item">
                <i className="legend-swatch legend-actual" />
                Actual
              </span>
            </div>
            <span className={archiveTone}>Beats in view {beatCount}/{visibleChronologicalHistory.length}</span>
          </div>

          <svg className="history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical consensus versus actual chart">
            <line x1="24" y1={height - 24} x2={width - 24} y2={height - 24} className="chart-axis" />
            <line x1="24" y1="18" x2="24" y2={height - 24} className="chart-axis" />
            <path d={consensusBandPath} className="chart-band" />
            <path d={consensusPath} className="chart-line chart-line-consensus" />
            <path d={actualPath} className="chart-line chart-line-actual" />
            {consensusDots.map((point) => (
              <circle key={`consensus-${point.label}`} cx={point.x} cy={point.y} r="4" className="chart-dot chart-dot-consensus" />
            ))}
            {actualDots.map((point, index) => {
              const hit = visibleChronologicalHistory[index].actual >= visibleChronologicalHistory[index].consensus;
              return (
                <circle
                  key={`actual-${point.label}`}
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  className={`chart-dot ${hit ? "chart-dot-beat" : "chart-dot-miss"}`}
                />
              );
            })}
            {visibleChronologicalHistory.map((point, index) => (
              <text
                key={point.period}
                x={24 + ((width - 48) / Math.max(visibleChronologicalHistory.length - 1, 1)) * index}
                y={height - 6}
                textAnchor="middle"
                className="chart-label"
              >
                {point.period}
              </text>
            ))}
          </svg>

          <div className="history-table">
            <div className="history-row history-row-head" aria-hidden="true">
              <span>Period</span>
              <span>Consensus</span>
              <span>Actual</span>
              <span>Outcome</span>
              <span>Sources</span>
              <span>Street path</span>
            </div>
            {visibleDescendingHistory.map((point) => {
              const hit = point.actual >= point.consensus;
              const isExpanded = Boolean(expandedPeriods[point.period]);
              const revVals = (point.revisions || []).map((r) => r.value).filter(Number.isFinite);
              const streetHigh = revVals.length ? Math.max(...revVals) : null;
              const streetLow  = revVals.length ? Math.min(...revVals) : null;
              return (
                <article key={point.period} className={`history-row ${hit ? "history-row-beat" : "history-row-miss"} ${isExpanded ? "history-row-open" : ""}`}>
                  <div className="history-row-summary">
                    <strong className="history-cell history-period">{point.period}</strong>
                    <span className="history-cell">
                      <em>Consensus</em>
                      {formatNumber(point.consensus)}
                      {streetHigh !== null && (
                        <span className="history-range">
                          {formatNumber(streetLow)}–{formatNumber(streetHigh)}
                        </span>
                      )}
                    </span>
                    <span className="history-cell">
                      <em>Actual</em>
                      {formatNumber(point.actual)}
                    </span>
                    <span className={`history-cell history-outcome ${hit ? "history-outcome-beat" : "history-outcome-miss"}`}>
                      <em>Outcome</em>
                      {hit ? "Beat" : "Miss"}
                    </span>
                    <span className="history-cell history-sources">
                      <em>Sources</em>
                      <span className="history-source-list">
                        {(point.sources || []).map((source) => (
                          <a
                            key={`${point.period}-${source.label}`}
                            className="history-source-link"
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {source.label}
                          </a>
                        ))}
                      </span>
                    </span>
                    <button
                      className="ghost history-expand"
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={`history-revisions-${point.period}`}
                      onClick={() =>
                        setExpandedPeriods((current) => ({
                          ...current,
                          [point.period]: !current[point.period],
                        }))
                      }
                    >
                      {isExpanded ? "Hide street path" : "Show street path"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div id={`history-revisions-${point.period}`} className="history-revisions">
                      <div className="meta-row history-revisions-head">
                        <span className="field-label">{point.period} Street consensus path</span>
                        <span className="field-label">{(point.revisions || []).length} snapshots</span>
                      </div>
                      <div className="revision-list">
                        {(point.revisions || []).map((revision) => (
                          <article key={`${point.period}-${revision.label}`} className="revision-card">
                            <span className="field-label">{revision.label}</span>
                            <strong>{formatNumber(revision.value)}</strong>
                            <p className={`revision-change ${revision.changeRatio >= 0 ? "tone-beat" : "tone-miss"}`}>
                              {revision.changeLabel}
                            </p>
                            <p>{revision.isLocked ? "This was the archived lock reference for the period." : "Visible sell-side read ahead of the report."}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {canToggleArchive && (
            <button type="button" className="ghost history-toggle" onClick={() => setExpanded((current) => !current)}>
              {expanded ? "Show latest 6 periods" : `Show all ${descendingHistory.length} periods`}
            </button>
          )}
        </>
      )}

      <p className="history-note">
        Archive rows are shown newest first. On mobile, the chart and archive default to the latest six periods. Source links are
        period-specific issuer material lookups for fact-checking the seeded archive, and each row can expand to show the prior
        Street consensus path for that quarter.
      </p>
    </div>
  );
}
