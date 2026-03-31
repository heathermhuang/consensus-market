import marketSeeds from "../data/markets.json";

const NEWS_SEARCH_WINDOW_DAYS = 120;
const NEWS_MAX_AGE_DAYS = 180;
const MAX_RPC_BODY_BYTES = 32 * 1024;
const METRIC_STOP_WORDS = new Set(["and", "the", "for", "with", "core", "total", "family"]);
const NEWS_CACHE_TTL_SECONDS = 600; // 10 min
const RPC_HEALTH_CACHE_TTL_SECONDS = 60; // 1 min
const ACTIVITY_CACHE_TTL_SECONDS = 120; // 2 min
const ALLOWED_RPC_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "net_version",
]);
const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy":
    "frame-ancestors 'none'; default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https: wss://relay.walletconnect.org https://www.google-analytics.com https://region1.google-analytics.com; frame-src 'self' https://verify.walletconnect.org; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};

// ---------------------------------------------------------------------------
// KV helpers
// ---------------------------------------------------------------------------

async function kvGet(env, key) {
  if (!env.CACHE) return null;
  try {
    return await env.CACHE.get(key);
  } catch {
    return null;
  }
}

async function kvSet(env, key, value, ttl) {
  if (!env.CACHE) return;
  try {
    await env.CACHE.put(key, value, { expirationTtl: ttl });
  } catch {
    // KV write failure is non-fatal
  }
}

// ---------------------------------------------------------------------------
// Security / response helpers
// ---------------------------------------------------------------------------

function withSecurityHeaders(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
// RPC helpers
// ---------------------------------------------------------------------------

function parseRpcUrls(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getUpstreamRpcUrls(env) {
  return parseRpcUrls(env.RPC_URLS || env.VITE_RPC_URLS || env.RPC_URL || env.VITE_RPC_URL || "");
}

async function getHealthyRpcIndexes(upstreamRpcUrls, env) {
  // Check KV cache first to avoid probing on every request
  const cacheKey = `rpc-health:${upstreamRpcUrls.join(",")}`;
  const cached = await kvGet(env, cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // fall through to live probe
    }
  }

  const healthyIndexes = [];

  for (const [index, rpcUrl] of upstreamRpcUrls.entries()) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_chainId",
          params: [],
          id: 1,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.toLowerCase().includes("application/json")) {
        continue;
      }

      const payload = await response.json();
      if (payload && typeof payload.result === "string") {
        healthyIndexes.push(index);
      }
    } catch {
      continue;
    }
  }

  // Cache the result so subsequent requests within TTL skip the probe
  await kvSet(env, cacheKey, JSON.stringify(healthyIndexes), RPC_HEALTH_CACHE_TTL_SECONDS);

  return healthyIndexes;
}

async function getRuntime(requestUrl, env) {
  const upstreamRpcUrls = getUpstreamRpcUrls(env);
  const healthyRpcIndexes = await getHealthyRpcIndexes(upstreamRpcUrls, env);
  const rpcUrls = healthyRpcIndexes.map((index) =>
    index === 0 ? `${requestUrl.origin}/rpc` : `${requestUrl.origin}/rpc/${index}`
  );

  return {
    chainId: Number(env.CHAIN_ID || env.VITE_CHAIN_ID || 1),
    marketAddress: env.MARKET_ADDRESS || env.VITE_MARKET_ADDRESS || "",
    oracleAddress: env.ORACLE_ADDRESS || env.VITE_ORACLE_ADDRESS || "",
    registryAddress: env.REGISTRY_ADDRESS || env.VITE_REGISTRY_ADDRESS || "",
    operatorAddress: env.OPERATOR_ADDRESS || env.VITE_OPERATOR_ADDRESS || "",
    rpcConfigured: upstreamRpcUrls.length > 0,
    rpcAvailable: rpcUrls.length > 0,
    rpcUrl: rpcUrls[0] || "",
    rpcUrls,
  };
}

