# Architecture

How Navigator works internally — module structure, data flow, and design decisions.

## Process Layout

```
MCP Client / HTTP Caller
        │
        ▼
┌─────────────────────────────────────┐
│       src/mcp-server.js             │
│  Tool schemas, dispatch, sessions   │
│  HTTP routes, cache, console APIs   │
└─────────┬───────────────────────────┘
          │
          ├──── web_search ────► src/search.js ──► src/engines/*
          │                         │
          ├──── web_fetch ─────► src/search.js ──► browser + extraction
          │                         │
          ├──── screenshots ────► browser runtime
          │
          └──── DevTools ──────► src/devtools.js ──► persistent targets
```

## Module Responsibilities

| Layer | Files | What it does |
|-------|-------|-------------|
| Server | `src/mcp-server.js` | MCP schemas, dispatch, HTTP, sessions, cache |
| Browser | `src/browser.js` | Launch/connect, backend selection, page slots |
| Search | `src/search.js`, `src/engines/` | Query execution, fallback, route health |
| Extraction | `src/search.js`, `src/domain-hints.js` | Navigation, stabilization, text/table/link extraction |
| DevTools | `src/devtools.js` | Persistent browser tabs, CDP tools |
| State | `src/db.js`, `src/config.js` | SQLite, configuration, API keys |

## Browser Backends

| Backend | Implementation | Use case |
|---------|---------------|----------|
| `chromium` | Puppeteer Chromium | Standard rendering |
| `cloakbrowser` | CloakBrowser | Anti-bot fingerprinting |
| `lightpanda` | Lightpanda CDP | Lightweight, shared pool |

### Backend Selection

1. **Search routes** — each route has a fixed backend
2. **Direct operations** (`web_fetch`, screenshots) — use `BROWSER_BACKEND` config
3. **DevTools** — use `DEVTOOLS_BROWSER_BACKEND` config

## Search Flow

```
web_search query
    │
    ▼
Cache lookup (5min TTL)
    │
    ▼ (miss)
Scheduler ranks routes
    │
    ▼
Driver.search() or Driver.submit() + extract()
    │
    ▼
Normalize URLs, deduplicate
    │
    ▼
Cache + format MCP text
    │
    ▼
Return results
```

### Circuit Breakers

Each route has a circuit breaker:

- **Closed** — healthy, accepting requests
- **Open** — failed, in cooldown (default 5 minutes)
- **Half-open** — cooldown expired, testing with a probe

### Engine Scheduler

Persists per-route health in `.cache/search-engine-profiles.json`:

- Success rate
- Result yield
- Median latency
- Recent stability
- Failure penalty
- Recovery score

## Extraction Flow

```
web_fetch URL/ref_id
    │
    ▼
Cache lookup
    │
    ▼ (miss)
Load domain hints
    │
    ▼
Open page, navigate, stabilize
    │
    ▼
Serialize HTML + browser text + SEO
    │
    ▼
Extract text (Readability > candidates > body)
    │
    ▼
Extract tables (structured, span-expanded)
    │
    ▼
Extract links (absolute, deduped)
    │
    ▼
Remember refs, rewrite markdown links
    │
    ▼
Cache + format MCP text
```

### Text Selection Order

1. **Domain Hint Flow** — interactive multi-step extraction
2. **Domain Hint Blocks/Sections** — targeted CSS selectors
3. **Readability** — Mozilla algorithm
4. **Candidate Blocks** — semantic containers
5. **Body Text** — final fallback

### Stabilization

| Strategy | How it works |
|----------|-------------|
| `network_idle` | Wait for 500ms of no network activity |
| `content_idle` | Poll text length until stable |
| `mutation` | MutationObserver-based |
| `none` | Skip stabilization |

## Data Storage

### SQLite (`data/navigator.db`)

WAL mode, 7-day retention, hourly pruning:

| Table | Contents |
|-------|----------|
| `searches` | Query, routes, status, timing |
| `engine_attempts` | Per-route attempt, outcome |
| `page_ops` | Fetch, screenshot telemetry |
| `api_keys` | Named secrets, tool allow-lists |
| `ref_links` | URL-to-reference-ID mappings |

### In-Memory

- Tool result cache (5min TTL, 200 entries per tool)
- Request log (20,000 entries)
- Activity counters (reset on restart)

## HTTP Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Liveness check, browser state |
| `/stats` | Memory, instances, counters |
| `/mcp` | MCP transport (POST/GET/DELETE) |
| `/search` | Human-friendly search wrapper |
| `/extract` | Human-friendly extraction wrapper |
| `/screenshot` | Human-friendly screenshot wrapper |
| `/console/*` | Management UI |

## Design Principles

1. **Real browser** — Always use a real Chromium browser, never mock
2. **Graceful degradation** — Partial results beat no results
3. **Circuit breakers** — Fail fast, recover gradually
4. **Reference IDs** — Avoid URL resolution overhead
5. **Domain hints** — Let users teach the system
6. **SQLite for durability** — Activity logs and keys survive restarts
7. **In-memory for speed** — Caches and counters are ephemeral

## Next Steps

- [Changelog](/changelog) — Version history
