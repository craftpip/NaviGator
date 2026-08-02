# Search Engines As Drivers

## Execution Progress

_Last updated: 2026-08-01 (after brave_api removal). Update this section after each batch of work._

**Status: COMPLETE. Core refactor done, deployed, and verified live. `brave_api` route removed per user request (2026-08-01).**

- **brave_api removed (2026-08-01):** Deleted `src/engines/brave-api.js`; dropped from `src/engines/index.js` (import, `DRIVER_CLASSES`, `MCP_SEARCH_ENGINES`), `DEFAULT_FALLBACK` in `src/search.js`, `tests/engines.test.js` (registry/MCP subset + both Brave driver tests), `tests/search.test.js` (live test), and the MCP enum assertion in `tests/mcp-server.test.js`. config.js/mcp-server.js derive from the registry, so no direct edits needed. `duckduckgo_api` remains the only `api` backend route; `ApiSearchDriver`/`api-driver.js` kept. Full suite: 330 passed, 24 skipped. Live-verified: `web_search` enum now `["select_best","duckduckgo_api","brave_cb","bing_lp","mojeek_lp","google_cb","bing_cb","duckduckgo_cb"]`, default fallback search works, requesting `brave_api` returns "No valid engines requested" with the 10 supported routes.
- **Deploy:** `docker compose build && docker compose down && docker compose up -d` succeeded. Container running the refactored image.
- **Health:** `ok:true`, cloakbrowser connected, no unexpected circuit breakers. Warmup windows empty because `BROWSER_BACKEND=cloakbrowser` and the `defaultBackend !== "chromium"` warmup guard is pre-existing (present at HEAD). Pools created on demand during live checks: `brave_cb` (engine pool, 1 persistent), `_shared` (lightpanda, 1 persistent).
- **Live `/search` checks:**
  - `duckduckgo_api` — 3 results ✅
  - `brave_api` — 3 results ✅ (429 rate limit had cleared)
  - `brave_cb` — 3 results ✅
  - `google_ch` — correctly detected CAPTCHA block (`"Google blocked this request with a CAPTCHA page"`), opened that route's circuit breaker (expected — proves `assertNotBlocked` works)
  - `bing_lp` — 3 results ✅
- **Post-deploy lint note:** ESLint still reports the 2 pre-existing `NodeFilter` errors in `src/devtools.js`; optional to fix.

### Done

