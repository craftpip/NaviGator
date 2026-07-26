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
- `maxTableRows: number` (optional) — Maximum number of rows per extracted table

**Output:** Per-item success/error with SEO metadata. Tables are always extracted and appended as clean pipe-separated tables. Links are always extracted but not shown in the output — use `web_page_links(ref_id)` to inspect them. The LLM calls `web_fetch(ref_id: link_ref_id)` to visit a link.

---

### `web_page_links`

Lists links extracted from a previously fetched page. Given a page's `ref_id` (from `web_fetch` output), returns the extracted links with their link ref_ids. Links are already shown inline in `web_fetch` output — this tool is a convenience for re-listing them without re-fetching the page.

**Input:**
- `ref_id: number` — Page ref_id from a prior `web_fetch` call

**Output:** `- text — [ref_id]` lines for each extracted link.

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

### `web_page_ascii`

Captures a webpage as annotated ASCII wireframe art with numbered element markers and a selector legend.

**Input:**

- `url: string` — Single URL
- `ref_id: number` — Numeric reference from a prior `web_search`
- `width: number` (default `100`) — ASCII art width in characters (40–200)
- `elementLimit: number` (default `25`) — Maximum number of elements to annotate
- `includeSelector: boolean` (default `true`) — Include CSS selectors in the legend
- `includeXpath: boolean` (default `true`) — Include XPaths in the legend

**Output:** Annotated ASCII wireframe + element legend (markdown).

---

## Code References

### MCP Tool Definitions

All tool schemas are defined in `getToolsListResponse()`:

| Tool | File | Lines |
|------|------|-------|
| `web_search` | `src/mcp-server.js` | 916–948 |
| `web_fetch` | `src/mcp-server.js` | 949–979 |
| `web_page_screenshot` | `src/mcp-server.js` | 980–1027 |
| `web_page_links` | `src/mcp-server.js` | after web_page_screenshot |
| `web_page_ascii` | `src/mcp-server.js` | 1028–1065 |
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
| `src/ascii.js` | ASCII wireframe transformer — `generateWireframe()`, `formatLegend()`, `transform()` |
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

### Running tests

All tests run inside the container only:
```bash
docker compose exec browser-search-mcp npm install --include=dev   # First time only
docker compose exec browser-search-mcp npx vitest run              # Run all tests
docker compose exec browser-search-mcp npx vitest run tests/mcp-server.test.js  # Single file
```

---

## Known Issues

- SSE streams die after ~5 min if there is no keepalive traffic. The MCP SDK writes to SSE only when there is actual JSON-RPC data. Any idle connection gets killed by TCP keepalive, Docker networking, or upstream proxies. Fixed with 30s SSE comment keepalive (`: keepalive\n\n`) written directly to each active stream controller via `_streamMapping`, HTTP server timeouts (`keepAliveTimeout: 300s`, `headersTimeout: 300s`, `timeout: 0`), and `retryInterval: 30000` on the transport. The SDK's `StreamableHTTPServerTransport` wraps `WebStandardStreamableHTTPServerTransport` — the internal `_streamMapping` holds all active SSE controllers (standalone GET and POST response streams). SSE comments are ignored by spec-compliant clients but keep TCP/proxy idle timers alive.

## Domain Hints Workflow

Creating extraction hints for a website is an iterative process. One site at a time, one page type at a time.

### Routine (per page type)

1. **Open the page in a persistent browser tab:**
   `browser_Target_createTarget(url: "https://example.com/page")`

2. **Take a low-quality screenshot:**
   `browser_web_page_screenshot(targetId: "<id>", quality: "low")`
   See what the page looks like visually — what content matters, what's noise.

3. **Inspect the DOM document structure:**
   `browser_DOM_getDocument(targetId: "<id>", limit: 30-40)`
   Identifies structural elements, their selectors, xpaths, text, and visibility.

4. **Get outerHTML of key content containers:**
   `browser_DOM_getOuterHTML(targetId: "<id>", selector: "main"/".content"/"div.h-card", maxChars: 5000-10000)`
   Gets raw HTML of specific sections you identified in step 3.

5. **Query specific elements to verify selectors:**
   `browser_DOM_querySelectorAll(targetId: "<id>", selector: "ol.js-pinned-items-reorder-list li")`
   Confirms selector matches and captures actual text content.

