# Domain Hints Panel — Web Console Plan

## Plan Status

**Status: NOT STARTED** — created 2026-08-12. No hint-management API exists today: the
only writers of `domain-hints.json` are humans editing the file by hand, and the only
read paths are `getDomainHints()` (load) and `findDomainHint()` (match). There is no
`/console/hints` route, no `Hints` mode in the console (`modeFromPath` at
`web-console/src/main.jsx:100` knows only `status`/`manage`/`tools`/`keys`), and
`clearDomainHintCache()` has zero callers.

### Checklist

- [ ] 1. Add `validateHintRule()` + `saveDomainHints()` to `src/domain-hints.js` (port validation from `tests/domain-hints.test.js`).
- [ ] 2. Add `hint` override param to `GET /extract` (test-before-save) and thread it through `openTargetsParallel()` → `browserOpenAndExtract()`.
- [ ] 3. Add `/console/hints` CRUD + validate + match + reorder endpoints in `src/mcp-server.js`, gated by `enableWebConsole`.
- [ ] 4. Add `hints` mode to the console: nav button, `HintsView` list, `HintEditor` form with live validate + test + save.
- [ ] 5. Rebuild console (`npm run console:build`), lint, run tests.
- [ ] 6. Update `AGENTS.md` Domain Hints Workflow, `docs/domain-hints.md`, README.
- [ ] 7. Live verification against the container (add → validate → test-before-save → save → extract without restart → reorder → delete).

---

## 1. User Request Log

| # | Date | Request | Status |
|---|------|---------|--------|
| 1 | 2026-08-12 | Add a panel for domain hints in the web console where the user can add, create and update domains and test them. | planned |

---

## 2. Goal

A new **Domain Hints** view in the web console (`/console/hints`) that replaces the
hand-editing workflow (`edit domain-hints.json` → `docker cp` → `docker restart` →
`curl /extract`). From the panel an operator can:

- **List** all hints with their match fields, comments, test URLs, and validation state.
- **Create / edit / delete** hints, including reorder (first-match-wins makes order significant).
- **Validate** a hint before saving (same checks the test suite runs).
- **Test** a hint against a real URL **before saving** — no restart, no docker cp.
- **Check** which rule currently applies to a given URL (`findDomainHint`).

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
validation feedback in the authoring loop, no visibility into which rule a URL
currently resolves to, and no guard against duplicate `domain|pathPattern` entries
(the test suite at `tests/domain-hints.test.js:104-107` rejects those, but only after
the fact).

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
  (the endpoint must accept it) so previews are never stale. A future step could
  invalidate matching cache keys on save (see §10).

---

## 5. Server-Side API (`src/mcp-server.js`, gated by `enableWebConsole` like the other `/console/*` routes)

Hints are an ordered array with no ids, so **array index** is the stable reference
(the duplicate `domain|pathPattern` invariant from the tests guarantees keys are
unique). All mutation endpoints validate, then `saveDomainHints()`, then return the
fresh list (or a result object).

| Method & Path | Body / Params | Response |
|---|---|---|
| `GET /console/hints` | — | `{ ok, hintsPath, count, hints: [...], duplicates: [{index, key, collisionIndex}], errorsByIndex: {i: [{field, message}]} }` — list + duplicate/validation summary so the UI can badge broken entries |
| `POST /console/hints/validate` | `{ hint }` | `{ ok, valid, errors: [{field, message}], warnings: [] }` — pure validation, no write, no navigation |
| `POST /console/hints` | `{ hint, position? }` | validate → duplicate check → insert (default append) → save → `{ ok, index, hint, hintsPath }` |
| `PUT /console/hints/:index` | `{ hint }` | validate → duplicate check excluding self → replace → save → `{ ok, index, hint, hintsPath }` |
| `DELETE /console/hints/:index` | — | range check → splice → save → `{ ok, index, count }` |
| `POST /console/hints/reorder` | `{ from, to }` | move (array order = match order) → save → `{ ok, hints }` |
| `POST /console/hints/match` | `{ url }` | `{ ok, url, match: { index, hint } \| null }` via `findDomainHint()` — "which rule applies here" |
| `GET /extract` | existing + `hint=<urlencoded-json>` + `bypassCache=1` | unchanged markdown response; candidate hint applied for this request only |

Gating: same guard used by `/console/config`, `/console/api-keys`, `/console/logs`
(`maybeStartHttpServer`, `src/mcp-server.js:2596+`). All hint routes reject with 403
when `enableWebConsole` is off. Mutations also require `ENABLE_HTTP_MCP`-style
readiness — they just need the HTTP server, which the console already implies.

### 5.1 Duplicate & validation errors

- `validateHintRule()` (below) is the single source of truth, shared by endpoints and tests.
- Duplicate check: normalized key `domain|pathPattern`. Creating/updating one that
  collides with another index → 400 with `{ field: "pathPattern", message: "collides with hint #N (github.com / */*)" }`.
- `domain` must match `/^[a-z0-9.-]+$/` and `pathPattern` must start with `/`
  (per `tests/domain-hints.test.js:59-60`).

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
would silently vanish. The panel's `GET /console/hints` surfaces those as validation
errors instead (compare raw loaded list, not the filtered cache), so nothing hides.

---

## 8. Console UI (`web-console/src/main.jsx` + `style.css`)

### 8.1 Navigation

- Add `hints` mode: `modeFromPath` (`/console/hints`) + `pathForMode` (lines 100-112).
- New nav button **Domain hints** in `Layout`'s `.mode-switch` (line 159-186), placed
  after **Manage**.
- Mode is rendered like the other views inside `App`'s switch; the polled telemetry
  loop (`App.load`, line 2046) keeps running so the header stays live.

