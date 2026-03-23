import marketSeeds from "../data/markets.json";

const NEWS_SEARCH_WINDOW_DAYS = 120;
const NEWS_MAX_AGE_DAYS = 180;
const MAX_RPC_BODY_BYTES = 32 * 1024;
const METRIC_STOP_WORDS = new Set(["and", "the", "for", "with", "core", "total", "family"]);
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

function parseRpcUrls(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getUpstreamRpcUrls(env) {
  return parseRpcUrls(env.RPC_URLS || env.VITE_RPC_URLS || env.RPC_URL || env.VITE_RPC_URL || "");
}

async function getHealthyRpcIndexes(upstreamRpcUrls) {
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

  return healthyIndexes;
}

async function getRuntime(requestUrl, env) {
  const upstreamRpcUrls = getUpstreamRpcUrls(env);
  const healthyRpcIndexes = await getHealthyRpcIndexes(upstreamRpcUrls);
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
      {
        ok: false,
        error: "RPC proxy only accepts POST.",
      },
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
    ), corsHeaders);
  }

  if (!isAuthorizedRpcBrowserRequest(request, requestUrl, allowedOrigin)) {
    return withSecurityHeaders(Response.json(
      {
        ok: false,
        error: "RPC proxy only accepts same-origin browser requests.",
      },
      {
        status: 403,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
    ), corsHeaders);
  }

  if (!upstreamRpcUrl) {
    return withSecurityHeaders(Response.json(
      {
        ok: false,
        error: "RPC endpoint is not configured.",
      },
      {
        status: 503,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
    ), corsHeaders);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_RPC_BODY_BYTES) {
    return withSecurityHeaders(Response.json(
      {
        ok: false,
        error: "RPC request body is too large.",
      },
      {
        status: 413,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
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
      {
        ok: false,
        error: "RPC request body is invalid.",
      },
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
    ), corsHeaders);
  }

  let payload;
  try {
    payload = JSON.parse(requestBody);
  } catch {
    return withSecurityHeaders(Response.json(
      {
        ok: false,
        error: "RPC request must be valid JSON.",
      },
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
    ), corsHeaders);
  }

  if (!isReadOnlyRpcPayload(payload)) {
    return withSecurityHeaders(Response.json(
      {
        ok: false,
        error: "RPC method is not allowed by the read-only proxy.",
      },
      {
        status: 403,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
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
      {
        ok: false,
        error: "RPC upstream is unavailable.",
        detail,
      },
      {
        status: 502,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
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

async function handleNewsRequest(url) {
  const slug = url.searchParams.get("market") || "";
  const market = marketSeeds.find((entry) => entry.slug === slug);

  if (!market) {
    return withSecurityHeaders(Response.json(
      {
        ok: false,
        error: "Unknown market.",
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    ));
  }

  const queries = buildNewsQueries(market);
  const reportingPeriod = parseReportingPeriod(market.idSeed);

  try {
    let articles = [];
    let query = queries[0];

    try {
      articles = await fetchSeekingAlphaNews(market);
    } catch {
      articles = [];
    }

    for (const candidate of queries) {
      if (articles.length >= 4) break;
      query = candidate;
      const candidateArticles = await fetchGoogleNewsForQuery(candidate, market);
      articles = getRecentArticles([...articles, ...candidateArticles], market);
      if (articles.length >= 4) {
        break;
      }
    }

    return withSecurityHeaders(Response.json(
      {
        ok: true,
        market: slug,
        company: market.company,
        metricName: market.metricName,
        reportingPeriod,
        query,
        updatedAt: new Date().toISOString(),
        articles,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300",
        },
      }
    ));
  } catch {
    return withSecurityHeaders(Response.json(
      {
        ok: false,
        market: slug,
        company: market.company,
        metricName: market.metricName,
        reportingPeriod,
        query: queries[0],
        updatedAt: new Date().toISOString(),
        articles: [],
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    ));
  }
}

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
        headers: {
          "Cache-Control": "no-store",
        },
      }));
    }

    if (url.pathname === "/healthz") {
      return withSecurityHeaders(Response.json(
        {
          ok: true,
          service: "consensusmarket-app",
          checkedAt: new Date().toISOString(),
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
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
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
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
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      ));
    }

    if (url.pathname === "/news.json") {
      return handleNewsRequest(url);
    }

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
