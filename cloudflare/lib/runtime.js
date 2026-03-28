import { kvGet, kvSet, RPC_HEALTH_CACHE_TTL_SECONDS } from "./helpers.js";

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

export function parseRpcUrls(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getUpstreamRpcUrls(env) {
  return parseRpcUrls(env.RPC_URLS || env.VITE_RPC_URLS || env.RPC_URL || env.VITE_RPC_URL || "");
}

export async function getHealthyRpcIndexes(upstreamRpcUrls, env) {
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

export async function getRuntime(requestUrl, env) {
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
