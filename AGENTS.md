# Agents

> A Model Context Protocol (MCP) server that provides web search, page extraction, and screenshot capabilities using a real Chromium browser.

## Table of Contents

- [Tool Contract](#tool-contract)
- [Agent Flow](#agent-flow)
- [Configuration](#configuration)
- [Development](#development)
- [Known Issues](#known-issues)
- [Fix Patterns](#fix-patterns)
- [Project Learnings](#project-learnings)

---

## Tool Contract

### `web_search`

Performs broad web research using multiple search engines with automatic fallback and circuit-breaker logic.

**Input:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | — | Single search query |
| `queries` | `string[]` | — | Multiple query variants |
| `limit` | `number` | `5` | Results per query |
| `engine` | `enum` | `select_best` | Preferred engine: `duckduckgo_api`, `bing_lp`, `mojeek_lp`, `google_ch`, `duckduckgo_ch` |
| `engines` | `string[]` | — | Multiple engines to query in parallel |

**Output:** `results[]` containing `{ title, snippet, llmText, ref_id, link, url }`

---

### `web_fetch`

Opens pages and returns cleaned, readable text content.

**Input** (choose one mode):

- `url: string` — Single URL
- `urls: string[]` — Multiple URLs
- `ref_id: number` — Numeric reference from a prior `web_search`
- `ref_ids: number[]` — Multiple references
- `maxChars: number` (default `8000`) — Maximum characters per page

**Output:** Per-item success/error with SEO metadata.

---

### `web_page_screenshot`

Captures rendered page appearance as images.

**Input** (choose one mode):

- `targetId: string` — Target id from `Target.createTarget` to screenshot an existing persistent tab
- `url: string` or `urls: string[]`
- `ref_id: number` or `ref_ids: number[]`
- `format: 'png' | 'jpeg'` (default `'png'`)
- `quality: number` (default `75`) — JPEG quality (1–100)
- `fullPage: boolean` (default `true`) — Capture entire page

**Output:** `screenshotBase64` with page metadata.

---

## Code References

### MCP Tool Definitions

All tool schemas are defined in `getToolsListResponse()`:

| Tool | File | Lines |
|------|------|-------|
| `web_search` | `src/mcp-server.js` | 916–948 |
| `web_fetch` | `src/mcp-server.js` | 949–979 |
| `web_page_screenshot` | `src/mcp-server.js` | 980–1027 |
| Devtools tools (13) | `src/devtools.js` | 884–1062 |

### Tool Call Dispatch

| Handler | File | Lines |
|---------|------|-------|
| `handleToolCall()` — primary dispatcher | `src/mcp-server.js` | 1033–1182 |
| `handleDevtoolsToolCall()` — devtools dispatcher | `src/devtools.js` | 1064–1079 |
| `CallToolRequestSchema` handler (session mode) | `src/mcp-server.js` | 1250–1261 |
| `handleStatelessMcpPost()` (stateless HTTP) | `src/mcp-server.js` | 1212 |

### MCP Server Setup

| Component | File | Lines |
|-----------|------|-------|
| `createMcpServer()` | `src/mcp-server.js` | 1230–1278 |
| HTTP transport (`maybeStartHttpServer`) | `src/mcp-server.js` | 1280–1673 |
| Stdio transport | `src/mcp-server.js` | 1775–1779 |
| Server startup | `src/mcp-server.js` | 1676–1684 |

### Key Implementation Files

| File | Purpose |
|------|---------|
| `src/mcp-server.js` | Main MCP server — tool definitions, dispatch, HTTP/stdio transport, SSE keepalive, caching, screenshot storage |
| `src/devtools.js` | Devtools tool definitions and handlers (CDP-based browser interaction) |
| `src/search.js` | `browserSearch()`, `browserOpenAndExtract()`, `browserCaptureScreenshot()` |
| `src/browser.js` | `BrowserManager`, page lifecycle, `newPage()` |
| `src/config.js` | `loadConfig()`, env var parsing |

---

## Agent Flow

1. Call `web_search` with the user's intent.
2. Select the best results using `results[].ref_id`.
3. Call `web_fetch` with the chosen `ref_id` or `ref_ids`.
4. Synthesize the answer from extracted text.

For visual verification, call `web_page_screenshot` with the same `ref_id`.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROME_PATH` | `/usr/bin/chromium` | Path to Chromium executable |
| `HEADLESS` | `true` | Run browser in headless mode |
| `BROWSER_BACKEND` | `cloakbrowser` | Default backend for non-search page creation. Allowed values: `cloakbrowser`, `chromium`, `lightpanda`. This is used by `web_fetch` and `web_page_screenshot`. |
| `BROWSER_OP_TIMEOUT_MS` | `60000` | Per-operation timeout |
| `SEARCH_ROUTE_WARMUP_ENGINES` | `duckduckgo_api,google_cb,google_lp,bing_lp,duckduckgo_cb,bing_cb` | Engines to warm up on startup |
| `SEARCH_ROUTE_CIRCUIT_OPEN_MS` | `300000` | Per-route cooldown after failure |
| `PRELAUNCH_BROWSER` | `1` | Prelaunch browser on server start |
| `ENABLE_HTTP_MCP` | `0` | Enable Streamable HTTP transport |

### Key Notes

- Reference memory is process-local and resets when the server restarts.
- Prefer `ref_id` / `ref_ids` immediately after a search within the same session.
- Sticky search windows are reused for performance.
- `BROWSER_BACKEND` is parsed in `src/config.js` into `defaultBackend`.
- `BrowserManager.newPage()` in `src/browser.js` uses `defaultBackend` only when no specific search engine override is passed.
- `web_fetch` calls `browserOpenAndExtract()`, and that opens pages with `manager.newPage({ backend: manager.config.defaultBackend })`.
- `web_page_screenshot` calls `browserCaptureScreenshot()`, and that opens pages with `manager.newPage({ backend: manager.config.defaultBackend })`.
- Search routes are different: when `newPage()` is called with an engine like `bing_lp`, `google_cb`, or `duckduckgo_ch`, the engine-specific route wins over `BROWSER_BACKEND`.
- Current engine-to-backend overrides in `newPage()` are: `*_cb` -> `cloakbrowser`, `*_ch` -> `chromium`, `*_lp` -> `lightpanda`.
- So the rule is simple: `BROWSER_BACKEND` controls direct page operations, but search-engine routes control search pages.
- Before adding or changing config, trace the existing variable through `loadConfig()`, `BrowserManager.newPage()`, and the actual call site first; do not invent a new env var or behavior until the current flow is verified end-to-end.

---

## Development

```bash
npm start                          # Run MCP server over stdio
npm run test:mcporter              # Test MCP integration
docker compose build               # Build Docker image
docker compose down && up -d       # Restart containers
```

---

## Known Issues

- SSE streams die after ~5 min if there is no keepalive traffic. The MCP SDK writes to SSE only when there is actual JSON-RPC data. Any idle connection gets killed by TCP keepalive, Docker networking, or upstream proxies. Fixed with 30s SSE comment keepalive (`: keepalive\n\n`) written directly to each active stream controller via `_streamMapping`, HTTP server timeouts (`keepAliveTimeout: 300s`, `headersTimeout: 300s`, `timeout: 0`), and `retryInterval: 30000` on the transport. The SDK's `StreamableHTTPServerTransport` wraps `WebStandardStreamableHTTPServerTransport` — the internal `_streamMapping` holds all active SSE controllers (standalone GET and POST response streams). SSE comments are ignored by spec-compliant clients but keep TCP/proxy idle timers alive.

## Fix Patterns

- When adding SSE keepalive to MCP transports, write SSE comment frames (`: keepalive\n\n`) directly to each stream controller via `transport._webStandardTransport._streamMapping` — do NOT use `notifications/message` through `transport.send()` as that creates real JSON-RPC traffic the client must process. Dead controllers throw on `enqueue()` and get cleaned up from the mapping.
- Always copy Map entries to an array before iterating if you plan to delete during the loop (`[...map.entries()]`).
- The `retryInterval` option on `StreamableHTTPServerTransport` sends an SSE `retry:` field telling clients when to reconnect. Without it, the client guesses or gives up.
- The MCP SDK's `server.ping()` sends a request _to_ the client and waits for a response — that is not a keepalive. SSE comments (lines starting with `:`) are the correct idle-traffic mechanism.
- **POST handler must use exact session ID match** (`mcpTransports.get(sessionId)`) — never `resolveTransport()` which falls back to any available transport. The SDK's `validateSession()` rejects requests where the session ID in the header doesn't match the transport's own session ID (returns 404), causing "Session terminated" errors and unnecessary reconnect loops.
- **Keepalive outer catch must NOT delete transports** — if `transport._webStandardTransport` throws during a close sequence, skip it instead of calling `mcpTransports.delete(sid)`. The SDK's own `onclose` handler will clean up when the session is truly dead.
- Container deploy flow: `docker compose build && docker compose down && docker compose up -d`. Never `npm install` on the host.

## Project Learnings

### SSE Keepalive and Stream Lifecycle

**Created:** 2026-07-15

Hermes agent reported browser tools disappearing after ~5 min. Container logs showed constant `🤝 MCP initialized` — the SSE stream was dying and the client kept re-initializing. The SDK's `StreamableHTTPServerTransport` has zero built-in keepalive. It only writes to SSE streams when there is actual JSON-RPC data to send. Between tool calls the connection is completely silent. Added a 30s `setInterval` that sends SSE comment frames (`: keepalive\n\n`) directly to each active stream controller via `transport._webStandardTransport._streamMapping`. This matches the approach in the upstream SDK PR (#1726) which adds a native `keepAliveInterval` option. SSE comments are spec-compliant idle traffic that keeps TCP/proxy timers alive without creating JSON-RPC messages the client must process. Also configured HTTP server timeouts (`keepAliveTimeout: 300s`, `headersTimeout: 300s`, `timeout: 0`) and `retryInterval: 30000` on the transport.

**SDK status check (2026-07-15):** Verified the `keepAliveInterval` feature is NOT in installed SDK 1.27.1 or latest available 1.29.0 — the `webStandardStreamableHttp.js` files are identical. The PR exists but hasn't shipped. Our manual implementation is the correct approach until the SDK ships it natively.

**Root cause discovered (2026-07-15):** Keepalive alone wasn't enough — sessions still died every ~6 minutes. The actual root cause was in `resolveTransport()` at line 1280: POST handler used the fallback chain (exact → `defaultMcpSessionId` → ANY transport), routing requests to the wrong transport. SDK's `validateSession()` returned 404 ("Session not found"), causing "Session terminated" → reconnect loop. The GET handler worked because it patched the header (line 1385-1386), but POST handler didn't. Additionally, the keepalive outer catch block was deleting transports from `mcpTransports` on `_webStandardTransport` access errors, permanently removing sessions. Fixed by: (1) POST handler uses exact-match `mcpTransports.get(sessionId)` instead of `resolveTransport()`, (2) outer catch skips instead of deleting. Verified 30+ minute session stability after both fixes.

### MCP HTTP Compatibility With Stateless Clients

**Created:** 2026-06-25
**Last updated:** 2026-06-25

**Trigger:** OpenCode reported the MCP server as down even though the container and `/health` endpoint were healthy.

**Mistake:** Verified only container health and search behavior. The real failure was in `/mcp` POST routing for stateless JSON-RPC clients.

**Root cause:** `src/mcp-server.js` reused an existing `StreamableHTTPServerTransport` for plain `POST /mcp` requests without an `Mcp-Session-Id`. That forced stateless clients onto a session transport and caused errors like `Mcp-Session-Id header is required` or `Not Acceptable`.

**Correct approach:**

1. Check `docker exec <container> curl -s localhost:3000/health` first.
2. Test stateless MCP directly with `curl` against `POST /mcp` using `tools/list` and `tools/call`.
3. Test real MCP session flow with an MCP SDK client or `mcporter`, not just direct module calls.
4. In `src/mcp-server.js`, only route POST requests through an existing streamable transport when the client explicitly sends `Mcp-Session-Id`.
5. After the fix, verify `web_search`, `web_fetch`, and `web_page_screenshot` through MCP using `url`, `urls`, and `ref_id` inputs.

**Verification:**

- `curl -s http://localhost:3000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` returns tool metadata.
- `npx --yes mcporter list local-browser-search --config <config>` succeeds.
- `npx --yes mcporter call local-browser-search.web_search ...` succeeds.
- `/health` ends with `pageLimiter.inUse: 0` after page and screenshot tests.

### Creating a GitHub Release with Proper Notes

**Created:** 2026-06-25
**Last updated:** 2026-06-25

**Trigger:** The first release tag was pushed with `generate_release_notes: true`, which produced only a changelog link instead of meaningful notes.

**Correct approach:**

1. Merge `dev` into `main` (fast-forward).
2. Tag the release: `git tag v<version> -m "<message>"`
3. Push the tag: `git push origin v<version>`
4. The workflow auto-creates a bare release — write proper notes immediately:
   ```bash
   gh release edit v<version> --notes-file - << 'NOTES'
   ## Title

   Write proper release notes with features, fixes, and a changelog link.
   NOTES
   ```
5. Alternatively, create the release from the CLI with full notes before the workflow runs.

**Release notes format:**

```
## Project Name vX.Y.Z

### Features
- Major capabilities

### What's Included
- What ships with the release

**Full Changelog**: <link>
```

**Verification:** `gh release view v<version>` returns full notes, not just a changelog link.

---

### Branch Switch & Docker Deploy Workflow

**Created:** 2026-06-13
**Last updated:** 2026-06-13

**Trigger:** User asked to check out a branch, build, and restart the container.

**Mistake:** Ran `npm install` on the host instead of using `docker compose build`. The project is fully containerized.

**Correct approach:**

1. `git checkout <branch-name>`
2. `docker compose build`
3. `docker compose down && docker compose up -d`
4. Verify: `docker exec <container> curl -s localhost:3000/health`

**Verification:** Health endpoint returns `{"ok":true}` with the expected backend and no open circuit breakers.

---

### Diagnosing Container Health

**Created:** 2026-06-11
**Last updated:** 2026-06-11

**Trigger:** User asked whether the containerized MCP server was working.

**Mistake:** Ran host-level diagnostics (`ps aux`, `journalctl`, `strace`) instead of Docker commands. The container was healthy; the real issue was open circuit breakers on all search routes.

**Correct approach:**

1. `docker ps -a` — Check container status.
2. `docker logs <container>` — Check runtime errors.
3. Read `docker-compose.yml` — Understand configuration.
4. `docker exec <container> curl -s localhost:3000/health` — Check health endpoint (includes circuit breaker status).
5. `docker exec <container> ps aux` — Check processes inside the container.

**Verification:** Health endpoint returns `{"browserConnected":true,"lightpandaConnected":true}`.

---

### Container Outbound Internet (DOCKER-USER iptables)

**Created:** 2026-06-11
**Last updated:** 2026-06-11

**Trigger:** All search engines timed out despite the host having internet. `curl` from inside the container returned `000`.

**Mistake:** Investigated code, circuit breakers, and iptables chains before checking basic container connectivity.

**Root cause:** The `DOCKER-USER` iptables chain had `RETURN` for RELATED/ESTABLISHED, a VPN subnet, and loopback, followed by a catch-all `DROP`. Outbound NEW connections from Docker bridge networks fell through to the DROP rule.

**Correct approach:**

1. `docker exec <container> curl -s --max-time 5 https://duckduckgo.com`
2. If that fails: `docker exec <container> curl -s --max-time 5 http://1.1.1.1`
3. On the host: `iptables -L DOCKER-USER -n -v`
4. Fix: `sudo iptables -I DOCKER-USER 4 -s 172.16.0.0/12 -j ACCEPT`

> **Note:** This fix is not persistent across reboots. Add it to a startup script.

**Verification:** `docker exec <container> curl -s --max-time 5 https://duckduckgo.com` returns HTTP 200.

---

### Docker Compose Comment Style

**Created:** 2026-06-26
**Last updated:** 2026-06-26

**Trigger:** User wanted the docker-compose.yml to be friendlier for first-time devs.

**Style rules:**

1. Group env vars by topic with section headers.
2. Put the 5-8 most commonly changed vars at the top with a "Most commonly changed" header.
3. Comments should be short and human — `name (port) — what it's for` pattern. No over-explaining or robotic phrasing.
4. Ports that are optional (VNC/noVNC) should be commented out with a single note explaining why you'd uncomment them.
5. Self-explanatory ports (MCP) need only a brief label comment like `# MCP port (3000) — where the server listens for tool calls`.
6. Consistent comment formatting across the file.

**Verification:** A dev can open the file and know which env vars to touch within 30 seconds.
