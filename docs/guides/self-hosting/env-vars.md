# Environment Variables

Configure Navigator through `.env` or the console at [http://localhost:1994/console/manage](http://localhost:1994/console/manage). Grouped exactly as in the console's **Configs** panel.

## Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_BACKEND` | `cloakbrowser` | Primary browser backend — `cloakbrowser`, `lightpanda`, `chromium` |
| `DEVTOOLS_BROWSER_BACKEND` | `cloakbrowser` | Backend for devtools tools |
| `HEADLESS` | `true` | Run browsers without UI (toggled by VNC) |
| `CHROME_PATH` | `/usr/bin/chromium` | Path to Chromium executable |
| `CHROME_USER_DATA_DIR` | `/data/chrome` | Persistent Chrome profile directory |
| `CHROME_PROFILE_DIR` | `Default` | Chrome profile folder name |
| `LIGHTPANDA_PATH` | `auto-detect` | Path to lightpanda binary |
| `LIGHTPANDA_PORT` | `1997` | CDP port for lightpanda |
| `CLOAKBROWSER_BINARY_PATH` | `auto-detect` | Path to cloakbrowser chrome binary |
| `PRELAUNCH_BROWSER` | `true` | Pre-launch browser on server start |
| `STARTUP_URL` | `about:blank` | URL opened on launch |
| `BROWSER_USER_AGENT` | `Mozilla/5.0 ... Chrome/151.0.0.0` | User agent string |

## Search

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_ROUTE_WARMUP_ENGINES` | `3 routes` | Prewarmed on start |
| `SEARCH_ENABLED_ENGINES` | `12 routes` | Eligible for `select_best` |
| `SEARCH_ROUTE_CIRCUIT_OPEN_MS` | `300000` | Route cooldown after failure (ms) |
| `EXA_API_KEY` | — | API key for `exa_api` — when empty, disabled |
| `LINKUP_API_KEY` | — | API key for `linkup_api` |
| `TAVILY_API_KEY` | — | API key for `tavily_api` |
| `FIRECRAWL_API_KEY` | — | API key for `firecrawl_api` |
| `SEARCH_KEEP_MIN_WORKING_WINDOWS` | `2` | Min warm windows per pool (Lightpanda capped at 1) |
| `SEARCH_MAX_WORKING_WINDOWS` | `10` | Max concurrent windows per engine |
| `SEARCH_QUEUE_MIN_INTERVAL_MS` | `30000` | Baseline min gap between calls to one engine (ms) |
| `SEARCH_QUEUE_MAX_INTERVAL_MS` | `1800000` | Cap for learned backoff (ms) |
| `SEARCH_QUEUE_ESCALATION_FACTOR` | `2` | Backoff multiplier after failure |
| `SEARCH_QUEUE_ERROR_GAP_PERCENTILE` | `0.75` | Failure-gap percentile |
| `SEARCH_QUEUE_ERROR_GAP_SAFETY` | `1.25` | Safety multiplier on failure gaps |
| `SEARCH_QUEUE_DECAY_PER_SUCCESS` | `0.75` | Backoff decay per success |
| `SEARCH_QUEUE_PROFILE_PATH` | `.cache/search-engine-profiles.json` | Persisted scheduler profile |
| `SEARCH_QUEUE_W_SUCCESS` | `0.45` | Weight: success rate |
| `SEARCH_QUEUE_W_RESULTS` | `0.15` | Weight: results per attempt |
| `SEARCH_QUEUE_W_STABILITY` | `0.25` | Weight: recent stability |
| `SEARCH_QUEUE_W_RECENCY` | `0.1` | Weight: recent-failure penalty |
| `SEARCH_QUEUE_W_RECOVERY` | `0.05` | Weight: recovery successes |
| `SEARCH_QUEUE_W_LATENCY` | `0.2` | Weight: response latency |
| `OPEN_PAGE_MAX_PARALLEL` | `6` | Max parallel `open_page` ops |
| `MAX_CONCURRENT_PAGE_OPS` | `30` | Global max concurrent page ops |
| `HUMAN_TYPING_DELAY` | `15` | Delay per typed character (ms) — `0` in Compose |

## Ops

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_OP_TIMEOUT_MS` | `60000` | Timeout for browser ops (ms) — `25000` in Compose |
| `NAV_WAIT_UNTIL` | `domcontentloaded` | Navigation wait — `load`, `domcontentloaded`, `networkidle0`, `networkidle2` |
| `WEB_FETCH_MAX_CHARS` | `90000` | Default `maxChars` per fetch |
| `LINK_REFS` | `true` | Rewrite links to `[text](ref_id)` for `web_page_links` |
| `DEBUG` | `false` | Per-step benchmark timing logs |
| `LOG_TOOL_ERRORS` | `true` | Log errors to `logs/tool-errors.log` |
| `DISABLE_TOOLS` | — | MCP tools to hide/reject (comma-separated) |
| `DOMAIN_HINTS_PATH` | `domain-hints.json` | Path to extraction hints file |
| `ENABLE_HANG_RESTART` | `false` | Exit on hung ops so Docker restarts |
| `HANG_RESTART_TIMEOUT_MS` | `120000` | Hang threshold (ms) |

## Console

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_WEB_CONSOLE` | `true` | Serve web console at `/console` |
| `ENABLE_HTTP_HEALTH` | `false` | Serve `/health` and `/stats` |
| `ENABLE_HTTP_MCP` | `false` | Serve MCP at `/mcp` — `1` in Compose |
| `MCP_ALLOW_UNAUTHENTICATED` | `true` | Allow `/mcp` without API key |
| `ENABLE_STDIO_MCP` | `true` | Run MCP over stdio |
| `ENABLE_DEVTOOLS_MCP` | `false` | Expose devtools browser tools — `1` in Compose |
| `MCP_API_PORT` | `1994` | HTTP port |
| `MCP_API_HOST` | `http://localhost` | Host base shown in logs |
| `ENABLE_SCREENSHOT_DOWNLOAD_LINK` | `false` | Serve screenshots at `/download/` — set `1` for `output: "url"` |
| `ENABLE_SCREENSHOT_PATH` | — | Where files are stored — set absolute path like `/tmp/screenshots` for `output: "file"` |

## VNC

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_VNC` | `false` | VNC mode — `1` in Compose (toggled by console) |
| `VNC_PORT` | `1995` | x11vnc port |
| `NOVNC_PORT` | `1996` | noVNC web port (published to host) |

## Extractor

| Variable | Default | Description |
|----------|---------|-------------|
| `POST_PROCESSOR_MODELS` | `[]` | JSON array of post-processor models — see [Post-processors](/guides/extraction/ai-extractors) for `kind: "chat"` / `"mineru"` / `"api"` and per-entry `timeoutMs`/`maxInputChars`/`maxTokens`. Legacy names: `AI_EXTRACTOR_MODELS`, `READER_LM_MODELS` |

## Tips

- **Many variables need `docker compose up -d`** — those with `applies: "recreate"` (e.g. `BROWSER_BACKEND`, `ENABLE_SCREENSHOT_*`) require a restart; others hot-reload via `readEnvFile`
- **Check `/console`** to see current values and edit live
- **Use `.env` file** — don't set variables in `docker-compose.yml` unless necessary
- **Test changes** with `curl http://localhost:1994/health` after updating

## Next Steps

- [Security](/guides/self-hosting/security) — API keys and authentication
- [Monitoring](/guides/self-hosting/monitoring) — Health checks and activity logs
