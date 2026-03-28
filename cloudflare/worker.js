import marketSeeds from "../data/markets.json";
import { withSecurityHeaders } from "./lib/helpers.js";
import { getRuntime } from "./lib/runtime.js";
import { handleNewsRequest } from "./handlers/news.js";
import { handleActivityRequest } from "./handlers/activity.js";
import { handleRpcProxy } from "./handlers/rpc-proxy.js";

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
