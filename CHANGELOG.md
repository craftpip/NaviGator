# Changelog

All notable changes to this project are documented here. Follows [Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/).

## [Unreleased]

### Added

- `web_page_ascii` — chafa-style ASCII screenshot tool with color/grayscale/plain modes
- DevTools MCP tools (19 CDP-based browser interaction tools: tabs, DOM, input, network, console)
- Domain hint flows for interactive multi-step extraction (click, type, wait, navigate)
- Domain hints editor with grouped form, guides, and multi-selector wait
- AI-model extractors (`chat`, `mineru`, `api` kinds) with silent fallback to `html_to_markdown`
- `POST_PROCESSOR_MODELS` config for AI extractor model entries
- Wildcard default hint (`domain: "*"`) replacing all `DEFAULT_EXTRACT_*` env vars
- `DISABLE_TOOLS` env var to dynamically hide MCP tools from clients
- `LOG_TOOL_ERRORS` for persistent tool error logging (`logs/tool-errors.log`)
- Navigator monitoring CLI (`./navigator.js statistics|monitoring`)
- Web console (React/Vite SPA): config management, status dashboard, domain hints editor
- Console: engine health grid, SQLite live activity feed, tab inactivity timers, usage totals
- Console: manage page with typed inputs, validation, backend subgroups, sticky headers
- Search engine routes: `startpage_cb`, `yahoo_cb`, `duckduckgo_cb`, `google_cb`, `bing_cb`, `brave_cb`
- `bypassCache` param for `web_search` and `web_fetch`
- Instant Answers (DuckDuckGo Instant Answer API on every search)
- Link ref memory with `web_page_links` resolver
- SQLite activity DB with 7-day prune (`data/navigator.db`)
- SSE keepalive for long-lived MCP sessions (30s comment frames)
- `web_page_screenshot` output modes: base64, file path, download URL
- Named quality presets for screenshots (`low`/`medium`/`high`)
- Mutation-based page stabilization (`stabilizeStrategy: mutation`)
- Scoped table extraction via domain hints
- BSE option chain domain hint
- ESLint + `lint` script, `.editorconfig`
- GitHub Actions CI: test, Docker image publish, stale bot, PR labeler
- Dependabot for npm + GitHub Actions

### Changed

- Replaced `DEFAULT_EXTRACT_*` env vars with wildcard default hint (`domain: "*"`)
- Renamed `AI_EXTRACTOR_MODELS` to `POST_PROCESSOR_MODELS`
- Extract text/extractor pipeline refactored into `src/extractors/`
- Search engine drivers moved to `src/engines/` with registry pattern
- `web_fetch` always extracts links (no `extractLinks` flag) — inline `[text](ref_id)`
- `web_fetch` always extracts tables (no `includeTables` flag) — extractor decides rendering
- Ref IDs render as markdown link destinations (`[text](ref_id)`)
- Replaced blind 2s navigation wait with configurable stabilize strategy
- Run candidate blocks through Readability before markdown conversion
- Move `maxChars` truncation to the response layer (post-cache)
- Gate `web_fetch` debug logging behind `DEBUG` env var
- Trim empty leading/trailing columns from extracted tables
- Use enriched link text when markdown link text is purely numeric
- Make `web_fetch` default `maxChars` configurable via `WEB_FETCH_MAX_CHARS`
- Bump `@modelcontextprotocol/sdk` to ^1.30.0
- Balanced search engine scheduling for fairer load distribution
- Unified search engine configuration across all routes

### Fixed

- SSE stream keepalive (30s comment frames prevent TCP idle kills)
- POST handler exact session ID match (no fallback to wrong transport)
- Stateless MCP HTTP routing (no forced session transport for clients without `Mcp-Session-Id`)
- Devtools tools report real DOM state and actionable errors
- Navigation, observers, and input tools hardened
- `.env` file wins over `process.env` at startup
- Empty `SEARCH_ROUTE_WARMUP_ENGINES` disables warmup correctly
- DDG instant answer wait capped so searches never block on it
- Default screenshot quality to medium (55) when omitted
- Explicit timeout wrappers to prevent indefinite hangs
- Don't flag empty-title text files and JSON APIs as bot blocks
- Strip tables from JSDOM doc after extraction to prevent Readability doubling
- Keep MCP tool timing in catch scope

### Removed

- `DEFAULT_EXTRACT_*` env vars (migrated to wildcard hint)
- `default.tables` mode (`all`/`content`/`disabled`) — extractor decides table rendering
- Weather extraction hijack from the generic pipeline
- NSE India table trimming and tab-line stripping from the generic pipeline
- Dead code flagged by the new lint config

## [1.0.1] - 2026-06-25

### Fixed

- Stateless MCP HTTP routing (no forced session transport for clients without `Mcp-Session-Id`)

[Unreleased]: https://github.com/craftpip/navigator/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/craftpip/navigator/compare/v1.0.0...v1.0.1
