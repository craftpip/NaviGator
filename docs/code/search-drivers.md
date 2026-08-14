# Search Drivers

`src/engines/` isolates provider-specific transport, page interaction, block detection, and DOM extraction from `src/search.js`. Drivers return raw normalized search results and direct answers; the search orchestrator owns query variants, selection policy, circuit breakers, cross-route deduplication, caching, telemetry, and final MCP formatting.

## Route Model and Registry

Every registered driver declares an ID, backend, pool policy, home URL, result selectors, and one of two execution paths:

- API routes implement `search({ query })`, do not have a browser pool or home URL, and return results directly.
- Browser routes implement a search URL and extraction. The orchestrator acquires a route-appropriate window, calls `submit(page, query)`, then `extract(page)`.

`index.js` validates this contract at module load, before traffic reaches a malformed route: IDs are unique and lowercase, backends and pool policies are known, API routes have no pool/home URL and implement `search`, and browser routes have a home URL plus `searchUrl` and `extract`. `getEngineDriver()` throws for an unknown ID because dispatching it is a programming/configuration error. `getEngineMetadata()` instead returns `null` for unknown input so browser creation can safely fall back to its configured default backend.

Browser routes use engine-local pools for Cloakbrowser and Chromium, while Lightpanda routes share one pool. This is route metadata, not just documentation: `BrowserManager` uses it to pick backend and pool capacity. Do not change a route from `engine` to `shared` without checking browser lifecycle and concurrency behavior.

| Route | Backend and pool | Provider behavior |
| --- | --- | --- |
| `duckduckgo_api` | HTTP API, no pool | POSTs DDG HTML and optionally reads the answer API in parallel. |
| `duckduckgo_cb`, `duckduckgo_ch` | Cloakbrowser/Chromium, engine-local | Uses the real DDG form, rather than relying on a query URL. |
| `google_cb`, `google_ch` | Cloakbrowser/Chromium, engine-local | Standard Google SERP parsing and CAPTCHA detection. |
| `google_lp` | Lightpanda, shared | Same Google request/block rules with a Lightpanda-specific extractor. |
| `bing_cb` | Cloakbrowser, engine-local | Standard Bing SERP parsing and verification detection. |
| `bing_lp` | Lightpanda, shared | Same Bing behavior through the shared Lightpanda pool. |
| `brave_cb` | Cloakbrowser, engine-local | Extracts web results and cleaned standalone AI answers. |
| `mojeek_lp` | Lightpanda, shared | Extracts normal results/infoboxes and detects automation challenges. |
| `startpage_cb` | Cloakbrowser, engine-local | Retries transient navigation-context failures unique to Startpage. |
| `yahoo_cb` | Cloakbrowser, engine-local | Extracts organic rows/answer cards and detects blocked requests. |

`SUPPORTED_ENGINES` is generated from this registry. Configuration parsing rejects route names outside it, and browser warmup filters an arbitrary list down to registered browser routes. Register a new driver here rather than adding independent engine maps in search or browser code.

## Shared Browser Behavior

`BrowserSearchDriver` implements the normal browser route lifecycle:

1. Navigate to the provider search URL with the configured operation timeout.
2. Wait for `<body>`, then allow a short settle period for client-side SERP rendering.
3. Check for a provider block page, poll all configured result selectors, and check again before reporting a selector timeout.
4. Run the provider extractor in the page context, tag every result and direct answer with the route ID, attach the final page URL to answers, and de-duplicate answers.

The pre/post block checks distinguish a slow or changed SERP from an explicit CAPTCHA page. Provider extractors should return only `{ results, directAnswers }` using browser-global `document`; tests execute them in JSDOM. Result filtering, URL normalization, and cross-route deduplication should stay in the route/orchestrator layers that already own those responsibilities.

DuckDuckGo browser routes override submission because loading `?q=` may leave a homepage skeleton. They wait for the real input, set its value, submit its form, tolerate a navigation wait that does not fire, then require a result selector. Do not replace this with generic URL navigation without rechecking DDG's rendered behavior.

## API and Shared Utilities

`DuckDuckGoApiDriver` is the only API route. It caps both requests at 15 seconds or the smaller configured browser-operation timeout. HTML search is required; direct-answer retrieval is optional, so an answer endpoint failure does not discard usable organic results. HTML parsing rejects an anomaly/CAPTCHA page only when it has no usable results, avoiding false blocks on ordinary empty SERPs.

