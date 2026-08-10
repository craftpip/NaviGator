# Web Console (Navigator self-console)

## Goal

Give the navigator server its own **live management console** — a browser page
that shows everything the server knows about itself in real time and answers
"what will go wrong / what is wrong right now" in one glance: browser drivers,
search engines, circuit breakers, search statistics, runtime state, errors,
plus the full environment configuration **that can be edited from the panel**,
and a one-click live view of the browser screen via VNC/noVNC.

It is the browser version of the existing `navigator.js monitoring` command
(`navigator.js` line 323) — same data, same sections, but live-updating and
visual, with a config manager and a VNC view.

**Config model (the manager part):** `.env` is the source of defaults (as
today). The console reads and edits those same defaults — it is a full manager,
not a read-only dashboard. Management lives **only in the web UI**; the CLI
(`navigator.js`) stays read-only.

**VNC model:** headless is the default. One "ENABLE VNC" button switches the
whole composite at runtime (spawn the X display stack, relaunch the browser
headed, open the noVNC link) and back again — no container restart, no manual
env flag juggling.

Status: planned.

## Design (decided)

**Single panel — no pages, no navigation.** Theme: **RADAR** (professional dark
ops console): deep navy background, radar-green for healthy/live, cyan for
interactive (VNC/navigation), amber for degrading, red for broken. Monospace
data, uppercase micro-labels, bracketed `[ SECTION ]` headers, pulsing LIVE dot,
faint grid. No external fonts/CDNs (offline-safe).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▸ NAVIGATOR CONSOLE        ● LIVE 2s   uptime 3d   [⏸]   [▶ OPEN VNC]   │
│  STATUS: ● DEGRADED        ✗ google_cb open 42s (captcha)  ✗ cloak down │
├──────────────┬──────────────────────────────┬───────────────────────────┤
│ [ DRIVERS ]  │ [ ENGINES ]                  │ [ RUNTIME ]               │
│ browser      │ id       driver role state   │ windows  4/6 ██████░░     │
│ cloaks ● 3t  │ ddg_api  api    ★ warmup ✓   │ slots    2/30 · 1 wait    │
│ chrome ● 0t  │ google_cb cb ★ warmup ✗42s   │ memory   1.24GB  ▁▂▃▅▇    │
│ panda  ● 1t  │ bing_lp  lp   ★ warmup ✓    │ cache    192 · 91% hits   │
│ spawns 1/2/4 │ brave_cb cb   fallback ✓     │ sessions 3  blocks 7      │
│ default→cloak│ ...                          │ CIRCUITS  ✓✓✓✓✓✗         │
├──────────────┴──────────────┬───────────────┴───────────────────────────┤
│ [ SEARCH STATS ]            │ [ ALERTS ]                                │
│ 5m 34/2 · 15m 98/6 · 1h ... │ ✗ captcha 2m ago · ✗ timeout 6m ago      │
├─────────────────────────────┴───────────────────────────────────────────┤
│ [ CONFIG — as parsed from env ]  grouped, bad combos flagged ⚠           │
├──────────────────────────────────────────────────────────────────────────┤
│ VNC ▸ live browser screen (Xvfb :99 → x11vnc 5900 → noVNC 7900)          │
└──────────────────────────────────────────────────────────────────────────┘
```

Everything health-critical is on screen at once; VNC is a bottom drawer that
expands to full height; "OPEN VNC" in the header opens noVNC in a new tab.

**Two modes, one page.** The console stays a single SPA (no routes/pages). The
header switches the main region between:
- **STATUS** — the live diagnostic view above (default).
- **MANAGE** — the config manager overlay: every env-driven setting, editable,
  with the three-way value model (see "Config ownership" below). It replaces the
  main region while open; closing returns to STATUS. VNC drawer is available
  in both.

**VNC is one button, not three flags.** The user never touches
`ENABLE_VNC`/`HEADLESS` individually. The console shows one "ENABLE VNC"
control that flips the whole composite server-side (see "VNC integration").

## What the server already exposes (the data)

All data below is real, read from the code. No new plumbing for most of it —
the console reads these JSON endpoints.

### `GET /health` (src/mcp-server.js:2018 → src/browser.js:939)

```js
{
  ok, backend, devtoolsBackend,               // defaultBackend, devtoolsBackend
  browserConnected, lightpandaConnected, cloakbrowserConnected,  // 3 driver flags
  headless, enableDevtoolsMcp,
  userDataDir, profileDir,
  searchRouteWarmupEngines,                    // the PRIMARY (warmup) engines
  searchWindows: { total, byEngine: { <pool>: { total, inUse, pending, persistent } } },
  pageLimiter: { maxConcurrentPageOps, inUse, queued }
}
// + searchRouteCircuitBreakers appended by the /health handler:
//   [{ route: "<engine>/<backend>", state: "open"|"half_open", remainingMs,
//      failures, lastError, lastFailureAt }]
```

### `GET /stats` (src/mcp-server.js:2029)

```js
{
  ok, uptimeSeconds,
  memory: { rss, heapUsed, heapTotal },
  sessions,                                  // active MCP sessions (mcpTransports.size)
  cache: { total, byTool: { web_search, web_fetch } },
  instances: [ { backend, connected, tabs, pid, spawns } ],  // per driver
  counters: { searches, fetches, screenshots, botBlocks,
              targetsCreated, targetsClosed, targetsInactivityClosed,
              cacheHits, cacheMisses },
  requests: { total, ok, err,
              byPeriod: { "5m","15m","1h","24h","all": {total,ok,err} },
              byTool: { <tool>: {total,ok,err} },
              recentErrors: [ { minutesAgo, tool, error } ] },
  engineAttempts: { total, ok, fail, skip,
              byEngine: { <engine>: { total, ok, fail, skip,
                byPeriod: { "5m","15m","1h","24h","all": {total,ok,fail,skip} } } } }
}
```

### New: `GET /console/config` + `PUT /console/config` (server additions, Phase 1)

The console must be **config-driven**, so the server serves its own parsed
config + the engine registry (the server already holds both — no new
computation):

```js
GET /console/config
{
  config: { /* full loadConfig() object, see Config section */ },
  env: { /* the raw process.env entries navigator actually reads */ },
  engines: [ { id, backend, pool, exposedInMcp, homeUrl, isBrowser } ], // engine registry
  mcpEngines: [/* MCP_SEARCH_ENGINES */],
  package: { name, version },       // from package.json
  schema: [ ... ],                  // config-schema.js entries (drives MANAGE view)
  envPath: "/app/.env"              // where persistence writes
}

