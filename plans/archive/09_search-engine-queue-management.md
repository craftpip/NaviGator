# Search Engine Queue Management

## Plan Status

**Status: COMPLETE** — implemented and focused-validated 2026-08-15.

Focused validation: `tests/engine-scheduler.test.js` passes. The host `mcp-server` suite requires a rebuilt `better-sqlite3` native module; the legacy root-owned config test still asserts the retired pacing/exploration settings and needs its expectations updated to this plan's queue settings.

Previous `select_best` behavior in `src/search.js`:
- `DEFAULT_FALLBACK` (line 99–104) is a **static, fixed-order** list: `duckduckgo_api, brave_cb, google_lp, google_cb, duckduckgo_cb, bing_cb, bing_lp, google_ch, duckduckgo_ch, mojeek_lp`.
- `runFallbackEngineGroups()` (line 1370) is **first-success-wins**: walk the list top to bottom; the first engine that returns results serves the query and the loop stops. The engine at the head of the list implicitly gets all traffic; everyone behind it is only tried when everything in front has failed.
- Circuit breakers (`getRouteCircuit` / `recordRouteFailure` / `recordRouteSuccess`, lines 142–174) freeze a route for a **fixed, uniform cooldown** (`searchRouteCircuitOpenMs`, default 300000 ms = 5 min) regardless of engine, failure type, or how recently it failed before. State persists to `.cache/search-circuit-breakers.json`.
- Engine attempt telemetry already exists (`recordEngineAttempt` line 217, ring buffer capped at 20000, persisted to `.cache/search-engine-attempts.json`, exposed via `getEngineAttemptStats()` in `/stats`).

**Gaps this plan fills:** no per-engine reputation scoring, no results-per-attempt / error-gap analysis, no timing-based backoff (the "fails at 4-minute intervals but works at 5" problem), no way to reset an engine's history, and the selection strategy is first-success-wins instead of distributing load across the engines that are actually working.

### Checklist

- [x] 1. Phase 1 — Engine profile store + scoring: `src/engine-scheduler.js`, persisted profiles, scores exposed in `/stats`.
- [x] 2. Phase 2 — Interval learning (error-gap analysis): per-engine `minIntervalMs`, categorized escalation, percentile failure-gap learning, and success decay are persisted.
- [x] 3. Phase 3 — Selection rewrite: `runFallbackEngineGroups` score-weights one eligible primary, then retains sequential fallback. Explicit-engine requests stay untouched.
- [x] 4. Phase 4 — Admin surfaces: `POST /engines/reset`, `POST /engines/reset/all`, `navigator.js engines [reset <engine|all>]`, and console score/reset controls.

## Goal

Make `select_best` an **adaptive queue manager** instead of a static ordered walk:

- **Every working engine gets a chance.** Each query is sent to **one** engine, but over time the requests are distributed across the healthy engines (weighted by measured performance), not monopolized by whichever engine sits first in a list. A working engine that is picked and fails falls back sequentially to the next-ranked engine.
- **Failures sink engines in rank.** An engine that fails stops being selected; it falls to the bottom and only climbs back after it recovers.
- **Per-engine timing backoff.** A failure (e.g., a CAPTCHA) raises that engine's *minimum call interval*. The interval escalates on repeated failures and **stays elevated until the engine recovers** (a success starts decaying it back down). If an engine only tolerates being hit every ~5 minutes, the scheduler remembers that and won't call it sooner.
- **User-resettable history.** A user can wipe one engine's reputation/backoff so it gets a fresh "first try" and re-learns its place in the flow.

Deliberately **not** sticky: there is no "current winning engine" that absorbs all traffic. Distribution is the strategy.

## Current Behavior (code map)

| Concern | Location | Behavior |
|---|---|---|
| Static fallback order | `src/search.js:99-104` | Fixed array, hard-coded |
| Fallback selection | `src/search.js:1370-1439` | First-success-wins sequential walk |
| Circuit breaker | `src/search.js:142-174`, `config.searchRouteCircuitOpenMs` (default 300000) | Uniform fixed cooldown on failure |
| Attempt telemetry | `src/search.js:217-268` | `recordEngineAttempt` / `getEngineAttemptStats` → `/stats` |
| Engine registry | `src/engines/index.js` | `getEngineMetadata`, `getBrowserWarmupEngines`, `MCP_SEARCH_ENGINES` |

