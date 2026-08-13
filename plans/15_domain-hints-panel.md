# Domain Hints Panel — Web Console Plan

## Plan Status

**Status: IMPLEMENTED** — created 2026-08-12. All seven checklist items done. The
console has a Domain hints view (`/console/api/hints`), the `/console/api/hints` REST API is
live behind `enableWebConsole`, `/extract?hint=` enables test-before-save, and section
selectors that match 0 elements surface a `⚠` warning in the output. Panel saves are
atomic + `.bak` + cache-cleared (live without restart). Absorbed into `AGENTS.md`
Domain Hints Workflow §Panel-first workflow.

### Checklist

- [x] 1. Add `validateHintRule()` + `saveDomainHints()` to `src/domain-hints.js` (port validation from `tests/domain-hints.test.js`).
- [x] 2. Add `hint` override param to `GET /extract` (test-before-save) and thread it through `openTargetsParallel()` → `browserOpenAndExtract()`.
- [x] 3. Add `/console/api/hints` GET list + validate + create + update endpoints in `src/mcp-server.js`, gated by `enableWebConsole`.
- [x] 4. Add `hints` mode to the console: nav button, `HintsView` list, `HintEditor` (Form+JSON), `HintTestPanel` (live browser test).
- [x] 5. Rebuild console (`npm run console:build`), lint, run tests.
- [x] 6. Update `AGENTS.md` Domain Hints Workflow, `docs/domain-hints.md`, README.
- [x] 7. Live verification against the container (create → validate → test-before-save → save → extract without restart → update → cleanup).

---

## 1. User Request Log

| # | Date | Request | Status |
|---|------|---------|--------|
| 1 | 2026-08-12 | Add a panel for domain hints in the web console where the user can add, create and update domains and test them. | planned |
| 2 | 2026-08-12 | Decisions: Form + JSON tabs editor; edit the static `domain-hints.json` (no overlay store); minimal list (no reorder / match-checker / delete); keep plan-only for now. | decided |

---

## 2. Goal

A new **Domain Hints** view in the web console (`/console/api/hints`) that replaces the
hand-editing workflow (`edit domain-hints.json` → `docker cp` → `docker restart` →
`curl /extract`). From the panel an operator can:

- **List** all hints with their match fields, comments, and test URLs.
- **Create / edit** hints (Form + JSON tabs), validated against the schema before saving.
- **Test** a hint in a dedicated **testing panel** — run it against the real browser on a
  real URL and see the extracted output (text + optional screenshot) live, before saving.

Saving is atomic, backed up, and immediately live via `clearDomainHintCache()` — the
server picks up edits without a restart.

---

## 3. Why

The current hint workflow is slow and restart-bound:

1. Edit `domain-hints.json` by hand (schema is only enforced by tests).
2. `docker cp` the file into the container (or commit + rebuild).
3. `docker restart navigator` — `getDomainHints()` caches at module level
   (`src/domain-hints.js:4-5,83-90`) and `clearDomainHintCache()` is never called.
4. `curl "http://localhost:3000/extract?url=..."` to see the result, then repeat.

There is no way to test a rule against a real page **before** committing it, no
validation feedback in the authoring loop, and no guard against duplicate
`domain|pathPattern` entries (the test suite at `tests/domain-hints.test.js:104-107`
rejects those, but only after the fact).

The console already has a write-from-UI precedent: the **Manage** panel PUTs `.env`
through `applyConfigUpdates()` (`src/mcp-server.js:531-633`, validate → backup →
write → hot-apply). The hints panel is the same pattern applied to
`domain-hints.json`, with the added value of test-before-save.

---

## 4. Design Overview

### 4.1 The panel edits the static file (source of truth)

`domain-hints.json` is bind-mounted at `/app` (repo root). Writing it from inside the
container writes the host file too — no `docker cp`. It stays source-controlled: the
operator can still commit panel-made changes with git. We deliberately do **not** use
the separate runtime overlay store proposed in `plans/llm-managed-domain-hints.md`
— that plan is for LLM/agent-driven rules (overlay, enabled-by-default-off, revision
counter). This panel is a human operator editing the real source file. Both features
are complementary and share the new `validateHintRule()` primitive.

