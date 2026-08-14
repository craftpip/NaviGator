# Web Console — Improvement Plan

## Plan Status

**Status: COMPLETE** — the remaining next-area decision was discarded 2026-08-14.

### Checklist

- [x] Request log #1–#6 implemented in `main.jsx` (header alignment, welcome prose removed, error filter + professional look, VNC drawer removed, schema-driven Tools page + internal console key, response timing/size).
- [x] `style.css` fully rewritten (~700 readable lines, was the old 7-line minified file) to style all new component classes.
- [x] Lint clean over `web-console/src/`, `console:build` succeeds.
- [x] **Deployed 2026-08-11**: image rebuilt (`docker build -t navigator:latest .`), container recreated with exact captured env/volumes/ports. All 4 modes verified live.

---

## 1. Basic knowledge — the frontend environment

### 1.1 Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | React 19 (`react` / `react-dom` 19.2.4) | runtime deps of the server package (not dev-only) |
| Build | Vite 7 (`@vitejs/plugin-react` 5) | `npm run console:build` → `vite build --config web-console/vite.config.js` |
| Language | JSX, plain JavaScript | no TypeScript anywhere in the repo |
| Lint | ESLint 9 (`eslint.config.js`) | covers `web-console/src/`; JSX `no-unused-vars` off |
| Tests | none for the console today | vitest exists for server tests only |
| Runtime serving | Node HTTP server in `src/mcp-server.js` | serves built `dist/` at `/console/*` |

### 1.2 Files

| File | Role |
|------|------|
| `web-console/index.html` | entry HTML — loads `/src/main.jsx`, root `#root` |
| `web-console/vite.config.js` | `root: web-console/`, `base: "/console/"`, `outDir: dist`, `emptyOutDir: true` |
| `web-console/src/main.jsx` | **the entire app** — all components + logic in 68 very dense lines (~34KB) |
| `web-console/src/style.css` | the entire stylesheet — 7 very dense lines (~13KB), CSS variables + 3 media queries |
| `web-console/src/navigator.png` | header logo, imported by `main.jsx`, hashed by Vite into `dist/assets/` |
| `web-console/dist/` | build output; served directly from the bind mount (no image bake) |

### 1.3 Build & serve flow

```
source (jsx/css/png) --vite build--> web-console/dist/ (bind-mounted at /app/web-console/dist)
                                                                  |
web console browser <--GET /console/assets/*-- src/mcp-server.js (serveWebConsoleAsset)
```

- Server resolves the console dir as `<cwd>/web-console/dist` (src/mcp-server.js:35).
- `/console/assets/*` served with `cache-control: public, max-age=31536000, immutable`
  (mcp-server.js:284-298) — **a console rebuild requires a hard refresh** in the client.
- Dev mode: `npm run console:dev` runs vite against the source (needs dev deps installed).
- **Deploy note (this host):** docker compose is available; build the console on the host
  with `npm run console:build` (needs dev deps), then `docker compose up -d` recreates the
  container from the existing image — no image rebuild.

### 1.4 Data contract — endpoints the console polls

The SPA is a polling dashboard (no SSE/WebSocket). `App.load()` fires every
`POLL_MS = 2000` ms (skipped while `document.hidden`, pausable via `[⏸]`) and
`Promise.all`s four requests into one `snapshot` object:

| Endpoint | Payload used by console |
|----------|--------------------------|
| `GET /health` | `ok`, `backend`, `pageLimiter{inUse,queued,maxConcurrentPageOps}`, `searchWindows{total,byEngine}`, `searchRouteCircuitBreakers[]`, `vnc{running,enabled,headed,novncPort}` |
| `GET /stats` | `uptimeSeconds`, `memory.rss`, `sessions`, `cache{total}`, `instances[]{backend,connected,tabs,pid,spawns,openTabs[]}`, `counters{}`, `requests{byPeriod,recentErrors}`, `engineAttempts{byEngine}` |
| `GET /console/config` | `config{}` (parsed config), `env{}`, `engines[]` (registry), `schema[]` (env-var schema, drives Manage view), `envPath` |
| `GET /console/logs?n=20` | `entries[]` (tool-error log tail, drives Recent errors) |

Write endpoints used by the console:
- `PUT /console/config` — `{ updates | revert | reset }` (Manage view).
- `POST /console/vnc` — `{ action: "enable" | "disable" }`.
- `GET|POST /console/api-keys` — auth settings + key create/revoke.

The **Web tools view bypasses all of the above** and hits the raw HTTP endpoints
directly: `GET /search`, `GET /extract`, `GET /screenshot`.

### 1.5 App structure (from `main.jsx`)

Routing is manual `history.pushState` with a 4-mode switch:

| Mode | Path | Component |
|------|------|-----------|
| status | `/console` | `StatusView` → `Runtime`, `Drivers`, `Engines`, `Tabs`, `Work`, `Logs`, `VncDrawer` |
| manage | `/console/manage` | `Manage` → `FragmentRows` |
| tools | `/console/tools` (also `/console/api`) | `Tools` → `Field`, `Check` |
| keys | `/console/keys` | `Keys` |

Shared primitives: `Layout` (header: logo, LIVE/PAUSED, uptime/mem/sessions, mode
switch, dark toggle, pause, VNC buttons), `Dot`, `Pill`, `Panel`, `Empty`, `Trend`
(2-point SVG sparkline), `Item`, `Metric`.

