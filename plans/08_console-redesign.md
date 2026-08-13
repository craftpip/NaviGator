# Navigator Console — Redesign Plan

## Plan Status

**Status: AREAS A + B IMPLEMENTED** — created 2026-08-11. User dictated
improvements live; implementation landed 2026-08-11 in the working tree
(not yet deployed). An earlier improvement plan
(`plans/web-console-improvements.md`, IN PROGRESS) covers a different
requirement set — keep the two from colliding.

### Checklist

- [x] Collect user requirements (User Request Log below).
- [x] Group into improvement areas, rank by leverage, confirm scope.
- [x] Write per-area implementation sub-plans.
- [x] Implement (SQLite `src/db.js`, activity recording `src/activity.js`, tab timers `src/tab-timers.js`, console Area A + Area B).
- [x] Build (`npm run console:build`) and lint — pass (only pre-existing `scripts/benchmark/web-search-benchmark.mjs:209` unused `fastest` error remains).
- [ ] Deploy (image rebuild + container recreate), verify live.
- [ ] Commit (backend + console together or in two commits).

---

## 1. User Request Log

| # | Date | Request | Status |
|---|------|---------|--------|
| 1 | 2026-08-11 | Reorganize the status page. Search engines are the #1 thing to see (their health, which is the most working, what's going on with searches) — must come BEFORE browser drivers. Open-tabs count must be visible first. "Drivers online 1/3" metric is useless/redundant (drivers panel already shows it). "Current activity" memory number is redundant with the top bar. Wants a reorganized layout (ASCII mock proposed). | logged, layout proposed |
| 2 | 2026-08-11 | User's mental model (drives layout): 3 browser engines = internal plumbing; 2 tool groups = web extraction (web_search/web_fetch/web_page_screenshot) + devtools (Puppeteer CDP). web_search fans out across many search engines/backends; web_fetch/web_page_screenshot always use ONLY the default engine. | context |
| 3 | 2026-08-11 | Wants a **live activity feed** on the console: what searches are coming in, which engine each search used, did that engine produce output, which searches failed. Real-time incoming feed with success/failure. | logged, design pending |
| 4 | 2026-08-11 | **Make this a professional project**, not a side project. First professional decision: introduce a **SQLite database** for activity persistence. Confirmed today there is NO database — all in-memory (requestLog ring buffer src/mcp-server.js:84, engineAttempts src/search.js:217, ref memory, tool cache) and lost on restart. | direction |
| 5 | 2026-08-11 | **Browser drivers card consolidation:** one card shows the browser engines AND each driver's open tabs (tab count + tab names inline). Remove the separate "Open tabs" card. Each listed tab must show an **inactivity countdown timer** — how much time is left until it auto-closes. | logged |
| 6 | 2026-08-11 | **DECIDED: stay on Node 20 + `better-sqlite3`** (not node:22/node:sqlite). | decided |

---

## 2. Improvement Areas

### Area A — Status page reorganization (requested first)

Goal: lead with search-engine health; treat drivers as infra; kill redundancy.

