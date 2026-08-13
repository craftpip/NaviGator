# Search Route Warmup Defaults

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
- `.env.example.full` still documents the old six-route value.
- `AGENTS.md` still documents the old six-route default in its configuration
  table.
- `tests/config.test.js` verifies explicit parsing and invalid-engine filtering,
  but not the default used when the variable is unset.

## Implementation

1. Update `.env.example.full` so its `SEARCH_ROUTE_WARMUP_ENGINES` example is
   `brave_cb,duckduckgo_api,duckduckgo_cb`.
2. Update the configuration table in `AGENTS.md` to show the same default.
3. Add a config test that unsets `SEARCH_ROUTE_WARMUP_ENGINES`, calls
   `loadConfig()`, and expects the three-engine default in its documented order.
4. Search the repository for `SEARCH_ROUTE_WARMUP_ENGINES` and update any other
   user-facing default values that differ. Do not change references that merely
   describe the setting without naming a default.

## Verification

1. Run `docker compose exec navigator npm install --include=dev` if the
   container was restarted or rebuilt since development dependencies were last
   installed.
2. Run `docker compose exec navigator npx vitest run tests/config.test.js`.
3. Confirm all configured default sources agree: `src/config.js`,
   `src/config-schema.js`, both Compose files, `.env.example.full`, and
   `AGENTS.md`.
