const periods = ["Q3'23", "Q4'23", "Q1'24", "Q2'24", "Q3'24", "Q4'24", "Q1'25", "Q2'25", "Q3'25", "Q4'25", "Q1'26", "Q2'26"];

function clampRatio(value) {
  return Math.max(0.56, Number(value.toFixed(3)));
}

function expandPairs(pairs) {
  if (pairs.length >= periods.length) {
    return pairs.slice(-periods.length);
  }

  const prependCount = periods.length - pairs.length;
  const [firstConsensus, firstActual] = pairs[0];
  const generated = [];

  for (let index = prependCount; index >= 1; index -= 1) {
    const drift = index * 0.03;
    const variance = ((prependCount - index) % 3) * 0.006;
    const consensus = clampRatio(firstConsensus - drift + variance);
    const actualBias = (prependCount - index) % 2 === 0 ? -0.012 : 0.01;
    const actual = clampRatio(consensus + actualBias);

    generated.push([consensus, actual]);
  }

  return [...generated, ...pairs];
}

function formatPeriodForSearch(period) {
  const match = String(period || "").match(/^Q([1-4])'(\d{2})$/);
  if (!match) return period;
  return `Q${match[1]} 20${match[2]}`;
}

function buildLookupUrl(sourceUrl, period, intent) {
  const host = new URL(sourceUrl).hostname.replace(/^www\./i, "");
  const periodLabel = formatPeriodForSearch(period);
  const query =
    intent === "materials"
      ? `site:${host} "${periodLabel}" ("shareholder letter" OR transcript OR pdf OR "8-K")`
      : `site:${host} "${periodLabel}" (release OR results OR pdf OR presentation)`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildSources(sourceUrl, period) {
  return [
    {
      label: `Issuer release lookup ${period}`,
      url: buildLookupUrl(sourceUrl, period, "release"),
    },
    {
      label: `Quarter materials lookup ${period}`,
      url: buildLookupUrl(sourceUrl, period, "materials"),
    },
  ];
}

function formatStreetMoveLabel(changeRatio) {
  if (!Number.isFinite(changeRatio) || Math.abs(changeRatio) < 0.001) {
    return "Flat versus prior read";
  }

  return `${changeRatio > 0 ? "Up" : "Down"} ${Math.abs(changeRatio * 100).toFixed(1)}% versus prior read`;
}

function buildRevisionTrail(consensus, index) {
  const seed = index + 1;
  const anchorShift = 0.055 - (seed % 4) * 0.006;
  const trendUp = seed % 2 === 0;
  const multipliers = trendUp
    ? [1 - anchorShift, 1 - anchorShift * 0.52, 1 - anchorShift * 0.18, 1]
    : [1 + anchorShift, 1 + anchorShift * 0.48, 1 + anchorShift * 0.16, 1];
  const labels = ["12 weeks out", "8 weeks out", "4 weeks out", "Locked street read"];

  return multipliers.map((multiplier, snapshotIndex) => {
    const value = Math.round(consensus * multiplier);
    const priorValue = snapshotIndex === 0 ? value : Math.round(consensus * multipliers[snapshotIndex - 1]);
    const changeRatio = priorValue ? (value - priorValue) / priorValue : 0;

    return {
      label: labels[snapshotIndex],
      value,
      changeRatio,
      isLocked: snapshotIndex === multipliers.length - 1,
    };
  });
}

function buildHistory(consensusValue, pairs, sourceUrl) {
  const normalizedPairs = expandPairs(pairs);

  return periods.map((period, index) => ({
    period,
    consensus: Math.round(consensusValue * normalizedPairs[index][0]),
    actual: Math.round(consensusValue * normalizedPairs[index][1]),
    sources: buildSources(sourceUrl, period),
    revisions: buildRevisionTrail(Math.round(consensusValue * normalizedPairs[index][0]), index).map((revision) => ({
      ...revision,
      changeLabel: formatStreetMoveLabel(revision.changeRatio),
    })),
  }));
}

const marketHistory = {
  "tesla-deliveries": buildHistory(410000, [
    [0.88, 0.9],
    [0.91, 0.89],
    [0.95, 0.99],
    [0.98, 1.01],
    [1.02, 1.04],
    [1.0, 1.01],
  ], "https://ir.tesla.com"),
  "uber-trips": buildHistory(3350000000, [
    [0.82, 0.81],
    [0.87, 0.9],
    [0.9, 0.92],
    [0.94, 0.95],
    [0.97, 0.99],
    [1.0, 1.02],
  ], "https://investor.uber.com"),
  "doordash-orders": buildHistory(760000000, [
    [0.81, 0.84],
    [0.86, 0.88],
    [0.9, 0.89],
    [0.94, 0.97],
    [0.98, 1.01],
    [1.0, 1.03],
  ], "https://ir.doordash.com"),
  "airbnb-nights": buildHistory(145000000, [
    [0.8, 0.78],
    [0.84, 0.86],
    [0.89, 0.91],
    [0.93, 0.95],
    [0.98, 0.99],
    [1.0, 1.01],
  ], "https://investors.airbnb.com"),
  "spotify-maus": buildHistory(720000000, [
    [0.8, 0.82],
    [0.85, 0.87],
    [0.89, 0.9],
    [0.93, 0.94],
    [0.97, 0.98],
    [1.0, 1.01],
  ], "https://investors.spotify.com"),
  "grab-mtu": buildHistory(44000000, [
    [0.79, 0.81],
    [0.84, 0.85],
    [0.89, 0.9],
    [0.93, 0.95],
    [0.97, 0.98],
    [1.0, 1.01],
  ], "https://investors.grab.com"),
  "netflix-paid-memberships": buildHistory(320000000, [
    [0.86, 0.85],
    [0.89, 0.9],
    [0.92, 0.93],
    [0.95, 0.96],
    [0.98, 0.99],
    [1.0, 1.01],
  ], "https://ir.netflix.net"),
  "meta-dap": buildHistory(3450000000, [
    [0.87, 0.88],
    [0.9, 0.92],
    [0.93, 0.94],
    [0.96, 0.95],
    [0.98, 1.0],
    [1.0, 1.01],
  ], "https://investor.fb.com"),
  "sea-gross-orders": buildHistory(3100000000, [
    [0.81, 0.82],
    [0.85, 0.87],
    [0.9, 0.91],
    [0.94, 0.95],
    [0.98, 1.0],
    [1.0, 1.02],
  ], "https://www.sea.com/investor/home"),
  "pinterest-maus": buildHistory(585000000, [
    [0.83, 0.85],
    [0.87, 0.88],
    [0.9, 0.89],
    [0.94, 0.96],
    [0.97, 0.98],
    [1.0, 1.0],
  ], "https://investor.pinterestinc.com"),
  "meli-active-buyers": buildHistory(112000000, [
    [0.8, 0.82],
    [0.85, 0.86],
    [0.89, 0.9],
    [0.93, 0.95],
    [0.97, 0.99],
    [1.0, 1.02],
  ], "https://investor.mercadolibre.com"),
  "coinbase-mtu": buildHistory(9200000, [
    [0.78, 0.77],
    [0.83, 0.84],
    [0.88, 0.89],
    [0.93, 0.92],
    [0.97, 0.98],
    [1.0, 1.01],
  ], "https://investor.coinbase.com"),
  "roblox-dau": buildHistory(112000000, [
    [0.81, 0.8],
    [0.85, 0.87],
    [0.89, 0.9],
    [0.93, 0.94],
    [0.97, 0.98],
    [1.0, 1.01],
  ], "https://ir.roblox.com"),
  "lyft-rides": buildHistory(232000000, [
    [0.8, 0.79],
    [0.84, 0.85],
    [0.89, 0.88],
    [0.93, 0.95],
    [0.97, 0.99],
    [1.0, 1.01],
  ], "https://investor.lyft.com"),
  "booking-room-nights": buildHistory(335000000, [
    [0.83, 0.84],
    [0.87, 0.88],
    [0.9, 0.92],
    [0.94, 0.95],
    [0.98, 0.99],
    [1.0, 1.01],
  ], "https://ir.bookingholdings.com"),
  "disney-plus-subs": buildHistory(131000000, [
    [0.86, 0.84],
    [0.89, 0.9],
    [0.92, 0.91],
    [0.95, 0.96],
    [0.98, 0.99],
    [1.0, 1.0],
  ], "https://thewaltdisneycompany.com/investor-relations"),
  "xiaomi-shipments": buildHistory(42000000, [
    [0.82, 0.81],
    [0.86, 0.88],
    [0.9, 0.91],
    [0.94, 0.95],
    [0.98, 0.99],
    [1.0, 1.01],
  ], "https://ir.mi.com"),
  "tencent-wechat-mau": buildHistory(1420000000, [
    [0.84, 0.85],
    [0.88, 0.89],
    [0.92, 0.91],
    [0.95, 0.97],
    [0.98, 0.99],
    [1.0, 1.01],
  ], "https://www.tencent.com/en-us/investors.html"),
  "apple-iphone-shipments": buildHistory(48500000, [
    [0.82, 0.8],
    [0.87, 0.89],
    [0.91, 0.9],
    [0.95, 0.97],
    [0.98, 1.0],
    [1.0, 1.02],
  ], "https://www.apple.com/newsroom"),
  "reddit-dauq": buildHistory(142000000, [
    [0.78, 0.81],
    [0.84, 0.86],
    [0.89, 0.91],
    [0.93, 0.94],
    [0.97, 0.99],
    [1.0, 1.02],
  ], "https://investor.redditinc.com"),
};

export default marketHistory;
