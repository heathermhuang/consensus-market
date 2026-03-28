import marketSeeds from "../../data/markets.json";
import {
  kvGet,
  kvSet,
  withSecurityHeaders,
  METRIC_STOP_WORDS,
  NEWS_SEARCH_WINDOW_DAYS,
  NEWS_MAX_AGE_DAYS,
  NEWS_CACHE_TTL_SECONDS,
} from "../lib/helpers.js";

// ---------------------------------------------------------------------------
// News feed parsing
// ---------------------------------------------------------------------------

function decodeFeedText(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAttributeValue(attributes, name) {
  const match = String(attributes || "").match(new RegExp(`${name}="([^"]+)"`, "i"));
  return decodeFeedText(match?.[1] || "");
}

function getHostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseReportingPeriod(idSeed) {
  const match = String(idSeed || "").match(/_Q([1-4])_(\d{4})_/i);
  if (!match) return "current quarter";
  return `Q${match[1]} ${match[2]}`;
}

function parseNewsItems(xml) {
  const items = [];
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  for (const rawItem of itemMatches.slice(0, 16)) {
    const title = decodeFeedText(rawItem.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const link = decodeFeedText(rawItem.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "");
    const publishedAt = decodeFeedText(rawItem.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "");
    const description = decodeFeedText(rawItem.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "");
    const sourceMatch = rawItem.match(/<source([^>]*)>([\s\S]*?)<\/source>/i);
    const source = decodeFeedText(sourceMatch?.[2] || "");
    const sourceUrl = extractAttributeValue(sourceMatch?.[1] || "", "url");
    const sourceDomain = getHostname(sourceUrl);

    if (!title || !link || !isSafeHttpUrl(link)) continue;

    items.push({
      title,
      link,
      publishedAt,
      snippet: description,
      source: source || "Google News",
      sourceUrl,
      sourceDomain,
    });
  }

  return items;
}

function parseSeekingAlphaItems(xml) {
  const items = [];
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  for (const rawItem of itemMatches.slice(0, 12)) {
    const title = decodeFeedText(rawItem.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const publishedAt = decodeFeedText(rawItem.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "");
    const author = decodeFeedText(rawItem.match(/<sa:author_name>([\s\S]*?)<\/sa:author_name>/i)?.[1] || "");
    const guid = decodeFeedText(rawItem.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] || "");
    const guidMatch = guid.match(/:(\d+)$/);
    const articleId = guidMatch?.[1] || "";
    const link = articleId ? `https://seekingalpha.com/news/${articleId}` : "";

    if (!title || !link || !isSafeHttpUrl(link)) continue;

    items.push({
      title,
      link,
      publishedAt,
      snippet: author ? `Seeking Alpha news by ${author}` : "Seeking Alpha news",
      source: "Seeking Alpha",
      sourceUrl: "https://seekingalpha.com",
      sourceDomain: "seekingalpha.com",
    });
  }

  return items;
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function buildMetricTokens(metricName) {
  return Array.from(
    new Set(
      normalizeText(metricName)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3 && !METRIC_STOP_WORDS.has(token))
        .flatMap((token) => (token.endsWith("s") ? [token, token.slice(0, -1)] : [token]))
    )
  );
}

function buildTopicTokens(market) {
  const metric = normalizeText(market.metricName);
  const focus = normalizeText(market.focus);
  const tokens = [...buildMetricTokens(market.metricName), ...buildMetricTokens(market.focus)];

  if (metric.includes("deliver")) tokens.push("sales", "unit", "volume");
  if (metric.includes("shipment")) tokens.push("sales", "unit", "volume");
  if (metric.includes("trip") || metric.includes("ride")) tokens.push("mobility", "booking", "demand");
  if (metric.includes("order")) tokens.push("commerce", "demand");
  if (metric.includes("night") || metric.includes("room")) tokens.push("travel", "booking", "lodging");
  if (metric.includes("subscriber") || metric.includes("membership")) tokens.push("subscribers", "subscriber", "paid", "streaming");
  if (metric.includes("user") || metric.includes("people") || metric.includes("mau") || metric.includes("dau")) {
    tokens.push("engagement", "audience", "users");
  }
  if (focus.includes("travel")) tokens.push("travel");
  if (focus.includes("volume")) tokens.push("volume");
  if (focus.includes("engagement")) tokens.push("engagement");

  return Array.from(new Set(tokens.filter(Boolean)));
}

function isRelevantArticle(article, market) {
  const corpus = normalizeText(`${article.title} ${article.snippet} ${article.source}`);
  const companyTokens = Array.from(
    new Set(
      [market.company, market.ticker]
        .flatMap((value) => normalizeText(value).split(/[^a-z0-9]+/))
        .filter((token) => token.length >= 2)
    )
  );
  const metricTokens = buildMetricTokens(market.metricName);
  const topicTokens = buildTopicTokens(market);
  const supportTokens = ["consensus", "estimate", "estimates", "forecast", "forecasts", "analyst", "earnings", "report", "results", "deliveries", "shipments"];

  const companyMatch = companyTokens.some((token) => corpus.includes(token));
  const metricMatch = metricTokens.some((token) => corpus.includes(token));
  const topicMatch = topicTokens.some((token) => corpus.includes(token));
  const supportMatch = supportTokens.some((token) => corpus.includes(token));

  if (!companyMatch) return false;
  if (metricMatch) return true;
  return supportMatch && topicMatch;
}

function buildNewsQueries(market) {
  const reportingPeriod = parseReportingPeriod(market.idSeed);
  const baseTerms = `"${market.company}" "${market.metricName}" ${reportingPeriod}`;

  return [
    `${baseTerms} earnings when:${NEWS_SEARCH_WINDOW_DAYS}d`,
    `${baseTerms} consensus OR estimate OR analyst when:${NEWS_SEARCH_WINDOW_DAYS}d`,
    `"${market.company}" "${market.metricName}" site:reddit.com when:${NEWS_SEARCH_WINDOW_DAYS}d`,
  ];
}

function parsePublishedAt(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getRecentArticles(articles, market) {
  const maxAgeMs = NEWS_MAX_AGE_DAYS * 86400 * 1000;
  const now = Date.now();
  const seenKeys = new Set();

  return articles
    .filter((article) => {
      const publishedAt = parsePublishedAt(article.publishedAt);
      if (!publishedAt) return false;
      if (now - publishedAt > maxAgeMs) return false;
      if (!isRelevantArticle(article, market)) return false;
      const dedupeKey = normalizeText(`${article.title}|${article.sourceDomain || article.source}`);
      if (seenKeys.has(dedupeKey)) return false;
      seenKeys.add(dedupeKey);
      return true;
    })
    .sort((left, right) => parsePublishedAt(right.publishedAt) - parsePublishedAt(left.publishedAt))
    .slice(0, 4);
}

async function fetchGoogleNewsForQuery(query, market) {
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "ConsensusMarketNewsBot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Feed request failed with ${response.status}`);
  }

  const xml = await response.text();
  return getRecentArticles(parseNewsItems(xml), market);
}

async function fetchSeekingAlphaNews(market) {
  const feedUrl = `https://seekingalpha.com/api/sa/combined/${encodeURIComponent(market.ticker)}.xml`;
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "ConsensusMarketNewsBot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Seeking Alpha feed failed with ${response.status}`);
  }

  const xml = await response.text();
  return getRecentArticles(parseSeekingAlphaItems(xml), market);
}

// ---------------------------------------------------------------------------
// News handler -- KV-cached
// ---------------------------------------------------------------------------

async function fetchFreshNews(market) {
  const queries = buildNewsQueries(market);
  const reportingPeriod = parseReportingPeriod(market.idSeed);

  let articles = [];
  let usedQuery = queries[0];

  try {
    articles = await fetchSeekingAlphaNews(market);
  } catch {
    articles = [];
  }

  for (const candidate of queries) {
    if (articles.length >= 4) break;
    usedQuery = candidate;
    const candidateArticles = await fetchGoogleNewsForQuery(candidate, market);
    articles = getRecentArticles([...articles, ...candidateArticles], market);
    if (articles.length >= 4) break;
  }

  return { articles, query: usedQuery, reportingPeriod };
}

export async function handleNewsRequest(url, env) {
  const slug = url.searchParams.get("market") || "";
  const market = marketSeeds.find((entry) => entry.slug === slug);

  if (!market) {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "Unknown market." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    ));
  }

  const cacheKey = `news:${slug}`;

  // Serve from KV if fresh
  const cached = await kvGet(env, cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return withSecurityHeaders(Response.json(
        { ok: true, ...parsed, fromCache: true },
        { headers: { "Cache-Control": `public, max-age=${NEWS_CACHE_TTL_SECONDS}` } }
      ));
    } catch {
      // fall through to live fetch
    }
  }

  try {
    const { articles, query, reportingPeriod } = await fetchFreshNews(market);
    const payload = {
      market: slug,
      company: market.company,
      metricName: market.metricName,
      reportingPeriod,
      query,
      updatedAt: new Date().toISOString(),
      articles,
    };

    // Cache in KV
    await kvSet(env, cacheKey, JSON.stringify(payload), NEWS_CACHE_TTL_SECONDS);

    return withSecurityHeaders(Response.json(
      { ok: true, ...payload },
      { headers: { "Cache-Control": `public, max-age=${NEWS_CACHE_TTL_SECONDS}` } }
    ));
  } catch {
    return withSecurityHeaders(Response.json(
      {
        ok: false,
        market: slug,
        company: market.company,
        metricName: market.metricName,
        reportingPeriod: parseReportingPeriod(market.idSeed),
        query: buildNewsQueries(market)[0],
        updatedAt: new Date().toISOString(),
        articles: [],
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    ));
  }
}