### 4.2 Test-before-save needs a request-scoped hint

`browserOpenAndExtract()` resolves the hint internally at `src/search.js:1779-1781`
(`getDomainHints` → `findDomainHint`) and the result is cached by URL. To test an
**unsaved** candidate hint, `GET /extract` gets an optional `hint` query param
(URL-encoded JSON). The candidate fully replaces the resolved static hint for that one
request (replace semantics — the URL is known, so match metadata is irrelevant). This
is console-HTTP-only; it does **not** add a `domainHint` param to the MCP `web_fetch`
tool (that stays owned by `plans/llm-managed-domain-hints.md`).

### 4.3 Caching stays correct

- After any mutation: `saveDomainHints()` writes the file, then calls
  `clearDomainHintCache()` (`src/domain-hints.js:92-95`) — next fetch re-reads disk.
- The `web_fetch` / `/extract` tool cache keys on `{ url, maxChars, ... }` only, so an
  edit that changes which rule matches a URL would serve stale output for that URL
  until `bypassCache`. The panel's **Test** action always calls `/extract?bypassCache=1`
  (the endpoint must accept it) so previews are never stale. Full cache invalidation on
  save is a follow-up (see §12).

---

## 5. Server-Side API (`src/mcp-server.js`, gated by `enableWebConsole` like the other `/console/*` routes)

Hints are an ordered array with no ids, so **array index** is the stable reference
(the duplicate `domain|pathPattern` invariant from the tests guarantees keys are
unique). Create/update endpoints validate, then `saveDomainHints()`, then return the
fresh result.

| Method & Path | Body / Params | Response |
|---|---|---|
| `GET /console/api/hints` | — | `{ ok, hintsPath, count, hints: [...] }` — the full ordered list |
| `POST /console/api/hints/validate` | `{ hint }` | `{ ok, valid, errors: [{field, message}], warnings: [] }` — pure validation, no write, no navigation |
| `POST /console/api/hints` | `{ hint }` | validate → duplicate check → append → save → `{ ok, index, hint, hintsPath }` |
| `PUT /console/api/hints/:index` | `{ hint }` | validate → duplicate check excluding self → replace → save → `{ ok, index, hint, hintsPath }` |
| `GET /extract` | existing + `hint=<urlencoded-json>` + `bypassCache=1` | unchanged markdown response; candidate hint applied for this request only |

Gating: same guard used by `/console/config`, `/console/api-keys`, `/console/logs`
(`maybeStartHttpServer`, `src/mcp-server.js:2596+`). All hint routes reject with 403
when `enableWebConsole` is off. Mutations also require `ENABLE_HTTP_MCP`-style
readiness — they just need the HTTP server, which the console already implies.

### 5.1 Duplicate & validation errors

- `validateHintRule()` (below) is the single source of truth, shared by endpoints and tests.
- Duplicate check on save: normalized key `domain|pathPattern`. Creating/updating one
  that collides with another index → 400 with `{ field: "pathPattern", message: "collides with hint #N (github.com / */*)" }`.
- `domain` must match `/^[a-z0-9.-]+$/` and `pathPattern` must start with `/`
  (per `tests/domain-hints.test.js:59-60`).

**Deliberately out of scope for v1** (kept minimal per requirements): delete, reorder
(first-match order stays file order; new hints append), and a "which rule applies"
checker. All are cheap additions later if wanted.

---

## 6. Test-Before-Save: `hint` param on `/extract`

### Server threading

1. **`src/mcp-server.js` `/extract` handler (line 2774):** parse optional `hint`
   query param (`JSON.parse` of the decoded string). If present, run
   `validateHintRule(candidate)`; on errors return `400 { ok:false, errors }` before
   any navigation. Pass the candidate through to `openTargetsParallel()`.
