import { useState } from "react";
import BrandAvatar from "./BrandAvatar";
import { getFirmBrand } from "./brandSystem";
import { formatNumber, formatCompactNumber, formatPercent } from "./contracts";
import { formatTimestampDateOnly as formatTimestampWithYear } from "./lib/format-utils";
import { buildPath as _buildPath, buildDots as _buildDots } from "./lib/chart-utils";

const CHART_OPTS = { marginH: 40, marginV: 36, topInset: 16 };
const buildPath = (points, w, h, min, max) => _buildPath(points, w, h, min, max, CHART_OPTS);
const buildDots = (points, w, h, min, max) => _buildDots(points, w, h, min, max, CHART_OPTS);

export default function ConsensusPanel({ market }) {
  const [hovered, setHovered] = useState(null);
  const timeline = market?.consensusTimeline || [];
  const analysts = market?.analystEstimates || [];

  if (!market || timeline.length === 0) {
    return (
      <div className="empty-state">
        <strong>No consensus history is available.</strong>
        <p>Add tracked consensus revisions to surface the current Street setup.</p>
      </div>
    );
  }

  const width = 640;
  const height = 200;
  const lowEstimate = analysts[0]?.estimate ?? timeline[timeline.length - 1].value;
  const highEstimate = analysts[analysts.length - 1]?.estimate ?? timeline[timeline.length - 1].value;
  const spreadRatio = lowEstimate ? (highEstimate - lowEstimate) / lowEstimate : 0;
  const values = timeline.map((point) => point.value);
  const allValues = [...values, lowEstimate, highEstimate];
  const minValue = Math.min(...allValues) * 0.985;
  const maxValue = Math.max(...allValues) * 1.015;
  const path = buildPath(timeline, width, height, minValue, maxValue);
  const dots = buildDots(timeline, width, height, minValue, maxValue);

  // Analyst range band — horizontal fill between low and high estimate
  const innerHeight = height - 36;
  const range = Math.max(maxValue - minValue, 1);
  const bandHighY = (16 + innerHeight - ((highEstimate - minValue) / range) * innerHeight).toFixed(1);
  const bandLowY  = (16 + innerHeight - ((lowEstimate  - minValue) / range) * innerHeight).toFixed(1);
  const bandPath  = `M 20 ${bandHighY} L ${width - 20} ${bandHighY} L ${width - 20} ${bandLowY} L 20 ${bandLowY} Z`;

  return (
    <div className="consensus-shell">
      <div className="panel-heading">
        <div>
          <p className="section-label">Street consensus</p>
          <h2>{market.reportingPeriod} estimate curve</h2>
        </div>
        <span className="hero-pill">{market.currentConsensusDisplay} now</span>
      </div>

      <p className="panel-copy">
        The current Street number can move before the company reports. This panel separates the latest consensus from the
        market&apos;s frozen lock reference and shows the firms contributing to the range.
      </p>

      <div className="consensus-summary-grid">
        <article className="snapshot-card">
          <span className="field-label">Current Street consensus</span>
          <strong>{market.currentConsensusDisplay}</strong>
          <p>{market.currentConsensusSnapshot.label} · {formatTimestampWithYear(market.currentConsensusSnapshot.observedAt)}</p>
        </article>
        <article className="snapshot-card">
          <span className="field-label">Frozen lock reference</span>
          <strong>{market.frozenConsensusDisplay}</strong>
          <p>{market.frozenConsensusSource}</p>
        </article>
        <article className="snapshot-card">
          <span className="field-label">Consensus move</span>
          <strong className={market.consensusMoveValue >= 0 ? "tone-beat" : "tone-miss"}>{market.consensusMoveLabel}</strong>
          <p>{formatNumber(Math.abs(market.consensusMoveValue))} absolute change from the first tracked read.</p>
        </article>
        <article className="snapshot-card">
          <span className="field-label">Street spread</span>
          <strong>{formatPercent(spreadRatio)}</strong>
          <p>{formatNumber(lowEstimate)} low to {formatNumber(highEstimate)} high across the visible firm set.</p>
        </article>
      </div>

      <div className="consensus-grid">
        <div className="note-card consensus-chart-card">
          <div className="meta-row consensus-chart-meta">
            <span className="field-label">Revision timeline</span>
            <span className="field-label">{timeline.length} snapshots</span>
          </div>

          <svg className="consensus-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Consensus revision timeline">
            <line x1="20" y1={height - 20} x2={width - 20} y2={height - 20} className="chart-axis" />
            <path d={bandPath} className="chart-band chart-band-analyst" />
            <line x1="20" y1={bandHighY} x2={width - 20} y2={bandHighY} className="chart-ref-line chart-ref-high" />
            <text x={width - 18} y={Number(bandHighY) - 4} textAnchor="end" className="chart-ref-label chart-ref-label-high">High {formatCompactNumber(highEstimate)}</text>
            <line x1="20" y1={bandLowY}  x2={width - 20} y2={bandLowY}  className="chart-ref-line chart-ref-low" />
            <text x={width - 18} y={Number(bandLowY) + 12} textAnchor="end" className="chart-ref-label chart-ref-label-low">Low {formatCompactNumber(lowEstimate)}</text>
            <path d={path} className="chart-line chart-line-consensus-live" />
            {dots.map((point, index) => (
              <g key={`${point.label}-${point.observedAt}`}
                onMouseEnter={() => setHovered({ index, x: point.x, y: point.y, label: point.label, value: point.value })}
                onMouseLeave={() => setHovered(null)}
              >
                <circle cx={point.x} cy={point.y} r="12" className="chart-hit-area" />
                <circle cx={point.x} cy={point.y} r="5" className="chart-dot chart-dot-consensus-live" />
                <text x={point.x} y={height - 4} textAnchor="middle" className="chart-label">
                  {point.label.replace(" street read", "").replace(" refresh", "")}
                </text>
              </g>
            ))}
            {hovered && (() => {
              const tipValue = formatCompactNumber(hovered.value);
              const tipW = 100;
              const tx = Math.max(tipW / 2, Math.min(width - tipW / 2, hovered.x));
              const ty = hovered.y - 34;
              return (
                <g className="chart-tooltip-group" pointerEvents="none">
                  <rect x={tx - tipW / 2} y={ty} width={tipW} height={24} rx="4" className="chart-tooltip-bg" />
                  <text x={tx} y={ty + 16} textAnchor="middle" className="chart-tooltip-text">{tipValue}</text>
                </g>
              );
            })()}
          </svg>
        </div>

        <div className="note-card consensus-analyst-card">
          <div className="meta-row consensus-chart-meta">
            <span className="field-label">Contributing firm estimates</span>
            <span className="field-label">{analysts.length} visible</span>
          </div>

          <div className="analyst-list">
            {analysts.map((entry) => (
              <article key={`${entry.firm}-${entry.analyst}`} className="analyst-row">
                <div className="analyst-identity">
                  <BrandAvatar brand={getFirmBrand(entry.firm)} label={entry.firm} className="brand-avatar-firm" />
                  <div className="analyst-copy">
                    <strong>{entry.firm}</strong>
                    <p>{entry.analyst}</p>
                  </div>
                </div>
                <div className="analyst-estimate">
                  <strong>{formatNumber(entry.estimate)}</strong>
                  <p>{formatTimestampWithYear(entry.updatedAt)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