Proposed page order:
1. Thin status banner (keeps `default browser` — it's what web_fetch/screenshot hit).
2. Metric row → **Engines ready · Open tabs · Pages in use · Requests 5m** (drop "Drivers online").
3. **Search engines** (top panel, sorted by health) — add per-engine success bar from
   `stats.engineAttempts.byEngine` + "most working" badge on the top engine.
4. **Browser drivers** (with per-driver tab list + inactivity countdowns — see below).
5. **Activity** (memory sparkline trend + search windows + cache + page slots) and
   **Work completed** side by side — memory *number* stays only in the header.
6. Recent errors (wide) — filter stays.
7. **Live feed** (new, from Area B) — position TBD, likely right under the metric row or pinned bottom.

**No separate "Open tabs" card** — tabs are listed inline inside each driver in the
Browser drivers card (request #5).

### Browser drivers card — with tabs + inactivity countdown

One card, one row per browser engine. Each row expands to list its open tabs with
title and an auto-close countdown:

```
┌─ BROWSER DRIVERS ──────────────────────────────────────────────────────┐
│  ● cloakbrowser   default   3 tabs · pid 1234 · 12 spawns     online   │
│      ▸ NSE India — option chain                    closes in 4:12      │
│      ▸ GitHub — craftpip                           closes in 3:55      │
│      ▸ about:blank (search window)                 sticky (no timer)   │
│  ○ lightpanda     —         0 tabs · not started              idle     │
│  ○ chromium       —         0 tabs · not started              idle     │
└─────────────────────────────────────────────────────────────────────────┘
```

Data gap to close (server-side):
- `getInstanceStats().openTabs` (src/browser.js:1020) returns only `{ title, url }`
  today — **no timestamps**. Must enrich to `{ title, url, kind, lastActiveAt, closesInMs }`.
- Only devtools testing tabs have a real auto-close policy: `lastActiveAt` tracked +
  `INACTIVITY_TIMEOUT_MS = 300_000` (src/devtools.js:9,59,101), created via
  `manager.newPage` so they appear in `instance.pages()`. For these, compute
  `closesInMs = 300_000 - (now - lastActiveAt)` → render live countdown.
- Browser-managed pages (sticky search windows, page-op tabs) have **no auto-close** —
  show `sticky` / no timer rather than a fake countdown.
- Countdown should tick every ~1s client-side (start from `closesInMs`, decrement),
  so the 2s poll doesn't need per-second refresh.

### Area B — SQLite database + live activity feed (professionalization)

Goal: persistent, queryable record of searches → engine attempts → outcomes, plus
a real-time incoming feed on the console.

Design (proposed):
- SQLite, WAL mode, single file `data/navigator.db` (gitignored), on a Docker volume
  so data survives container recreates.
- `src/db.js` — connection + versioned migration runner (`schema_version` table,
  numbered migration array).
- `src/activity.js` — sole writer/reader of activity. Records searches, engine
  attempts, page ops; exposes queries (recent feed, engine stats over time).
- Schema v1:
  - `searches(id, ts, query, variants, requested_engine, engines, result_count, duration_ms, ok, error, source)` — one row per web_search fan-out.
  - `engine_attempts(id, search_id→searches, ts, engine, backend, status[ok|fail|skip], result_count, duration_ms, error)` — one row per engine attempt.
  - `page_ops(id, ts, tool[web_fetch|web_page_screenshot], url, backend, duration_ms, ok, error)` — always-default-backend ops.
- Feed endpoint: `GET /stats/activity?since=<id>&limit=100` — id-cursor incremental
  polling (console already polls every 2s), no new transport. Future: SSE push.
- Console: new **Live feed** panel — each search → its engine attempts → ok/fail
  coloring, per the user's mental model.

**Node decision (2026-08-11):** stay on **Node 20 + `better-sqlite3`** (native dep
with prebuilds; add `@types` optional). NOT upgrading to node:22. Install must be
pinned and the Docker build must verify the prebuilt binary loads (`npm ci` in
Dockerfile; prebuilds exist for bookworm). DB file lives on a volume, so recreate
doesn't wipe it.

### ASCII mock (v1 — proposed 2026-08-11)

See conversation; wireframe agreed in principle pending user review.

### Gaps / open questions (flagged 2026-08-11)

1. **In-flight searches must be visible.** Feed should show a search as soon as it
   starts ("running" spinner), then resolve to ok/fail. Requires `searches.status`
   (`running|ok|fail`) + insert-on-start, update-on-complete. Schema §B update.
2. **DB retention policy.** Add auto-prune (e.g. keep 7 days or cap ~50k rows per
   table, run on migration/open + periodically). Prevents unbounded growth.
3. **DB file location + volume.** Container currently has 3 volumes, none for data.
   Plan: DB at `data/navigator.db`, new named Docker volume mounted at `/data` (or
   repo dir if bind-mounted already — check `docker inspect navigator` mounts),
   `.gitignore` `data/`. WAL + `-wal`/`-shm` files live alongside.
4. **"Most working engine" needs a window.** Decide success-rate window: last 24h
   (recommended) vs all-time vs 5m. Feed panel + engines card must use the same one.
5. **Feed scope: searches only vs all ops.** `page_ops` is in the schema; user's
   feed ask was about searches. Decide: feed shows searches (default), with a
   filter/tab to include fetch/screenshot ops.
6. **Render `result_count` per engine attempt** in the feed so "did it produce
   output" is visible at a glance, not just ok/fail.

---

## 3. Context — the frontend environment

See `plans/web-console-improvements.md` §1 for the full environment map
(React 19 + Vite 7, `web-console/src/main.jsx` single 68-line file, served
from the bind mount at `<cwd>/web-console/dist`, build via `npm run console:build`).

Key facts:
- Entire app lives in `web-console/src/main.jsx` (~34KB, 68 dense lines).
- All CSS in `web-console/src/style.css` (~13KB, 7 lines).
- No TypeScript, no test coverage for the console, ESLint covers `web-console/src/`.
- Console is NOT baked into the image — served from the bind mount (`cwd/web-console/dist`).
- Deploy: host `npm run console:build` + `docker compose up -d` (no image rebuild).

---

## 4. Out of scope (for now)

- TBD once requirements are known.

## 5. How to verify a change

1. `npm run console:build` (needs dev deps — reinstall after any container restart).
2. `npm run lint` clean over `web-console/src/`.
3. Rebuild image + recreate container (this host has no docker compose).
4. Hard-refresh `http://10.69.1.164:3000/console`, verify each mode renders,
   live dot updates every 2 s, dark/light toggle, and no console errors.

## 6. Implementation log

### 2026-08-11 — Areas A + B implemented, deployed, verified

**Deploy:** `docker build -t navigator:latest .` + recreate with captured env
(`/tmp/opencode/navigator.env`), network `navigator_default`, `--init --shm-size=2g -m 4g --cpus=4.0`, ports 3000/7900, three mounts.

**Verified live** (browser target on `/console`):
- Metrics row = Engines ready 8/8 · Open tabs · Pages in use · Requests 5m.
- Grid order = Engines (wide, first) → Drivers → Activity → Work → Live activity → Recent errors.
- 10 engine rows, driver tabs with countdowns, feed rows populate.
- Real `web_search` through the live MCP endpoint recorded search #6 + `duckduckgo_api(api) ok 9 results` in `/stats/activity`.
- Only console error = favicon 404 (pre-existing).

**Gotchas fixed during implementation:**
- `searches` and `page_ops` have independent id sequences — a single `since`
  cursor loses rows (off-by-one on the shared max). Fixed with two cursors:
  `GET /stats/activity?since=<searchId>&sinceOps=<pageOpId>`. `getRecentActivity`
  now takes `{ sinceId, sinceOpId }`.
- `recordDbEngineAttempt` takes an options object, not positional args, and
  relies on `searchContext.run({ searchId }, …)` (AsyncLocalStorage) for the FK
  — test harnesses must wrap calls in the context.
- `initDb()` defaults to `process.cwd()/data` (container cwd `/app` = the bind
  mount → `data/navigator.db` on the host, gitignored). `DATA_DIR` env is NOT
  read by db.js. Host smoke tests pollute the live DB unless run from a temp cwd.
- `formatTime` must handle epoch-ms `ts` (activity rows store `Date.now()`).
- Feed merging in `App.load()`: pass `feed` as a direct prop (stale-closure
  hazard if stuffed into `snapshot`).
- ESLint: `recordSearchStart` had an unused `source` param (removed); `search.js`
  imported `initDb` unused (removed). Remaining lint error is pre-existing
  (`scripts/benchmark/web-search-benchmark.mjs:209` unused `fastest`).

**Not committed yet** as of this log entry — see git status.
