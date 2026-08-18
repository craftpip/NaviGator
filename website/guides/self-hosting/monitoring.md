# Monitoring

Keep track of Navigator's health, performance, and usage.

## Health Endpoint

The quickest way to check if Navigator is running:

```bash
curl -s http://localhost:3000/health
```

Returns:

```json
{
  "ok": true,
  "backend": "cloakbrowser",
  "browserConnected": true,
  "pageLimiter": {
    "maxConcurrentPageOps": 30,
    "inUse": 0,
    "queued": 0
  },
  "searchRouteCircuitBreakers": [...]
}
```

## Stats Endpoint

Detailed server statistics:

```bash
curl -s http://localhost:3000/stats
```

Returns:

```json
{
  "ok": true,
  "uptimeSeconds": 86400,
  "memory": { "rss": 125000000, "heapUsed": 45000000 },
  "sessions": 2,
  "cache": { "total": 150, "byTool": { "web_search": 80, "web_fetch": 70 } },
  "counters": { "searches": 1234, "fetches": 567, "screenshots": 89 },
  "requests": { "total": 1890, "ok": 1850, "err": 40 }
}
```

## Navigator CLI

A host-side tool for monitoring the live server:

```bash
# One-shot snapshot
./navigator.js statistics

# Live auto-refresh (like docker stats)
./navigator.js monitoring --interval 2

# Show engine routes
./navigator.js engines

# Reset a specific route
./navigator.js engines reset google_cb
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--url <base>` | Server URL (default: http://localhost:3000) |
| `--interval <sec>` | Refresh interval for monitoring (default: 2) |
| `--json` | Output as JSON |
| `--help` | Show help |

## Web Console

Open **http://localhost:3000/console** for a visual dashboard:

- **Engine health** — 24h success bars, most-working badge
- **Browser tabs** — Live tab count, inactivity countdowns
- **Activity feed** — Searches, engine attempts, page operations
- **Configuration** — Edit settings, manage API keys
- **Domain hints** — Create, test, and manage extraction rules

## Activity Logs

Navigator stores activity in SQLite (`data/navigator.db`):

| Table | Retention | Description |
|-------|-----------|-------------|
| `searches` | 7 days | Search queries, routes, timing |
| `engine_attempts` | 7 days | Per-route success/failure |
| `page_ops` | 7 days | Fetch, screenshot, page operations |
| `activity_events` | 7 days | Tool outcome timeline |

Logs are pruned hourly. The web console shows real-time activity.

## Error Logging

Tool errors are logged to `logs/tool-errors.log`:

```bash
# Tail the log
tail -f logs/tool-errors.log
```

Each entry includes:

- Timestamp
- Tool name
- Error message
- Redacted arguments (passwords masked)
- Stack trace (if available)

Configure with `LOG_TOOL_ERRORS=1` (default) or `0` to disable.

## Circuit Breakers

Search engine circuit breakers track route health:

| State | Meaning |
|-------|---------|
| `closed` | Route is healthy, accepting requests |
| `open` | Route failed, in cooldown period |
| `half_open` | Cooldown expired, testing with a probe |

View circuit breaker status:

```bash
curl -s http://localhost:3000/health | jq '.searchRouteCircuitBreakers'
```

## Performance Monitoring

### Key Metrics

| Metric | Where to find |
|--------|---------------|
| Uptime | `/stats` → `uptimeSeconds` |
| Memory usage | `/stats` → `memory` |
| Request rate | `/stats` → `requests` |
| Cache hit rate | `/stats` → `cache` |
| Engine health | `/console` → Engine Health grid |

### Debug Mode

Enable per-step timing logs:

```bash
DEBUG=1
```

This logs each step of `web_fetch` with millisecond timing:

```
[web_fetch] goto_page: 1234ms
[web_fetch] stabilize_page: 567ms
[web_fetch] extract_text: 89ms
[web_fetch] TOTAL: 1890ms
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Server won't respond | `curl localhost:3000/health` |
| Search failing | Check circuit breakers in `/health` |
| Memory growing | `docker stats navigator` |
| Slow responses | Enable `DEBUG=1`, check timing logs |
| Errors in log | `tail -f logs/tool-errors.log` |

## Next Steps

- [All Tools Reference](/reference/tools) — Complete tool documentation
- [Architecture](/reference/architecture) — How Navigator works internally
