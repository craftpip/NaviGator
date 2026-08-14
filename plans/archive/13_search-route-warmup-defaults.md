# Search Route Warmup Defaults

## Status

**Status: COMPLETE** — runtime defaults, schema, and config tests are complete.
Documentation-example follow-up scope was discarded 2026-08-14.

## Goal

Use the same default `SEARCH_ROUTE_WARMUP_ENGINES` value everywhere:

```text
brave_cb,duckduckgo_api,duckduckgo_cb
```

This keeps one CloakBrowser route for Brave, the DuckDuckGo API route, and one
CloakBrowser DuckDuckGo route available at startup without warming the other
search backends by default.

## Current State

- `src/config.js` already defaults `searchRouteWarmupEngines` to the target list.
- `docker-compose.yml` and `docker-compose-gluten.yml` already use the target
  list as their interpolation fallback.
- `src/config-schema.js` already exposes the target fallback to the console.
- `tests/config.test.js` verifies the unset default, explicit parsing, and
  invalid-engine filtering.

## Implementation

1. Add a config test that unsets `SEARCH_ROUTE_WARMUP_ENGINES`, calls
   `loadConfig()`, and expects the three-engine default in its documented order.

## Verification

1. Run `docker compose exec navigator npm install --include=dev` if the
   container was restarted or rebuilt since development dependencies were last
   installed.
2. Run `docker compose exec navigator npx vitest run tests/config.test.js`.
3. Confirm the runtime default sources agree: `src/config.js`,
   `src/config-schema.js`, and both Compose files.