2. **`openTargetsParallel(targetUrls, maxParallel, includeSeoAnalysis, debug, opts = {})`
   (line 1340):** accept `opts.hintOverride`, forward it to `browserOpenAndExtract`.
   Add `bypassCache` passthrough so `/extract?hint=...&bypassCache=1` never serves a
   stale cached extraction.
3. **`browserOpenAndExtract({ url, maxChars, includeSeoAnalysis, hintOverride })`
   (line 1768):** at `src/search.js:1779-1781`, when `hintOverride` is set use it as
   the hint and skip `findDomainHint` (replace semantics). Everything downstream
   (`flags`, `waitForSelector`, `stabilizeStrategy`, sections, Readability, fallback)
   already reads from the local `hint` variable — no further changes.
4. Debug log the source as `hint=override` vs `hint=static` under `DEBUG=1`.

### Contract

- `hint` applies to the whole multi-target call; all targets get the same candidate
  (caller passes one URL per test in practice).
- Candidate uses the same schema as a saved hint but `domain`/`pathPattern` are
  optional for testing (the URL is known). `validateHintRule(hint, { scope: "test" })`
  allows omitting them; save-scope requires them.
- Markdown response is identical to a normal fetch — the panel renders it verbatim.

---

## 7. Validation Module — `src/domain-hints.js`

Port the checks currently living only in `tests/domain-hints.test.js:56-94` into
reusable, runtime-safe functions (jsdom is a runtime dependency, see `package.json`):

- `validateHintRule(hint, { scope = "static" | "test" } = {})` → `{ errors: [{field, message}], warnings: [] }`:
  - `domain`: string, `/^[a-z0-9.-]+$/` (required unless `scope === "test"`).
  - `pathPattern`: string starting with `/`, default `"/**"` (required unless test scope).
  - `pageType`, `comment`: strings (comment required for save scope per llm-managed convention).
  - `testUrls`: optional array, each `^https://`, and each must **self-match** — but the
    self-match check needs the surrounding list, so it runs at save time in the endpoint
    (`findDomainHint(url, listWithCandidateInPlace) === candidate`), not in
    `validateHintRule`; validate keeps it to format checks.
  - `waitForSelector`, `skipSelectors[]`, `section.selector`, `field.selector`:
    valid CSS via `validateSelector()` (JSDOM `querySelectorAll`, exactly as the tests do).
  - `section.label` string; `section.priority` ∈ `{high, medium, low}`;
    `section.itemLabel` optional string; `field.label` string;
    `field.format` ∈ `{markdown, text, list}`.
  - `preferReadability` ∈ `{undefined, true, false}`;
    `tableExtraction` ∈ `{undefined, "content", "disabled"}`;
    `flags.*` ∈ `{undefined, true, false}`.
  - Unknown top-level keys → warning (not error) so the file format can evolve.
- `validateSelector(selector)` — throws/returns error on malformed CSS.
- `saveDomainHints(hints, hintsPath)` — atomic write: `JSON.stringify(hints, null, 2)`
  to a temp sibling file, then `fs.rename` over the target. Before overwriting, copy
  the current contents to `domain-hints.json.bak` (single rotating backup). Then call
  `clearDomainHintCache()`. Refuse to write when `hintsPath` is `/dev/null` or
  otherwise unwritable (return error, do not throw).

Note: `getDomainHints()` filters out entries without a `string` domain at load
(`src/domain-hints.js:72`) — a broken entry written by a future non-panel process
would silently vanish from matching. The panel's `GET /console/api/hints` reads the **raw**
loaded file (not the filtered cache) so broken entries still appear in the list and can
be opened and fixed in the editor, instead of hiding them.

---

## 8. Console UI (`web-console/src/main.jsx` + `style.css`)

### 8.1 Navigation

- Add `hints` mode: `modeFromPath` (`/console/api/hints`) + `pathForMode` (lines 100-112).
- New nav button **Domain hints** in `Layout`'s `.mode-switch` (line 159-186), placed
  after **Manage**.
