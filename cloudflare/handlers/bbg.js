import { withSecurityHeaders } from "../lib/helpers.js";

async function kvGet(env, key) {
  if (!env.CACHE) return null;
  try {
    return await env.CACHE.get(key);
  } catch {
    return null;
  }
}

export async function handleBbgRequest(url, env) {
  const endpointMap = {
    "/bbg/consensus.json": "bbg:consensus",
    "/bbg/actuals.json": "bbg:actuals",
    "/bbg/earnings.json": "bbg:earnings-dates",
    "/bbg/revisions.json": "bbg:revisions",
  };

  const kvKey = endpointMap[url.pathname];
  if (!kvKey) return null;

  const data = await kvGet(env, kvKey);
  if (!data) {
    return withSecurityHeaders(Response.json(
      { error: "No Bloomberg data yet" },
      { status: 404 }
    ));
  }

  return withSecurityHeaders(new Response(data, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  }));
}
