# Domain Hint Flows — Multi-Step, Multi-Page Interactive Extraction Plan

## Plan Status

**Status: COMPLETE** — core implementation and unit-test scope completed. Live
fixture validation, documentation, and production rollout scope was discarded
2026-08-14. This plan **supersedes** the archived
`plans/archive/domain-hint-workflows.md`.

Design decisions locked 2026-08-13: v1 actions are `extract` / `click` / `wait` / `type` / `navigate`; iframes are deferred; flow bounds are hard-coded in the engine with a per-hint `flowOptions` override (capped); the `content.sections` + `content.sections[].fields` duality is replaced by a single `content.blocks` concept that keeps the original nesting depth.

### Checklist

- [x] 1. Unified content schema: `content.blocks` replaces `content.sections` + `fields`. Leaf block = `selector` + `format` (`text` | `list` | `html` | `html_to_markdown` | `readability_to_markdown`); record block = `selector` + `itemLabel` + nested `fields`. Root `preferReadability` absorbed into per-block `format: "readability_to_markdown"`. Migration of existing hints in `domain-hints.json` + `validateBlock` in `src/domain-hints.js` + tests.
- [x] 2. `flow` validation in `src/domain-hints.js` + `tests/domain-hints.test.js`: array shape, per-action allowed properties, valid selectors, `timeoutMs` range, `extract` label/content reuse, ordering rules, `flow` + top-level `content` interplay.
- [x] 3. `flowOptions` validation: `totalTimeoutMs` (integer, capped at engine max 45000), `continueOnEmptyExtract` (boolean). `maxSteps`/`maxClicks` intentionally NOT in the hint — the array defines steps, the engine counts them.
- [x] 4. Page-state capture helpers in `src/search.js`: `capturePageState`, `extractHintStage`, `renderExtractedStage`, `mergeExtractedStages` reusing `extractTextFromHtml` / `insertTablesInline` / `extractLinksFromHtml`.
- [x] 5. Flow execution in the existing page lifecycle (src/search.js:1773): sequential `extract`/`click`/`wait`/`type`/`navigate` steps, exactly-one visible click element, post-click `waitForSelector`, re-stabilize after each interaction, explicit `wait` steps, bot-challenge abort after navigation.
- [x] 6. Hard bounds: 8 steps, 4 clicks, 20s per step timeout, 45s total flow (capped by `flowOptions.totalTimeoutMs`), end-with-extract rule.
- [x] 7. Output semantics: `## <stage>` headings in order, tables stay with their stage, links deduplicated, `maxChars` on merged text, final `url`/`title` from final page state (navigating click), step-failure returns an explicit error naming the step.
- [x] 8. Console editor (`web-console/src/main.jsx`): `BlocksEditor` (replaces `SectionsEditor`) + `FlowEditor` step-list component, per-step fields, add/remove/reorder, validation surfacing, warning when top-level `content` coexists with `flow`.
- [x] 9. Unit tests (`tests/search.test.js`): no-flow path unchanged, extract→click→extract order, click waits, post-click DOM, stage tables/links, click failures, wait/type/navigate behavior, flow validation rejections, URL/title on navigating click, bot abort.

## Goal

Today `web_fetch` is a single straight-line flow:

```
goto(url) → waitForSelector → stabilize → capture HTML → extract blocks → done
```

Content is assumed to be in the DOM after page load. But useful content is often hidden behind interaction or spread across pages: a "show more" button, an expandable panel, a tab, a paginated list, a search box, a detail link that navigates to another page. The devtools MCP tools (click, navigate, evaluate) can do this today, but only **manually**, step by step — nothing encodes it.

Add an optional declarative `flow` array to a domain hint so Navigator can walk a page (and across pages) on its own:

1. Extract the current page state.
2. Click, type, or navigate — which may change the page or move to a different one.
3. Wait for configured post-interaction / post-navigation content.
4. Extract the next state.
5. Repeat in the declared order.

A flow is a **linear sequence of steps**. "Recursion" in the sense of nested control flow is not intended — the need is sequential navigation across multiple pages/places to collect content hidden in different spots. Each `extract` step carries its own `content.blocks`, so a piece of content that requires multiple actions to reach is expressed by placing its extract step after the click/wait steps that reveal it.