### 8.2 `HintsView` (list)

```
┌─ DOMAIN HINTS ─────────────────────────────────────────────────────────┐
│ path: /app/domain-hints.json   ·   50 hints   ·   0 duplicates          │
│ [ + New hint ]   [ 🔍 Search: repo            ]                         │
│                                                                        │
│  #  DOMAIN          PAGE TYPE   PATH          COMMENT        TEST  ACTS │
│  1  github.com      profile     /*            User profile  1 url [T][E][↑][↓][✕] │
│  2  github.com      repo        /*/*          Repo landing   3 urls     │
│  ⚠  en.wikipedia.org article    /wiki/**      [bad selector] 2 urls     │
│                                                                        │
│ ── WHICH RULE APPLIES? ──────────────────────────────────────────────   │
│  URL [ https://github.com/craftpip/navigator ]  [ Check ]              │
│  → hint #2 · github.com · /*/* · "Repo landing"                        │
└────────────────────────────────────────────────────────────────────────┘
```

- Rows from `GET /console/hints`: index, domain, pageType, pathPattern (mono), comment,
  testUrls count, duplicate warning icon, per-hint validation errors (`errorsByIndex`).
- Row actions: **Test** (uses first testUrl, or an inline URL field) → opens editor in
  test/preview mode; **Edit**; **↑/↓** (reorder, POST `/console/hints/reorder`);
  **✕** (delete, confirm dialog). Duplicates banner across the top with collision pairs.
- "Which rule applies" box → `POST /console/hints/match`.

### 8.3 `HintEditor` (create / edit / test)

Two tabs: **Form** and **JSON**.

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
- **Actions bar:**
  - **Validate** → `POST /console/hints/validate`, inline field-level errors.
  - **Test on page** → URL input (defaults to `testUrls[0]`) + candidate →
    `GET /extract?url=…&maxChars=8000&bypassCache=1&hint=<encodeURIComponent(JSON)>`;
    renders the markdown result in a scrollable preview below (with a raw/rendered toggle).
  - **Save** → `POST /console/hints` (new) or `PUT /console/hints/:index` (edit) →
    refresh list, close editor. Blocked while validation errors exist.
- **Test mode from the list row** opens the editor read-only-ish (only testUrl
  adjustable) for the *saved* hint — useful for iterating on existing rules.

### 8.4 Styling

Reuse existing CSS vars and classes (`.panel`, `.card`, `.button`, `.input`,
`.mono`, `--gold`/`--red` for badges). New styles only for section/fields repeaters and
the test preview panel. Dark theme inherits via `data-theme` vars automatically.

---

## 9. Implementation Steps (ordered)

### Server
1. `src/domain-hints.js`: add `validateHintRule`, `validateSelector`, `saveDomainHints`
   (§7). Keep exports backward-compatible; `getDomainHints`/`findDomainHint` unchanged.
2. `src/search.js`: add `hintOverride` to `browserOpenAndExtract` (§6.3), debug log.
3. `src/mcp-server.js`:
   - `openTargetsParallel(..., opts)` — forward `hintOverride`, honor `bypassCache`.
   - `/extract` handler — parse + validate `hint`, pass through (§6.1).
   - New `/console/hints*` routes (§5) with `enableWebConsole` gating.
   - `getHintListForConsole()` helper: raw list + duplicate detection + per-index
     `validateHintRule` errors (uses `loadDomainHints`, not the filtered cache).

### Console
4. `modeFromPath`/`pathForMode` + nav button (§8.1).
5. `HintsView` list + match tester (§8.2).
6. `HintEditor` form/JSON + validate + test + save (§8.3).
7. `style.css` additions (§8.4).

### Verify
8. `npm run console:build` (host, needs dev deps) → confirm `web-console/dist`
   references the new hashed bundle.
9. `docker compose exec navigator npm install --include=dev` then
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
4. `GET /console/hints` returns list + duplicate/validation summary; 403 when console disabled.
5. Create → append; duplicate key → 400 naming the collision; invalid selector → 400.
6. Update replaces in place; delete range-checked; reorder persists order.
7. `match` returns the right rule for a URL and `null` when none.
8. `/extract?hint=` returns validation 400 for a bad candidate and applies a good
   candidate without touching the saved file; `bypassCache=1` bypasses the tool cache.

### Console
9. `npm run lint` clean; `npm run console:build` succeeds.

### Live verification
1. Open `/console/hints`; confirm list matches `domain-hints.json`.
2. Create a hint for `example.com` with `waitForSelector: "p"` — duplicate/validation clean.
3. **Test on page** `https://example.com` before saving → preview shows extraction.
4. Save → run `curl /extract?url=https://example.com` **without restart** → hint applies.
5. `docker compose restart navigator` → hint still there (persisted file).
6. Reorder two GitHub hints; verify `POST /console/hints/match` reflects the new order.
7. Delete the test hint; confirm it's gone from the file and extraction falls back.

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
  (`navigationWait` is docs-only; `workflow` is `plans/domain-hint-workflows.md`).
  The panel offers only fields the engine actually reads.
- **Selector auto-detection / page inspection** — stays with the devtools browser
  tools and the AGENTS.md exploration routine; embedding those in the console is a
  possible future step, not this one.
- **Multi-file / multi-env hint management**, migration, or import/export.
- **Adding a `domainHint` param to the MCP `web_fetch` tool** — owned by the
  llm-managed plan; the `hint` param here is console-HTTP only.
- **Cache-key invalidation on save** (only `bypassCache` on the Test action for now;
  full invalidation is a follow-up if stale results surface).
