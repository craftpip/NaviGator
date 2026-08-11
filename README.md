# 🐊 NaviGator

[![CI](https://github.com/craftpip/navigator/actions/workflows/test.yml/badge.svg)](https://github.com/craftpip/navigator/actions/workflows/test.yml)
[![Docker](https://ghcr-badge.egpl.dev/craftpip/navigator/latest_tag?label=ghcr.io/craftpip/navigator)](https://github.com/craftpip/navigator/pkgs/container/navigator)
[![License](https://img.shields.io/github/license/craftpip/navigator)](LICENSE)

NaviGator gives your MCP client a real browser for:

- web search
- readable page extraction
- page screenshots
- optional browser-testing tools like tabs, DOM reads, console capture, click, scroll, and type

It is built for HTTP MCP first, which makes it easy to run once and connect many times. If your client needs to launch a local process, stdio is supported too.

## What Makes It Nice To Use

- Real browser-backed search instead of a thin scraper
- Multiple search engines and multiple browser/backend routes
- Route-level circuit breakers so one failing route does not poison every request
- A strong `web_fetch` tool that returns clean, readable content
- A screenshot tool that can return base64, a local file path, or a download link
- An optional devtools-style tool set for interactive browser testing
- Persistent browser sessions and profiles
- Optional VNC/noVNC access for interactive debugging

## Highlights

### Multi-engine search with route circuit breakers

This project is built to keep working even when one search route gets flaky.

- It supports multiple engines, including browser-backed and HTTP-backed routes
- It tracks route health separately
- When a route fails, it is temporarily opened in a circuit-breaker state instead of being hammered over and over
- Healthy routes can keep serving requests while unhealthy routes cool down
- Route health is visible from the `/health` endpoint

That makes the server much nicer for real use, especially in long-running HTTP deployments.

### Multiple search options inside the engine pool

This project does not depend on just one search path.

Depending on configuration, it can use a mix of:

- `duckduckgo_api`
- `bing_lp`
- `mojeek_lp`
- `google_ch`
- `duckduckgo_ch`
- and additional supported routes such as `bing_cb`, `duckduckgo_cb`, `google_cb`, and `google_lp`

That gives you flexibility when tuning for speed, resilience, compatibility, or anti-bot behavior.

### `web_fetch` is built for readable extraction

The web_fetch tool is one of the strongest parts of the project.

It does more than dump raw HTML. The extraction flow combines several methods:

- page navigation plus content settling, so extraction waits for meaningful content to appear
- DOM cleanup to remove noise like scripts, styles, popups, cookie banners, and obvious non-content areas
- Mozilla Readability for article-style extraction when possible
- a fallback semantic candidate scoring system that scores likely main-content blocks using things like text length, link density, heading density, depth, size, and position on the page
- SEO-aware snapshotting that captures headings, canonical URL, meta description, and the best main-content candidates

The final text prefers the richer main-content extraction when it beats the simpler article extraction.

So the output is usually much closer to what a person would want to read, not just what the DOM happened to contain.

### `web_page_screenshot` is designed for real LLM workflows

The screenshot tool started with base64 output, which is still supported, but large base64 blobs can waste tokens.

So the tool now supports better output modes too:

- base64 mode: useful when inline image data is acceptable
- path mode: the server stores the screenshot and returns a file path instead of base64
- link mode: the server stores the screenshot and returns a download URL instead of base64

Path mode is handy when the caller is on the same machine and can read the file directly.

Link mode is handy when the caller is remote and needs an HTTP URL to fetch the image.

You can enable these behaviors with:

- `ENABLE_SCREENSHOT_PATH`
- `ENABLE_SCREENSHOT_DOWNLOAD_LINK`

When either storage mode is enabled, the tool writes the screenshot to disk and avoids sending the full base64 payload back in the normal response.

### Lots of controls when you need them

The server is easy to start, but it also exposes a lot of tuning knobs for real-world use:

- browser backend selection
- engine selection and fallback behavior
- timeouts and navigation strategy
- browser profile persistence
- HTTP vs stdio transport
- screenshot storage behavior
- VNC/noVNC debugging
- concurrency and page operation limits

## Start Here

If you just want this working quickly, use the HTTP server setup below.

You will:

1. start the server with Docker
2. verify the health endpoint
3. point your MCP client at `http://127.0.0.1:3000/mcp`

## Recommended Setup: HTTP MCP Server

This is the best setup for most users.

### Requirements

- Docker
- Docker Compose

### Quick Start

1. Clone the repo:

```bash
git clone https://github.com/craftpip/navigator.git
cd navigator
```

2. Copy the example config:

```bash
cp .env.example .env
```

3. Start the server:

```bash
docker compose up --build -d
```

### Check That It Works

Run:

```bash
curl -s http://127.0.0.1:3000/health
```

You should see a JSON response with `"ok": true`.

### Web Console (live management panel)

The server hosts a live management console on the **same URL and port as the
MCP endpoint** — open it in your browser:

```text
http://127.0.0.1:3000/console
```

It shows the same data as `navigator.js monitoring` but live: browser drivers,
search engines and circuit breakers, runtime stats, recent errors, and the
parsed environment config (defaults / env / effective). The **Manage** tab
lists every supported env variable with its default, current `.env` value, and
live effective value, plus whether it hot-applies or needs a container
recreate. The **VNC** control opens the live browser screen via noVNC (the
display stack starts at boot when `ENABLE_VNC=1`; runtime enable/disable
ships in a later phase).

`/ui` and `/dashboard` are aliases. Disable with `ENABLE_WEB_CONSOLE=0`.

### Connect Your MCP Client

Use this MCP endpoint:

```text
http://127.0.0.1:3000/mcp
```

If your client is on a different machine, replace `127.0.0.1` with the server IP or hostname.

### Example HTTP MCP Config

Different clients use different config formats, but the important value is the MCP URL:

```json
{
  "mcpServers": {
    "browser-search": {
      "transport": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

## Alternative Setup: stdio

Use stdio when your MCP client wants to launch a local command directly.

### Local stdio with Node.js

Requirements:

- Node.js 20+
- Chromium installed locally, or `CHROME_PATH` set to a valid browser binary

Install dependencies:

```bash
npm install
```

Run the server:

```bash
npm start
```

Example client config:

```json
{
  "mcpServers": {
    "browser-search": {
      "command": "node",
      "args": ["/absolute/path/to/navigator/src/mcp-server.js"]
    }
  }
}
```

## Domain Hints

Some websites need special handling to extract content well. An SPA that loads content 8 seconds after page open, a site that uses web components instead of semantic HTML, or a login wall that has zero useful content — the default extraction pipeline may not handle these well.

The domain hints system lets you teach the extraction engine how to handle specific websites.

### How it works

When a page is fetched, the domain hints module checks its URL against a list of known hints. If a matching hint is found, the extraction pipeline adjusts its behavior accordingly.

Hints live in `domain-hints.json` at the project root. You can point to a different file with `DOMAIN_HINTS_PATH`.

### What a hint looks like

```json
{
  "domain": "en.wikipedia.org",
  "pathPattern": "/wiki/**",
  "comment": "Wikipedia navbox tables are layout noise, not content. Skip them.",
  "skipSelectors": [".navbox", ".navbox-styles"],
  "tableExtraction": "content",
  "contentSelectors": ["main#content"]
}
```

### Hint fields

| Field | Purpose |
|-------|---------|
| `domain` | The domain the hint applies to |
| `pathPattern` | Glob pattern for URL paths (`/**` for all, `/wiki/**` for specific sections) |
| `comment` | Shown in the extraction output — explains why the hint exists |
| `waitForSelector` | CSS selector to wait for before extracting (for SPAs that load content late) |
| `navigationWait` | Milliseconds to wait after page load before extracting |
| `skipSelectors` | CSS selectors for elements to remove before extraction (navboxes, popups, etc.) |
| `contentSelectors` | CSS selectors for the main content container (when `<main>` or `<article>` are missing) |
| `preferReadability` | Default `true`. Set to `false` to skip Readability and use SEO text instead |
| `tableExtraction` | `"enabled"`, `"disabled"`, or `"content"` (only extract tables in content area) |
| `flags` | Special behaviors: `authWall`, `visualOnly`, `paywall`, `botProtected`, `requiresChromium` |

### Flag behaviors

| Flag | What it does |
|------|-------------|
| `authWall: true` | Returns early with "Auth wall" error — no content to extract |
| `visualOnly: true` | Returns early with "Visual-only page, no text content" error |
| `paywall: true` | Notes that content may be behind paywall; extraction proceeds but may get partial content |
| `botProtected: true` | Notes that the page has bot protection that may block extraction |
| `requiresChromium: true` | Suggests using chromium backend (not enforced automatically) |

### How to add a hint

1. Open `domain-hints.json`
2. Add an entry with `domain`, `pathPattern`, and `comment`
3. Add the behavioral fields that fix extraction for that site
4. Restart the server or container

The `comment` field is shown in the extraction output so you always know which hint was applied.

### Currently shipped hints

The project ships with research-backed hints for 40+ websites across news, finance, weather, e-commerce, social, developer, and regional-language categories. See `archive/websites/` for detailed research on each site.

### Disable hints

To run without any hints, set `DOMAIN_HINTS_PATH` to an empty file or unset it:

```bash
DOMAIN_HINTS_PATH=/dev/null
```

---

## MCP Tools

This server always exposes the three main web tools below.

If `ENABLE_DEVTOOLS_MCP=1`, it also exposes a small browser-testing tool set with CDP-style names.

### `web_search`

Search the web with one or more browser-backed engines.

This tool is designed to work across a pool of engines and routes rather than relying on a single fragile path.

Example input:

```json
{ "query": "latest MCP news", "limit": 5 }
```

Also supports:

- `queries`
- `engine`
- `engines`

### `web_fetch`

Open a page and return cleaned readable text.

Under the hood it uses DOM cleanup, Mozilla Readability, and a semantic main-content scoring fallback so the result is usually much cleaner than raw page text.

Example input:

```json
{ "url": "https://example.com", "maxChars": 8000 }
```

Also supports:

- `urls`
- `ref_id`
- `ref_ids`

### `web_page_screenshot`

Capture a rendered screenshot of a page.

By default the tool can return base64 image data. If screenshot storage is enabled, it can instead return a local file path, a download link, or both, which is much friendlier for LLM workflows.

Example input:

```json
{ "url": "https://example.com", "format": "png", "fullPage": true }
```

Also supports:

- `urls`
- `ref_id`
- `ref_ids`

### Optional browser-testing tools

When `ENABLE_DEVTOOLS_MCP=1`, the server also exposes these tools:

- `Target.createTarget`
- `Target.getTargets`
- `Target.closeTarget`
- `Page.navigate`
- `Runtime.evaluate`
- `Runtime.getConsoleMessages`
- `DOM.getDocument`
- `DOM.querySelector`
- `DOM.querySelectorAll`
- `DOM.getOuterHTML`
- `DOM.scrollIntoViewIfNeeded`
- `Input.dispatchMouseEvent`
- `Input.insertText`

This mode is for browser testing and interactive automation, not broad web research.

Quick idea of the flow:

1. Create a tab with `Target.createTarget`
2. Inspect the page with `DOM.getDocument` or `DOM.querySelector`
3. Interact with `Input.dispatchMouseEvent` or `Input.insertText`
4. Read errors with `Runtime.getConsoleMessages`

## Main Configuration

The most important environment variables are:

- `ENABLE_HTTP_MCP`: enable HTTP MCP on `/mcp`
- `MCP_API_KEYS`: comma-separated API keys accepted by HTTP MCP
- `MCP_ALLOW_UNAUTHENTICATED`: set to `0` to require an API key on `/mcp`; default `1` keeps local deployments open
- `ENABLE_STDIO_MCP`: enable stdio transport
- `ENABLE_DEVTOOLS_MCP`: enable the optional browser-testing tool set
- `MCP_API_PORT`: HTTP server port, default `3000`
- `HEADLESS`: run browser headless or with UI
- `CHROME_PATH`: Chromium path for local installs
- `CHROME_USER_DATA_DIR`: persistent browser profile directory
- `CHROME_PROFILE_DIR`: Chrome profile subdirectory, default `Default`
- `PRELAUNCH_BROWSER`: prelaunch browser at startup
- `BROWSER_OP_TIMEOUT_MS`: browser operation timeout in milliseconds
- `BROWSER_BACKEND`: default backend for page operations
- `DEVTOOLS_BROWSER_BACKEND`: backend for the browser-testing tools; defaults to `BROWSER_BACKEND`
- `SEARCH_ROUTE_WARMUP_ENGINES`: browser routes to open and keep warm at startup
- `SEARCH_ENABLED_ENGINES`: routes eligible for automatic `select_best` scheduling
- `ENABLE_VNC`: enable VNC and noVNC in Docker

See `.env.example` for the full list (the pre-cleanup reference copy is kept at `.env.example.full`).

Create and revoke keys at `/console/keys`. MCP clients can send either
`Authorization: Bearer <key>` or `X-API-Key: <key>`. Keep the console behind a
trusted network or reverse-proxy access control; MCP API keys do not protect it.

## Docker Notes

The included `docker-compose.yml` is the easiest supported deployment path.

It gives you:

- HTTP MCP on port `3000`
- `/health` for quick checks
- devtools mode enabled by default for Docker
- persistent browser profile storage
- optional VNC and noVNC access

Stop the service:

```bash
docker compose down
```

Rebuild after changes:

```bash
docker compose up --build -d
```

## noVNC Access

When `ENABLE_VNC=1`, open one of these in your browser:

- `http://127.0.0.1:7900/vnc.html`
- `http://127.0.0.1:7901/vnc.html`

This lets you watch or interact with the same browser session used by the MCP tools.

## Troubleshooting
### `/health` does not respond

- Check that the container is running: `docker compose ps`
- Check logs: `docker compose logs`
- Make sure port `3000` is free

### Browser launch fails

- Verify Chromium exists at `CHROME_PATH` for local installs
- In Docker, keep `CHROME_PATH=/usr/bin/chromium`
- In restrictive environments, the default launch args already include no-sandbox flags

### Search requests fail sometimes

- Check `/health` for route circuit breaker status
- Increase `BROWSER_OP_TIMEOUT_MS` if the environment is slow
- Verify the container has outbound internet access

### A page never settles

- Use `NAV_WAIT_UNTIL=domcontentloaded`
- Increase `BROWSER_OP_TIMEOUT_MS`

### Keep sessions logged in

- Use a persistent browser profile directory
- In Docker, keep the `chrome_profile_data` volume
- Use `HEADLESS=false` with `ENABLE_VNC=1` if you want to log in once and reuse the session later

## Development

Run locally:

```bash
npm install
npm start
```

Test MCP integration:

```bash
npm run test:mcporter
```

## Releases

This repo uses semver tags and GitHub Releases.

To cut a release from `main`:

```bash
git checkout main
git pull
npm run release:patch   # or: npm run release:minor / npm run release:major
git push origin main --follow-tags
```

That will:

- update `package.json` and `package-lock.json`
- create a Git tag like `v1.0.1`

When the `v*.*.*` tag is pushed, GitHub Actions automatically publishes a GitHub Release with generated notes.

## Security Notes

- This project drives a real browser and can access live web content
- Be careful before exposing the HTTP endpoint outside a trusted environment
- Do not commit real credentials or personal browser profiles into the repository

To report a security issue, open a private report on the GitHub security advisories page.

## Contributing

Contributions are welcome.

- See the `archive/websites/` directory for the site research that drives domain hints
- Run `npm run lint` and the test suite before opening a PR
- Follow the tool contract documented in `AGENTS.md`

## Examples

Ready-to-run MCP client examples live in `examples/`. They talk to `http://localhost:3000/mcp` by default and can be pointed at any server with `NAVIGATOR_URL`.

```bash
node examples/web-search.mjs "model context protocol"
node examples/web-fetch.mjs https://example.com
node examples/web-screenshot.mjs https://example.com screenshot.png
```

## Versioning

The repo uses semver tags and GitHub Releases. See `CHANGELOG.md` for the changelog.

## Roadmap

- Multi-arch GHCR images (blocked: the bundled `stealthpanda` binary is x86_64-only)
- npm publishing for `navigator-mcp`
- More domain hints as the site research in `archive/websites/` grows

## FAQ

**Does it need Docker?** No. stdio mode works with a local Node.js + Chromium install. Docker is the recommended, easiest path.

**Which MCP clients work with HTTP mode?** Any client that supports Streamable HTTP MCP, like OpenCode, Claude Desktop, and others. The endpoint is `http://127.0.0.1:3000/mcp`.

**Why does the GitHub Actions test workflow run, but tests run in a container locally?** The CI workflow uses native Node.js + `npx vitest run` for speed. Local dev runs the same tests inside the `navigator` container; both use vitest.

## License

Licensed under the Apache License 2.0. See `LICENSE`.
