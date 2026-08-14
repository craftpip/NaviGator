# Search, Scheduling, and Drivers

## Search Business Logic

`browserSearch()` in `src/search.js` is the search orchestrator. It normalizes quoted/duplicate query variants, records one SQLite search, requests configured routes, merges duplicate URLs, and returns concise result records.

An explicit engine request runs the requested route group. Automatic selection asks `EngineScheduler` for routes in priority order and stops at the first route that returns results. Browser routes acquire a reusable search window; the DuckDuckGo API route runs without a browser.

## Scheduler and Circuit Breaker

The scheduler and route circuit breaker solve different problems.

| Mechanism | State | Decision |
|---|---|---|
| `EngineScheduler` | `.cache/search-engine-profiles.json` | Prefers healthy, fast routes and backs off repeated route failures |
| Route circuit breaker | `.cache/search-circuit-breakers.json` | Refuses a route for `SEARCH_ROUTE_CIRCUIT_OPEN_MS` after an execution failure |

Scheduler selection ranks ready routes by measured median latency, puts never-measured routes first, periodically explores a non-leading healthy route, and probes routes recovering from failures. Failure cooldown grows exponentially. Each success reduces the failure count by one, so recovery is gradual.

`runSearchRoute()` applies a global page-operation slot, route-circuit checks, activity metrics, and backend-specific recovery. Lightpanda retries detached-frame/target-loaded failures once. Empty results count as an automatic-scheduler failure but do not open the hard circuit for an explicitly requested route. Local display/browser-launch faults never open a circuit.

## Driver Contract

Every route is registered in `src/engines/index.js` and validated at module load.

`SearchEngineDriver` defines metadata and extension points:

```js
id                 // unique route ID
backend            // api | cloakbrowser | chromium | lightpanda
pool               // null | engine | shared
homeUrl            // null for API; HTTPS URL for browser routes
inputSelectors
resultSelectors
searchUrl(query)   // browser routes
search({ query })  // API routes
submit(page, query)
extract(page)
assertNotBlocked(page)
```

`ApiSearchDriver` fixes API metadata. `BrowserSearchDriver` implements common navigation, result-selector polling, before/after block checks, and result tagging. DOM extractor functions execute inside the loaded SERP and return `{ results, directAnswers }`.

## Route Matrix

| Route | Provider | Backend | Pool | Notes |
|---|---|---|---|---|
| `bing_cb` | Bing | CloakBrowser | engine | Standard Bing SERP parser and block detection |
| `bing_lp` | Bing | Lightpanda | shared | Same Bing extraction adapted to shared Lightpanda pool |
| `brave_cb` | Brave | CloakBrowser | engine | Extracts web results and standalone AI answer |
| `duckduckgo_api` | DuckDuckGo | API | none | Posts to DDG HTML endpoint; optionally parses DDG API answer |
| `duckduckgo_cb` | DuckDuckGo | CloakBrowser | engine | Submits homepage search form rather than query URL |
| `duckduckgo_ch` | DuckDuckGo | Chromium | engine | Chromium variant of the same browser driver |
| `google_cb` | Google | CloakBrowser | engine | Search results and knowledge/direct-answer selectors |
| `google_ch` | Google | Chromium | engine | Chromium variant |
| `google_lp` | Google | Lightpanda | shared | Uses Lightpanda-tolerant selectors |
| `mojeek_lp` | Mojeek | Lightpanda | shared | Parses standard results and infoboxes |
| `startpage_cb` | Startpage | CloakBrowser | engine | Retries transient execution-context destruction |
| `yahoo_cb` | Yahoo | CloakBrowser | engine | Filters result rows from related-search rows |

All registered route IDs may be selected explicitly. `SEARCH_ENABLED_ENGINES` limits only automatic scheduling.

## Provider Details

### DuckDuckGo

Browser variants load `https://duckduckgo.com/`, fill an available search field, submit the surrounding form, then parse result articles or legacy `.result` cards. They detect anomaly and `/sorry/` blocks. The API variant posts to `https://html.duckduckgo.com/html/`, parses JSDOM result rows, and treats anomaly/captcha HTML with no usable results as an error.

### Google

Routes use `https://www.google.com/search?q=...&hl=en&udm=14`. Results come from `#search` cards containing an `h3`; direct answers use knowledge/description selectors. Google drivers reject unusual-traffic, robot, and `/sorry/` pages.

### Bing

Routes use `https://www.bing.com/search?q=...`, parse `#b_results li.b_algo`, and optionally return answer-card content. CAPTCHA, unusual-traffic, human-verification, and `/sorry/` text are treated as blocks.

### Brave, Mojeek, Startpage, and Yahoo

- Brave parses `#results` web snippets and its standalone AI response.
- Mojeek parses `.results-standard li` and infobox text, with title/body block checks.
- Startpage parses normal result links and wiki quick information. Its `withNavigationRetry()` wrapper retries only navigation-context errors up to two times because Startpage can navigate just after load.
- Yahoo parses qualifying `#web ol li` rows, excluding related-search cards, and returns its direct-answer cards.

## Result Cleanup

`src/engines/util.js` centralizes behavior used by drivers:

- `normalizeQueryText()` removes irrelevant punctuation while retaining useful syntax such as `+`, `#`, and `.`.
- `normalizeUrl()` unwraps Google, DuckDuckGo, Bing, and Yahoo redirects.
- `cleanWhitespace()` and `cleanAndTruncateText()` normalize output while preserving newlines in the latter.
- `dedupeDirectAnswers()` merges answers by source/text and records query variants.
- `fetchTextWithTimeout()` applies abortable HTTP timeouts to API requests.

## Search Settings

| Setting | Effect |
|---|---|
| `SEARCH_ENABLED_ENGINES` | Routes available to automatic selection |
| `SEARCH_ROUTE_WARMUP_ENGINES` | Browser routes kept warm at startup |
| `SEARCH_ROUTE_CIRCUIT_OPEN_MS` | Route-circuit open duration |
| `SEARCH_KEEP_MIN_WORKING_WINDOWS` | Warm windows retained per pool |
| `SEARCH_MAX_WORKING_WINDOWS` | Maximum windows in an engine pool |
| `SEARCH_QUEUE_*` | Scheduler cooldown, pacing, exploration, and latency sampling |
| `ENABLE_INSTANT_ANSWERS` | Enables independent DDG Instant Answer fetch per query |