6. **Test without hints first:**
   `curl "http://localhost:3000/extract?url=https://example.com/page&maxChars=2000"`
   See what the current fallback (Readability/candidate blocks) produces.

7. **Write the hint in `domain-hints.json`:**
   ```json
   {
     "domain": "example.com",
     "pathPattern": "/page-type",
     "pageType": "type-name",
     "comment": "What this page type is.",
     "waitForSelector": "selector-for-dynamic-content",
     "navigationWait": 2000,
     "preferReadability": true,
     "content": {
       "sections": [
         { "selector": "div.content-area", "label": "Content", "priority": "high" },
         { "selector": "aside.sidebar", "label": "Sidebar", "priority": "medium" }
       ]
     }
   }
   ```

  **Content type hint in selector comment:** Mention what the selector targets — single text (one line), list (multiple items), mixed (text block, multi-line).

  **Rule of thumb for section selectors:**
   - Selectors must NOT overlap — one element should not be a child of another selected element.
   - `high` priority sections always included. `medium` sections included only if they have 50+ chars of text.
   - `low` sections are available but currently unused (reserved for future).
   - Use `preferReadability: false` when the page has sidebar/navigation content that Readability strips.
   - Select ONLY the container that has the useful content. Exclude UI elements: buttons, block/report forms, follow buttons, empty tables, achievement badges, "Learn more" links, form labels, sticky bars.
   - For profile sidebars: prefer `div.js-profile-editable-area` (bio + stats + details) over `div.h-card` (includes block/report noise). Add separate sections for name (`h1.vcard-names`) and status (`div.user-status-message-wrapper`) if needed.
   - For lists of items: select the `<ol>` or `<ul>` container directly (e.g., `ol.js-pinned-items-reorder-list`). The extraction code auto-detects `<ol>/<ul>` and renders each `<li>` as a separate block with a blank line between items.
   - For single text items: use the most specific container (e.g., `h1.vcard-names`, `div.p-note`). These are rendered as flat list lines.

8. **Deploy and test:**
   ```bash
   docker cp /workspace/src/search.js browser-search-mcp:/app/src/search.js
   docker cp /workspace/src/mcp-server.js browser-search-mcp:/app/src/mcp-server.js
   docker cp /workspace/domain-hints.json browser-search-mcp:/app/domain-hints.json
   docker restart browser-search-mcp
   sleep 8
   curl "http://localhost:3000/extract?url=https://example.com/page&maxChars=2000"
   ```

9. **Compare output with screenshot:**
   - Is all important content present?
   - Is there noise that should be excluded?
   - Is the formatting clean (markdown lists for sections)?
   - Are tables extracted properly?

10. **Tune and repeat** until output is clean. Then move to the next page type for the same domain, then the next domain.

### Known pitfalls

