import { withSecurityHeaders } from "../lib/helpers.js";

const WAITLIST_PREFIX = "waitlist:";
const RATE_LIMIT_TTL = 60; // 1 minute per IP

export async function handleWaitlistSubmit(request, env) {
  try {
    // Per-IP rate limiting via KV
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const rateKey = `ratelimit:waitlist:${ip}`;
    const existing = await env.CACHE.get(rateKey);
    if (existing) {
      return withSecurityHeaders(Response.json(
        { ok: false, error: "Too many requests. Try again in a minute." },
        { status: 429 }
      ));
    }
    await env.CACHE.put(rateKey, "1", { expirationTtl: RATE_LIMIT_TTL });

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return withSecurityHeaders(Response.json(
        { ok: false, error: "Valid email required" },
        { status: 400 }
      ));
    }

    const walletRaw = String(body.wallet || "").trim();
    const wallet = /^0x[a-fA-F0-9]{40}$/.test(walletRaw) ? walletRaw.toLowerCase() : "";
    const markets = Array.isArray(body.markets) ? body.markets.filter((t) => typeof t === "string").slice(0, 20) : [];

    const entry = {
      email,
      wallet,
      wouldBet: Boolean(body.wouldBet),
      markets,
      submittedAt: new Date().toISOString(),
      country: request.cf?.country || "XX",
    };

    await env.CACHE.put(`${WAITLIST_PREFIX}${email}`, JSON.stringify(entry));

    // Update count
    const countRaw = await env.CACHE.get("waitlist:_count");
    const alreadySeen = await env.CACHE.get(`${WAITLIST_PREFIX}${email}:seen`);
    if (!alreadySeen) {
      const count = Number(countRaw || 0) + 1;
      await env.CACHE.put("waitlist:_count", String(count));
      await env.CACHE.put(`${WAITLIST_PREFIX}${email}:seen`, "1");
    }

    const totalCount = Number(await env.CACHE.get("waitlist:_count") || 0);

    return withSecurityHeaders(Response.json(
      { ok: true, count: totalCount },
      { headers: { "Cache-Control": "no-store" } }
    ));
  } catch {
    return withSecurityHeaders(Response.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    ));
  }
}

export async function handleWaitlistCount(env) {
  const count = Number(await env.CACHE.get("waitlist:_count") || 0);
  return withSecurityHeaders(Response.json(
    { count },
    { headers: { "Cache-Control": "no-store" } }
  ));
}

export async function handleWaitlistExport(request, env) {
  if (!env.CACHE) {
    return withSecurityHeaders(Response.json({ entries: [], count: 0 }));
  }
  const entries = [];
  let cursor = null;
  do {
    const result = await env.CACHE.list({ prefix: WAITLIST_PREFIX, cursor, limit: 500 });
    for (const key of result.keys) {
      if (key.name.endsWith(":seen") || key.name === "waitlist:_count") continue;
      const raw = await env.CACHE.get(key.name);
      if (raw) {
        try { entries.push(JSON.parse(raw)); } catch {}
      }
    }
    cursor = result.list_complete ? null : result.cursor;
  } while (cursor);

  entries.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));

  const summary = {
    total: entries.length,
    wouldBet: entries.filter((e) => e.wouldBet).length,
    withWallet: entries.filter((e) => e.wallet).length,
    countries: [...new Set(entries.map((e) => e.country).filter(Boolean))],
    topMarkets: Object.entries(
      entries.flatMap((e) => e.markets || []).reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {})
    ).sort((a, b) => b[1] - a[1]),
  };

  return withSecurityHeaders(Response.json(
    { summary, entries },
    { headers: { "Cache-Control": "no-store" } }
  ));
}