## Design

### 1. Engine profile (persisted reputation state)

New module `src/engine-scheduler.js` (pure logic, no browser deps — unit-testable with jsdom-free asserts). Persisted to `.cache/search-engine-profiles.json`, one record per engine:

```js
{
  engine: "google_cb",
  // attempt counters (also derivable from the attempt log, but kept for cheap reads)
  attempts: 87, ok: 74, fail: 13, skip: 0, results: 712,
  // timing
  lastCalledAt: 1789..., lastSuccessAt: 1789..., lastFailureAt: 1788...,
  minIntervalMs: 120000,            // adaptive minimum gap before the next call
  failuresInRow: 3, successesInRow: 0,
  // error-gap history: elapsed time between consecutive failures
  failureGapsMs: [240000, 238000, 250000, 310000],
  // error-type tally (drives escalation severity)
  errorTypes: { captcha: 4, timeout: 2, blocked: 3, other: 4 }
}
```

Boot: load file; missing engines get a fresh baseline profile. `SUPPORTED_ENGINES` defines the universe.

### 2. Scoring (the ranking)

A deterministic pure function `scoreEngine(profile, now)` → `number`, computed fresh on every selection (profiles are small; no caching needed). Factors:

- **Success ratio** — `ok / attempts` (best indicator of a working engine).
- **Results per attempt** — `results / attempts` (how much an engine actually returns; a stable engine returning 0 results should score low).
- **Stability / error rate** — weighted failure density over recent windows (reuse the `5m/15m/1h/24h` bucketing idea already in `getEngineAttemptStats`).
- **Recency penalty** — small negative term when `lastFailureAt` is recent (soft demotion *in addition to* the hard timing gate).
- **Reward for recovery** — a success after failures gets a small bonus so a recovered engine climbs back quickly.

Skeleton:

```js
score = w1 * successRate
      + w2 * normalize(resultsPerAttempt)
      + w3 * stabilityFactor        // 1 - weightedRecentFailures
      - w4 * recencyPenalty
      + w5 * recoveryBonus
```

Weights configurable (env), sane defaults. Result: engines with few errors and good yield sit on top; failing engines sink.

### 3. Interval learning (the "4 minutes vs 5 minutes" problem)

Separate from the score — a **hard timing gate** that answers "is it safe to call this engine *now*?"

- Baseline: `minIntervalMs` floor (default e.g. 10–30 s; configured).
- **On failure:** escalate. `minIntervalMs = max(minIntervalMs * 2, errorGapPercentile * safetyFactor)`. The percentile term is the learned part: from `failureGapsMs`, pick the ~75th percentile of "time between failures" and multiply by a safety factor (~1.25) so the scheduler waits *longer than the observed failure cadence*. This is the "it failed at 4-minute gaps, so don't call before ~5 minutes" rule. Escalation is capped (e.g., ≤ 30 min).
- **On success:** decay slowly. `minIntervalMs = max(baseline, minIntervalMs * 0.75)` per consecutive success (or a `-20%` step), so a recovered engine's interval falls back toward baseline over a few successful calls — not instantly.
- **Persistence:** the elevated interval survives restarts (the user explicitly wants the elevated timer to *stay* until the engine recovers, because that recovery is slow).
- Error types weight escalation: `captcha`/`blocked` escalate harder than generic `timeout`.

The existing circuit breaker stays as a **second, harder layer** (catastrophic failure → full freeze). The scheduler's timing gate is the soft layer that handles the rate-limit/anti-bot cadence case.

### 4. Selection algorithm (replaces first-success-wins)

For a `select_best` query in `runFallbackEngineGroups` — **one engine per query**:

1. **Eligibility filter:** engine not circuit-open AND `now >= lastCalledAt + minIntervalMs`. Ineligible engines are skipped (recorded as `skip` in telemetry).
2. **Rank & pick one:** rank the eligible engines by score. Pick exactly **one** engine for this query. To spread load across the healthy pool (not monopolize it), selection is score-weighted: a `score`-weighted roulette over the top tier, so a clearly-dominant engine gets most picks and the runners-up get a steady share. This is distribution *with* preference, not stickiness.
3. **Sequential fallback:** if the picked engine fails (error or zero results), record the failure and immediately try the next-ranked eligible engine, and so on, until one succeeds or the eligible pool is exhausted. The final response always comes from a single working engine. Only when *every* eligible engine fails does the query return errors (mirroring today's all-failed path).
4. **Feedback:** every attempt already flows through `recordEngineAttempt` (ok/fail/skip + result count) — the scheduler consumes that same stream to update profiles. `runSearchRoute`'s success/failure path calls the scheduler's `recordSuccess`/`recordFailure` hooks.

Concurrency guard: fallback is strictly sequential (one engine at a time per query), so lightpanda's shared pool and the page-slot limiter are naturally respected. Explicit engine requests (`engines: [...]` in `web_search`) bypass the scheduler entirely — user-specified order wins.

### 5. Per-engine reset (user control)

Reset = wipe one engine's profile: counters → 0, `minIntervalMs` → baseline, error history cleared, circuit breaker closed. The engine is then eligible immediately, gets a normal first try, and re-learns its place.

Surfaces:
- **HTTP:** `POST /engines/reset` `{ engine: "google_cb" }` (also `POST /engines/reset/all`). Same auth posture as `/console`.
- **CLI:** new `navigator.js` subcommand, e.g. `./navigator.js engines reset google_cb` and `./navigator.js engines` to list rankings. The CLI already has a dispatcher pattern in `navigator.js`.
- **Stats/console:** `/stats` gains `engineProfiles` (score, rank, `minIntervalMs`, ok/fail/results) so the user can see why an engine is throttled and which to reset.

## Architecture

```
config ------> engine-scheduler (new)   # reads baselines/weights/env
search ------> engine-scheduler         # selectEngine(), recordSuccess(), recordFailure(), resetEngine()
engine-scheduler ---> .cache/search-engine-profiles.json
search ------> engines (unchanged)      # drivers stay ignorant of scheduling
```

- `src/engine-scheduler.js` — profiles, scoring, interval learning, selection, reset. Zero browser imports (imports only from `src/engines/index.js` for the engine universe + metadata).
- `src/search.js` — `runFallbackEngineGroups()` rewritten to call the scheduler; `runSearchRoute()` calls the scheduler's feedback hooks alongside existing `recordEngineAttempt`/circuit calls.
- `src/config.js` — new env vars (below).
- `navigator.js` — `engines` subcommand.
- `src/mcp-server.js` — `/stats` additions + `/engines/reset` route (and optionally an MCP tool, TBD).

## Configuration (env)

| Variable | Default | Description |
|---|---|---|
| `SEARCH_QUEUE_MIN_INTERVAL_MS` | `30000` | Baseline floor for an engine's minimum call interval |
| `SEARCH_QUEUE_MAX_INTERVAL_MS` | `1800000` | Cap on escalated interval (30 min) |
| `SEARCH_QUEUE_ESCALATION_FACTOR` | `2` | Multiplier applied to `minIntervalMs` on failure |
| `SEARCH_QUEUE_ERROR_GAP_PERCENTILE` | `0.75` | Percentile of observed failure gaps used for the learned interval |
| `SEARCH_QUEUE_ERROR_GAP_SAFETY` | `1.25` | Multiplier on the learned gap |
| `SEARCH_QUEUE_DECAY_PER_SUCCESS` | `0.75` | `minIntervalMs` multiplier on each consecutive success |
| `SEARCH_QUEUE_PROFILE_PATH` | `.cache/search-engine-profiles.json` | Persistence path |

Score weights: `SEARCH_QUEUE_W_SUCCESS`, `SEARCH_QUEUE_W_RESULTS`, `SEARCH_QUEUE_W_STABILITY`, `SEARCH_QUEUE_W_RECENCY`, `SEARCH_QUEUE_W_RECOVERY`.

## Phases

### Phase 1 — Profile store + scoring
Create `src/engine-scheduler.js`:
- Profile load/save/persist (mirror the pattern used by `routeCircuitState` / `engineAttemptLog` persistence).
- `ingestAttempt(engine, status, errorMsg, resultCount, at)` — subscribe to the same calls `recordEngineAttempt` already receives (or refactor so the scheduler *is* the telemetry consumer).
- `scoreEngine(profile, now)` + `rankEngines(now)`.
- Unit tests (`tests/engine-scheduler.test.js`): scoring monotonicity (more ok/fewer fail → higher score), zero-attempt handling, recovery bonus.
- Wire `/stats` to expose scores/rankings.

### Phase 2 — Interval learning
- Track `failureGapsMs` (elapsed time between consecutive failures) and `errorTypes`.
- Escalate `minIntervalMs` on failure (cap applied), decay on success (floor applied).
- `isEligible(engine, now)` gate used by selection.
- Tests: escalation caps, decay floor, gap-percentile math, persistence of elevated interval across reload.

### Phase 3 — Selection rewrite
- Rewrite `runFallbackEngineGroups` to: eligibility filter → rank → **pick one engine** (score-weighted) → on failure, **sequential fallback** through the remaining ranked eligible engines until one succeeds or the pool is exhausted.
- **Sequential fallback:** example — primary pick `google_lp` fails → try next-ranked `bing_lp`; if that fails too → `mojeek_lp`, and so on. The final response always comes from a single working engine. Distribution is across *requests*, not within a query.
- Keep explicit-engine group path (`runExplicitEngineGroup`) untouched.
- Verify timing logs + `📊` result distribution lines show **different engines** winning different queries over a batch (spread across the healthy pool), not one engine every time.
- Tests (`tests/search-queue.test.js`): mocked drivers, verify one engine per query, verify sequential fallback on failure, verify failed engine sinks out of the pool, verify reset re-admits an engine.

### Phase 4 — Admin surfaces
- `POST /engines/reset` + `/engines/reset/all` in `src/mcp-server.js`; `GET /stats` gains `engineProfiles`.
- `navigator.js engines` subcommand (list rankings / reset one engine) using the existing dispatcher pattern.
- Optional MCP tool (e.g., `search_engines_reset`) — decide in review.
- Web console: show rankings + reset button (follows the console's existing pattern in `web-console/src/main.jsx`).

## Edge Cases & Risks

- **Latency:** sequential fallback means one engine at a time per query — no added page-slot pressure; a fallback only costs one extra engine round-trip when the primary fails. Failures are the exception, so steady-state latency is unchanged.
- **Overlap/dedup:** distributing engines across requests (different queries using different engines) doesn't increase per-query dedup pressure — `dedupeAndMergeResults` still handles the rare same-query fallback overlap.
- **Thrash between engines:** never switch engines *mid-query*; selection happens once per query. Within a query, the engine set is fixed.
- **Explicit engines:** user-specified engines must never be re-ranked or throttled by the scheduler. Explicit path already bypasses `runFallbackEngineGroups`.
- **Write amplification:** profile persistence on every attempt could churn disk. Debounce/batch writes (e.g., 1 write per second max, or write on change + shutdown).
- **Cold start:** fresh profiles have zero attempts — score must handle `attempts === 0` (treat as neutral, mid-tier, so new engines still get a chance rather than being assumed great or terrible). This is exactly the "try it for the first time, let it settle" behavior the reset flow relies on.
- **Retained circuit breaker:** keep `getRouteCircuit` as the hard safety layer; the scheduler's timing gate is additive, not a replacement. Both are checked before a call.
- **Backoff plateau:** a failing engine whose interval hits the cap should still be periodically probed at the cap (half-open style) so recovery is ever detected — otherwise a permanently-CAPTCHA'd engine stays on the bench forever and the interval never decays (it only decays on success).

## Verification

1. Unit tests pass: `docker compose exec navigator npx vitest run tests/engine-scheduler.test.js tests/search-queue.test.js`.
2. `select_best` queries over a batch of ~20 queries: `📊` distribution lines show **multiple engines** contributing (not one engine + `skipped:` lines for all others).
3. Force a failure (point a driver at a bad proxy or send a fake CAPTCHA error): `/stats` shows that engine's `minIntervalMs` escalated and its score dropping below working engines; subsequent queries skip it until the interval elapses.
4. Reset: `./navigator.js engines reset google_cb` → profile counters zeroed, `minIntervalMs` at baseline, engine re-appears in the next query's distribution.
5. Persistence: `docker restart navigator` → elevated intervals and scores survive; a previously recovered engine's interval continues decaying.