- `cleanAndTruncateText` used to call `cleanWhitespace` which collapsed newlines with `\s+`. Now uses `[^\S\n]+` to preserve newlines. If section output appears as a single run-on line, check that the fix is deployed.
- Sections path and fallback path are exclusive — if sections produce any output, Readability/candidate blocks are skipped entirely.
- `waitForSelector` waits for the selector to appear in the live DOM before extracting the HTML snapshot. If content loads after the wait (e.g., Turbo frames), increase `navigationWait`.
- The `/extract?url=` endpoint is for quick testing. The actual MCP `web_fetch` tool goes through the same `browserOpenAndExtract()` path.
- **Selectors must not overlap** — one selected element should not be a child of another. Otherwise content appears in multiple sections.
- **Noisy content** comes from UI elements inside a selected container (buttons, modals, block/report forms). Use the most specific selector possible that excludes these. If `div.h-card` includes block/report UI, use `div.js-profile-editable-area` instead. If a Follow button is inside the profile area, check if a more specific container excludes it.
- **Empty tables** (all body cells empty or whitespace-only) are now filtered out via `hasDataContent` check in `extractTablesFromDocument`. Tables must have at least one body cell with >2 chars of text content.
- **Short values** like "7" (following count) can be lost because `uniqueLines` filters lines with `length < 3`. To preserve them, the parent element should be selected so the full text (e.g., "116 followers · 7 following") stays together.
- **Duplicated content across page states** (e.g., desktop + mobile versions of the same section) causes duplicate lines. `uniqueLines` filters exact duplicates, but different text content passes through. Use a selector that targets only one state when possible (e.g., prefer `div.user-status-container:not(.d-md-none)` over the classless version).
- **Smart hints, not smart code.** Do NOT add auto-detection logic (list detection, content type detection) in search.js. Formatting decisions belong in the hint — choose precise selectors that naturally produce clean output. The section extraction code stays simple: textContent → lines → dedup → render as flat list items.
- **Link reference IDs** are shown in metadata as `Links: N (use web_page_links(ref_id: N) to list)`. The page ref_id `[N]` in each entry title lets the LLM call `web_page_links(ref_id: N)` to explore links with their own ref_ids, then `web_fetch(ref_id: link_ref_id)` to visit.
- **test without the hints first** as step 6 before writing the hint to see what's missing.
- **Path pattern matching:** `/*` means one segment (`/foo`), `/*/*` means two segments (`/foo/bar`), `/**` means everything. Uses `compileGlob` which converts `*` to `[^/]*`. The special case for `/*` was removed — it now uses `compileGlob` like everything else.
- **Hint matching is first-match:** The first hint that matches wins. List hints from most specific to least specific (profile before repo, then issues, etc.). GitHub entries are ordered: profile (`/*`), repo (`/*/*`), issues (`/*/*/issues`), prs (`/*/*/pulls`).
- **GitHub selector stability:** GitHub uses React + Turbo and CSS-module classes change per build. Use stable selectors like `h1.vcard-names`, `div.js-profile-editable-area`, `ol.js-pinned-items-reorder-list`, `article.markdown-body`, `li[role="listitem"]` (issues/PRs list). Avoid CSS-module class names. For repo pages, `article.markdown-body` is inside Turbo + React, so wait for it specifically.

---

## Fix Patterns

- When debugging extraction issues, use the browser devtools (`browser_Target_createTarget`, `browser_Runtime_evaluate`, `browser_DOM_getDocument`, `browser_web_fetch`) to inspect the live page and test Readability's output directly in the browser. Do NOT guess by reading code — the browser tools are faster and show the actual runtime state.
- Before modifying `NON_CONTENT_SELECTORS`, check whether removing semantic elements like `header`/`footer` could strip page content. These elements commonly hold real content on portfolio and personal sites. Let Readability handle them naturally instead of pre-removing them.

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

---

### Link Extraction — Always On, Compact Format

**Created:** 2026-07-25

**What:** Links are always extracted but never shown in `web_fetch` output. They are stored in `pageLinksByPageRef` and accessible only via `web_page_links(ref_id)`. There is no `extractLinks` flag — extraction is automatic but invisible.

**Why:** Keeps `web_fetch` output clean and focused on page text content. The LLM calls `web_page_links(page_ref_id)` when it needs to explore links.

**Key changes:**
- `src/search.js` — `browserOpenAndExtract()` always calls `extractLinksFromHtml()`. Removed `extractLinks` parameter.
- `src/mcp-server.js` — `openTargetsParallel()` registers links with `rememberLink()` and stores them in `pageLinksByPageRef`. No `## Links` appended to text output.
- `src/mcp-server.js` — Removed `extractLinks` from `web_fetch` schema.
- `linkMemoryByRef` / `linkMemoryByUrl` store the URL mapping, so `web_fetch(ref_id: link_ref_id)` resolves correctly.
- `pageLinksByPageRef` stores `{ ref_id, url, text }` per page (used by `web_page_links` tool).

**Flow:**
1. `web_fetch(url: "...")` → clean text + tables (no links in output)
2. `web_page_links(ref_id: <page_ref_id>)` → lists links with `- Circulars — [4]`, `- RSS Feed — [5]`, ...
3. `web_fetch(ref_id: 4)` → fetches the Circulars page

**Verified on:** NSE India option chain (255 links, no prices in link output, web_fetch link resolution works end-to-end)

---

### Table Extraction — Always On, No Flag

**Created:** 2026-07-25

**What:** There is no `includeTables` flag. `web_fetch` always extracts tables from the HTML via JSDOM and appends them as clean pipe-separated structured tables (`### Table N`). The Readability text is used as the base (it naturally strips inline tabular content), so raw tab-separated table noise is eliminated.