- `src/engines/driver.js` — rewritten to instance-property contract (`id`, `backend`, `pool`, `exposedInMcp`, `homeUrl`, `inputSelectors`, `resultSelectors`, plus `searchUrl()`, `search()`, `submit()`, `extract()`, `assertNotBlocked()`), exports `KNOWN_BACKENDS` and `POOL_POLICIES`.
- `src/engines/api-driver.js` — `ApiSearchDriver` base (backend `api`, no pool/homeUrl).
- `src/engines/browser-driver.js` — `BrowserSearchDriver` with common `submit()` (goto → body wait → 500ms settle → `waitForAnySelector` with before/after `assertNotBlocked`).
- `src/engines/util.js` — exists with `cleanWhitespace`, `normalizeQueryText`, `normalizeUrl`, `buildLlmText`, `dedupeDirectAnswers`, `cleanAndTruncateText`, `fetchTextWithTimeout`.
- `src/engines/duckduckgo-api.js` — `DuckDuckGoApiDriver` (POST html.duckduckgo.com + instant-answers API; parser + `collectDuckDuckGoInstantAnswers` moved here).
- `src/engines/brave-api.js` — `BraveApiDriver` (GET search.brave.com + Cloudflare challenge detection).
- `src/engines/duckduckgo-browser.js` — `DuckDuckGoBrowserDriver` shared base (form-submit override + `EXTRACT_PAGE` + result shaping).
- `src/engines/duckduckgo-cb.js` — `DuckDuckGoCbDriver` (backend cloakbrowser, pool engine, exposedInMcp true).
- `src/engines/duckduckgo-ch.js` — `DuckDuckGoChDriver` (backend chromium, exposedInMcp false).
- `src/engines/google-driver.js` — shared `GoogleDriver` (standard extract with `a:has(h3)`, block check via `/sorry/` + `unusual traffic|not a robot`).
- `src/engines/google-cb.js`, `google-ch.js` — extend `GoogleDriver` (cb exposed, ch not).
- `src/engines/google-lp.js` — Lightpanda selector/extraction variant kept separate (`LP_RESULT_SELECTORS`, `LP_EXTRACT_PAGE`).
- `src/engines/bing-driver.js` — shared Bing extraction (`#b_results li.b_algo`); `bing-cb.js`, `bing-lp.js`.
- `src/engines/brave-cb.js` — `BraveCbDriver` (cloakbrowser, `EXTRACT_PAGE` incl. AI answer `.snippet.standalone .snippet-content`, followups stripped).
- `src/engines/mojeek-lp.js` — `MojeekLpDriver` (lightpanda, 403/`automated queries` block check).
- `src/engines/index.js` — registry: ordered `SUPPORTED_ENGINES` (11 IDs), `MCP_SEARCH_ENGINES` (8 exposed, exact enum order), `getEngineDriver`, `getEngineMetadata` (null-safe), `getBrowserWarmupEngines`, load-time validation (unique ids, known backends, API no pool/homeUrl, browser has homeUrl + valid pool). Dependency-free.
- `src/search.js` — refactored to registry + `util.js`. Removed `SUPPORTED_ENGINES` Set, `ENGINE_BACKENDS`, `ENGINE_PAGE_CONFIG`, local copy of 6 util helpers, block check, wait-for-any-selector, HTTP fetcher, both HTML parsers, both HTTP runners, homepage submit helper, and the per-engine extraction switch. `runSearchEngine()` now drives via `getEngineDriver` (api: `driver.search` + `http_total` log; browser: acquire → submit → extract + per-stage timing log; page closed on error before release). `routeKey`/`normalizeEngines`/Lightpanda concurrency + retry use `getEngineMetadata`.
- `src/browser.js` — refactored to registry metadata in `newPage()`, `_poolEngine()`, `ensureMinWorkingWindows()`; dropped `ENGINE_STARTUP_URLS`; prelaunch filters warmup via `getBrowserWarmupEngines()` and uses `homeUrl` from metadata.
- `src/config.js` — `SEARCH_ENGINE_VALUES` now built from `SUPPORTED_ENGINES`.
- `src/mcp-server.js` — `WEB_SEARCH_ENGINE_ENUM = ["select_best", ...MCP_SEARCH_ENGINES]` used for both `web_search` enums; `duckduckgo_ch`/`google_ch` stay unadvertised.
- `tests/engines.test.js` — new: registry shape, MCP subset, null-safe metadata, unknown-driver throw, contract validation for all 11 drivers, jsdom fixture extraction for DDG/Google/Bing/Brave/Mojeek/google_lp, empty-SERP handling, DuckDuckGo + Brave API search (mocked fetch), Cloudflare-challenge rejection, warmup filtering.
- `tests/browser.test.js` — `brave_cb` added to `_poolEngine` + `newPage` dispatch cases.
- `tests/mcp-server.test.js` — new test asserting the `web_search` enum equals `["select_best", ...8 exposed]` and `engines` items enum matches.

### Verified