The independent `instant-answers.js` request is also DuckDuckGo-backed but not coupled to the selected search driver. When enabled, the orchestrator can fetch it for every query. Its timeout is similarly capped at 15 seconds and it accepts only Answer, AbstractText, or Definition fields.

`util.js` defines normalization rules shared by all routes:

- Queries are made human-search-like by removing wrapping quotes, lowercasing, removing non-meaningful punctuation, and preserving meaningful `+`, `#`, and `.` characters.
- Result URLs unwrap Google, DuckDuckGo, Bing, and Yahoo redirects. Invalid URLs become empty strings rather than reaching result output.
- Direct answers are de-duplicated by normalized source and text while merging query variants.
- HTTP helpers abort on timeout and include a bounded response excerpt in non-OK errors.
- Human-readable error handling unwraps `AggregateError` causes so scheduler state, circuit messages, and the console show the actual failed selector or request.

## Provider-Specific Behavior

### Google

Google routes navigate directly to an English web-search URL and wait for one of several historical/current SERP containers. The normal extractor reads `#search` result rows, title links, snippets, descriptions, and answer widgets. It treats `/sorry/`, “unusual traffic”, and “not a robot” as an explicit block.

`google_lp` retains Google’s navigation and block detection but has separate selectors and link lookup order for the DOM exposed through Lightpanda. Keep that extractor separate: changing it to the Cloakbrowser/Chromium extractor risks routes reporting a loaded SERP with zero results.

### Bing

Bing routes read organic `li.b_algo` entries plus answer/entity snippets. They reject CAPTCHA, unusual-traffic, human-verification, and `/sorry/` responses. The Lightpanda wrapper uses the same provider behavior but shares the Lightpanda search pool; the Cloakbrowser route has its own pool.

### DuckDuckGo

Browser drivers identify current and legacy DDG result card shapes and instant-answer modules, and fail early on anomaly, puzzle, unusual-traffic, or `/sorry/` pages. The API driver instead posts to `html.duckduckgo.com`, parses only complete title/URL rows with JSDOM, normalizes redirect URLs, and independently attempts the JSON answer endpoint.

This split is intentional. The API route is a fast no-browser fallback, while the browser routes handle the interactive public SERP. Keep their failures independent so one can recover service when the other is blocked.

### Brave

Brave has a Cloakbrowser-only engine-local route. It extracts only web result snippets and cleans the standalone AI answer before returning it by removing buttons and follow-up controls. It inherits the generic selector timeout behavior and does not currently add provider-specific block detection; add it only with a verified Brave block signature to avoid classifying ordinary result text as a failure.

### Mojeek

Mojeek runs through the shared Lightpanda pool. It extracts standard list results and infobox paragraphs, and treats 403, automated-query, CAPTCHA, and challenge text in either title or body as an explicit block. Title inspection matters because some provider failures put the signal outside the visible result container.

### Startpage

Startpage detects CAPTCHA, human verification, unusual traffic, access denial, blocked, and robot challenge text. It also wraps both generic submission and extraction in a bounded retry for execution-context destruction, target closure, or missing-context errors. Startpage performs a transient client-side navigation that can destroy the context just as a normal check/evaluate runs. The wrapper retries at most twice after the first attempt, waits 400 ms between attempts, and never extends beyond the configured browser operation deadline. Do not generalize this retry to all providers without evidence: it can hide real navigation failures and make circuit breaking slower.

### Yahoo

Yahoo extracts only organic list rows with a recognized title anchor, plus answer-card text. It detects CAPTCHA, unusual traffic, request blocking, and human verification before an eventual selector timeout. Its redirect URLs are normalized by the shared utility rather than route-specific parsing.

## Safe Modification Boundaries

When adapting a driver to provider markup, change its result-selector set and page-context extractor together, then test against the actual provider and JSDOM extractor tests. A selector that only indicates page chrome can make submission succeed while extraction returns no usable rows; a selector that is too narrow turns a DOM variation into a timeout.

Keep provider block checks conservative and based on verified block signatures. A thrown block error is operationally significant: the orchestrator records it, scheduler cooldown/circuit behavior can change, and automatic fallback moves to another route. Conversely, an empty result set is handled by orchestration policy, not by arbitrary extractor exceptions.

Adding a route requires a concrete class, registry registration, backend/pool metadata, configuration exposure through the generated registry list, and tests for the extractor and any custom submission/block behavior. Do not add provider-specific timing, retry, scheduler, or fallback policy to a driver when it belongs in the search orchestrator.