- Mode is rendered like the other views inside `App`'s switch; the polled telemetry
  loop (`App.load`, line 2046) keeps running so the header stays live.

### 8.2 `HintsView` (list)

```
┌─ DOMAIN HINTS ─────────────────────────────────────────────────────────┐
│ path: /app/domain-hints.json   ·   50 hints                            │
│ [ + New hint ]   [ 🔍 Search: repo            ]                         │
│                                                                        │
│  #  DOMAIN          PAGE TYPE   PATH          COMMENT        TEST  ACTS │
│  1  github.com      profile     /*            User profile  1 url [T][E]│
│  2  github.com      repo        /*/*          Repo landing   3 urls [T][E]│
│  3  en.wikipedia.org article    /wiki/**      Article body   2 urls [T][E]│
└────────────────────────────────────────────────────────────────────────┘
```

- Rows from `GET /console/api/hints`: index, domain, pageType, pathPattern (mono), comment,
  testUrls count.
- Row actions: **Test** (opens the editor with the testing panel for the *saved* hint);
  **Edit** (opens the editor pre-filled with the hint). Header: **+ New hint** and a
  search/filter box.
- No reorder, no delete, no match-checker in v1 (kept minimal — see §5.1).

### 8.3 `HintEditor` (create / edit) + `HintTestPanel` (test)

The editor and testing panel are a **two-pane layout** — the testing panel is a
first-class, always-present pane beside the editor, not a hidden action. Editing on the
left, live browser output on the right.

```
┌─ EDIT — github.com / */* ──────────────────┬─ TEST ON PAGE ─────────────────────┐
│ [Form | JSON]  backend: cloakbrowser       │ URL [ https://github.com/craftpip ] │
│                                            │ [▶ Run test]   auto-re-run: [x]     │
│ Domain      [github.com                ]   │─────────────────────────────────────│
│ Path        [/*/*                      ]   │ ● running… waitForSelector 312ms     │
│ Page type   [repo                      ]   │   stabilize 1.1s · extract 92ms     │
│ Comment     [Repo landing: readme etc  ]   │   ✓ 1,842 chars · 2 tables          │
│ Test URLs   [https://github.com/craftpip ] │─────────────────────────────────────│
│             [+ add]                       │ [Text ▾]  README                     │
│ Wait for    [article.markdown-body    ]   │          # navigator …               │
│ Prefer Rdbl [on]  Stabilize [network ▾]   │          ## Table 1 …                │
│ Sections (2) [+ add]                     │          [Screenshot]  [Raw]          │
│  1 [article.markdown-body] "README" high │─────────────────────────────────────│
│  2 [nav.file-tree]          "Files" low  │ ⚠ article.markdown-body: 0 matches    │
│ Flags: [ ] auth [ ] visual [ ] bot [ ]   │ → try "main" or a data-testid         │
│ [ ▼ Validate ]  [ 💾 Save ]  [ ✕ Cancel ] │                                      │
└───────────────────────────────────────────┴──────────────────────────────────────┘
```

**Left pane — `HintEditor`:** two tabs, **Form** and **JSON** (same as before):
- **Form** — guided fields for the full schema:
  - Identity: `domain`, `pathPattern` (with `/`-prefix hint), `pageType`, `comment`,
    `testUrls` (add/remove rows, each validated as https).
  - Navigation/extraction: `waitForSelector`, `skipSelectors` (list), `preferReadability`
    (toggle), `tableExtraction` (select: unset / content / disabled),
    `stabilizeStrategy` (select: unset / network_idle / content_idle / mutation),
    `contentSelectors` (list, used by content_idle + SEO).
  - Sections: repeating rows — `selector`, `label`, `priority` (select), `itemLabel`,
    plus per-section `fields` sub-editor (`selector` / `label` / `format`).
  - Flags: 4 checkboxes (`authWall`, `visualOnly`, `botProtected`, `requiresChromium`).