- `node --check` clean for search.js, browser.js, config.js, mcp-server.js, engines/*.
- `npx vitest run` (host, no container): 5 affected files → 182 passed. Full suite: 326 passed, 24 skipped, **1 failed**.
- The 1 failure is the pre-existing live `brave_api` test in `tests/search.test.js` — Brave is currently rate-limiting this IP (HTTP 429 confirmed via direct driver call 3×). Not a refactor regression; it is a live-network test.
- ESLint: 2 errors, both pre-existing in `src/devtools.js` (lines 916/921 `NodeFilter` no-undef, present on HEAD). No lint errors in changed files.

### Next

- Nothing blocking. Optional follow-ups if the user wants them:
  - Fix pre-existing `NodeFilter` lint errors in `src/devtools.js` for a fully clean lint run.
  - Commit the refactor (user has not asked yet).

### Important notes for resumption

- Working tree already had uncommitted Brave-route work (brave_api/brave_cb inline in search.js/config/browser/mcp + `tests/search.test.js` brave_api test). That work is the pre-plan baseline; the refactor builds on it.
- `src/engines/index.js` must stay dependency-free (no imports of search.js/browser.js/config.js). config.js imports `SUPPORTED_ENGINES` from it — one-way.
- `getEngineMetadata(engine)` must NOT throw for unknown engines (browser `newPage()` is called with arbitrary engine names); `getEngineDriver()` may throw.
- Current MCP enum (9 items incl `select_best`) must be preserved exactly; only `duckduckgo_ch`/`google_ch` are non-advertised.
- Driver extract fns are plain functions (reference global `document`); tests run them via `dom.window.eval` with `runScripts: "outside-only"` in the fake page's `evaluate`.
- jsdom 27 supports `:has()` — Google extractor keeps `a:has(h3)`.
- Timing logs stay in search.js (orchestrator owns them), API drivers do NOT log timings.
- Do not remove `console.log`/`console.error` from source files (debug logs are intentional).

## Goal

Move search-engine-specific transport, navigation, block detection, and SERP parsing out of `src/search.js` without changing search results, fallback order, pooling, or the public MCP surface.

The current implementation has 11 internal engine routes. Their metadata is duplicated across `src/search.js`, `src/browser.js`, `src/config.js`, and the MCP schema. A new route requires editing several unrelated modules and extending a large conditional extractor.

Drivers make one registry the source of truth. Adding a route becomes: implement a driver, register it, and explicitly choose whether it is exposed through the MCP schema.

## Verified Current Behavior

- Internal routes: `bing_cb`, `bing_lp`, `brave_api`, `brave_cb`, `duckduckgo_api`, `duckduckgo_cb`, `duckduckgo_ch`, `google_cb`, `google_ch`, `google_lp`, `mojeek_lp`.
- `brave_api` and `duckduckgo_api` use direct HTTP, although their current backend name is `http`.
- Browser routes use fixed backends: CloakBrowser for Brave, DDG, Google, and Bing `*_cb`; Chromium for `duckduckgo_ch` and `google_ch`; Lightpanda for `google_lp`, `bing_lp`, and `mojeek_lp`.
- CloakBrowser and Chromium routes have separate pools per engine. All Lightpanda routes use the `_shared` pool and must remain serialised.
- The current MCP tool schema deliberately advertises only nine routes. `duckduckgo_ch` and `google_ch` remain valid internal/configured routes but are not exposed in its enums.
- Google CAPTCHA detection and Mojeek automated-traffic detection run before and after waiting for a result selector.
- The existing suite baseline is `297 passed`; `24` live domain-hint tests are skipped unless enabled.

## Design

Create `src/engines/` with a small driver hierarchy and a static registry. The registry must be dependency-free: it cannot import `search.js`, `browser.js`, or `config.js`. This keeps the import direction one-way:

```
config ------> engines
browser -----> engines
search ------> engines
mcp-server --> engines
```

`search.js` remains the orchestrator. It owns query normalisation, circuit breakers, fallback sequencing, cross-engine deduplication, result formatting, page-slot accounting, and timing logs. Drivers only own route-specific work.

### Driver Contract

Use instance properties for route metadata and methods for behavior. Static-only properties make inherited overrides and registry validation less clear.

```js
class SearchEngineDriver {
  id;                    // e.g. "brave_cb"
  backend;               // "api" | "cloakbrowser" | "chromium" | "lightpanda"
  pool;                  // "engine" | "shared"; browser drivers only
  exposedInMcp;          // whether to advertise this route in MCP enums
  homeUrl;               // browser warmup URL; null for API drivers
  inputSelectors;
  resultSelectors;

  searchUrl(query) {}
  async search({ query }) {}                 // API drivers only
  async submit(page, query) {}                // browser drivers only
  async extract(page) {}                      // browser drivers only
  async assertNotBlocked(page) {}             // browser drivers; default no-op
}
```

Every driver returns `{ results, directAnswers }`. Each item is already tagged with `engine: this.id`; browser direct answers use the final `page.url()` as their source URL. Shared normalization helpers (`cleanWhitespace`, `normalizeUrl`, `dedupeDirectAnswers`, and the timeout-aware HTTP fetcher) move to `src/engines/util.js`, so drivers and the router do not import one another.

`BrowserSearchDriver.submit()` performs the common URL navigation, body wait, short settle delay, selector wait, and before/after block checks. DuckDuckGo overrides `submit()` because its homepage requires setting the form value and waiting for the form-submission navigation. Google and Mojeek override `assertNotBlocked()` for their existing block checks.

`ApiSearchDriver` is only a convenience base for API routes. It does not define a fake `homeUrl`, and API routes are never browser-warmed or assigned a browser pool.

## Folder Layout

```
src/engines/
  driver.js              # base contract and validation
  util.js                # driver/router shared pure helpers and HTTP fetch
  api-driver.js          # API-driver base
  browser-driver.js      # common browser submit and block-check lifecycle
  index.js               # driver classes plus derived metadata/query helpers
  duckduckgo-api.js
  brave-api.js
  duckduckgo-browser.js  # shared DDG submit/extract base
  duckduckgo-cb.js
  duckduckgo-ch.js
  google-driver.js       # shared Google extraction; LP may override selectors
  google-cb.js
  google-ch.js
  google-lp.js
  bing-driver.js         # shared Bing extraction
  bing-cb.js
  bing-lp.js
  brave-cb.js
  mojeek-lp.js
```

The shared Google driver must preserve the separate Lightpanda selector/extraction variant. Do not collapse it into the CloakBrowser/Chromium parser merely because the target engine is the same.

## Registry

`src/engines/index.js` imports the concrete driver classes in a deliberate stable order and validates that IDs are unique, all backends are known, API routes have no pool/warmup metadata, and browser routes have a home URL and valid pool policy.

Export query functions instead of new mutable duplicate maps:

- `SUPPORTED_ENGINES`: ordered, frozen array/set of all 11 internal IDs.
- `MCP_SEARCH_ENGINES`: the derived `exposedInMcp` subset, preserving the current nine-item schema.
- `getEngineDriver(engine, config)`: instantiates a driver or throws for an unknown ID.
- `getEngineMetadata(engine)`: returns `{ backend, pool, homeUrl, isBrowser }` for routing and browser lifecycle code.
- `getBrowserWarmupEngines(engines)`: filters configured engine IDs to browser drivers only.

Do not retain `ENGINE_BACKENDS`, `ENGINE_PAGE_CONFIG`, or `ENGINE_STARTUP_URLS` as compatibility exports. Their callers should use the registry functions directly, so a second representation cannot drift.

## Route Metadata

| backend | pool | routes |
|---|---|---|
| `api` | none | `duckduckgo_api`, `brave_api` |
| `cloakbrowser` | engine | `duckduckgo_cb`, `google_cb`, `bing_cb`, `brave_cb` |
| `chromium` | engine | `duckduckgo_ch`, `google_ch` |
| `lightpanda` | shared | `google_lp`, `bing_lp`, `mojeek_lp` |

The rename from `http` to `api` is internal. Route IDs, fallback order, config environment values, health route keys, and result `engine` values do not change.

## File Changes

### `src/search.js`

Remove the engine maps, HTTP runner/parser functions, homepage submit helper, block-check helper, selector wait helper, and per-engine extraction switch.

Import registry metadata and shared utilities. `runSearchEngine()` should instantiate the driver, call `driver.search({ query })` for API drivers, or acquire/submit/extract/release a pooled browser page for browser drivers. Preserve the existing error cleanup: a failed browser route closes its page before release so it cannot return to the pool.

Use `getEngineMetadata(engine).backend` for route keys, Lightpanda concurrency, and the one retry for Lightpanda detached-frame errors. Keep `DEFAULT_FALLBACK` in this module unchanged and in the current order.

### `src/browser.js`

Use registry metadata in `newPage()` and `_poolEngine()` instead of route-name arrays. Backend dispatch remains route-specific even if `BROWSER_BACKEND` differs; the default backend still applies only to non-search page operations and unknown/non-route engines.

Use `metadata.pool === "shared"` for the Lightpanda `_shared` pool. During prelaunch, filter `SEARCH_ROUTE_WARMUP_ENGINES` through `getBrowserWarmupEngines()` and use each driver’s `homeUrl`. This avoids accidentally opening browser pages for API routes if an operator configures one for warmup.

### `src/config.js`

Build `SEARCH_ENGINE_VALUES` from `SUPPORTED_ENGINES`. Configuration continues to accept all 11 routes, including the two non-advertised Chromium routes. Preserve the configured-value filtering and default warmup/fallback arrays.

### `src/mcp-server.js`

Build the two `web_search` enums from `MCP_SEARCH_ENGINES`, prefixed by `select_best`. Do not expose the full internal set by accident: that would change the public tool contract by advertising `duckduckgo_ch` and `google_ch`.

## Tests

Keep all existing tests, but add focused tests for the new boundary. A pure refactor moving parsing, block checks, and routing needs contract coverage; live `/search` calls alone are not a reliable regression suite.

- `tests/engines.test.js`: registry uniqueness, all 11 route metadata entries, MCP subset, browser-only warmup filtering, and pool policy.
- Driver tests with fixture HTML or mocked pages for each extractor family: DuckDuckGo, Brave, Google standard, Google Lightpanda, Bing, and Mojeek. Assert result fields, direct answers, redirect normalization, and engine tags.
- Browser-driver tests: ordinary URL submit, DDG form submission, and Google/Mojeek block detection both before and after selector waits.
- Update `tests/browser.test.js` to assert registry-derived backend dispatch and the shared Lightpanda pool, retaining its current behavior cases.
- Update MCP schema tests to assert the enum equals the derived advertised subset and still excludes the two Chromium-only routes.

## Verification

1. Run syntax checks and ESLint for the changed source and test files.
2. Run `docker compose exec navigator npx vitest run`; baseline is `297 passed` plus the new deterministic driver tests. The 24 opt-in live domain-hint tests remain skipped unless `LIVE_DOMAIN_HINTS=1` is set.
3. Build and redeploy the changed image with `docker compose build`, then `docker compose down && docker compose up -d`. Do not use `docker restart` after source changes because it restarts the old image.
4. Check `docker exec navigator curl -s localhost:3000/health` and verify configured browser warmup pools are unchanged.
5. Run live `/search` checks for both API routes and at least one route per browser backend: `brave_api`, `duckduckgo_api`, `brave_cb`, `google_ch`, and `bing_lp`. Also check a Google block response and Mojeek 403 handling when reproducible; their unit tests are the required regression coverage.

## Non-Goals

- No change to page extraction, screenshots, devtools, caching, circuit-breaker policy, fallback policy, result deduplication, or public result shape.
- No dynamic filesystem plugin loading. Drivers are statically imported so startup is deterministic and bundling/testing remain simple.
- No removal of Chromium routes. They are valid internal routes and remain usable through configuration and the HTTP `/search` endpoint.
