// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const NEWS_SEARCH_WINDOW_DAYS = 120;
export const NEWS_MAX_AGE_DAYS = 180;
export const MAX_RPC_BODY_BYTES = 32 * 1024;
export const METRIC_STOP_WORDS = new Set(["and", "the", "for", "with", "core", "total", "family"]);
export const NEWS_CACHE_TTL_SECONDS = 600; // 10 min
export const RPC_HEALTH_CACHE_TTL_SECONDS = 60; // 1 min
export const ACTIVITY_CACHE_TTL_SECONDS = 120; // 2 min
export const ALLOWED_RPC_METHODS = new Set([
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
export const SECURITY_HEADERS = {
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

export async function kvGet(env, key) {
  if (!env.CACHE) return null;
  try {
    return await env.CACHE.get(key);
  } catch {
    return null;
  }
}

export async function kvSet(env, key, value, ttl) {
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

export function withSecurityHeaders(response, extraHeaders = {}) {
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

/** Constant-time string comparison to prevent timing side-channels. */
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let mismatch = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    mismatch |= bufA[i] ^ bufB[i];
  }
  return mismatch === 0;
}
