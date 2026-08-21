# MCP and HTTP API

## MCP Transport

`src/mcp-server.js` supports two transports.

| Transport | Enablement | Use |
|---|---|---|
| stdio | `ENABLE_STDIO_MCP` | A local MCP client starts `node src/mcp-server.js` |
| Streamable HTTP | `ENABLE_HTTP_MCP=1` | Clients connect to `POST /mcp` |

HTTP supports both stateless JSON-RPC calls and session-based Streamable HTTP. Session POST requests must carry the exact `Mcp-Session-Id` returned by their transport. The server sends raw SSE comment frames every 30 seconds to keep idle session streams alive without generating JSON-RPC notifications.

## Web Tools

The complete per-tool input/output contract is in [Tool Reference](tool-reference.md).

| Tool | Input modes | Core behavior |
|---|---|---|
| `web_search` | `queries`, `limit`, `engine`, `bypassCache` | Runs explicit routes or automatic fallback search |
| `web_fetch` | `urls` or `ref_ids`, `maxChars`, `bypassCache` | Opens pages and returns readable text with tables and numeric markdown references |
| `web_page_screenshot` | URL/ref input or persistent `targetId`, `quality`, `fullPage` | Captures a JPEG screenshot; storage output depends on config |
| `web_page_links` | link `ref_ids` | Resolves inline link references from a prior fetch |
| `web_page_ascii` | URL/ref input, `width`, `fullPage`, `mode` | Produces ANSI or plain ASCII from a real screenshot plus DOM legend |

Tools can be hidden and rejected by `DISABLE_TOOLS`. API keys with an allowed-tool list see and call only their permitted tools.

## DevTools Tools

The server also exposes persistent browser tools (unless `ENABLE_DEVTOOLS_MCP=0`):

- Targets: `Target.createTarget`, `Target.getTargets`, `Target.closeTarget`
- Navigation: `Page.navigate`, `Page.reload`, `Page.goBack`, `Page.goForward`
- Runtime/network: `Runtime.evaluate`, `Runtime.getConsoleMessages`, `Network.getRequests`
- DOM: `DOM.getDocument`, `DOM.querySelector`, `DOM.querySelectorAll`, `DOM.getOuterHTML`, `DOM.getCompactHTML`, `DOM.scrollIntoViewIfNeeded`
- Input: `Input.dispatchMouseEvent`, `Input.insertText`, `Input.dispatchKeyEvent`

See [Browser Runtime](../architecture/browser-runtime.md) for target lifetime and the [Source Map](../reference/source-reference.md) to locate dispatch code.

## HTTP Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/`, `/health` | GET | Lightweight liveness, browser state, VNC state, page limiter, and circuit breakers |
| `/stats` | GET | Memory, browser instances, caches, counters, request rates, scheduler and activity summary |
| `/stats/activity` | GET | Incremental SQLite activity feed; use independent `since` and `sinceOps` cursors |
| `/stats/activity-trend` | GET | Bucketed request/engine trend for `minutes`, `hour`, `day`, or `week` |
| `/mcp` | POST/GET/DELETE | Stateless and session-based MCP transport |
| `/search`, `/extract`, `/screenshot` | GET | Human-friendly HTTP wrappers around core browser operations |
| `/download/:id` | GET | Temporary screenshot download when enabled |
| `/console/*` | GET/POST/PUT/DELETE | Management UI, config, logs, keys, hints, and console MCP proxy |

## Cache Behavior

`web_search` and `web_fetch` responses are cached in process memory for five minutes, up to 200 entries per tool.

- `bypassCache=true` skips lookup and refreshes the cached result.
- `web_fetch` excludes `maxChars` from its cache key; a cached entry retains the length requested by its first caller, up to 200,000 characters.
- Caches are not shared between processes and reset on restart.

## Reference IDs

References make fetch output navigable without repeating long URLs.

1. A fetched page gets a numeric reference ID.
2. Every extracted link is assigned a numeric ID through `rememberLink()`.
3. Markdown link destinations are rewritten from URLs to IDs: `[documentation](88)`.
4. `web_page_links(ref_ids: [88])` resolves an inline link reference.
5. `web_fetch(ref_ids: [88])` resolves that link and fetches it.

The in-memory maps are bounded to 2,000 entries. `ref_links` in SQLite preserves URL-to-ID mappings across restarts.

## Authentication

HTTP MCP can be open for local use or require a key.

- Set `MCP_ALLOW_UNAUTHENTICATED=0` to require authentication.
- Supply `Authorization: Bearer <key>` or `X-API-Key: <key>`.
- Comparisons use `timingSafeEqual`.
- Persisted API keys and tool allow-lists are managed through the console API and stored in SQLite.

The web console itself is not protected by MCP API keys. Put it behind a trusted network or reverse proxy when exposed.
