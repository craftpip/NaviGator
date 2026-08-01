# Changelog

All notable changes to this project are documented here. Follows [Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Mutation-based page stabilize strategy (`stabilizeStrategy: mutation`)
- Scoped table extraction via domain hints
- BSE option chain domain hint
- ESLint + `lint` script, `.editorconfig`
- GitHub Actions CI: test, Docker image publish, stale bot, PR labeler
- Dependabot for npm + GitHub Actions
- `CHANGELOG.md` (this file), `examples/`, `.github/FUNDING.yml`
- README badges, FAQ, roadmap, and versioning policy

### Changed

- Replace blind 2s navigation wait with configurable stabilize strategy (`network_idle`, `content_idle`, `none`)
- Move `maxChars` truncation to the response layer (post-cache)
- Gate `web_fetch` debug logging behind `DEBUG` env var
- Run candidate blocks through Readability before markdown conversion
- Trim empty leading/trailing columns from extracted tables
- Use enriched link text when markdown link text is purely numeric
- Make `web_fetch` default `maxChars` configurable via `WEB_FETCH_MAX_CHARS`
- Trim `.env.example` to essentials; full reference moved to `.env.example.full`
- Bump `@modelcontextprotocol/sdk` to ^1.30.0 and override `@hono/node-server` to ^2.0.5 (npm audit clean)

### Removed

- Weather extraction hijack from the generic pipeline
- NSE India table trimming and tab-line stripping from the generic pipeline
- Dead code flagged by the new lint config

## [1.0.1] - 2026-06-25

### Fixed

- Stateless MCP HTTP routing (no forced session transport for clients without `Mcp-Session-Id`)

[Unreleased]: https://github.com/craftpip/navigator/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/craftpip/navigator/compare/v1.0.0...v1.0.1