**Why:** The raw SEO text (browser `innerText`) always contains table data as tab-separated noise (106+ rows for NSE). There is no point in letting that noise through raw when we can always parse it into a clean format. Removing the flag simplifies the API — the LLM never needs to decide whether to include tables.

**Key changes:**
- Removed `includeTables` parameter from `web_fetch` schema, `handleToolCall`, `openTargetsParallel`, and `browserOpenAndExtract`.
- `selectedText` always uses `extracted.text` (Readability text) as the base — avoids raw tabular data while keeping article content.
- `extractTablesFromDocument()` always runs and `insertTablesInline()` always appends structured tables.
- `maxTableRows` kept as an optional param for limiting row count per table.

**Flow:**
1. `web_fetch(url)` → Readability text + `### Table N` (pipe-separated)
2. No raw tab-separated noise. No flags needed.

**Verified on:** NSE India option chain (0 tab rows in output, clean structured table)

---

---

### ASCII Screenshot — Wireframe Approach

**Created:** 2026-07-25

**What:** The ASCII screenshot tool (`src/ascii.js`) renders a **structural wireframe** — boxes made of `─│┌┐└┘` characters with text labels inside. NOT photographic ASCII art (`$$$`, `@@@` character ramps). The user explicitly rejected pixel-to-character conversion.

**Architecture:**
- `src/ascii.js` — Pure transformer: takes element positions + viewport dims, returns wireframe + legend. Zero browser dependency.
- `scripts/ascii-screenshot.js` — Temporary CLI harness: opens page in browser, extracts elements with scroll offset, filters to viewport, calls transformer.
- `src/mcp-server.js` — Future consumer (Phase 2 integration).

**Key decisions:**
- Use `window.scrollX`/`scrollY` offset in element extraction so positions are document-relative, not viewport-relative.
- Filter elements to viewport only (with 50px margin) — off-screen elements clutter the wireframe.
- Box overlap handling: track cell ownership (`owner` array). First box's borders take priority; adjacent boxes share borders naturally.
- Wireframe height capped at 200 rows max. Use viewport height for scaling (compact output).
- Text inside boxes: `[N]` marker on first interior line, `<tag> text` on second line. Truncate with available width.
- `eval()` required for code strings in `page.evaluate()` — `new Function()` doesn't serialize through puppeteer.

**Files:**
- `src/ascii.js` — exports `generateWireframe()`, `formatLegend()`, `transform()`
- `scripts/ascii-screenshot.js` — CLI harness with `ELEMENT_EXTRACT_CODE` (content-priority extraction)
- `ASCII screenshot.md` — Full plan with research findings

**Verified on:** example.com, Hacker News, Wikipedia, GitHub Trending

---

### Truncation Indicator for web_fetch

**Created:** 2026-07-26

**What:** When `web_fetch` output exceeds `maxChars`, a truncation note is appended at the end of the text.

**Why:** Previously, the LLM had no way to know when content was truncated. The article text was truncated to `maxChars`, but tables (extracted separately) could push the total output far beyond `maxChars` with no indicator.

**Implementation (Option B — awareness only):**
- `src/search.js:2175-2177` in `browserOpenAndExtract()` — after `insertTablesInline()`:
  ```js
  if (maxChars && finalText.length > maxChars) {
    finalText += `\n\n*(Response truncated — increase maxChars to see more)*`;
  }
  ```
- No re-truncation of the output — just appends the note when the total exceeds `maxChars`.
- The note uses `*(italic)*` markdown so LLMs notice it naturally.

**Trade-off:** Tables can still exceed `maxChars` (no re-truncation), which is intentional — this is the less-breaking approach. If re-truncation is needed later, the check is already in place.

---

### Website Exploration for Extraction Design

**Created:** 2026-07-25

**Status:** In progress — ~50 websites across 13 categories in `websites/` directory. See `websites/` for individual entries. 22 news sites explored (14 Indian + 8 global) with DOM inspection written to `websites/news.md`. GitHub (Profile, Repo, Issues, PRs), HN, Wikipedia, Stack Overflow, Dev.to, npm, freeCodeCamp also explored in `websites/developer.md` and `websites/reference.md`.

