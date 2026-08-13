# 20 — Hint Extraction Methods: Two Methods Only (`default` / `flow`)

## Plan Status

**Status: APPROVED — IMPLEMENTING** — created 2026-08-14, revised per follow-up
(static blocks removed, two methods only, page-load fields inside `default`,
readability as dropdown), then approved by the user on 2026-08-14
("Yes, this is what I wanted … start implementing").

The schema was agreed before implementation; `content` is removed and everything the
plan describes below is being implemented as specced.

### Checklist

- [x] 1. Target schema spec (below) agreed — method keys `default` / `flow` only.
- [ ] 2. `migrateHintShape()` in `src/domain-hints.js`: old flat hints → new shape;
      `content.*` and top-level page-load fields rejected post-migration.
- [ ] 3. Rewrite `domain-hints.json` (7 entries: 6 github → single-extract-step flows,
      chaos → `default`), `.bak` kept.
- [ ] 4. Validation: exactly-one-method-key rule (`default` | `flow`), `default` block
      fields (`waitForSelector`, `stabilizeStrategy`, `waitForContent`, `skipSelectors`,
      `format`, `tables`), `content`/top-level page-load/`preferReadability` → errors.
- [ ] 5. Engine dispatch in `src/search.js`: method selection on `default`/`flow`;
      `default` owns waitForSelector + stabilizeStrategy + waitForContent + skipSelectors;
      implement `tables` ("all" | "content" | "disabled") and `format` for whole-page.
- [ ] 6. Console editor (`web-console/src/main.jsx`): two-tab mode switch (Default /
      Interactive); Default tab gets waitForSelector, stabilizeStrategy, waitForContent,
      skipSelectors, **format dropdown**, tables select. Remove BlocksEditor path.
- [ ] 7. Server endpoints (`src/mcp-server.js`): unchanged routes, verify against new shape.
- [ ] 8. Tests: `tests/domain-hints.test.js` + `tests/search.test.js` fixtures and new cases.
- [ ] 9. Docs: `docs/domain-hints.md`, `AGENTS.md`, supersede note on plans 16.
- [ ] 10. Live verification: `/extract` on the 7 hint URLs + `LIVE_DOMAIN_HINTS=1`, then
      `docker restart navigator` + console smoke test.

---

## What the User Wants

1. **Only two extraction methods.** Static blocks (`content` key) is removed — its
   functionality (extract these exact containers) is already expressible as a single
   `extract` step inside the interactive flow.
   - `"default"` key present → **Default extraction** runs.
   - `"flow"` key present → **Interactive flow** runs.
2. **`default` owns all of its settings, including page load:**
   `waitForSelector`, `stabilizeStrategy`, `waitForContent`, `skipSelectors`, format,
   table extraction. Nothing about default extraction lives at the top level anymore.
3. **Readability is a dropdown, not a checkbox** — styled like the `format` select in the
   interactive-flow block editor.
4. Flow handles its own waiting via steps (`wait`, per-click/type/navigate
   `waitForSelector` gates) — it needs no top-level page-load config.

## Current Reality (why the page "does not do justice to the code")

Audited 2026-08-14 against `domain-hints.json`, `src/search.js`, `src/domain-hints.js`,
`src/mcp-server.js`, `web-console/src/main.jsx`.

