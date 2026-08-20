# Search Engines

Navigator has 12 search routes across 5 engines and 3 browser backends. The automatic router picks the best one for each query.

## Available Engines

| Engine | Type | Routes | Notes |
|--------|------|--------|-------|
| DuckDuckGo | API + Browser | `duckduckgo_api`, `duckduckgo_cb`, `duckduckgo_ch` | Fast, privacy-focused |
| Google | Browser | `google_cb`, `google_ch`, `google_lp` | Best coverage, may block automation |
| Bing | Browser | `bing_cb`, `bing_lp` | Good general coverage |
| Brave | Browser | `brave_cb` | Privacy-focused, growing index |
| Mojeek | Browser | `mojeek_lp` | Independent, UK-based |

## Route Naming

Routes are named `{engine}_{backend}`:

- `_api` — Direct API call, no browser needed
- `_cb` — CloakBrowser (anti-bot fingerprinting)
- `_ch` — Chromium (standard headless)
- `_lp` — Lightpanda (lightweight browser)

## Backend Types

| Backend | What it is | Best for |
|---------|-----------|----------|
| `api` | Direct HTTP request | DuckDuckGo Instant Answers |
| `cloakbrowser` | Browser with anti-bot profiles | Most search engines |
| `chromium` | Standard headless Chromium | When CloakBrowser isn't available |
| `lightpanda` | Lightweight CDP browser | Shared pool, low memory |

## Automatic Routing

With `select_best` (default), Navigator:

1. Checks which routes are healthy
2. Ranks them by recent performance (success rate, speed, result count)
3. Tries the best route first
4. Falls back to the next route on failure
5. Puts failed routes on cooldown (circuit breaker)

You almost never need to specify an engine manually.

## Manual Engine Selection

Force a specific route:

```json
{
  "queries": ["specific query"],
  "engine": "duckduckgo_api"
}
```

This runs the requested route even if it's not in the automatic pool.

Available route names: `duckduckgo_api`, `duckduckgo_cb`, `duckduckgo_ch`, `google_cb`, `google_ch`, `google_lp`, `bing_cb`, `bing_lp`, `brave_cb`, `mojeek_lp`, `startpage_cb`, `yahoo_cb`.

## Circuit Breakers

When a route fails, it enters a cooldown period (default: 5 minutes). During cooldown:

- The route is skipped for automatic selection
- It can still be used if explicitly requested
- After cooldown, it's tried again with a probe request
- If the probe succeeds, the route rejoins the pool

View circuit breaker status at `/console` or via the `/health` endpoint.

## Search Windows

Navigator maintains "search windows" — pre-opened browser tabs ready for search. This makes subsequent searches faster because the browser doesn't need to open a new tab each time.

- Windows are pooled by engine backend
- Idle windows are cleaned up after a timeout
- The number of windows is configurable via `SEARCH_MAX_WORKING_WINDOWS`

## Tips

- **Let the router work** — `select_best` is almost always the right choice
- **Use DuckDuckGo API** for fast, reliable results without browser overhead
- **Try Google manually** if other engines don't have what you need
- **Check `/console`** if searches are failing — it shows which routes are healthy

## Next Steps

- [Results](/guides/search/results) — Understanding search output
- [Tips](/guides/search/tips) — Advanced search techniques
