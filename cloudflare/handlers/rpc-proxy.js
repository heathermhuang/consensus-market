import {
  withSecurityHeaders,
  ALLOWED_RPC_METHODS,
  MAX_RPC_BODY_BYTES,
} from "../lib/helpers.js";
import { getUpstreamRpcUrls } from "../lib/runtime.js";

// ---------------------------------------------------------------------------
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

export async function handleRpcProxy(request, env, index = 0) {
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
    return withSecurityHeaders(Response.json(
      { ok: false, error: "RPC upstream is unavailable." },
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
