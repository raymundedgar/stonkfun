# STONK.SCAN

A single-page dashboard for the `stonk.fun` public tokens endpoint, built to deploy free on Cloudflare Pages.

## What's here

```
index.html              the whole dashboard (HTML/CSS/JS, no build step)
functions/api/tokens.js  a Cloudflare Pages Function that proxies the stonk.fun API
```

The frontend never calls `stonkfun.xyz` directly — it calls its own `/api/tokens`,
which is handled by the Pages Function. That function fetches the real API
server-side and returns the JSON. Two reasons for this:

1. **CORS safety.** If `stonkfun.xyz` doesn't send CORS headers, a direct
   browser fetch from your `*.pages.dev` domain would be blocked. Server-to-server
   requests don't have this restriction.
2. **Speed.** The function caches each unique query for 15 seconds at Cloudflare's
   edge, so repeat views and quick filter tweaks are close to instant and don't
   hit the upstream API on every keystroke.

## Deploy — option A: connect a Git repo (recommended, auto-deploys on push)

1. Push this folder to a new GitHub/GitLab repo.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the repo. Build settings:
   - Framework preset: `None`
   - Build command: *(leave empty)*
   - Build output directory: `/`
4. Deploy. Cloudflare automatically detects the `functions/` folder and wires up `/api/tokens`.

## Deploy — option B: Wrangler CLI (no Git needed)

```bash
npm install -g wrangler
cd stonk-dashboard
wrangler pages deploy . --project-name=stonk-scan
```

This uploads `index.html` and `functions/` together in one shot — functions
are included automatically when you deploy the whole directory this way.

## Deploy — option C: drag-and-drop in the dashboard

Workers & Pages → Create → Pages → **Upload assets**, then drag the whole
`stonk-dashboard` folder in. Direct-upload deployments also pick up the
`functions/` directory, so `/api/tokens` will work without any extra config.

Either way you end up with a free `your-project.pages.dev` URL. No environment
variables, secrets, or KV/D1 bindings are needed — everything runs off the
one function file.

## Notes on the two extra filters (peak market cap, age)

The public API only supports `q`, `sort`, `mode`, `status`, `quoteMint`,
`category`, `page`, `pageSize` — there's no server-side way to filter by
`peakMarketCapUsd` or token age (`createdAt`). The dashboard adds both as
client-side filters that apply to whatever page of results is currently
loaded (shown in the hint text under the filter bar). If you need these to
filter across the *entire* dataset rather than one page at a time, that would
require the Pages Function to page through and cache results itself — happy
to add that if you want it, just say so.

## Customizing

- Edge cache duration: `CACHE_SECONDS` at the top of `functions/api/tokens.js` (default 15s).
- Client refresh interval: the `setInterval(..., 20000)` near the bottom of `index.html`.
- Colors/fonts: CSS custom properties at the top of `index.html`'s `<style>` block.