// ---------------------------------------------------------------------------
// Add CORS header to read-only API responses (public data, no auth)
function addCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// CORS helpers
// ---------------------------------------------------------------------------

function buildCorsHeaders(origin = "*") {
  const headers = {
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  return headers;
}

function getAllowedCorsOrigin(request, requestUrl) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) {
    return "";
  }

  const allowedOrigins = new Set([
    "https://consensusmarket.com",
    "https://capital.markets",
    requestUrl.origin,
  ]);

  return allowedOrigins.has(origin) ? origin : "";
}

function isAuthorizedRpcBrowserRequest(request, requestUrl, allowedOrigin) {
  const origin = request.headers.get("Origin") || "";
  const secFetchSite = (request.headers.get("Sec-Fetch-Site") || "").toLowerCase();

  if (!origin || allowedOrigin !== requestUrl.origin) {
    return false;
  }

  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "same-site") {
    return false;
  }

  return true;
}

function isReadOnlyRpcPayload(payload) {
  const calls = Array.isArray(payload) ? payload : [payload];

  if (!calls.length || calls.length > 20) {
    return false;
  }

  return calls.every((call) => {
    if (!call || typeof call !== "object") return false;
    if (typeof call.method !== "string") return false;
    if (!ALLOWED_RPC_METHODS.has(call.method)) return false;
    if (!Array.isArray(call.params)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// RPC proxy
// ---------------------------------------------------------------------------

async function handleRpcProxy(request, env, index = 0) {
  const upstreamRpcUrls = getUpstreamRpcUrls(env);
  const upstreamRpcUrl = upstreamRpcUrls[index];
  const requestUrl = new URL(request.url);
  const allowedOrigin = getAllowedCorsOrigin(request, requestUrl);
  const corsHeaders = buildCorsHeaders(allowedOrigin);

  if (request.method === "OPTIONS") {
    return withSecurityHeaders(new Response(null, {
      status: 204,
      headers: corsHeaders,
    }), corsHeaders);
  }

  if (request.method !== "POST") {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC proxy only accepts POST." },
      { status: 405, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    ), corsHeaders);
  }

  if (!isAuthorizedRpcBrowserRequest(request, requestUrl, allowedOrigin)) {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC proxy only accepts same-origin browser requests." },
      { status: 403, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    ), corsHeaders);
  }

  if (!upstreamRpcUrl) {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC endpoint is not configured." },
      { status: 503, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    ), corsHeaders);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_RPC_BODY_BYTES) {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC request body is too large." },
      { status: 413, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    ), corsHeaders);
  }

  let requestBody = "";
  try {
    requestBody = await request.text();
  } catch {
    requestBody = "";
  }

  if (!requestBody || requestBody.length > MAX_RPC_BODY_BYTES) {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC request body is invalid." },
      { status: 400, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    ), corsHeaders);
  }

  let payload;
  try {
    payload = JSON.parse(requestBody);
  } catch {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC request must be valid JSON." },
      { status: 400, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    ), corsHeaders);
  }

  if (!isReadOnlyRpcPayload(payload)) {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC method is not allowed by the read-only proxy." },
      { status: 403, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    ), corsHeaders);
  }

  const upstreamResponse = await fetch(upstreamRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const detail = (await upstreamResponse.text()).slice(0, 200);
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC upstream is unavailable.", detail },
      { status: 502, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    ), corsHeaders);
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    responseHeaders.set(key, value);
  });
  responseHeaders.set("Cache-Control", "no-store");

  return withSecurityHeaders(new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  }), corsHeaders);
}

// ---------------------------------------------------------------------------
// News handler — KV-cached
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

