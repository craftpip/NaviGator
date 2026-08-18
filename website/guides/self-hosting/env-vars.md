# Environment Variables

Configure Navigator through environment variables in `.env`. Most are hot-reloaded — no restart needed.

## Browser Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROME_PATH` | `/usr/bin/chromium` | Path to Chromium binary |
| `HEADLESS` | `true` | Run browser without visible window |
| `BROWSER_BACKEND` | `cloakbrowser` | Default browser backend |
| `BROWSER_OP_TIMEOUT_MS` | `60000` | Per-operation timeout (ms) |
| `PRELAUNCH_BROWSER` | `1` | Start browser on server boot |
| `CHROME_USER_DATA_DIR` | — | Persistent browser profile directory |
| `CHROME_PROFILE_DIR` | `Default` | Chrome profile subdirectory |

## Transport & MCP

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_HTTP_MCP` | `0` app / `1` Compose | Enable HTTP transport on `/mcp` |
| `MCP_API_PORT` | `3000` | Server port |
| `MCP_ALLOW_UNAUTHENTICATED` | `1` | Set to `0` to require API keys |
| `MCP_API_KEYS` | — | Comma-separated API keys |
| `ENABLE_DEVTOOLS_MCP` | — | Enable DevTools browser tools |
| `DISABLE_TOOLS` | — | Comma-separated tool names to hide |

## Search

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_ENABLED_ENGINES` | — | Routes for automatic selection |
| `SEARCH_ROUTE_WARMUP_ENGINES` | — | Engines to warm at startup |
| `SEARCH_ROUTE_CIRCUIT_OPEN_MS` | `300000` | Route cooldown after failure (ms) |
| `ENABLE_INSTANT_ANSWERS` | `1` | DuckDuckGo instant answers |

## Extraction

| Variable | Default | Description |
|----------|---------|-------------|
| `DOMAIN_HINTS_PATH` | `./domain-hints.json` | Domain hints file path |
| `WEB_FETCH_MAX_CHARS` | `90000` | Default maxChars for web_fetch |
| `POST_PROCESSOR_MODELS` | — | AI extraction models (JSON) |

## Screenshots

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_SCREENSHOT_PATH` | — | Enable file output |
| `ENABLE_SCREENSHOT_DOWNLOAD_LINK` | — | Enable URL output |

## Capacity

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CONCURRENT_PAGE_OPS` | — | Global browser operation limit |
| `OPEN_PAGE_MAX_PARALLEL` | — | Concurrent URL fetches |
| `HUMAN_TYPING_DELAY` | — | Delay between keystrokes (ms) |

## Operations

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_WEB_CONSOLE` | — | Enable management UI |
| `ENABLE_VNC` | — | Enable VNC/noVNC remote desktop |
| `DEBUG` | `0` | Per-step timing logs |
| `LOG_TOOL_ERRORS` | `1` | Log errors to file |

## MinerU Sidecar (GPU)

| Variable | Default | Description |
|----------|---------|-------------|
| `MINERU_BACKEND` | `vllm` | `vllm` or `transformers` |
| `MINERU_CONTEXT_WINDOW` | `13312` | KV token window |
| `MINERU_GPU_MEM_UTIL` | `0.95` | GPU memory utilization |

## Common Configurations

### Minimal Setup

```bash
# Just the basics — works out of the box
MCP_API_PORT=3000
ENABLE_HTTP_MCP=1
```

### With Authentication

```bash
MCP_ALLOW_UNAUTHENTICATED=0
MCP_API_KEYS=your-secret-key
```

### With DevTools

```bash
ENABLE_DEVTOOLS_MCP=1
```

### With AI Extractors

```bash
POST_PROCESSOR_MODELS=[{"id":"reader_lm","label":"reader-lm","model":"jinaai/reader-lm-0.5b","baseUrl":"http://host.docker.internal:8000/v1"}]
```

### Production

```bash
MCP_API_PORT=3000
ENABLE_HTTP_MCP=1
MCP_ALLOW_UNAUTHENTICATED=0
MCP_API_KEYS=your-secure-key
ENABLE_WEB_CONSOLE=1
LOG_TOOL_ERRORS=1
BROWSER_OP_TIMEOUT_MS=120000
```

## Tips

- **Most variables are hot-reloaded** — no restart needed for most changes
- **Check `/console`** to see current configuration
- **Use `.env` file** — don't set variables in `docker-compose.yml` unless necessary
- **Test changes** with `curl localhost:3000/health` after updating

## Next Steps

- [Security](/guides/self-hosting/security) — API keys and authentication
- [Monitoring](/guides/self-hosting/monitoring) — Health checks and activity logs