- **JSON** — raw textarea of the current hint (`JSON.stringify(hint, null, 2)`),
  round-trips with the Form tab; switching tabs re-parses and re-validates.
- **Actions:** **Validate** → `POST /console/api/hints/validate`, inline field-level errors
  (Save is blocked while errors exist). **Save** → `POST /console/api/hints` (new) or
  `PUT /console/api/hints/:index` (edit) → refresh list, close. **Cancel** → discard.

**Right pane — `HintTestPanel`:** a dedicated component that runs the current
candidate hint (form state, not the saved file) against the real browser:
- **URL input** — defaults to `testUrls[0]`; editable. Missing/empty URL → Run disabled
  with a hint to add a test URL.
- **Run test** → `GET /extract?url=…&maxChars=8000&bypassCache=1&hint=<encodeURIComponent(JSON)>`.
  The candidate is validated server-side first; a validation error renders in the pane
  without navigation.
- **Auto re-run** checkbox (default on, 800ms debounce) — every edit to the form
  re-triggers the test so the operator iterates live while typing selectors. Manual
  **▶ Run test** always available.
- **Status bar** — spinner while running; on completion shows the client-measured
  round-trip time, char count, table count (parsed from the response), and the hint
  source (`override` vs `static`). A structured `format=json` response for `/extract`
  (per `AGENTS.md`'s web-fetch-json note) is a possible future enhancement that would
  let the status bar show per-step timings — out of scope here, the markdown response
  is sufficient for iterating on selectors.
- **Output tabs** — **Text** (rendered markdown of the `/extract` response, scrollable)
  and **Raw** (verbatim response). A **Screenshot** toggle shows the page beside the
  text via the existing `GET /screenshot?url=…` endpoint (hint only affects extraction,
  not the visual — seeing both lets the operator verify the selectors target the right
  regions of the page).
- **Zero-match / error feedback** — `0 matches` warnings for section selectors are
  surfaced prominently with a suggested next step, instead of burying them in the
  markdown (e.g. "article.markdown-body: 0 matches — try main or a data-testid").
- **Backend note** — runs on the same `BROWSER_BACKEND` the MCP server uses for
  `web_fetch`, so the test result is exactly what a real `web_fetch` would produce.

**Entry points into the two-pane editor:**
- **+ New hint** → empty editor + empty test panel (user adds a test URL before running).
- **Edit** from a list row → editor pre-filled; test panel defaults to `testUrls[0]`.
- **Test** from a list row → same, but for the *saved* hint (no candidate overrides)
  — useful for iterating on existing rules and comparing against the current behavior.

### 8.4 Styling

Reuse existing CSS vars and classes (`.panel`, `.card`, `.button`, `.input`,
`.mono`, `--gold`/`--red` for badges). New styles: the two-pane editor/test layout
(responsive grid — panes stack on narrow screens), section/fields repeaters, and the
test status bar + zero-match warning block. Dark theme inherits via `data-theme` vars
automatically.

---

## 9. Implementation Steps (ordered)

### Server
1. `src/domain-hints.js`: add `validateHintRule`, `validateSelector`, `saveDomainHints`
   (§7). Keep exports backward-compatible; `getDomainHints`/`findDomainHint` unchanged.
2. `src/search.js`: add `hintOverride` to `browserOpenAndExtract` (§6 server threading
   step 3), debug log.
3. `src/mcp-server.js`:
   - `openTargetsParallel(..., opts)` — forward `hintOverride`, honor `bypassCache`.
   - `/extract` handler — parse + validate `hint`, pass through (§6.1).
   - New `/console/api/hints` routes (§5): GET list, POST validate, POST create, PUT update —
     with `enableWebConsole` gating and save-time duplicate check.

### Console
4. `modeFromPath`/`pathForMode` + nav button (§8.1).
5. `HintsView` list + search + New/Edit/Test entry points (§8.2).
6. `HintEditor` form/JSON + validate + save (§8.3 left pane).
7. `HintTestPanel` — run/debounce/status/timing/output tabs/screenshot/zero-match
   feedback (§8.3 right pane).
8. `style.css` additions (§8.4).

### Verify
9. `npm run console:build` (host, needs dev deps) → confirm `web-console/dist`
   references the new hashed bundle.
10. `docker compose exec navigator npm install --include=dev` then
    `npx vitest run tests/domain-hints.test.js tests/domain-hints-api.test.js` and
    `npm run lint`.

---

## 10. Tests

### `src/domain-hints` unit tests
1. `validateHintRule` accepts a valid full hint; rejects bad domain, bad pathPattern,
   invalid CSS in wait/skip/section/field selectors, bad priority, bad field format,
   bad flags; warns on unknown keys.
2. Test-scope allows missing `domain`/`pathPattern`; save-scope requires them.
3. `saveDomainHints` writes atomically (temp + rename), creates `.bak`, clears the
   cache (subsequent `getDomainHints` re-reads), and errors cleanly on `/dev/null`.

### HTTP API tests (`tests/domain-hints-api.test.js`, temp hints file)
4. `GET /console/api/hints` returns the ordered list; 403 when console disabled.
5. Create → appended at end; duplicate key → 400 naming the collision; invalid selector → 400.
6. Update replaces in place; out-of-range index → 400.
7. `/extract?hint=` returns validation 400 for a bad candidate and applies a good
   candidate without touching the saved file; `bypassCache=1` bypasses the tool cache.

### Console
9. `npm run lint` clean; `npm run console:build` succeeds.

### Live verification
1. Open `/console/api/hints`; confirm list matches `domain-hints.json`.
2. Create a hint for `example.com` with `waitForSelector: "p"` — validation clean,
   duplicate-free, appended to the file.
3. In the two-pane editor, **Run test** against `https://example.com` before saving →
   status bar + Text/Raw output appear; edit a selector and confirm auto re-run refreshes
   the output; toggle Screenshot and confirm the page renders beside the text.
4. Save → run `curl /extract?url=https://example.com` **without restart** → hint applies.
5. `docker compose restart navigator` → hint still there (persisted file).
6. Edit the test hint's selector and verify the update replaces the original entry.
7. Clean up: the test hint is removed manually from the file (no delete in v1) and
   extraction falls back.

---

## 11. Documentation

- `AGENTS.md` → Domain Hints Workflow section: panel-first workflow (list → edit →
  validate → test-before-save → save is live immediately), note that panel saves need
  no `docker cp`/restart, backup file location, duplicate rule.
- `docs/domain-hints.md` → schema reference stays authoritative; add note that the
  console panel is the recommended authoring path and that `navigationWait` is
  documented but **not implemented** (already true today; the panel should not offer it).
- `README.md` → console feature list mentions Domain Hints panel.

---

## 12. Non-Goals

- **LLM/agent hint management** — that is `plans/llm-managed-domain-hints.md`
  (overlay store, `domain_hints` MCP tool, revision/priority). This plan only builds
  `validateHintRule` which that plan reuses; the `mergeDomainHints`/resolver machinery
  is deliberately not built here.
- **`navigationWait` and `workflow[]`** — unimplemented in code today
  (`navigationWait` is docs-only; `workflow` is `plans/domain-hint-flows.md`).
  The panel offers only fields the engine actually reads.
- **Selector auto-detection / page inspection** — stays with the devtools browser
  tools and the AGENTS.md exploration routine; embedding those in the console is a
  possible future step, not this one.
- **Delete, reorder, and "which rule applies"** — deliberately excluded from v1 to keep
  the list minimal (per requirements); cheap to add later (§5.1).
- **Multi-file / multi-env hint management**, migration, or import/export.
- **Adding a `domainHint` param to the MCP `web_fetch` tool** — owned by the
  llm-managed plan; the `hint` param here is console-HTTP only.
- **Cache-key invalidation on save** (only `bypassCache` on the Test action for now;
  full invalidation is a follow-up if stale results surface).
