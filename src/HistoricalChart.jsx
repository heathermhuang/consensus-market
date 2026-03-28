import { useEffect, useState } from "react";
import { formatNumber, formatCompactNumber } from "./contracts";
import { buildPath, buildDots, buildAreaPath } from "./lib/chart-utils";

function getMobileHistoryView() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 760px)").matches;
}

function parsePeriodKey(period) {
  const match = String(period || "").match(/^Q([1-4])'(\d{2})$/);
  if (!match) return 0;
  return Number(`20${match[2]}`) * 4 + Number(match[1]);
}

export default function HistoricalChart({ history, reportingPeriod }) {
  const [mobileView, setMobileView] = useState(getMobileHistoryView);
  const [expanded, setExpanded] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState({});
  const [hovered, setHovered] = useState(null);

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

  // Use pre-computed Street range (analyst spread around consensus)
  const historyWithBand = visibleChronologicalHistory.map((point) => ({
    ...point,
    consensusHigh: point.streetHigh ?? point.consensus,
    consensusLow:  point.streetLow  ?? point.consensus,
  }));

  const allValues = historyWithBand.flatMap((p) => [p.consensus, p.actual, p.consensusHigh, p.consensusLow]);
  const minValue = allValues.length ? Math.min(...allValues) * 0.96 : 0;
  const maxValue = allValues.length ? Math.max(...allValues) * 1.04 : 1;
  const width = 640;
  const height = 260;
  const consensusBandPath = buildAreaPath(historyWithBand, width, height, minValue, maxValue, { highKey: "consensusHigh", lowKey: "consensusLow" });
  const consensusPath = buildPath(historyWithBand, width, height, minValue, maxValue, { valueKey: "consensus" });
  const actualPath = buildPath(historyWithBand, width, height, minValue, maxValue, { valueKey: "actual" });
  const consensusDots = buildDots(historyWithBand, width, height, minValue, maxValue, { valueKey: "consensus" }).map((d) => ({ ...d, label: d.period }));
  const actualDots = buildDots(historyWithBand, width, height, minValue, maxValue, { valueKey: "actual" }).map((d) => ({ ...d, label: d.period }));
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
            {consensusDots.map((point, index) => (
              <g key={`consensus-${point.label}`}
                onMouseEnter={() => setHovered({ index, type: "consensus", x: point.x, y: point.y, label: point.label, value: point.value, high: historyWithBand[index].consensusHigh, low: historyWithBand[index].consensusLow })}
                onMouseLeave={() => setHovered(null)}
              >
                <circle cx={point.x} cy={point.y} r="12" className="chart-hit-area" />
                <circle cx={point.x} cy={point.y} r="4" className="chart-dot chart-dot-consensus" />
              </g>
            ))}
            {actualDots.map((point, index) => {
              const hit = visibleChronologicalHistory[index].actual >= visibleChronologicalHistory[index].consensus;
              return (
                <g key={`actual-${point.label}`}
                  onMouseEnter={() => setHovered({ index, type: "actual", x: point.x, y: point.y, label: point.label, value: point.value })}
                  onMouseLeave={() => setHovered(null)}
                >
                  <circle cx={point.x} cy={point.y} r="12" className="chart-hit-area" />
                  <circle cx={point.x} cy={point.y} r="4" className={`chart-dot ${hit ? "chart-dot-beat" : "chart-dot-miss"}`} />
                </g>
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
            {hovered && (() => {
              const tipLabel = hovered.type === "consensus" ? "Consensus" : "Actual";
              const tipValue = formatNumber(hovered.value);
              const tipRange = hovered.type === "consensus" && hovered.low !== hovered.high
                ? `${formatNumber(hovered.low)} – ${formatNumber(hovered.high)}`
                : null;
              const labelLine = `${tipLabel}: ${tipValue}`;
              const rangeLine = tipRange ? `Street range: ${tipRange}` : null;
              const tipW = Math.max(labelLine.length * 7.5, rangeLine ? rangeLine.length * 6.5 : 0, 140);
              const tipH = rangeLine ? 44 : 26;
              const tx = Math.max(tipW / 2 + 4, Math.min(width - tipW / 2 - 4, hovered.x));
              const ty = Math.max(2, hovered.y - tipH - 12);
              return (
                <g className="chart-tooltip-group" pointerEvents="none">
                  <rect x={tx - tipW / 2} y={ty} width={tipW} height={tipH} rx="5" className="chart-tooltip-bg" />
                  <text x={tx} y={ty + 16} textAnchor="middle" className="chart-tooltip-text">
                    {labelLine}
                  </text>
                  {rangeLine && (
                    <text x={tx} y={ty + 34} textAnchor="middle" className="chart-tooltip-text chart-tooltip-sub">
                      {rangeLine}
                    </text>
                  )}
                </g>
              );
            })()}
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
              const streetHigh = point.streetHigh ?? null;
              const streetLow  = point.streetLow  ?? null;
              return (
                <article key={point.period} className={`history-row ${hit ? "history-row-beat" : "history-row-miss"} ${isExpanded ? "history-row-open" : ""}`}>
                  <div className="history-row-summary">
                    <strong className="history-cell history-period">{point.period}</strong>
                    <span className="history-cell">
                      <em>Consensus</em>
                      {formatNumber(point.consensus)}
                      {streetHigh !== null && (
                        <span className="history-range">
                          {formatNumber(streetLow)}{"\u2013"}{formatNumber(streetHigh)}
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

                  {isExpanded && (() => {
                    const revs = point.revisions || [];
                    if (revs.length === 0) return null;
                    const revValues = revs.map((r) => r.value);
                    const revMin = Math.min(...revValues) * 0.998;
                    const revMax = Math.max(...revValues) * 1.002;
                    const sparkW = 320;
                    const sparkH = 80;
                    const sparkPad = 24;
                    const revRange = Math.max(revMax - revMin, 1);
                    const revPoints = revs.map((r, ri) => ({
                      x: sparkPad + (ri / Math.max(revs.length - 1, 1)) * (sparkW - sparkPad * 2),
                      y: 12 + (sparkH - 24) - ((r.value - revMin) / revRange) * (sparkH - 24),
                      ...r,
                    }));
                    const revPath = revPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                    return (
                      <div id={`history-revisions-${point.period}`} className="history-revisions">
                        <div className="meta-row history-revisions-head">
                          <span className="field-label">{point.period} Street consensus path</span>
                          <span className="field-label">{revs.length} snapshots</span>
                        </div>
                        <svg className="revision-sparkline" viewBox={`0 0 ${sparkW} ${sparkH}`} role="img" aria-label={`${point.period} revision path`}>
                          <path d={revPath} className="chart-line chart-line-consensus" />
                          {revPoints.map((rp) => (
                            <g key={rp.label}>
                              <circle cx={rp.x} cy={rp.y} r="3.5" className="chart-dot chart-dot-consensus" />
                              <text x={rp.x} y={rp.y - 8} textAnchor="middle" className="chart-tooltip-text" style={{ fontSize: 9, fill: "var(--text-soft)" }}>
                                {formatCompactNumber(rp.value)}
                              </text>
                              <text x={rp.x} y={sparkH - 2} textAnchor="middle" className="chart-label" style={{ fontSize: 8 }}>
                                {rp.label.replace(" weeks out", "w").replace("Locked street read", "Lock")}
                              </text>
                            </g>
                          ))}
                        </svg>
                      </div>
                    );
                  })()}
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

    </div>
  );
}
