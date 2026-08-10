# Navigator CLI — Management Script

## Plan Status

**Status: COMPLETE — ABSORBED** (verified + absorbed 2026-08-10). `navigator.js` (statistics + monitoring), `GET /stats`, spawn/tab/activity counters, request + per-engine failure telemetry all built, tested, and committed (`f76cf1e feat: add navigator monitoring CLI` and follow-ups). Durable knowledge folded into `AGENTS.md` → [Navigator CLI and Stats](#navigator-cli-and-stats); this file archived to `plans/archive/` for history. One optional nicety remains (see checklist).

### Checklist

- [x] `navigator.js` CLI — `statistics` / `monitoring`, `--url` / `--interval` / `--json` / `--help`, boxed tables, exit 1 on unreachable server.
- [x] `GET /stats` endpoint (uptime, memory, sessions, cache, instances, counters).
- [x] `BrowserManager.getInstanceStats()` + `instanceSpawns` counters (`src/browser.js`).
- [x] Activity counters (`searches`/`fetches`/`screenshots`/`botBlocks`) + `getActivityCounters()` (`src/search.js`).
- [x] Devtools counters (`targetsCreated`/`targetsClosed`/`targetsInactivityClosed`) + `targetsById` leak fix (`src/devtools.js`).
- [x] Request failure rates (`requestLog` ring buffer, `getRequestStats()`, exposed in `/stats`).
- [x] Per-engine failure rates (`engineAttemptLog`, `getEngineAttemptStats()`, exposed in `/stats`).
- [x] De-boxed output (user request) — stable redraw layout.
- [x] Tests — `/stats` shape, devtools counter deltas, `getInstanceStats()`, engine attempt stats. Suite 347 passed / 24 skipped, ESLint clean.
- [ ] Optional: `package.json` `bin` / `cli` script for `npm run cli` (not added).

## Goal

Give the user a small command-line management script — `navigator.js` — that talks to the live MCP server and answers "what is going on right now?" without digging through docker logs.

Two commands:

1. `navigator statistics` — a snapshot report: how many engines are active, how many browser instances are created, how many pages/tabs/windows are open, how many MCP sessions are connected, and other live counters.
2. `navigator monitoring` — a live, auto-refreshing view (like `docker stats`): browser instances, search windows, engine/circuit-breaker state, and the MCP session count updating in real time.

The script is built as a tiny subcommand dispatcher so more commands can be added later (`status`, `sessions`, `cache`, `engines`, `logs`, `restart`, …).

## Verified Current Behavior

- Server exposes `GET /health` (src/mcp-server.js:1864). It already returns:
  - `backend`, `devtoolsBackend`, `browserConnected` / `lightpandaConnected` / `cloakbrowserConnected`, `headless`, `enableDevtoolsMcp`, `userDataDir`, `profileDir`, `searchRouteWarmupEngines`
  - `searchWindows.total` + `searchWindows.byEngine[].{total,inUse,pending,persistent}` (from `BrowserManager.getHealth()`, src/browser.js:933)
  - `pageLimiter.{maxConcurrentPageOps,inUse,queued}` (src/browser.js:963)
  - `searchRouteCircuitBreakers` (from `getSearchBackendHealth()`, src/search.js:130) — per-route `{route,state,remainingMs,failures,lastError,lastFailureAt}`
- Browser instances are held as singletons on `BrowserManager`: `this.browser` (Chromium), `this.lightpandaBrowser`, `this.cloakbrowserBrowser` (src/browser.js:116/124/128). Each is a puppeteer Browser with `.pages()`.
- MCP sessions live in `mcpTransports` (a `Map`, src/mcp-server.js:1707). Not exposed anywhere.
- Tool result cache lives in `toolResultCache` (src/mcp-server.js:31). Not exposed anywhere.
- There are NO cumulative counters today (total searches, fetches, screenshots, browser spawns). Console logs show activity but the state is not queryable.

## What `navigator statistics` Shows

A boxed report (same style as the benchmark output), with sections:

1. **Server** — URL, uptime, memory (RSS), version.
2. **Engines** — count of registered engines (from `SUPPORTED_ENGINES`), how many exposed via MCP, per-route circuit-breaker state (open/half_open with remaining cooldown + last error), how many warmup windows exist per engine pool.
3. **Browser instances** — one row per backend (chromium / lightpanda / cloakbrowser): connected?, how many tabs (`pages()`), how many times the instance has been spawned (cumulative), current pid.
4. **Search windows** — total + `byEngine[].{total,inUse,pending,persistent}` (already in /health).
5. **Page limiter** — `inUse` vs `maxConcurrentPageOps`, `queued`.
6. **MCP sessions** — active session count (new), per-session info (id, last activity) if cheap.
7. **Cache** — per-tool cache entry counts + total (new).
8. **Activity counters** (new) — cumulative: searches run, pages fetched, screenshots taken, bot blocks detected.

## Design

### CLI — `navigator.js`

Top-level script at the repo root (or `bin/navigator.js`), invoked as `node navigator.js <command>`. Options:

```
Usage: node navigator.js <command> [options]

Commands:
  statistics   Show a one-shot snapshot report of the running MCP server
  monitoring   Live view of browser instances, search windows, engines and
               MCP sessions — refreshes in place until Ctrl+C (like docker stats)

Options:
  --url <http://host:port>   MCP server base URL (default: env NAVIGATOR_URL or http://localhost:3000)
  --interval <seconds>       monitoring refresh rate (default: 2)
  --json                     Print raw JSON instead of the formatted report
  --help
```

Structure mirrors `benchmark/web-search-benchmark.mjs`: small, dependency-free, uses only `node:` built-ins plus `fetch`. Subcommand dispatch is a simple map:

```js
const COMMANDS = {
  statistics: runStatistics,
  monitoring: runMonitoring,
  // status, sessions, cache, engines — future
};
```

Both commands do:
1. `fetch(HEALTH_URL)` → `/health` payload.
2. `fetch(STATS_URL)` → `/stats` payload (new endpoint, below).
3. `statistics` renders boxed sections once and exits. `monitoring` loops: poll both endpoints every `--interval` seconds, redraw the frame, stop on Ctrl+C.
4. `--json` prints the merged raw payloads instead (statistics: once; monitoring: not supported / ignored).

Exit code 0 on success, 1 if the server is unreachable (with a friendly "is the container running?" hint).

### Server — new `GET /stats` endpoint

Add a lightweight endpoint next to `/health` (src/mcp-server.js ~line 1864) that exposes the currently hidden state. It must never block on the browser:

```js
{
  ok: true,
  uptimeSeconds: process.uptime(),
  memory: { rss, heapUsed, heapTotal },           // process.memoryUsage()
  sessions: mcpTransports.size,                    // active MCP sessions
  cache: {                                          // per-tool entry counts
    total: ...,
    byTool: { web_search: n, web_fetch: n, ... }
  },
  instances: [                                     // from BrowserManager
    { backend: "chromium",    connected, pid, tabs, spawns },
    { backend: "lightpanda",  connected, pid, tabs, spawns },
    { backend: "cloakbrowser",connected, pid, tabs, spawns }
  ],
  counters: { searches, fetches, screenshots, botBlocks, cacheHits, cacheMisses }
}
```

### Server — expose the missing state

- **Sessions:** `mcpTransports.size` — trivial, already a Map.
- **Cache:** `toolResultCache[tool].size` — the cache keys by tool (src/mcp-server.js:31-77).
- **Tabs per backend:** `await this.browser.pages()` / `lightpandaBrowser.pages()` / `cloakbrowserBrowser.pages()` — add a `getInstanceStats()` method on `BrowserManager` (src/browser.js) returning `{connected,pid,tabCount,spawnCount}` per backend. Guard for null/not-connected.
- **Spawn counters:** add `this.instanceSpawns = { chromium: 0, lightpanda: 0, cloakbrowser: 0 }` and increment where each singleton is assigned (`_prelaunchChromium` / chromium launch ~src/browser.js:388, lightpanda ~521, cloakbrowser ~712).
- **Activity counters:** add a small in-memory `counters` object in `src/search.js` (incremented in `browserSearch`, `browserOpenAndExtract`, `browserCaptureScreenshot`, bot-block detection) and expose via a `getActivityCounters()` helper. Keep it in-memory (resets on restart) — do not build a log store yet.
- Uptime/memory come straight from `process`.

Alternative (lighter): extend `/health` instead of a new `/stats`. Decision below.

### Output — `navigator statistics` (one-shot)

Prints once and exits. Same boxed/right-aligned table style as the benchmark report.

```
 NAVIGATOR STATISTICS ─ http://localhost:3000 ─ uptime 2d 14:07:33 ─ rss 412.3 MB
==================================================================================

ENGINES ─ 10 registered · 7 exposed via MCP (+ select_best)
┌──────────────────┬──────────────┬───────────────┬────────┬───────────────────────┐
│ route            │ backend      │ state         │ fails  │ last error            │
├──────────────────┼──────────────┼───────────────┼────────┼───────────────────────┤
│ duckduckgo_api   │ chromium     │ ok            │ 0      │                       │
│ duckduckgo_cb    │ cloakbrowser │ ok            │ 0      │                       │
│ duckduckgo_ch    │ chromium     │ ok            │ 0      │                       │
│ bing_cb          │ cloakbrowser │ ok            │ 0      │                       │
│ bing_lp          │ lightpanda   │ ok            │ 0      │                       │
│ brave_cb         │ cloakbrowser │ ok            │ 0      │                       │
│ google_cb        │ cloakbrowser │ open · 4m12s  │ 3      │ captcha required      │
│ google_ch        │ chromium     │ open · 1m48s  │ 2      │ captcha required      │
│ google_lp        │ lightpanda   │ open · 1m48s  │ 2      │ captcha required      │
│ mojeek_lp        │ lightpanda   │ open · 58s    │ 1      │ timeout after 60s     │
└──────────────────┴──────────────┴───────────────┴────────┴───────────────────────┘

BROWSER INSTANCES
┌─────────────┬───────────┬──────┬────────┬────────┐
│ backend     │ connected │ tabs │ pid    │ spawns │
├─────────────┼───────────┼──────┼────────┼────────┤
│ chromium    │ yes       │ 3    │ 48213  │ 5      │
│ lightpanda  │ yes       │ 2    │ 48219  │ 2      │
│ cloakbrowser│ yes       │ 1    │ 48220  │ 4      │
└─────────────┴───────────┴──────┴────────┴────────┘

SEARCH WINDOWS ─ total 4 · inUse 1 · pending 0
┌────────────────┬───────┬───────┬─────────┬────────────┐
│ pool           │ total │ inUse │ pending │ persistent │
├────────────────┼───────┼───────┼─────────┼────────────┤
│ duckduckgo_api │ 1     │ 0     │ 0       │ 0          │
│ bing_cb        │ 2     │ 1     │ 0       │ 1          │
└────────────────┴───────┴───────┴─────────┴────────────┘
page limiter: 1 / 8 in use · 0 queued

MCP SESSIONS: 2 connected
CACHE: 14 entries ─ web_search 8 · web_fetch 6

ACTIVITY (since server start)
  searches: 142   fetches: 38   screenshots: 12
  bot blocks: 7   cache hits: 96   cache misses: 18
```

### Output — `navigator monitoring` (live)

Continuous like `docker stats`: redraws in place every `--interval` seconds (default 2s) until Ctrl+C. Same boxed style, with a live status header and per-engine circuit-breaker state.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ NAVIGATOR MONITORING ─ http://localhost:3000 ─ every 2s ─ Ctrl+C to quit │
│ uptime 2d 14:07:33  rss 412.3 MB  heap 210.1 MB  sessions 2  calls 0.4/s│
├──────────────────────────────────────────────────────────────────────────┤
│ BROWSER INSTANCES                                                         │
│ backend        pid    tabs   status    memory                             │
│ chromium       48213  3      ● running 92.1 MB                            │
│ lightpanda     48219  2      ● running 18.4 MB                            │
│ cloakbrowser   48220  1      ● running 65.7 MB                            │
├──────────────────────────────────────────────────────────────────────────┤
│ SEARCH WINDOWS                                                            │
│ pool           total  inUse  pending  persistent                          │
│ duckduckgo_api 1      0      0        0                                   │
│ bing_cb        2      1      0        1                                   │
│ page limiter: 1 / 8 in use · 0 queued                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ ENGINES ─ circuit breakers                                                │
│ google_cb  OPEN 4m12s left   fails 3   captcha required                   │
│ mojeek_lp  OPEN 58s left     fails 1   timeout after 60s                  │
│ 8 of 10 routes ok                                                         │
├──────────────────────────────────────────────────────────────────────────┤
│ MCP SESSIONS: 2  ·  cache: 14 entries (web_search 8, web_fetch 6)         │
└──────────────────────────────────────────────────────────────────────────┘
```

Implementation notes for `monitoring`:

- Same data as `statistics` (`/health` + `/stats`), polled in a loop.
- Redraw by clearing the screen (`\x1b[2J\x1b[H`) then re-rendering each tick, so it feels like `docker stats`.
- Handle terminal resizing gracefully (column widths snap to terminal width where sensible).
- `Ctrl+C` stops cleanly (restore cursor / clear screen, exit 0).
- `--interval <seconds>` option (default 2).
- No flicker: render the full frame into one string and write it in one `process.stdout.write`.

## Files To Touch

| File | Change |
|------|--------|
| `navigator.js` (new) | CLI entry + subcommand dispatch + `statistics` + `monitoring` commands + table renderers |
| `src/mcp-server.js` | `GET /stats` handler; expose `mcpTransports.size`, cache sizes; wire activity counters |
| `src/browser.js` | `getInstanceStats()`; `instanceSpawns` counters |
| `src/search.js` | in-memory activity counters + `getActivityCounters()` export |
| `src/config.js` | (only if adding `NAVIGATOR_URL`-style env — optional) |
| `package.json` | add `bin` field or `"cli": "node navigator.js"` script |
| `tests/mcp-server.test.js` | `/stats` shape test (sessions, cache, instances) |
| `plans/navigator-cli.md` | this plan, update progress as work lands |

## Tests

- Unit: `/stats` endpoint returns the expected shape (mock `mcpTransports`, cache, BrowserManager stats).
- Unit: `getInstanceStats()` handles disconnected instances (null browser → `connected:false, tabs:0`).
- Manual: `node navigator.js statistics` against the running container shows all sections; `--json` prints valid JSON; unreachable server → exit 1 with hint.
- Full suite must stay green (current baseline: 336 passed / 24 skipped).

## Decisions Needed

1. **New `/stats` endpoint vs extended `/health`.** I lean toward a separate `/stats` so `/health` stays a liveness check and stays fast/cheap for monitoring. `/stats` can be slower (it awaits `pages()` per backend).
2. **Cumulative counters reset on restart** — acceptable for a dashboard? (I think yes, in-memory is fine; a persistent store is a bigger project.)
3. **`--url` default** — resolved host-side only (navigator.js is a host command, never run in the container). Resolution order: `--url` flag → `NAVIGATOR_URL` env → `.env` (`MCP_API_HOST` + `MCP_API_PORT`, parsed from the `.env` next to the script) → `http://localhost:3000`. This works because docker-compose already sources `.env` for the port mapping, so `.env` is the single source of truth for the reachable address.

## Execution Progress

_Last updated: 2026-08-02 — CLI built, deployed to the container, verified live, tests green. Failure-rate + per-engine failure telemetry added._

### Done

- [x] Decided: separate `/stats` endpoint (keeps `/health` a fast liveness check).
- [x] Decided: in-memory cumulative counters (reset on restart is fine for a dashboard).
- [x] Decided: `--url` default resolves host-side — flag → `NAVIGATOR_URL` → `.env` (`MCP_API_HOST` + `MCP_API_PORT`) → `http://localhost:3000`. Host-only command.
- [x] `src/browser.js`: `instanceSpawns` counters + `getInstanceStats()`/`_instanceStat()` (connected/tabs/pid/spawns per backend).
- [x] `src/search.js`: `activityCounters` (searches/fetches/screenshots/botBlocks) + `getActivityCounters()`.
- [x] `src/mcp-server.js`: `GET /stats` (uptime, memory, sessions, cache, instances, counters incl. cacheHits/misses).
- [x] `src/devtools.js`: `devtoolsCounters` (targetsCreated/closed/inactivityClosed) + `getDevtoolsCounters()`; fixed `targetsById` leak on inactivity close (target is now deleted so it can't pile up toward `MAX_TARGETS`).
- [x] `navigator.js` CLI: `statistics` + `monitoring`, `--url`/`--interval`/`--json`/`--help`, ANSI header art (NAVIGATOR block letters + jgs crocodile), boxed tables, `printHttpDisabled()` hint, exit 1 on unreachable server. Shortcuts `stats`/`stat`/`mon`; script is `chmod +x` (run as `./navigator.js`).
- [x] `.env` resolution host-side: `loadEnvFile()` (CWD then SCRIPT_DIR) + `resolveBaseUrl()`. Verified from host at `http://10.69.1.164:3000`.
- [x] Live verification: `/health` + `/stats` return expected shape; `statistics`/`monitoring` render in-container; create/close target counters increment correctly through MCP; unreachable URL → exit 1; `--json` valid.
- [x] Tests: added `/stats` shape tests, devtools counter delta tests, `getInstanceStats()` tests. Suite: 343 passed / 24 skipped (was 336). ESLint clean.
- [x] **Request failure rates** (src/mcp-server.js): `requestLog` ring buffer (`REQUEST_LOG_MAX = 20000`) + `recordRequest(tool, ok, errMsg)` wrapping `handleToolCall` (→ `handleToolCallInner`) and HTTP `/search` `/extract` `/screenshot`; `getRequestStats()` → `{total,ok,err,byPeriod(5m/15m/1h/24h/all),byTool,recentErrors(last 8)}`; exposed as `requests` in `/stats`. CLI `printRequests()` → REQUESTS / FAILURE RATES table + RECENT ERRORS; monitoring header shows `req N · 5m XX% ok · N err`.
- [x] **Per-engine failure rates** (src/search.js): `engineAttemptLog` + `recordEngineAttempt(engine, ok|fail|skip, err)` hooked in `runSearchRoute` (success/fail, circuit-open skip) and `runFallbackEngineGroups` (circuit-open skip); `getEngineAttemptStats()` → `{total,ok,fail,skip,byEngine:{engine:{total,ok,fail,skip,byPeriod}},recentFailures(last 8)}`; exposed as `engineAttempts` in `/stats`. CLI `printEngineFailures()` → ENGINE FAILURE RATES table (attempts/ok/err/skip/success%/err rate, sorted by worst) + RECENT ENGINE FAILURES; monitoring adds ENGINE RATES (5m) section.
- [x] Live-verified failure telemetry: default searches record ok attempts; explicit `engine=mojeek_lp` recorded a fail (`AggregateError: All promises were rejected`) and its route went OPEN; a second explicit call while OPEN recorded a skip and fell back to bing_cb. Statistics + monitoring both render the per-engine tables.
- [x] Tests: `getEngineAttemptStats` aggregation + recent failures (tests/search.test.js); `/stats` includes `requests` + `engineAttempts` (tests/mcp-server.test.js). Suite: 347 passed / 24 skipped. ESLint clean.
- [x] **De-boxed output** (user request): removed the enclosing `┌─┐` frame around monitoring and the `═` box around the statistics header — plain section headers + tables, so the UI stays put between redraws instead of resizing and shifting as content changes. ESLint clean.

### Next

- [x] Commit — done: `f76cf1e` (CLI), `c57fdd8` region follow-ups, `48f95a6`, `28b9510`, `880574e` (later sessions).
- [ ] Optional: `package.json` `bin`/`cli` script for `npm run cli`.