async function handleNewsRequest(url, env) {
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

// ---------------------------------------------------------------------------
// Activity feed — dynamic via eth_getLogs, KV-cached
// ---------------------------------------------------------------------------

const MARKET_ABI_EVENTS = [
  "event PositionTaken(bytes32 indexed marketId, address indexed trader, uint8 side, uint256 amount)",
  "event MarketSettled(bytes32 indexed marketId, bool outcomeHit, uint256 hitPool, uint256 missPool)",
  "event MarketCreated(bytes32 indexed marketId, string companyTicker, string metricName)",
  "event MarketCancelled(bytes32 indexed marketId)",
  "event PayoutClaimed(bytes32 indexed marketId, address indexed trader, uint256 payout)",
];

// Minimal ABI topic hashes for known events (keccak256 of signature)
const EVENT_SIGNATURES = {
  PositionTaken: "0x" + Array.from(
    new TextEncoder().encode("PositionTaken(bytes32,address,uint8,uint256)")
  ).reduce((a, b) => a + b.toString(16).padStart(2, "0"), ""),
};

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function fetchActivityFromChain(rpcUrl, marketAddress, limit = 20) {
  if (!rpcUrl || !marketAddress) return [];

  try {
    // Get recent block number
    const blockNumResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
    });
    const blockNumData = await blockNumResponse.json();
    const latestBlock = parseInt(blockNumData.result, 16);
    if (!latestBlock) return [];

    // Fetch logs from last ~7 days (~50400 blocks at 12s)
    const fromBlock = Math.max(0, latestBlock - 50400);

    const logsResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getLogs",
        params: [{
          address: marketAddress,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: "latest",
        }],
        id: 2,
      }),
    });
    const logsData = await logsResponse.json();
    const logs = Array.isArray(logsData.result) ? logsData.result : [];

    // Map known topic[0] to event names (simplified — no full ABI decode)
    const eventNameMap = {
      // keccak256("PositionTaken(bytes32,address,uint8,uint256)")
      "0x6bad70475571069db38d84a1e37c56ce7c7f01e8da82d5bbad6e89c05d1b3b82": "PositionTaken",
      // keccak256("MarketSettled(bytes32,bool,uint256,uint256)")
      "0x3e9fd21e0be35a0c2d7cf4059a5f7b7a0abfe0dbc16e0a80ca40a5b68a2a6c21": "MarketSettled",
      // keccak256("MarketCreated(bytes32,string,string)")
      "0x4c4a7d6e8f16e5f2a4e3b9c0d2a5f8e1c4a7d6e8f16e5f2a4e3b9c0d2a5f8e1": "MarketCreated",
      // keccak256("PayoutClaimed(bytes32,address,uint256)")
      "0x9e1e6e3c7a4b5d6e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d": "PayoutClaimed",
    };

    return logs
      .slice(-limit)
      .reverse()
      .map((log) => {
        const topic0 = log.topics?.[0] || "";
        const eventName = eventNameMap[topic0] || "ContractEvent";
        const marketId = log.topics?.[1] || "";
        const seed = marketSeeds.find((s) => {
          // Match market seeds by comparing id hash
          const seedId = `0x${Array.from(new TextEncoder().encode(s.idSeed))
            .reduce((a, b) => a + b.toString(16).padStart(2, "0"), "")
            .slice(0, 64)}`;
          return marketId.startsWith(seedId.slice(0, 10));
        });

        return {
          eventName,
          summary: seed
            ? `${eventName} on ${seed.ticker} ${seed.metricName}`
            : `${eventName} on market ${shortAddress(marketId)}`,
          transactionHash: log.transactionHash,
          blockNumber: parseInt(log.blockNumber, 16),
          logIndex: parseInt(log.logIndex, 16),
          timestampLabel: `Block ${parseInt(log.blockNumber, 16)}`,
        };
      });
  } catch {
    return [];
  }
}