Ordinary hints (no `flow`) must continue to take the existing one-pass path unchanged.

## Unified Content Schema — `content.blocks`

The old schema had two overlapping concepts: `content.sections` (a selector + optional nested `fields`) and `fields` (sub-selector + `format`). They do the same thing — "match a selector, render it" — at two depths. Replace both with **one concept: `blocks`**, keeping the original nesting depth only where it earns it.

### Leaf block — a selector + how to render it

```json
{
  "selector": "main.product .summary",
  "label": "Summary",
  "priority": "high",
  "format": "readability_to_markdown"
}
```

- `selector` required.
- `label` required — becomes an output heading (`### <label>`).
- `priority` optional — `high` | `medium` | `low` (medium drops if <50 chars).
- `format` required — how each matched element renders:
  - `text` — element `textContent`, whitespace-cleaned. Best for short values (titles, prices, counts).
  - `list` — each matched element becomes a `- ` bullet. Best for repeated items (headlines, comment lists).
  - `html` — element innerHTML returned **verbatim, unconverted** (raw HTML). Best when the caller wants the exact markup — e.g. to feed into their own parser, or to preserve markup that markdown would mangle. It is wrapped in a fenced code block so it survives the markdown pipeline intact.
  - `html_to_markdown` — element innerHTML converted via `htmlToMarkdown`, verbatim, no Readability. Best for rich content you want kept whole.
  - `readability_to_markdown` — element innerHTML run through Readability, then markdown; falls back to raw `html_to_markdown` if Readability finds nothing. Best for noisy containers (nav/footer/ads to strip). This replaces the old root-level `preferReadability: true` default behavior.
  - `table` — element's `<table>`(s) rendered as pipe-markdown (the current structured-table output). Best for tabular content.
  - `table_json` — element's `<table>`(s) rendered as a JSON array of row objects, in a fenced ` ```json ` block. Best when the caller wants machine-parseable tabular data.
  - `table_csv` — element's `<table>`(s) rendered as CSV (header row + rows), in a fenced ` ```csv ` block. Best for spreadsheets/CSV consumption.

**Table formats replace global table extraction.** When a hint with blocks uses a `table` / `table_json` / `table_csv` format, the global auto-append of tables is disabled for that extraction — the global flow is only for hints *without* blocks. This prevents the same table from being emitted twice and gives hint authors full control over which tables appear.

### Record block — N matched elements, each rendered with the same inner layout

```json
{
  "selector": ".answer",
  "label": "Answers",
  "itemLabel": "Answer",
  "priority": "high",
  "fields": [
    { "selector": ".js-vote-count", "label": "Votes", "format": "text" },
    { "selector": ".js-post-body", "label": "Content", "format": "readability_to_markdown" },
    { "selector": "ol.comments > li", "label": "Comments", "format": "list" }
  ]
}
```

- `selector` matches **N elements** (Stack Overflow answers, search results, product cards).
- `fields` renders the same sub-structure inside each matched element.
- `itemLabel` gives each item a numbered heading: `#### Answer 1`, `#### Answer 2`...
- Each `field` is a leaf block shape: `selector` + `label` + `format`.

### Rules

- A block is a leaf (has `format`) **or** a record (has `fields`) — never both. Validation enforces it.
- Simple hints that previously used `content.sections` with no `fields` become leaf blocks with an explicit `format`. `preferReadability: false` hints become `format: "html_to_markdown"`; default behavior becomes `format: "readability_to_markdown"`.
- Record blocks keep repeated-item grouping that a flat list cannot express (all votes → all bodies → all comments would lose the per-answer association).

### Migration

Existing `domain-hints.json` entries (github.com, stackoverflow.com, cricbuzz.com, etc.) are rewritten: `content.sections[]` → `content.blocks[]`, adding `format` to each formerly-formatless section (`readability_to_markdown` when root `preferReadability` was unset, `html_to_markdown` when it was `false`). The renderer accepts both `sections` and `blocks` during a transition window, then drops `sections`.

## Example Hint — multi-page navigation

