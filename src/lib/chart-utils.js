/**
 * Shared SVG chart geometry for ConsensusPanel and HistoricalChart.
 * All functions operate on a viewBox coordinate system.
 *
 * Padding params:
 *   marginH — total horizontal margin (split left/right, so left = marginH/2)
 *   marginV — total vertical margin (top offset = topInset, rest is bottom)
 *   topInset — y offset from top of viewBox to start of chart area
 */

function chartGeometry(points, width, height, minValue, maxValue, { marginH = 48, marginV = 42, topInset = 18 } = {}) {
  const innerWidth = width - marginH;
  const innerHeight = height - marginV;
  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
  const range = Math.max(maxValue - minValue, 1);
  const left = marginH / 2;
  return { innerWidth, innerHeight, xStep, range, left, topInset };
}

export function buildPath(points, width, height, minValue, maxValue, { marginH = 48, marginV = 42, topInset = 18, valueKey = "value" } = {}) {
  const { xStep, innerHeight, range, left, topInset: top } = chartGeometry(points, width, height, minValue, maxValue, { marginH, marginV, topInset });

  return points
    .map((point, index) => {
      const x = left + index * xStep;
      const y = top + innerHeight - ((point[valueKey] - minValue) / range) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function buildDots(points, width, height, minValue, maxValue, { marginH = 48, marginV = 42, topInset = 18, valueKey = "value" } = {}) {
  const { xStep, innerHeight, range, left, topInset: top } = chartGeometry(points, width, height, minValue, maxValue, { marginH, marginV, topInset });

  return points.map((point, index) => ({
    ...point,
    x: left + index * xStep,
    y: top + innerHeight - ((point[valueKey] - minValue) / range) * innerHeight,
  }));
}

export function buildAreaPath(points, width, height, minValue, maxValue, { marginH = 48, marginV = 42, topInset = 18, highKey, lowKey } = {}) {
  const { xStep, innerHeight, range, left, topInset: top } = chartGeometry(points, width, height, minValue, maxValue, { marginH, marginV, topInset });

  const topEdge = points.map((point, index) => {
    const x = left + index * xStep;
    const y = top + innerHeight - ((point[highKey] - minValue) / range) * innerHeight;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const bottomEdge = [...points].reverse().map((point, index) => {
    const originalIndex = points.length - 1 - index;
    const x = left + originalIndex * xStep;
    const y = top + innerHeight - ((point[lowKey] - minValue) / range) * innerHeight;
    return `L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  return [...topEdge, ...bottomEdge, "Z"].join(" ");
}
