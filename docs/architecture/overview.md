# Architecture

## Purpose

navigator is a Node.js Model Context Protocol server that uses real browser backends for web search, readable page extraction, screenshots, and optional browser automation. It runs over stdio or Streamable HTTP, with an HTTP status/management console for long-running deployments.

## Main Components

| Layer | Main files | Responsibility |
|---|---|---|
| Server and transport | `src/mcp-server.js` | MCP schemas and dispatch, HTTP routes, session transport, cache, console APIs |
| Browser runtime | `src/browser.js` | Browser launch/connect, backend selection, page slots, and reusable search windows |
| Search | `src/search.js`, `src/engine-scheduler.js`, `src/engines/` | Query execution, fallback, route health, SERP parsing, and direct answers |
| Extraction | `src/search.js`, `src/domain-hints.js`, `src/markdown.js` | Navigation, stabilization, article extraction, tables, links, and hint-driven flows |
| Persistent inspection | `src/devtools.js`, `src/tab-timers.js` | Long-lived browser tabs and CDP-style inspection/input tools |
| State and operations | `src/db.js`, `src/activity.js`, `src/config*.js`, `src/env-file.js` | SQLite telemetry, config parsing/updates, API keys, and reference IDs |
| Console and desktop | `src/web-console/`, `src/vnc-manager.js` | React management UI and optional headful VNC/noVNC stack |

## Startup Lifecycle

`src/mcp-server.js` is the entry point.

1. `loadConfig()` reads environment variables, resolves browser paths, and validates engine/backend values.
2. `initDb()` creates or migrates `data/navigator.db`, enables WAL, imports legacy API keys once, and prunes old activity.
3. `getBrowserManager()` creates the singleton `BrowserManager`.
4. `prelaunchIfConfigured()` starts the default browser backend and warms configured browser search routes when `PRELAUNCH_BROWSER=1`.
5. The process starts enabled transports: stdio, HTTP, or both.
6. HTTP mode exposes `/mcp`, health and stats endpoints, the console, and convenience HTTP wrappers.

## Request Lifecycles

### Search

```text
web_search
  -> MCP cache lookup
  -> browserSearch()
  -> normalize query variants + create SQLite search record
  -> explicit route group OR scheduler-ranked fallback routes
  -> runSearchRoute()
  -> driver search()/submit()/extract()
  -> normalize URLs, deduplicate results and direct answers
  -> cache structured response + format MCP text
```

The independent DuckDuckGo Instant Answer call is attempted for every query when enabled. It does not replace the selected search route.

### Fetch

```text
web_fetch
  -> resolve URL or durable ref_id
  -> cache lookup (maxChars is not part of the key)
  -> browserOpenAndExtract()
  -> match/apply domain hint, load and stabilize page
  -> serialize page, detect blocks, extract text/tables/links/SEO
  -> remember page and link refs, rewrite markdown destinations to ref IDs
  -> truncate on read and format MCP text
```

### Persistent DevTools Target

```text
Target.createTarget -> BrowserManager.newPage() -> target state + event listeners
subsequent DOM / input / runtime operations -> update last-active timer
30-second cleanup -> close targets idle for five minutes
```

## Data Boundaries

- Browser pages are transient for search, fetch, and screenshot tools. Search windows are reused only by the search pool.
- DevTools targets are intentionally persistent and isolated from search windows.
- SQLite stores activity, API keys, durable reference links, and usage counters. It is not the content cache.
- Tool-result caches are in memory, bounded and time-limited. They reset at process restart.
- Route circuit-breaker, scheduler-profile, and engine-attempt snapshots are JSON files under `.cache/`.

## Dependency Direction

The search-driver registry is deliberately dependency-free:

```text
config ------> engines
browser -----> engines
search ------> engines
mcp-server --> engines
```

`src/engines/index.js` must not import `search.js`, `browser.js`, or `config.js`. The browser reads route metadata from the registry rather than keeping another backend map.

## Error Model

- Tool handlers return MCP errors as text payloads or JSON-RPC errors where transport validation fails.
- A failed search route opens only that route's circuit. Other routes remain available.
- Local browser infrastructure failures do not poison a route circuit.
- Tool errors are redacted and appended to `logs/tool-errors.log` when `LOG_TOOL_ERRORS=1`.
- Request/route telemetry remains visible through `/stats` and the console even after a handled failure.