```json
{
  "domain": "example.com",
  "pathPattern": "/products/*",
  "pageType": "product",
  "comment": "Product summary, then reveals the specs tab, then follows the reviews link.",
  "waitForSelector": "main.product",
  "flow": [
    {
      "action": "extract",
      "label": "Product Summary",
      "content": {
        "blocks": [
          { "selector": "main.product .summary", "label": "Summary", "priority": "high", "format": "readability_to_markdown" }
        ]
      }
    },
    {
      "action": "click",
      "selector": "button[data-testid=\"open-specs\"]",
      "waitForSelector": "section[data-testid=\"product-specs\"]",
      "timeoutMs": 10000
    },
    {
      "action": "extract",
      "label": "Specifications",
      "content": {
        "blocks": [
          { "selector": "section[data-testid=\"product-specs\"]", "label": "Specs", "priority": "high", "format": "readability_to_markdown" }
        ]
      }
    },
    {
      "action": "click",
      "selector": "a[href*=\"/reviews\"]",
      "waitForSelector": "ol.review-list"
    },
    {
      "action": "wait",
      "selector": "li.review",
      "timeoutMs": 5000
    },
    {
      "action": "extract",
      "label": "Reviews",
      "content": {
        "blocks": [
          { "selector": "ol.review-list", "label": "Reviews", "priority": "high", "format": "list" }
        ]
      }
    }
  ]
}
```

For a load-more list, the post-click selector should identify an item that cannot exist before the click, for example `.review:nth-child(21)`. Waiting for the already-visible container would resolve immediately and is not a valid readiness signal.

## Flow Contract

Add an optional `flow` array to each domain hint. It executes only after the existing navigation, top-level `waitForSelector`, and stabilization logic complete.

### `extract` step

```json
{
  "action": "extract",
  "label": "Human-readable stage name",
  "content": {
    "blocks": [
      { "selector": ".stable-container", "label": "Section", "priority": "high", "format": "readability_to_markdown" }
    ]
  }
}
```

- `action` required, must equal `extract`.
- `label` required, 1-80 characters, becomes an output heading that preserves extraction order.
- `content` required, uses the unified `content.blocks` schema (leaf and record blocks).
- Top-level hint settings still apply to every step: `skipSelectors`, `tableExtraction`.
- Each extraction runs against the page HTML at that exact point in the flow. It never reuses a prior snapshot.

### `click` step

```json
{
  "action": "click",
  "selector": "button[data-testid=\"open-specs\"]",
  "waitForSelector": "section[data-testid=\"product-specs\"]",
  "timeoutMs": 10000
}
```

- `action` required, must equal `click`.
- `selector` required, must match exactly one visible element immediately before the click.
- `waitForSelector` required, waited for only after the click. Must target newly rendered/navigated content.
- `timeoutMs` optional. Default `10000`; accepted range `250`-`20000`.
- Uses the normal Puppeteer click path. Supports a same-page DOM update **or** a full navigation to another page, as long as the post-click selector appears in the new page.

### `wait` step

```json
{
  "action": "wait",
  "selector": "li.review",
  "state": "visible",
  "timeoutMs": 5000
}
```

- `action` required, must equal `wait`.
- `selector` required, valid CSS selector.
- `state` optional — `visible` (default) | `attached` | `hidden`. Mirrors Puppeteer's `waitForSelector` states.
- `timeoutMs` optional. Default `10000`; accepted range `250`-`20000`.
- Purpose: explicit readiness gate at any point — usually after a click that lands on a slow page, or before an extract whose content renders independently of the click's own wait.

### `type` step — search/filter boxes

```json
{
  "action": "type",
  "selector": "input[name=q]",
  "text": "wireless",
  "clear": true,
  "submit": true,
  "waitForSelector": "ol.product-list",
  "timeoutMs": 10000
}
```

- `action` required, must equal `type`.
- `selector` required — focuses the input first.
- `text` required — the string to type.
- `clear` optional (default `true`) — clear the existing value before typing.
- `submit` optional (default `false`) — press Enter after typing (form submit / search trigger).
- `waitForSelector` required when `submit: true` (the results gate); may be omitted for no-submit typing.
- `timeoutMs` optional. Default `10000`; accepted range `250`-`20000`.