| # | Problem | Evidence |
|---|---------|----------|
| 1 | **Method is implicit.** Default extraction = *absence* of `content`/`flow`. No `default` key exists to hold default-mode settings. | `modeFromHint` main.jsx:2227; `cleanedHint` main.jsx:3241 builds default mode by *deleting* keys. |
| 2 | **`tableExtraction` is dead code.** Validated and rendered, never read by the engine. "Content tables only" / "Disabled" do nothing. | Validated domain-hints.js:524; rendered main.jsx:3476; zero hits in `src/search.js`. |
| 3 | **`skipSelectors` leaks into every method.** Stripped before *any* extraction path. | search.js:903 (before blocks 913, sections 921, default 1005). |
| 4 | **`contentSelectors` (wait-for-content) is global.** Feeds `content_idle` stabilization + SEO snapshot for flow and static hints. | search.js:2021, 2314, 2486. |
| 5 | **`preferReadability` is global-ish.** Consulted by default path (search.js:1017) *and* legacy sections path (search.js:959). | search.js:959, 1017. |
| 6 | **Legacy `content.sections` is still the live shape.** All 6 github hints use `sections`; plan 16's checklist claims migration is done — it is not. | `domain-hints.json` entries 1–6; search.js:922. |
| 7 | **Three overlapping "content" concepts.** `content.sections`, `content.blocks`, and `flow` extract steps all render "select a container, render it". Redundant surface the user wants collapsed. | `renderContentBlocks` search.js:796; sections path 921; flow `extract` steps. |

## Target Schema

```jsonc
{
  // ── Matching / identity (top-level, NOT extraction config) ─────────────────
  "domain": "github.com",
  "pathPattern": "/*/*",
  "pageType": "repo",                 // optional label
  "comment": "…",                     // display only
  "testUrls": ["https://…"],          // test pane only
  "requireSelector": "…",             // optional — splits one domain+path

  // ── Extraction method — EXACTLY ONE of the two keys below ──────────────────

  // METHOD A · Default extraction — owns ALL its settings, incl. page load
  "default": {
    "waitForSelector": "…",             // string or string[]  (moved in from top-level)
    "stabilizeStrategy": "network_idle",// network_idle | content_idle | mutation
    "waitForContent": [ "…" ],          // was contentSelectors
    "skipSelectors": [ "…" ],           // was top-level skipSelectors
    "format": "readability_to_markdown",// DROPDOWN, not checkbox — was preferReadability
    "tables": "all"                     // "all" | "content" | "disabled" (was dead tableExtraction)
  },

  // METHOD B · Interactive flow (shape unchanged — well-tested, leave alone)
  "flow": [
    { "action": "wait", "selector": "…", "timeoutMs": 10000 },
    { "action": "extract", "label": "…", "content": { "blocks": [ … ] } },
    { "action": "click", "selector": "…", "waitForSelector": "…", "timeoutMs": 10000 }
  ],
  "flowOptions": { "totalTimeoutMs": 45000, "continueOnEmptyExtract": false }
}
```

### Field Mapping (old → new)

| Old (top-level) | New home | Notes |
|---|---|---|
| `waitForSelector` | `default.waitForSelector` | page load is a default-extraction concern now |
| `stabilizeStrategy` | `default.stabilizeStrategy` | same |
| `contentSelectors` | `default.waitForContent` | scoped to default |
| `skipSelectors` | `default.skipSelectors` | scoped to default |
| `preferReadability` (boolean) | `default.format` (dropdown) | `true`→`readability_to_markdown`, `false`→`html_to_markdown` |
| `tableExtraction` | `default.tables` | **implemented for the first time** |
| `content` (static blocks) | `flow` (single extract step) | **method removed** — becomes one `extract` step |
| `flow` | `flow` | unchanged |
| `flowOptions` | `flowOptions` | unchanged, flow-only policy |
| `requireSelector` | top-level | still a *matching* rule, not extraction |

### Design Decisions

- **D1 — Two method keys, presence-based, exactly one.** Presence of `default` or `flow`
  selects the method. Both present → validation **error**. Neither present → treated as
  bare default extraction (built-in defaults) during the transition only; the editor always
  writes an explicit `default`.
