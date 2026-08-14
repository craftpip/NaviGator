# Source Map

This page helps maintainers locate the implementation behind each documented behavior. It is deliberately a map, not a duplicate of the code.

| Area | Source | Start here when changing |
|---|---|---|
| MCP, HTTP, console routes, caching, result formatting | `src/mcp-server.js` | Tool schemas, request dispatch, response formats, HTTP routes, and server lifecycle |
| Search, extraction, screenshots | `src/search.js` | Search fallback/circuits, page stabilization, extraction, links, tables, hint flows |
| Browser processes and pools | `src/browser.js` | Backend selection, page limiter, launch/recovery, search windows, health |
| Persistent browser testing | `src/devtools.js`, `src/tab-timers.js` | Target lifecycle, DOM/runtime/input tools, console/network buffers, inactivity cleanup |
| Search route contract | `src/engines/driver.js`, `src/engines/browser-driver.js`, `src/engines/api-driver.js` | Driver metadata, navigation, readiness, block detection, and extractor contract |
| Search providers | `src/engines/` | Provider URL, selectors, submission behavior, page extractor, provider-specific blocks |
| Route scheduling | `src/engine-scheduler.js` | Latency ranking, cooldown, recovery probes, persisted route profiles |
| Domain hints and Markdown | `src/domain-hints.js`, `src/markdown.js` | Hint matching/validation/persistence and HTML-to-Markdown conversion |
| Durable state and activity | `src/db.js`, `src/activity.js`, `src/ref-memory.js` | SQLite schema, retention, API keys, usage, activity feed, durable references |
| Configuration | `src/config.js`, `src/config-schema.js`, `src/config-manager.js`, `src/env-file.js` | Environment parsing, editable schema, hot configuration, `.env` writes/backups |
| Screenshots and visual output | `src/pixel-sampler.js`, `src/ascii.js` | Screenshot sampling, ANSI/plain ASCII rendering, annotation legend |
| Desktop/VNC | `src/vnc-manager.js` | Xvfb/noVNC lifecycle and browser headful transitions |
| CLI and console | `navigator.js`, `web-console/` | Host monitoring CLI and management UI |

## Change Paths

- A new MCP tool crosses `src/mcp-server.js`, its owning runtime module, tool documentation, API-key tool grouping, console tool rendering, and tests.
- A new search route belongs in `src/engines/`, then the registry. Do not create a second route map in search or browser code.
- A new extraction behavior normally belongs in `domain-hints.json` first. Change generic extraction only when the behavior is safe across sites.
- A new environment setting needs parsing, runtime config, console schema/hot-apply behavior where applicable, Compose exposure, and documentation.
- A new durable value needs a SQLite migration and retention/operational implications considered.

Use the implementation guides in [`docs/code/`](../code/README.md) for behavior, decisions, limits, and safe boundaries. Use this page only to find the owning code.