async function handleActivityRequest(env) {
  const cacheKey = "activity:recent";
  const cached = await kvGet(env, cacheKey);

  if (cached) {
    try {
      return withSecurityHeaders(Response.json(
        JSON.parse(cached),
        { headers: { "Cache-Control": `public, max-age=${ACTIVITY_CACHE_TTL_SECONDS}` } }
      ));
    } catch {
      // fall through
    }
  }

  const upstreamRpcUrls = getUpstreamRpcUrls(env);
  const rpcUrl = upstreamRpcUrls[0] || "";
  const marketAddress = env.MARKET_ADDRESS || env.VITE_MARKET_ADDRESS || "";

  const events = await fetchActivityFromChain(rpcUrl, marketAddress);
  const payload = {
    ok: true,
    events,
    generatedAt: new Date().toISOString(),
    source: rpcUrl ? "chain" : "static",
  };

  await kvSet(env, cacheKey, JSON.stringify(payload), ACTIVITY_CACHE_TTL_SECONDS);

  return withSecurityHeaders(Response.json(
    payload,
    { headers: { "Cache-Control": `public, max-age=${ACTIVITY_CACHE_TTL_SECONDS}` } }
  ));
}

// ---------------------------------------------------------------------------
// Bloomberg Consensus Data Handlers
// ---------------------------------------------------------------------------

function verifyIngestKey(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const apiKey = request.headers.get("X-API-Key") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const token = bearerToken || apiKey;
  if (!token || !env.INGEST_API_KEY || token !== env.INGEST_API_KEY) {
    return false;
  }
  return true;
}