PUT /console/config
{ "updates": { "MAX_CONCURRENT_PAGE_OPS": 40, "DEBUG": true } }
→ { ok, hotApplied: [...], restartRequired: [...], rejected: [...],
    effective: {...}, env: {...} }
```

This is what lets the panel "show the configs", render the engine↔driver
matrix, and edit values — all without hardcoding anything in the page. Config
edits go through the server (`.env` write + hot-apply), never directly to the
file.

## The engine registry (what drives what)

Real list from `src/engines/*` (`SUPPORTED_ENGINES`). Driver = the browser
backend that executes the route; `pool` = `engine` (one window pool per engine)
or `shared` (lightpanda routes share one pool).

| id | driver (backend) | pool | MCP exposed | role |
|----|------------------|------|-------------|------|
| `duckduckgo_api` | **api** (no browser) | — | ✓ | primary/fallback |
| `google_cb` | **cloakbrowser** | engine | ✓ | primary |
| `duckduckgo_cb` | **cloakbrowser** | engine | ✓ | fallback |
| `bing_cb` | **cloakbrowser** | engine | ✓ | fallback |
| `brave_cb` | **cloakbrowser** | engine | ✓ | fallback |
| `google_lp` | **lightpanda** | shared | ✓ | primary |
| `bing_lp` | **lightpanda** | shared | ✓ | primary |
| `mojeek_lp` | **lightpanda** | shared | ✓ | fallback |
| `google_ch` | **chromium** | engine | ✗ | hidden route |
| `duckduckgo_ch` | **chromium** | engine | ✗ | hidden route |

Drivers → routes:
- **api**: `duckduckgo_api`
- **cloakbrowser**: `google_cb`, `duckduckgo_cb`, `bing_cb`, `brave_cb`
- **lightpanda**: `google_lp`, `bing_lp`, `mojeek_lp`
- **chromium**: `google_ch`, `duckduckgo_ch`

"Primary" (warmup) vs "fallback" comes from `SEARCH_ROUTE_WARMUP_ENGINES` /
`SEARCH_FALLBACK` config, not from the registry — the panel merges
`config.searchRouteWarmupEngines` (★ warmup/primary) + `config.searchFallback`
against the registry and shows each engine's actual role. Circuit state per
route comes from `/health`.searchRouteCircuitBreakers keyed by `id/backend`.

The console mirrors `navigator.js` engine tables (`printEngines`, line 455;
`engineMonitorRows`, line 429) — same columns, live.

## Config ownership — `.env` stays the source of truth (no migration)

Management of config lives **only in the web console** — never duplicated in
the CLI (`navigator.js` stays read-only and untouched). The `.env` file is not
replaced or migrated; it remains the single store.

```
.env ─────────────► server (loadConfig → manager.config)   source of truth
  ▲                        │
  │ writes                 │ reads / hot-applies
  │                        ▼
  WEB CONSOLE          (the ONLY editor — web UI, not the CLI)
```

- **Read:** server exposes its parsed config at `/console/config`; console
  renders it. CLI keeps reading `/health`+`/stats` exactly as today.
- **Write:** console sends edits to the server (`PUT /console/config`); the
  server validates with the same `parse*` functions, writes `.env` (preserving
  comments/order), then **hot-applies** the dynamic subset to `manager.config`.
- **Two apply classes per field:**
  - **Live (hot-apply, no restart):** values the code reads per-call —
    `MAX_CONCURRENT_PAGE_OPS`, `OPEN_PAGE_MAX_PARALLEL`, `SEARCH_KEEP_MIN_WORKING_WINDOWS`,
    `SEARCH_MAX_WORKING_WINDOWS`, `SEARCH_ROUTE_CIRCUIT_OPEN_MS`,
    `BROWSER_OP_TIMEOUT_MS`, `HUMAN_TYPING_DELAY`, `STABILIZE_STRATEGY`,
    `NAV_WAIT_UNTIL`, `WEB_FETCH_MAX_CHARS`, `DEBUG`, `LOG_TOOL_ERRORS`,
    `DISABLE_TOOLS`, `SEARCH_ROUTE_WARMUP_ENGINES`, `SEARCH_FALLBACK`,
    `ENABLE_HANG_RESTART`, `HANG_RESTART_TIMEOUT_MS`.
  - **Recreate (persisted to `.env`, active on next `docker compose up -d`):**
    consumed at container-creation or boot — `MCP_API_PORT`, `MCP_API_HOST`,
    `ENABLE_HTTP_MCP`, `ENABLE_STDIO_MCP`, `ENABLE_DEVTOOLS_MCP`,
    `BROWSER_BACKEND`, `DEVTOOLS_BROWSER_BACKEND`, `CHROME_PATH`,
    `CHROME_USER_DATA_DIR`, `CHROME_PROFILE_DIR`, `LIGHTPANDA_PATH`,
    `LIGHTPANDA_PORT`, `PRELAUNCH_BROWSER`, `STARTUP_URL`,
    `ENABLE_HTTP_HEALTH`, `ENABLE_SCREENSHOT_*`, `DOMAIN_HINTS_PATH`.
    The console badges these **"applies after container recreate"** and shows
    the exact command. (The server cannot recreate itself — no docker socket —
    so it instructs, it doesn't execute.)
- **HEADLESS / ENABLE_VNC are special:** managed as one composite "VNC mode"
  toggle that **is live** via the runtime VNC manager (next section), while the
  values are also persisted to `.env`.
- **Reset to defaults:** per-field "revert" restores the docker-compose `:-`
  fallback (removes the key from `.env`); a `.env` backup is written before
  each save.

## Config surface (shown in the CONFIG panel)

From `loadConfig()` (src/config.js:243). Grouped by topic; value shown is the
**parsed** value plus the env var name:

**Browser backends:** `BROWSER_BACKEND` (defaultBackend), `DEVTOOLS_BROWSER_BACKEND`,
`HEADLESS`, `CHROME_PATH`, `CHROME_USER_DATA_DIR`, `CHROME_PROFILE_DIR`,
`LIGHTPANDA_PATH`, `LIGHTPANDA_PORT`, `CLOAKBROWSER_BINARY_PATH`, `STARTUP_URL`,
`PRELAUNCH_BROWSER`, `BROWSER_USER_AGENT`

**Search:** `SEARCH_ROUTE_WARMUP_ENGINES` (★ primary), `SEARCH_FALLBACK`,
`SEARCH_KEEP_MIN_WORKING_WINDOWS`, `SEARCH_MAX_WORKING_WINDOWS`,
`SEARCH_ROUTE_CIRCUIT_OPEN_MS`, `OPEN_PAGE_MAX_PARALLEL`,
`MAX_CONCURRENT_PAGE_OPS`, `HUMAN_TYPING_DELAY`, `STABILIZE_STRATEGY`

**Ops/timeouts:** `BROWSER_OP_TIMEOUT_MS`, `NAV_WAIT_UNTIL`, `WEB_FETCH_MAX_CHARS`,
`DEBUG`, `ENABLE_HANG_RESTART`, `HANG_RESTART_TIMEOUT_MS`, `LOG_TOOL_ERRORS`,
`DISABLE_TOOLS`, `DOMAIN_HINTS_PATH`

**HTTP/MCP:** `MCP_API_PORT`, `MCP_API_HOST`, `ENABLE_HTTP_HEALTH`,
`ENABLE_HTTP_MCP`, `ENABLE_STDIO_MCP`, `ENABLE_DEVTOOLS_MCP`,
`ENABLE_SCREENSHOT_DOWNLOAD_LINK`, `ENABLE_SCREENSHOT_PATH`

**VNC (new fields):** `ENABLE_VNC`, `VNC_PORT`, `NOVNC_PORT` — currently read
only by `docker/entrypoint.sh`; Phase 1 adds them to Node config so the panel
can render the VNC state and button.

## Diagnostics engine (client-side rules)

The page turns raw JSON into status via a small rules engine (no server-side
changes to the data). Overall status = worst of: any RED → `CRITICAL`, else any
amber → `DEGRADED`, else `OK`. The banner lists the top offenders.

| Rule | Signal |
|------|--------|
| driver `connected:false` | RED driver row; if it's `defaultBackend` → "fetch/screenshot will fail" |
| circuit `remainingMs > 0` | RED engine pill + live `retry Ns` countdown + lastError |
| circuit `half_open` (no remaining, has failures) | amber pill |
| engine 5m fail-rate > 50% | amber "degrading" before the circuit trips |
| `pageLimiter.inUse >= max` | amber/red "saturated — N queued" |
| any pool `pending > 0` for consecutive polls | amber "stuck window" |
| memory RSS trend rising over 60 samples | amber "memory climbing" sparkline |
| `recentErrors` non-empty | RED alerts list |
| `botBlocks > 0` | amber |
| cache hit-rate < 30% | info "cache cold" |
| `sessions === 0` | info "no clients connected" |
| **VNC mode:** `vnc.running=false` + `config.headless=true` | info "headless mode — browsers invisible (enable VNC to see them)" |
| VNC stack starting (toggle in progress) | ⚠ live step text ("spawning Xvfb…", "relaunching headed…") |
| VNC stack running but noVNC port unreachable | RED "VNC unreachable" button |
| `SEARCH_MAX_WORKING_WINDOWS=1` | ⚠ "heavily throttled" |
| `DISABLE_TOOLS` non-empty | ⚠ lists disabled tools |
| both `ENABLE_STDIO_MCP` and `ENABLE_HTTP_MCP` off | RED "no transport — server unusable" |
| `.env` edited externally while server running (mtime/ctime changed) | info "env file changed on disk — restart required to pick up" |

## VNC integration — runtime manager (no container restart)

**Problem this solves:** VNC needs a composite of flags — `ENABLE_VNC=1`
(spawns the display stack in `docker/entrypoint.sh`) **and** `HEADLESS=false`
(the browser only appears on the X screen when launched headed, src/browser.js:331).
Both are boot-time env vars today, so enabling VNC meant editing `.env` and
recreating the container. The console removes that.

**Approach:** the Node server manages the display stack itself at runtime.
The container image already ships Xvfb, fluxbox, x11vnc, websockify
(Dockerfile:13-16) — the server just spawns them as child processes. One
"ENABLE VNC" action in the console:

1. `spawn("Xvfb", [":99", "-screen", "0", "1920x1080x24"])` (reuse the
   `:99` display, idempotent — same lock/reuse logic as entrypoint.sh)
2. `spawn("fluxbox")`, `spawn("x11vnc", ["-display", ":99", "-rfbport", "5900", ...])`,
   `spawn("websockify", ["--web=/usr/share/novnc/", "7900", "localhost:5900"])`
3. Set `manager.config.headless = false` **and** `process.env.DISPLAY = ":99"`,
   then **relaunch the default backend** (cloakbrowser → headed) so it renders
   on the X screen. New chromium/cloakbrowser instances inherit DISPLAY and are
   headed.
4. Persist the preference to `.env` (`ENABLE_VNC=1`, `HEADLESS=false`) so a
   future container recreate keeps the same mode.
5. Poll noVNC readiness (`/vnc.html` on 7900) and flip the console state to
   **VNC LIVE** with the link + drawer.

"DISABLE VNC" reverses it: kill the spawned display processes (owned PIDs
tracked by the server — never kill entrypoint-owned ones), set
`manager.config.headless = true`, relaunch the backend headless, persist
`ENABLE_VNC=0` (HEADLESS back to default `true`).

**Console UX (user-friendly):**
- Header shows one control: `[● ENABLE VNC]` when headless, `[● VNC LIVE — OPEN]`
  when running. While the toggle runs, it shows live steps ("spawning Xvfb…",
  "relaunching cloakbrowser headed…", "noVNC ready") in a small activity line —
  the user sees the backend working.
- On success: VNC drawer (iframe) + header link open the browser screen at
  `http://${location.hostname}:${novncPort}/vnc.html`.
- Lightpanda is CDP-only (no GUI) — never shown on VNC; the console labels the
  drawer "Xvfb screen (cloakbrowser/chromium)".

**Host side:** `docker-compose.yml` publishes `${NOVNC_PORT:-7900}:7900`
unconditionally (harmless when the stack is off) so the link works the moment
the server starts the stack — no recreate needed.

## Server changes

1. `src/config.js` — add `enableWebConsole`, `vncEnabled` (`ENABLE_VNC`),
   `vncPort` (`VNC_PORT`), `novncPort` (`NOVNC_PORT`). (Nothing else changes —
   the `.env` file and its parsing stay as-is; no migration.)
2. **New `src/config-schema.js`** — one entry per env var: `{ key, category,
   type, fallback, applies: "hot"|"recreate", secret? }`. Validation reuses the
   `parse*` helpers from `config.js`. Drives the MANAGE view.
3. **New `src/vnc-manager.js`** — spawns/kills the Xvfb + fluxbox + x11vnc +
   websockify stack as child processes; tracks owned PIDs; exposes
   `start()`, `stop()`, `status()`; idempotent (`:99` lock-aware).
4. **New file `src/web-console/index.html`** — self-contained page (HTML+CSS+JS,
   zero deps). Theme RADAR; regions: header strip, status banner, DRIVERS,
   ENGINES, RUNTIME, SEARCH STATS, ALERTS, CONFIG, VNC drawer; STATUS | MANAGE
   modes. Includes a small activity log so the user sees backend actions.
5. `src/mcp-server.js`:
   - Serve the page at `/console` (+ `/ui`, `/dashboard`) — read once at boot
     with `fs.readFileSync`, `Cache-Control: no-store`.
   - `GET /console/config` + `PUT /console/config` (validate, `.env` write with
     backup, hot-apply to `manager.config`).
   - `POST /console/vnc { action: "enable" | "disable" }` — the composite toggle
     (spawn/kill stack, flip `manager.config.headless`, relaunch default backend,
     persist to `.env`). Returns step status.
   - `/health` — append `vnc: { running, enabled, headed, novncPort }`.
6. `src/browser.js` — new `relaunchBackendHeaded(headless)` (re-uses the
   existing launch path so the browser restarts on the X display with
   `DISPLAY=:99`). `manager.config.headless` is already honored at launch
   (src/browser.js:331).
7. `docker-compose.yml` — add the new env vars + publish `NOVNC_PORT`
   unconditionally.
8. `.env` / `.env.example` — document; `README.md` — "Web Console" section.
   `navigator.js` (CLI) is **not touched**.

## Implementation phases

### Phase 1 — data + page skeleton
1. `config.js` new fields, `config-schema.js`, `GET /console/config`,
   `/health.vnc`; serve `index.html` at `/console`.
2. Page renders all regions as static layout fed by `/health`, `/stats`,
   `/console/config` (one-shot), polling `/health`+`/stats` every 2s. RADAR
   theme CSS in place. CONFIG region shows defaults; MANAGE mode renders the
   schema-driven editor (read-only initially).

### Phase 2 — diagnostics + real-time polish
1. Diagnostics engine (rules table above) → banner + per-region flags.
2. Rolling 60-sample buffers → canvas sparklines (memory, windows, slots,
   request rate, engine 5m rate). Delta-flash on change.
3. Pause polling when tab hidden; stale indicator on failed poll.

### Phase 3 — config manager (write path)
1. `PUT /console/config`: validation, comment-preserving `.env` writer with
   `.env.backup-<ts>`, hot-apply for `applies:"hot"` fields, "applies after
   container recreate" badges for the rest.
2. MANAGE view: edit fields, Save, Reset-to-default (remove key from `.env`),
   Revert `.env`; change-history list in the panel.

### Phase 4 — VNC manager (runtime, no restart)
1. `src/vnc-manager.js` + `POST /console/vnc` — spawn/kill Xvfb+fluxbox+x11vnc+
   websockify, flip `headless`, relaunch default backend on the X display,
   persist `ENABLE_VNC`/`HEADLESS` to `.env`.
2. compose publishes `NOVNC_PORT`. VNC drawer + one-button toggle in the header;
   live step text while starting; red state when unreachable.

### Phase 5 (optional)
1. `GET /console/logs?n=50` — tail of `logs/tool-errors.log` into ALERTS.
2. Per-engine window drill-down (which engine's windows are stuck).

## Files touched

| File | Change |
|------|--------|
| `src/config.js` | +4 config fields (`enableWebConsole`, `vncEnabled`, `vncPort`, `novncPort`) |
| `src/config-schema.js` | **new** — env-var schema driving the MANAGE view |
| `src/vnc-manager.js` | **new** — spawn/kill Xvfb+fluxbox+x11vnc+websockify, status |
| `src/web-console/index.html` | **new** — the console (RADAR theme, STATUS/MANAGE modes, activity log) |
| `src/mcp-server.js` | serve page; `GET/PUT /console/config`; `POST /console/vnc`; `/health.vnc` |
| `src/browser.js` | `relaunchBackendHeaded()` for the VNC toggle |
| `docker-compose.yml` | env vars + `NOVNC_PORT` publish |
| `.env` / `.env.example` | document new vars |
| `README.md` | Web Console section |
| `tests/mcp-server.test.js` | `/console` HTML; `GET/PUT /console/config`; `/health.vnc`; `POST /console/vnc` |
| `navigator.js` (CLI) | **unchanged** — config is web-UI-only |

## Verification

- `curl -s http://localhost:3000/console | head -20` → HTML page.
- `curl -s http://localhost:3000/console/config | jq '.engines | length'` → 10;
  `jq '.schema | length'` → 40+ env-var entries.
- `curl -s http://localhost:3000/health | jq .vnc` →
  `{"running":false,"enabled":false,"headed":true,"novncPort":7900}`.
- **Config manager (web-UI-only; CLI untouched):**
  - `curl -X PUT http://localhost:3000/console/config -d
    '{"updates":{"MAX_CONCURRENT_PAGE_OPS":40}}' -H 'content-type: application/json'`
    → `hotApplied:["MAX_CONCURRENT_PAGE_OPS"]`; `manager.config` updated; `.env`
    updated with comments intact; `.env.backup-*` exists; restart-required keys
    return `restartRequired:[...]` and render the badge.
- **VNC manager — one button, no container restart (headless default):**
  - `curl -X POST http://localhost:3000/console/vnc -d '{"action":"enable"}'`
    → `{ok:true}`; `pgrep -f Xvfb` finds Xvfb; `/health.vnc` →
    `{"running":true,"headed":false,...}`; `curl -sI http://127.0.0.1:7900/vnc.html`
    → 200; console shows "VNC LIVE" + link/drawer.
  - `POST {"action":"disable"}` → stack killed, browser relaunched headless,
    `.env` flipped back.
- Run searches/fetches; counters and sparklines move every 2s; banner flips
  states when you kill a backend or a circuit opens.
- `npx vitest run tests/mcp-server.test.js` green; `npm run test:mcporter` green.

## Out of scope

- Prometheus/Grafana (see `plans/monitoring.md` — console is the no-infra
  alternative).
- Auth/HTTPS; live SSE/WebSocket push (2s polling is enough); multiple pages.
- Container restart from the panel (requires mounting the docker socket — too
  heavy/risky; the VNC manager removes the only common restart need, and other
  recreate-required fields are clearly badged).
- Migrating config out of `.env` (deliberately **not** done — see "Config
  ownership").
- Any CLI-side config editing (`navigator.js` stays read-only).
- Remote/headless server VNC (only meaningful inside the container's X
  display; lightpanda has no GUI at all).
