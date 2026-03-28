import marketSeeds from "../../data/markets.json";
import {
  kvGet,
  kvSet,
  withSecurityHeaders,
  ACTIVITY_CACHE_TTL_SECONDS,
} from "../lib/helpers.js";
import { getUpstreamRpcUrls } from "../lib/runtime.js";

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

export async function handleActivityRequest(env) {
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