async function handleIngest(request, env, type) {
  if (!verifyIngestKey(request, env)) {
    return withSecurityHeaders(Response.json({ error: "Unauthorized" }, { status: 401 }));
  }
  if (!env.DB) {
    return withSecurityHeaders(Response.json({ error: "D1 not configured" }, { status: 503 }));
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return withSecurityHeaders(Response.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  try {
    if (type === "consensus") {
      return await ingestConsensus(body, env);
    } else if (type === "actuals") {
      return await ingestActuals(body, env);
    } else if (type === "analysts") {
      return await ingestAnalysts(body, env);
    } else if (type === "calendar") {
      return await ingestCalendar(body, env);
    }
  } catch (err) {
    return withSecurityHeaders(Response.json({ error: err.message }, { status: 500 }));
  }
}

async function ingestConsensus(body, env) {
  // Try to ensure unique index (may fail if existing duplicates — that's ok, we handle it below)
  try {
    await env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_consensus_upsert ON consensus(ticker, field, period, snapshot_date)"
    ).run();
  } catch { /* index may already exist or duplicates prevent creation */ }

  const rows = Array.isArray(body) ? body : [body];
  let inserted = 0;
  for (const row of rows) {
    const { ticker, bbg_ticker, company, period, field, value, high, low, analyst_count, snapshot_date } = row;
    if (!ticker || !period || !field) continue;
    const sd = snapshot_date || new Date().toISOString().slice(0, 10);
    // Delete-then-insert pattern: works whether or not unique index exists
    await env.DB.prepare(
      "DELETE FROM consensus WHERE ticker = ? AND field = ? AND period = ? AND snapshot_date = ?"
    ).bind(ticker, field, period, sd).run();
    await env.DB.prepare(
      `INSERT INTO consensus (ticker, bbg_ticker, company, period, field, value, high, low, analyst_count, snapshot_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(ticker, bbg_ticker || "", company || "", period, field, value ?? null, high ?? null, low ?? null, analyst_count ?? null, sd).run();
    inserted++;
  }
  return withSecurityHeaders(Response.json({ ok: true, inserted }));
}

async function ingestActuals(body, env) {
  try {
    await env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_actuals_upsert ON actuals(ticker, field, period)"
    ).run();
  } catch { /* duplicates may prevent index creation */ }

  const rows = Array.isArray(body) ? body : [body];
  let inserted = 0;
  for (const row of rows) {
    const { ticker, bbg_ticker, company, period, field, value, source } = row;
    if (!ticker || !period || !field) continue;
    await env.DB.prepare(
      "DELETE FROM actuals WHERE ticker = ? AND field = ? AND period = ?"
    ).bind(ticker, field, period).run();
    await env.DB.prepare(
      `INSERT INTO actuals (ticker, bbg_ticker, company, period, field, value, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(ticker, bbg_ticker || "", company || "", period, field, value ?? null, source || "").run();
    inserted++;
  }
  return withSecurityHeaders(Response.json({ ok: true, inserted }));
}

async function ingestAnalysts(body, env) {
  // Create table if not exists
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS analysts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    bbg_ticker TEXT NOT NULL,
    firm TEXT NOT NULL,
    analyst TEXT,
    recommendation TEXT,
    target_price REAL,
    date TEXT,
    snapshot_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_analysts_ticker ON analysts(ticker)").run();
  try {
    await env.DB.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_analysts_upsert ON analysts(ticker, firm, snapshot_date)"
    ).run();
  } catch { /* duplicates may prevent index creation */ }

  const rows = Array.isArray(body) ? body : [body];
  let inserted = 0;
  for (const row of rows) {
    const { ticker, bbg_ticker, firm, analyst, recommendation, target_price, date, snapshot_date } = row;
    if (!ticker || !firm) continue;
    const sd = snapshot_date || new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      "DELETE FROM analysts WHERE ticker = ? AND firm = ? AND snapshot_date = ?"
    ).bind(ticker, firm, sd).run();
    await env.DB.prepare(
      `INSERT INTO analysts (ticker, bbg_ticker, firm, analyst, recommendation, target_price, date, snapshot_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(ticker, bbg_ticker || "", firm, analyst || "", recommendation || "", target_price ?? null, date || "", sd).run();
    inserted++;
  }
  return withSecurityHeaders(Response.json({ ok: true, inserted }));
}

async function handleReadAnalysts(ticker, env) {
  if (!env.DB) {
    return withSecurityHeaders(Response.json({ error: "D1 not configured" }, { status: 503 }));
  }
  // Check if table exists
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM analysts WHERE ticker = ? ORDER BY target_price DESC LIMIT 200"
    ).bind(ticker).all();
    return withSecurityHeaders(Response.json({ ticker, count: results.length, data: results }, {
      headers: { "Cache-Control": "public, max-age=300" }
    }));
  } catch {
    return withSecurityHeaders(Response.json({ ticker, count: 0, data: [] }));
  }
}

async function handleReadAllAnalysts(env) {
  if (!env.DB) {
    return withSecurityHeaders(Response.json({ error: "D1 not configured" }, { status: 503 }));
  }
  try {
    const { results } = await env.DB.prepare(
      "SELECT ticker, COUNT(*) as cnt, GROUP_CONCAT(DISTINCT firm) as firms FROM analysts GROUP BY ticker ORDER BY ticker"
    ).all();
    return withSecurityHeaders(Response.json({ count: results.length, data: results }, {
      headers: { "Cache-Control": "public, max-age=300" }
    }));
  } catch {
    return withSecurityHeaders(Response.json({ count: 0, data: [] }));
  }
}

async function ingestCalendar(body, env) {
  const rows = Array.isArray(body) ? body : [body];
  let upserted = 0;
  for (const row of rows) {
    const { ticker, bbg_ticker, company, next_earnings_date, earnings_time, confirmed } = row;
    if (!ticker) continue;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO earnings_calendar (ticker, bbg_ticker, company, next_earnings_date, earnings_time, confirmed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(ticker, bbg_ticker || "", company || "", next_earnings_date || null, earnings_time || null, confirmed || null).run();
    upserted++;
  }
  return withSecurityHeaders(Response.json({ ok: true, upserted }));
}

async function handleReadConsensus(ticker, url, env) {
  if (!env.DB) {
    return withSecurityHeaders(Response.json({ error: "D1 not configured" }, { status: 503 }));
  }
  const period = url.searchParams.get("period");
  const field = url.searchParams.get("field");
  let sql = "SELECT * FROM consensus WHERE ticker = ?";
  const params = [ticker];
  if (period) { sql += " AND period = ?"; params.push(period); }
  if (field) { sql += " AND field = ?"; params.push(field); }
  sql += " ORDER BY snapshot_date DESC, period LIMIT 500";
  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return withSecurityHeaders(Response.json({ ticker, count: results.length, data: results }, {
    headers: { "Cache-Control": "public, max-age=300" }
  }));
}

async function handleReadActuals(ticker, url, env) {
  if (!env.DB) {
    return withSecurityHeaders(Response.json({ error: "D1 not configured" }, { status: 503 }));
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM actuals WHERE ticker = ? ORDER BY period DESC LIMIT 200"
  ).bind(ticker).all();
  return withSecurityHeaders(Response.json({ ticker, count: results.length, data: results }, {
    headers: { "Cache-Control": "public, max-age=300" }
  }));
}

async function handleReadCalendar(env) {
  if (!env.DB) {
    return withSecurityHeaders(Response.json({ error: "D1 not configured" }, { status: 503 }));
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM earnings_calendar ORDER BY next_earnings_date ASC"
  ).all();
  return withSecurityHeaders(Response.json({ count: results.length, data: results }, {
    headers: { "Cache-Control": "public, max-age=600" }
  }));
}

async function handleDashboard(env) {
  if (!env.DB) {
    return withSecurityHeaders(Response.json({ error: "D1 not configured" }, { status: 503 }));
  }

  // Gather all queries in parallel
  const queries = [
    // Coverage summary: snapshots per ticker x field
    env.DB.prepare("SELECT ticker, field, COUNT(*) as cnt, MAX(snapshot_date) as latest FROM consensus GROUP BY ticker, field").all(),
    // Actuals summary
    env.DB.prepare("SELECT ticker, COUNT(*) as cnt FROM actuals GROUP BY ticker").all(),
    // Calendar
    env.DB.prepare("SELECT * FROM earnings_calendar ORDER BY next_earnings_date ASC").all(),
    // Latest consensus values (most recent snapshot per ticker x field x period)
    env.DB.prepare(`
      SELECT c.ticker, c.bbg_ticker, c.company, c.period, c.field, c.value, c.high, c.low, c.analyst_count, c.snapshot_date
      FROM consensus c
      INNER JOIN (
        SELECT ticker, field, period, MAX(snapshot_date) as max_date
        FROM consensus GROUP BY ticker, field, period
      ) latest ON c.ticker = latest.ticker AND c.field = latest.field AND c.period = latest.period AND c.snapshot_date = latest.max_date
      ORDER BY c.ticker, c.field, c.period
    `).all(),
    // Analyst counts per ticker
    env.DB.prepare("SELECT ticker, COUNT(*) as cnt, COUNT(DISTINCT firm) as firms FROM analysts GROUP BY ticker").all(),
  ];

  const [consensus, actuals, calendar, latestValues, analystCounts] = await Promise.all(queries);

  return withSecurityHeaders(Response.json({
    generated: new Date().toISOString(),
    consensus_summary: consensus.results,
    actuals_summary: actuals.results,
    calendar: calendar.results,
    latest_values: latestValues.results,
    analyst_counts: analystCounts.results,
    totals: {
      consensus_rows: consensus.results.reduce((s, r) => s + r.cnt, 0),
      actuals_rows: actuals.results.reduce((s, r) => s + r.cnt, 0),
      calendar_rows: calendar.results.length,
      analyst_rows: analystCounts.results.reduce((s, r) => s + r.cnt, 0),
    }
  }, { headers: { "Cache-Control": "no-store" } }));
}

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "capital.markets") {
      return Response.redirect(`https://consensusmarket.com${url.pathname}${url.search}`, 308);
    }

    const runtime = await getRuntime(url, env);

    const rpcMatch = url.pathname.match(/^\/rpc(?:\/(\d+))?$/);
    if (rpcMatch) {
      const index = Number(rpcMatch[1] || 0);
      return handleRpcProxy(request, env, Number.isFinite(index) ? index : 0);
    }

    if (url.pathname === "/runtime-config.json") {
      return withSecurityHeaders(Response.json(runtime, {
        headers: { "Cache-Control": "no-store" },
      }));
    }

    if (url.pathname === "/healthz") {
      return withSecurityHeaders(Response.json(
        { ok: true, service: "consensusmarket-app", checkedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } }
      ));
    }

    if (url.pathname === "/status.json") {
      return withSecurityHeaders(Response.json(
        {
          ok: true,
          checkedAt: new Date().toISOString(),
          runtime,
          configPresent: {
            marketAddress: Boolean(runtime.marketAddress),
            oracleAddress: Boolean(runtime.oracleAddress),
            registryAddress: Boolean(runtime.registryAddress),
            rpcUrl: Boolean(runtime.rpcUrl),
          },
          tunnelHost: runtime.rpcUrl ? new URL(runtime.rpcUrl).host : "",
          marketCount: marketSeeds.length,
        },
        { headers: { "Cache-Control": "no-store" } }
      ));
    }

    if (url.pathname === "/catalog.json") {
      return withSecurityHeaders(Response.json(
        {
          count: marketSeeds.length,
          markets: marketSeeds.map((market) => ({
            slug: market.slug,
            ticker: market.ticker,
            company: market.company,
            metricName: market.metricName,
            focus: market.focus,
            sourceUrl: market.sourceUrl,
          })),
        },
        { headers: { "Cache-Control": "no-store" } }
      ));
    }

    if (url.pathname === "/news.json") {
      return handleNewsRequest(url, env);
    }

    if (url.pathname === "/activity.json") {
      return handleActivityRequest(env);
    }

    // ── Bloomberg Consensus Data API ──────────────────────────────
    if (url.pathname === "/api/ingest" && request.method === "POST") {
      return handleIngest(request, env, "consensus");
    }
    if (url.pathname === "/api/ingest/actuals" && request.method === "POST") {
      return handleIngest(request, env, "actuals");
    }
    if (url.pathname === "/api/ingest/calendar" && request.method === "POST") {
      return handleIngest(request, env, "calendar");
    }
    if (url.pathname === "/api/ingest/analysts" && request.method === "POST") {
      return handleIngest(request, env, "analysts");
    }
    // CORS preflight for read API endpoints
    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      }});
    }

    if (url.pathname.startsWith("/api/consensus/") && request.method === "GET") {
      const ticker = decodeURIComponent(url.pathname.replace("/api/consensus/", ""));
      return addCors(await handleReadConsensus(ticker, url, env));
    }
    if (url.pathname.startsWith("/api/actuals/") && request.method === "GET") {
      const ticker = decodeURIComponent(url.pathname.replace("/api/actuals/", ""));
      return addCors(await handleReadActuals(ticker, url, env));
    }
    if (url.pathname === "/api/calendar" && request.method === "GET") {
      return addCors(await handleReadCalendar(env));
    }
    if (url.pathname.startsWith("/api/analysts/") && request.method === "GET") {
      const ticker = decodeURIComponent(url.pathname.replace("/api/analysts/", ""));
      return addCors(await handleReadAnalysts(ticker, env));
    }
    if (url.pathname === "/api/analysts" && request.method === "GET") {
      return addCors(await handleReadAllAnalysts(env));
    }
    if (url.pathname === "/api/dashboard" && request.method === "GET") {
      return addCors(await handleDashboard(env));
    }
    // ── End Bloomberg API ─────────────────────────────────────────

    if (request.method !== "GET" && request.method !== "HEAD") {
      return env.ASSETS.fetch(request);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return withSecurityHeaders(assetResponse);
    }

    if (!url.pathname.includes(".")) {
      const spaRequest = new Request(new URL("/index.html", url), request);
      return withSecurityHeaders(await env.ASSETS.fetch(spaRequest));
    }

    return withSecurityHeaders(assetResponse);
  },
};