### `navigate` step — direct jump

```json
{
  "action": "navigate",
  "url": "/products/specs",
  "waitForSelector": "main.specs",
  "timeoutMs": 10000
}
```

- `action` required, must equal `navigate`.
- `url` required — absolute URL, or relative (resolved against the current page origin).
- `waitForSelector` required — the destination's readiness gate.
- `timeoutMs` optional. Default `10000`; accepted range `250`-`20000`.

### `flowOptions` — per-hint execution policy (optional)

```json
{
  "flowOptions": {
    "totalTimeoutMs": 45000,
    "continueOnEmptyExtract": false
  }
}
```

- `totalTimeoutMs` optional — total flow budget, capped at the engine max (45000). The array defines the steps; the engine counts them. `maxSteps` / `maxClicks` are deliberately NOT hint fields — they exist only as hard-coded engine caps.
- `continueOnEmptyExtract` optional (default `false`) — `false` fails the flow when an extract yields nothing; `true` warns and continues.

There is deliberately no generic `evaluate`, `select`, arbitrary delay, hover, form-submit beyond Enter, loop, or popup-permission action. Hints remain extraction configuration, not a browser automation or login system.

## Result Semantics

The final `web_fetch` result remains one page result. Flow extracts merge in declaration order:

```md
## Product Summary

### Summary

Initial content...

## Specifications

### Specs

Content revealed after the click...

## Reviews

### Reviews

Content from the navigated page...
```

- Stage labels make repeated blocks unambiguous and preserve the interaction/navigation sequence.
- Each stage renders its own extracted tables before the stage text merges, so tables stay with the state that produced them.
- Links are collected from every captured HTML state, then deduplicated by URL before the normal link-reference registration path.
- `title` and final `url` come from the **final** page state. This correctly represents a click that navigates.
- SEO analysis runs once on the final settled state. It is page metadata, not sequential content.
- The normal response-level `maxChars` limit applies to the final merged text. Extraction snapshots use a bounded internal capture limit so an early stage is not silently lost before the aggregate limit is applied.

If any flow step fails, fail the page extraction with an explicit error such as `Domain hint flow step 3 click failed: selector "…" matched 0 visible elements`. Do not return a plausible but incomplete sequence as a successful result.

## Implementation

### 1. Unify the content schema (`content.blocks`)

In `src/search.js` `extractTextFromHtml()`:

- Rename the `sections` path to operate on `content.blocks`.
- A leaf block (`format` present) renders each matched element via `format`:
  - `text` → `cleanWhitespace(node.textContent)`.
  - `list` → one `- ` bullet per matched element (this replaces the old section-with-`format:"list"`-field pattern at the block level).
  - `html` → raw `element.innerHTML` wrapped in a fenced code block (verbatim, unconverted).
  - `html_to_markdown` → `htmlToMarkdown(element.innerHTML)` verbatim.
  - `readability_to_markdown` → mini-JSDOM + `Readability.parse()` on the element, fallback to `htmlToMarkdown`. This is the old default section behavior.
- A record block (`fields` present) renders per-item with `itemLabel` headings, reusing the existing `renderHintFields()`.
- Keep a transition window where `content.sections` (old shape) still renders; log a deprecation warning. Then remove.

In `src/domain-hints.js`:

- Add `validateBlock()` (leaf XOR record, valid selector, valid `format`, valid nested field format). Replace `validateSection()`.
- `validateHintRule()` accepts `content.blocks` (and `content.sections` during transition).

Migrate `domain-hints.json` entries and the console `SectionsEditor` → `BlocksEditor`.

### 2. Validate flow hints

Extend `src/domain-hints.js` with a `validateFlow(flow, errors)` helper and mirror it in `tests/domain-hints.test.js`.

Validate:

- `flow` is absent, or a non-empty array with at most 8 steps.
- Every step has only the documented properties for its action (`additionalProperties`-style rejection with actionable messages).
- `extract` labels and all nested block/field selectors are valid (reuse `validateBlock`).
- `click.selector`, `click.waitForSelector`, `wait.selector`, `type.selector`, `navigate.url` are valid (selectors via `validateSelector`; `url` via `new URL()`).
- `timeoutMs` values are integers in `250`-`20000`.
- The flow ends with `extract`; at least one `extract` step exists; no two `click`/`type`/`navigate` steps are adjacent (an `extract` or `wait` must separate them).
- `flowOptions.totalTimeoutMs` is an integer ≤ 45000; `flowOptions.continueOnEmptyExtract` is a boolean.
- If both top-level `content` and `flow` are present, emit a warning that `content` is ignored when `flow` exists (flow extract steps own all content).

Keep the existing first-match domain-hint behavior. A flow belongs to the one selected hint, not to every matching domain entry.

### 3. Add page-state capture helpers

Refactor the serialization portion of `browserOpenAndExtract()` (src/search.js:1888) into small helpers:

- `capturePageState(page)` → `{ html, url, title, browserText }` from the live DOM.
- `extractHintStage(pageState, hint, step, maxChars)` → invokes the existing `extractTextFromHtml()` with the step's `content` while retaining top-level hint options.
- `renderExtractedStage(label, extracted)` → inserts that stage's tables into its text and wraps it in a level-two stage heading.
- `mergeExtractedStages(stages)` → combines rendered text, structured tables, unique links, `textOriginalLength`, and truncation metadata in order.

Do not create a second extraction engine. Reuse `extractTextFromHtml()`, `insertTablesInline()`, and `extractLinksFromHtml()` so block, field, table, link, and skip-selector behavior stays identical to normal hints.

### 4. Execute the flow in the existing page lifecycle

After the current top-level `waitForSelector` and stabilizer finish (src/search.js:1843-1872):

1. If `hint.flow` is absent, preserve the current one-pass serialization and extraction path.
2. If present, iterate steps sequentially.
3. `extract` step → capture current DOM, extract that step's content immediately, append as a stage.
4. `click` step → wait for the click selector, count visible matches, require exactly one, click, wait for that step's `waitForSelector` with the step timeout, run the configured stabilizer once more so follow-up mutations settle, then re-check for bot challenges.
5. `wait` step → `page.waitForSelector(selector, { state, timeout })`.
6. `type` step → focus selector, clear (if `clear`), type `text`, press Enter (if `submit`), wait for `waitForSelector` if present.
7. `navigate` step → resolve relative `url` against current origin, `page.goto()`, wait for `waitForSelector`.
8. After the final extract, capture the final page state for SEO analysis and final URL/title metadata.

Use the existing `withPageTimeout()` around every Puppeteer operation. Hard flow bounds:

- Maximum 8 flow steps.
- Maximum 4 click steps.
- Maximum 20 seconds per step readiness wait.
- Maximum 45 seconds for the complete flow (lowerable via `flowOptions.totalTimeoutMs`).

Check for bot challenges after navigation/stabilization and again after each interaction. Never attempt later configured actions if a challenge appears.

### 5. Preserve output and caching behavior

- The flow is selected entirely from `domain-hints.json`; `web_fetch` inputs and cache keys do not change.
- Cached entries contain the final merged result, so Markdown and the planned JSON formatter receive the same stages from one extraction.
- Existing non-flow hints must keep their text, tables, links, SEO, and truncation behavior unchanged (only the `sections` → `blocks` rename changes shape, with identical output).
- Add debug timing logs per flow step only when `DEBUG=1`; do not remove existing production debug logs.

### 6. Console editor

In `web-console/src/main.jsx`:

- Rename `SectionsEditor` → `BlocksEditor`; each block card offers leaf mode (selector + label + priority + `format` select) or record mode (selector + `itemLabel` + nested field list). Toggle between modes.
- Add `HintFieldGroup title="Flow"` (after the Content group): `FlowEditor` step-list with an action selector (`extract` / `click` / `wait` / `type` / `navigate`) and conditional fields:
  - `extract`: label input + embedded `BlocksEditor`.
  - `click`: selector, `waitForSelector`, `timeoutMs`.
  - `wait`: selector, `state` select, `timeoutMs`.
  - `type`: selector, `text`, `clear` checkbox, `submit` checkbox, `waitForSelector`, `timeoutMs`.
  - `navigate`: `url`, `waitForSelector`, `timeoutMs`.