- **D2 — `content` is gone.** Presence of `content` (blocks or sections) is a validation
  **error** after migration. `migrateHintShape()` converts old `content.blocks` /
  `content.sections` into a flow with a single `extract` step (blocks carry their `format`,
  per plan 16's mapping), and any old top-level `waitForSelector` becomes a leading `wait`
  step (so extraction readiness is preserved).
- **D3 — Default extraction is self-contained.** `default.waitForSelector` feeds the
  pre-extract wait (search.js:2432 logic), `default.stabilizeStrategy` feeds `stabilizePage`
  (search.js:2012), `default.waitForContent` feeds `content_idle` extra selectors
  (search.js:2021), `default.skipSelectors` feeds the DOM strip (search.js:903).
  Top-level versions of all four are rejected post-migration.
- **D4 — `default.format` is a dropdown mirroring the flow block `format` select.**
  Whole-page formats: `readability_to_markdown` (default), `html_to_markdown`,
  `text`. Same widget style as the flow editor; reuses `renderLeafContent` against the
  whole document.
- **D5 — `default.tables`.** `"all"` (omitted) = current always-on; `"disabled"` = no table
  extraction; `"content"` = tables only inside the Readability/format content node.
- **D6 — Flow owns its own readiness.** Flow keeps the built-in config-level stabilization
  on initial load, but per-hint page-load tuning is a `default`-only feature. Flow authors
  already have `wait` steps and per-action `waitForSelector` gates.
- **D7 — Flow stages carry the old static-blocks output.** Migrated github hints now emit
  `## <label>` stage headings (`## profile`, `## README`, …) — a visible output change from
  today's plain `### <label>` sections. Accepted as part of the re-haul.

## Migration — `domain-hints.json` (7 entries)

Per-entry transformation (generated and verified above):

- **6 github hints** (`content.sections`) → `flow` with:
  - leading `wait` step using the old top-level `waitForSelector`
    (`turbo-frame#user-profile-frame`, `[class*="markdown-body"]`, …),
  - one `extract` step, `label: <pageType>`, whose `content.blocks` are the old sections
    with `format` = `html_to_markdown` when `preferReadability: false` (profile,
    issue-detail, pr-detail) else `readability_to_markdown` (repo, issues, prs).
- **1 chaos hint** (no content, `preferReadability: false`, the one being edited today)
  → `default: { "format": "html_to_markdown", "tables": "all" }`.

`saveDomainHints` already writes a `.bak`; run one explicit migration save so
`domain-hints.json.bak` holds the old shape, then confirm `/console/api/hints` shows the
new shape.

## Implementation Steps

### 1. `src/domain-hints.js`

- Add `migrateHintShape(hint)`:
  - `content` present → build `flow` (single `extract` step + optional leading `wait` from
    old top-level `waitForSelector`), dropping the `content` key (D2).
  - Old top-level `waitForSelector`/`stabilizeStrategy`/`contentSelectors`/`skipSelectors`/
    `preferReadability`/`tableExtraction` and no `default` → fold into `default` (D3/D4/D5).
  - Returns `{ hint, warnings[] }`.
- `validateHintRule`:
  - Count method keys among `default`/`flow`. `> 1` → error per key
    ("choose exactly one extraction method: default | flow"). `content` present → error.
  - Validate `default`: object; `waitForSelector` string|string[] valid CSS;
    `stabilizeStrategy` ∈ `network_idle|content_idle|mutation`; `waitForContent` array of
    valid CSS; `skipSelectors` array of valid CSS; `format` ∈ whole-page formats
    (`readability_to_markdown`, `html_to_markdown`, `text`); `tables` ∈
    `all|content|disabled`; unknown `default.*` → warning.
  - Remove top-level `waitForSelector`, `stabilizeStrategy`, `contentSelectors`,
    `skipSelectors`, `preferReadability`, `tableExtraction`, `content` from allowed keys
    (error with "moved into `default`" hint during transition, plain unknown-field error
    after).
- Export `getExtractionMethod(hint)` → `"default" | "flow" | null` (shared with UI).

### 2. `src/search.js`

- `browserOpenAndExtract` (line 2416+):
  - Top-level `waitForSelector`/`stabilizePage` calls become default-only:
    read from `hint.default` when method is `default`; flow runs the built-in
    config-level stabilize only (D6).
- `stabilizePage` (2012): `extraSelectors` = method `default`
  ? `hint.default?.waitForContent` : `undefined`.
- `extractTextFromHtml` (887): dispatch on `getExtractionMethod`:
  - `default` branch: strip `default.skipSelectors`; render whole page via
    `default.format` (reuse `renderLeafContent` on the doc body); honor
    `default.tables` — `disabled` skips table extraction, `content` scopes it to the
    rendered content node, `all`/omitted keeps current global behavior.
  - Delete the legacy `sections` path (921–997) and the blocks-first branching (913–918).
- `runFlowExtraction` / SEO snapshot (2314, 2486): drop `extraSelectors:
  hint?.contentSelectors`.

### 3. `src/mcp-server.js`

No route changes. `createHint`/`updateHint` (742–796) and validate/test endpoints call
`validateHintRule` and pick up the new shape automatically. `loadDomainHints` gains a
`migrateHintShape()` pass.

### 4. `web-console/src/main.jsx`

- `emptyHint()` (2208): `default: { waitForSelector: [], stabilizeStrategy: "", waitForContent: [], skipSelectors: [], format: "readability_to_markdown", tables: "all" }`.
- `modeFromHint()` (2227): `flow` → flow; `default` → default; else → `null`.
- `cleanedHint` (3236): default mode strips `flow`/`flowOptions`; flow mode strips `default`.
- **Mode switch** (3417): two buttons — "Default extraction" / "Interactive flow".
  Remove the Static blocks button + `BlocksEditor` usage.
- **Default extraction tab** (3449): now holds the moved **Page load** fields —
  `waitForSelector` (list), `stabilizeStrategy` (select) — plus `waitForContent` (list),
  `skipSelectors` (list), **`format` dropdown** (same widget style as the flow block
  `format` select, values: readability_to_markdown / html_to_markdown / text), `tables`
  select. The top-level "Page load" group (3373) is removed.
- Flow tab: unchanged (`FlowEditor` + `FlowOptionsEditor`).

### 5. Tests

- `tests/domain-hints.test.js`: update fixtures (127–131, 214–217) to new shape; new cases —
  exactly-one-method-key, `content` rejected, `default` field validation (`format`, `tables`,
  stabilizeStrategy enums), `migrateHintShape` (content→single-extract flow, legacy
  top-level→default), `getExtractionMethod`.
- `tests/search.test.js`: update fixtures (`content.sections` → `flow` single-extract;
  add a `default`-method fixture); assert skipSelectors no longer affect flow hints; assert
  `tables: "disabled"` yields no tables, `"content"` yields article-scoped tables;
  `format: "html_to_markdown"` on a `default` hint returns raw markdown.

### 6. Docs

- `docs/domain-hints.md`: rewrite around two methods; document `default.*` (incl. the
  `format` dropdown); remove `navigationWait` / `content.sections` / static-blocks docs.
- `AGENTS.md`: update the Domain Hints Workflow + pitfalls (two methods, settings live in
  `default`, static blocks = single-extract-step flow).
- `plans/16_domain-hint-flows.md`: supersede note (static blocks folded into flow; this
  plan overrides its "top-level settings apply to every step" claim).

## Rollout / Verification

1. Land schema + migration (steps 1–3) without changing engine behavior — old hints still
   load via `migrateHintShape()`.
2. Rewrite `domain-hints.json`; verify:
   ```bash
   docker exec navigator curl -s localhost:3000/console/api/hints | node -e '…count method keys…'
   docker exec navigator curl -s "localhost:3000/extract?url=https://github.com/<user>&maxChars=2000"
   ```
3. Engine dispatch (step 2) + console UI (step 4). Build console on host
   (`npm run console:build`) → `docker compose up -d` (bind-mounted `web-console/dist`).
4. Full suite + lint, then `docker restart navigator`; smoke-test the editor on
   `/console/hints/edit/6` (now a `default` hint) and confirm the two-button mode switch.

## Non-Goals

- Any third extraction method (no "static", "auto", "hybrid").
- Changing `flow` step shapes or `flowOptions` semantics.
- Table extraction beyond `all|content|disabled`.
- Keeping `content.sections` / `content.blocks` as a loadable shape after migration.
- Request-scoped / per-`web_fetch` hint overrides (covered by plan 04).
