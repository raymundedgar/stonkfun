// Cloudflare Pages Function
// Handles: GET /api/tokens  ->  proxies https://www.stonkfun.xyz/api/public/v1/tokens
//
// Why this exists: calling the stonk.fun API directly from browser JS on a
// different origin (your-project.pages.dev) can be blocked by the browser if
// the upstream API doesn't send CORS headers. Routing through a same-origin
// Pages Function sidesteps that entirely (server-to-server has no CORS
// concept), and lets us add a short edge cache so repeat visits/filter
// tweaks are fast and don't hammer the upstream API.

const UPSTREAM = "https://www.stonkfun.xyz/api/public/v1/tokens";

// Only forward params the upstream API actually understands.
const ALLOWED_PARAMS = [
  "q",
  "sort",
  "mode",
  "status",
  "quoteMint",
  "category",
  "page",
  "pageSize",
];

const CACHE_SECONDS = 15;

export async function onRequestGet(context) {
  const { request } = context;
  const reqUrl = new URL(request.url);

  const upstream = new URL(UPSTREAM);
  for (const key of ALLOWED_PARAMS) {
    const val = reqUrl.searchParams.get(key);
    if (val !== null && val !== "") upstream.searchParams.set(key, val);
  }

  const cache = caches.default;
  const cacheKey = new Request(upstream.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstream.toString(), {
      headers: { accept: "application/json" },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
  } catch (err) {
    return jsonResponse({ error: "Upstream fetch failed", detail: String(err) }, 502);
  }

  const body = await upstreamRes.text();

  const response = new Response(body, {
    status: upstreamRes.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  });

  if (upstreamRes.ok) {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