- Add `flowOptions` editor: `totalTimeoutMs` number, `continueOnEmptyExtract` checkbox.
- Add-step, remove-step, move-up/down controls.
- When `flow` is non-empty, show a note that top-level `content` is ignored; the JSON tab and the Test pane already handle candidate hints verbatim, so the existing test-before-save flow works once the backend supports `flow`.

## Tests

### Unit tests

Add deterministic page mocks or small local HTML fixtures that change their returned DOM after a mocked click / navigation.

Cover:

1. No-flow hints still take the existing single extraction path.
2. `extract -> click -> extract` captures both states in order with their stage labels.
3. A click waits for the declared selector before the next extraction.
4. The second extraction sees post-click content, not the initial DOM.
5. Tables stay with the stage where they were extracted; links from both stages are deduplicated.
6. A zero-match or multi-match click selector returns a step-specific failure.
7. A missing post-click selector times out with a step-specific failure.
8. A `wait` step blocks until its selector appears and honors its timeout/state.
9. A `type` step types, optionally submits, and waits for the results gate.
10. A `navigate` step resolves relative URLs and lands on the destination gate.
11. Invalid flow shape, invalid selectors, excessive steps, invalid timeout, illegal action order, and missing final extract are rejected by domain-hint tests.
12. A click that changes `page.url()` uses the final URL and title in the result.
13. A flow bot challenge aborts remaining actions.
14. Block schema: leaf XOR record, valid formats, record fields render per-item with `itemLabel`.

### Live validation

Extend `tests/domain-hints-live.test.js` to execute flow steps for hints with a `testUrls` entry, behind `LIVE_DOMAIN_HINTS=1`.

- Reuse the local `example.com` fixture server (container `example-com`; internal port 8080, published on a RANDOM host port — find it with `docker port example-com 8080`) for deterministic multi-page flows — add an `interactive`-style fixture with a tab and a linked detail page if none exists.
- Verify every configured extraction block exists at its corresponding stage.
- Add the first production flow only after browser inspection confirms the selectors, before/after DOM states, and output are stable.

## Documentation

Update `docs/domain-hints.md` with the `content.blocks` schema (leaf vs record, five formats, `preferReadability` absorption), the `flow` field (actions, required post-click selector, exact-selector rule, wait/type/navigate semantics, limits, stage-order output), and a multi-page example. Update `docs/web-fetch-docs.md` if it mentions extraction flow. Update `AGENTS.md` with the browser-inspection routine for interactive/multi-page hints (capture initial DOM → inspect control → click in a persistent tab → inspect post-click/navigation DOM → write and live-test the hint).

## Rollout

1. Implement the unified `blocks` schema + migration, then flow parsing, validation, page-state capture, and unit tests without adding any production flow hint.
2. Test one controlled public page with a non-destructive expandable panel or load-more control.
3. Compare flow output with screenshots before and after the click.
4. Add one real domain hint and run `LIVE_DOMAIN_HINTS=1` for that page.
5. Run the full test suite and lint:

```bash
docker exec navigator npm install --include=dev
docker exec navigator npx vitest run
docker exec navigator npm run lint
```

(Use `docker exec` — the compose plugin is unavailable on this host.)

## Non-Goals

- Authentication, credentials, CAPTCHA handling, payments, checkout, or any form submission beyond Enter-to-search.
- Arbitrary JavaScript in hint files.
- Loop / repeat / paginate-until-exhausted steps (sequential multi-page navigation is supported via multiple `click` steps; unbounded iteration is not).
- Handling clicks that open a new tab (the click must be same-tab navigation or a DOM update).
- Iframe / frame-scoped extraction in v1 (deferred; a per-step `frame` option is the later additive path).
- User-supplied click selectors through `web_fetch` arguments (deferred to the request-scoped hints plan, `plans/llm-managed-domain-hints.md` stage 5).
- Changing the extraction strategy for existing static hints (the `sections` → `blocks` rename must be output-identical).
