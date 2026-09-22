// Cloudflare Pages Function
// Handles: GET /api/tokens  ->  proxies https://www.stonkfun.xyz/api/public/v1/tokens
//
// Why this exists: calling the stonk.fun API directly from browser JS on a
// different origin (your-project.pages.dev) can be blocked by the browser if
// the upstream API doesn't send CORS headers. Routing through a same-origin
// Pages Function sidesteps that entirely (server-to-server has no CORS
// concept), and lets us add a short edge cache so repeat visits/filter
// tweaks are fast and don't hammer the upstream API.
//
// Error contract: every failure this function returns (as opposed to what it
// passes through from upstream) is shaped { error: { code, message } } per
// the API docs, with `code` as the stable field callers should branch on.

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
    // We never reached stonk.fun at all — that's a dependency being down,
    // which is exactly what service_unavailable (503) means per the docs.
    // Not cached, and not retried automatically here: the client decides
    // whether/when to retry.
    return errorResponse("service_unavailable", "Could not reach the upstream token feed. Please try again.", 503);
  }

  const body = await upstreamRes.text();

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": upstreamRes.ok ? `public, max-age=${CACHE_SECONDS}` : "no-store",
  };

  // rate_limited (429) responses carry a Retry-After the client should
  // honour — forward it through so the browser doesn't have to guess.
  const retryAfter = upstreamRes.headers.get("retry-after");
  if (upstreamRes.status === 429 && retryAfter) {
    headers["retry-after"] = retryAfter;
  }

  const response = new Response(body, {
    status: upstreamRes.status,
    headers,
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

// Catch-all for any method other than GET/OPTIONS (those have their own
// handlers above and take priority over this one). Keeps method_not_allowed
// on this route consistent with the rest of the API's error contract instead
// of falling back to Cloudflare's default plain-text 405.
export async function onRequest(context) {
  return errorResponse(
    "method_not_allowed",
    `${context.request.method} is not supported on this endpoint. Use GET.`,
    405,
    { "access-control-allow-origin": "*", "allow": "GET, OPTIONS" }
  );
}

function errorResponse(code, message, status, extraHeaders) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: Object.assign(
      {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      extraHeaders || {}
    ),
  });
}