**Key lesson (2026-07-25):** Write findings to the file immediately after each site exploration, not in batches. Earlier explorations (India Times, HT, Aaj Tak, etc.) were batch-processed and lost from context during compaction before being saved. Only later edits (BBC, CNN, Guardian, Al Jazeera) were saved immediately after each site. File edits persist through compaction; in-memory context does not.

**What we're doing:** Inspecting real websites' DOM structure to understand how content is laid out, so we can design a general-purpose extraction tool. We are NOT using `web_fetch` (the tool we're building) to do this — that would be circular.

**Site exploration routine (exact steps):**

For each site:

1. **Open page in a persistent browser tab:**
   ```
   browser_Target_createTarget(url: "https://example.com/page")
   ```
   This uses a real Chromium browser (cloakbrowser backend) and renders JS.

2. **Take a low-quality screenshot:**
   ```
   browser_web_page_screenshot(targetId: "<id>", quality: "low")
   ```
   To see what the page actually looks like visually.

3. **Inspect the DOM document structure:**
   ```
   browser_DOM_getDocument(targetId: "<id>", limit: 30-40)
   ```
   Gets all important elements, their selectors, xpaths, text, and visibility. This shows the structural outline of the page.

4. **Get outerHTML of key content containers:**
   ```
   browser_DOM_getOuterHTML(targetId: "<id>", selector: "main" (or specific class/id), maxChars: 5000-10000)
   ```
   Gets the raw HTML of main content areas. Pick selectors based on step 3 (e.g., `main#content`, `article.markdown-body`, `turbo-frame#user-profile-frame`).

5. **Run JS to get page-level stats:**
   ```
   browser_Runtime_evaluate(targetId: "<id>", expression: "JSON.stringify({...})")
   ```
   Things to measure:
   - `document.title` — page title
   - `document.querySelectorAll('a').length` — total link count
   - `document.querySelectorAll('script').length` — script count (JS heaviness)
   - Presence of key frameworks: `!!document.querySelector('turbo-frame')` (Turbo), `!!document.querySelector('react-app')` (React)
   - Content availability: `document.querySelector('article')?.innerText?.substring(0, 200) || 'none'`

6. **Close the tab:**
   ```
   browser_Target_closeTarget(targetId: "<id>")
   ```

7. **Write findings to the corresponding file in `websites/` directory:**
   - Update the extraction table (SEO, Readability, Tables, Links, Screenshot columns)
   - Document the DOM structure (use indented code blocks with `├──` tree)
   - Note page-level stats (link count, script count, framework usage)
   - Note quirks (SPA, bot protection, timing issues, etc.)
   - Describe how extraction SHOULD work for this site (which strategy fits)

**Things to look for:**
- Is the site server-rendered or SPA? Check script count + presence of React/Turbo/Vue
- Is there a timing issue? Does content appear immediately or after JS?
- Is there bot protection? (Cloudflare, etc.)
- Are there semantic HTML elements? (`<article>`, `<main>`, `<nav>`, `<table>`)
- Are there microdata/structured data attributes? (schema.org `itemprop`, RDFa)
- What are the useful CSS selectors for content areas?
- What content should be excluded? (nav, footer, sidebar, ads)
- How many links are there and what fraction are useful vs. navigation?
- What kind of tables and are they useful content or layout/nav?

**Categories to explore (13 files in `websites/`):**
1. `developer.md` — GitHub (profile, repo, issues, PRs), Stack Overflow, HN, Dev.to, daily.dev, npm, freeCodeCamp
2. `finance.md` — NSE India (done), Moneycontrol
3. `news.md` — NDTV, India Times, Hindustan Times, Aaj Tak, The Hindu, Indian Express, The Quint, News18, ABP Live, Firstpost, The Print, Scroll, Deccan Herald, The Tribune
4. `business-news.md` — Livemint, Business Standard, Financial Express, Economic Times
5. `weather.md` — Weather.com, AccuWeather, BBC Weather, Windy, IMD, OpenWeatherMap, timeanddate, Skymet
6. `ecommerce.md` — Amazon India, Flipkart
7. `social.md` — Reddit, LinkedIn
8. `sports.md` — Cricbuzz
9. `food-travel.md` — IRCTC, Zomato, Swiggy
10. `ai-chat.md` — ChatGPT, Claude AI
11. `video.md` — YouTube
12. `reference.md` — Wikipedia
13. `README.md` — Category index / legend