Theme: light/dark via `html[data-theme]` + CSS variables, persisted in
`localStorage["navigator-theme"]`. Responsive breakpoints at 1050 / 800 / 720 px.

### 1.6 Current weaknesses observed

1. **Maintainability:** `main.jsx` and `style.css` are hand-minified one-liners —
   edits are risky (long, easy to break), and `git diff` noise is huge. No
   Prettier run, no splitting into modules.
2. **Tools view is partial:** only 3 tools (search/fetch/screenshot) of the full
   MCP surface; the engine `<select>` and tool args are hardcoded (drift risk —
   registry lives server-side and is already exposed in `/console/config.engines`).
3. **No request history** in Tools view; screenshot preview supports only a single
   inline base64 image.
4. **No frontend tests**, no type checking, no visual regression coverage.
5. **Polling churn:** 4 requests every 2 s regardless of view; Manage/Tools/Keys
   don't need the status payload, but it is still fetched.
6. **Accessibility:** buttons/inputs mostly lack `aria-*`; the VNC bar is a
   `<button>` containing a nested clickable `<span>`; small 9-11px fonts.
7. **Screenshot image handling** regex-parses the raw response text for base64
   (`data:image/(png|jpeg);base64,`) — brittle.

---

## 2. Improvement areas

> **User request log** — verbatim notes from the user, newest at top. Each entry
> gets folded into the areas below when it is fully understood.

- **#6 (2026-08-11) Web Tools response metadata — timing + size:** After sending
  a tool request (e.g. web_search → Send request), the response must show: (1)
  how long it took to get the response, and (2) how big the response is — in
  characters, plus in brackets how many bytes.
- **#5 (2026-08-11) Web Tools page — schema-driven from MCP, internal API key:**
  Standardize the Web Tools page for ALL tools. The server already has an MCP
  endpoint — use it. The Web Tools page requires an API key to be entered; with
  that key the page fetches the tool definitions (`tools/list`) and renders a
  form for every tool automatically (web_search, web_fetch, web_page_screenshot,
  and all the others). If the MCP reader is built properly, all tool pages get
  built automatically and we can test every tool from the console. At project
  startup, internally create an API key for console use; the console talks to
  the MCP API only through that internally created key. The internally created
  key is visible in the API keys section.
- **#4 (2026-08-11) VNC duplicated — remove bottom drawer:** There is a second
  VNC option at the bottom of the screen (the VNC drawer) when it is already in
  the header. Having both is redundant.
- **#3 (2026-08-11) Recent errors panel — professional look + filter + size:**
  Why are "web browsing" and "dev tools" errors shown differently (grouped in
  separate sub-sections)? It looks unprofessional/"funny". Make it look
  professional. Add a filter on top to filter between web browsing and dev
  tools errors. Text is too small — hard to read.
- **#2 (2026-08-11) Welcome text — remove the tutorial blurb:** In the live
  operational overview, the text *"This screen refreshes every two seconds so
  you can see capacity, routes, and browser state without reading raw logs"* is
  unnecessary — the user visits this page daily and doesn't need to be told how
  it works every day. Remove that prose.
- **#1 (2026-08-11) Header layout/alignment:** The header on the navigator
  console is not liked. It is not properly aligned at different widths — it
  "changes randomly". Button heights are not standardized, and where buttons
  appear is also not standardized.

Two improvement plans are being scoped. Candidates ranked by leverage:

### Area A — Code health: split + format + baseline tests *(recommended first)*
Break `main.jsx` into modules (components/, views/, lib/), add Prettier to the
repo, enforce `npm run lint` clean, add a minimal Vitest component smoke test +
a build-check so `console:build` is CI-safe. Zero UX change — makes every later
improvement cheap and reviewable.

### Area B — Web tools view upgrade
- Drive engine options and tool schemas from the server registry
  (`/console/config.engines` + MCP `tools/list`), removing hardcoded drift.
- Add request history (localStorage ring), per-request timing, copyable output,
  and multi-image support (existing `/screenshot` supports `urls[]`).
- Render `web_fetch` tables and ref-id links nicely instead of raw text.

### Area C — Real-time / efficiency
Swap 2 s polling for SSE push (server already has Streamable HTTP + SSE infra),
or at minimum view-aware polling (only fetch what the active view needs).

### Area D — UX/accessibility polish
Focus rings, aria labels, semantic buttons, larger tap targets, empty/error
states for every panel, reduced-motion support, keyboard nav in Tools view.

### Area E — Depth of telemetry
Sparkline upgrade (real canvas charts for request rate, engine 5m), engine
window drill-down (already a known gap in `plans/web-console.md` Phase 5), and
per-tool failure tables.

---

## 3. Out of scope (for now)

- Migrating the app to TypeScript (no TS anywhere in the repo).
- Auth/HTTPS for `/console`.
- Full charting library (inline SVG/canvas keeps it dependency-free and offline-safe).

## 4. How to verify a change

1. `npm run console:build` (needs dev deps — reinstall after any container restart).
2. `npm run lint` clean over `web-console/src/`.
3. Rebuild image + recreate container (this host has no docker compose).
4. Hard-refresh `http://10.69.1.164:3000/console`, verify each mode renders,
   live dot updates every 2 s, dark/light toggle, and no console errors.
