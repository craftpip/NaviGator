# Domain Hint Workflows - Sequential Interactive Extraction Plan

## Plan Status

**Status: NOT STARTED** — verified 2026-08-10. No `workflow` support exists anywhere in the codebase (no `workflow` in `src/search.js`, `src/domain-hints.js`, `src/mcp-server.js`; no workflow tests).

### Checklist

- [ ] 1. Workflow hint validation (`src/domain-hints.js` + `tests/domain-hints.test.js`): max 8 steps, allowed properties per action, valid selectors, timeout range, extract/click ordering.
- [ ] 2. Page-state capture helpers (`capturePageState`, `extractHintStage`, `renderExtractedStage`, `mergeExtractedStages`) reusing `extractTextFromHtml` / `insertTablesInline` / `extractLinksFromHtml`.
- [ ] 3. Workflow execution in the page lifecycle: sequential extract/click, exactly-one visible click element, post-click `waitForSelector`, re-stabilize after click, final-state SEO/URL/title.
- [ ] 4. Hard bounds: 8 steps, 4 clicks, 20s click wait, 45s total; bot-challenge abort after each click.
- [ ] 5. Output semantics: stage headings in order, tables stay with their stage, links deduplicated, `maxChars` on merged text, step-failure returns an explicit error.
- [ ] 6. Unit tests (`tests/search.test.js`): no-workflow path unchanged, extract→click→extract order, click waits, post-click DOM, stage tables/links, click failures, workflow validation rejections, URL/title on navigating click, bot abort.
- [ ] 7. Live validation (`tests/domain-hints-live.test.js`, behind `LIVE_DOMAIN_HINTS=1`).
- [ ] 8. Documentation in `AGENTS.md` (workflow field, two actions, interactive-page browser-inspection routine).
- [ ] 9. Rollout: first production workflow hint after browser inspection confirms selectors/DOM states.

## Goal

Domain hints already tell `web_fetch` which parts of a page are useful. They select stable content containers, wait for dynamic page content, and extract those sections instead of relying only on generic Readability.

Some useful content is hidden behind a page interaction: a "show more" button, an expandable details panel, a tab, or a paginated list. Add an optional, declarative workflow to a domain hint so Navigator can:

1. Extract the initial page state.
2. Click one configured control.
3. Wait for configured post-click content.
4. Extract the next state.
5. Repeat in the declared order.

Ordinary hints must continue to take their existing one-pass path unchanged.

## Example Hint

```json
{
  "domain": "example.com",
  "pathPattern": "/products/*",
  "pageType": "product",
  "comment": "Captures the product summary, then opens the details panel.",
  "waitForSelector": "main.product",
  "preferReadability": false,
  "workflow": [
    {
      "action": "extract",
      "label": "Product Summary",
      "content": {
        "sections": [
          { "selector": "main.product .summary", "label": "Summary", "priority": "high" }
        ]
      }
    },
    {
      "action": "click",
      "selector": "button[data-testid=\"show-details\"]",
      "waitForSelector": "section[data-testid=\"product-details\"]",
      "timeoutMs": 10000
    },
    {
      "action": "extract",
      "label": "Product Details",
      "content": {
        "sections": [
          { "selector": "section[data-testid=\"product-details\"]", "label": "Details", "priority": "high" }
        ]
      }
    }
  ]
}
```

For a load-more list, the post-click selector should identify an item that cannot exist before the click, for example `.review:nth-child(21)`. Waiting for the already-visible list container would resolve immediately and is not a valid readiness signal.

## Workflow Contract

Add an optional `workflow` array to each domain hint. It is executed only after the existing navigation, top-level `waitForSelector`, and stabilization logic complete.

### `extract` step

```json
{
  "action": "extract",
  "label": "Human-readable stage name",
  "content": {
    "sections": [
      { "selector": ".stable-container", "label": "Section", "priority": "high" }
    ]
  }
}
```

- `action` is required and must equal `extract`.
- `label` is required, 1-80 characters, and becomes an output heading that preserves extraction order.
- `content` is required and uses the existing `content.sections` schema, including `fields`, `itemLabel`, and section priorities.
- Top-level hint settings still apply to every step: `skipSelectors`, `preferReadability`, and table extraction behavior.
- Each extraction runs against the page HTML at that exact point in the workflow. It does not reuse a prior snapshot.

### `click` step

```json
{
  "action": "click",
  "selector": "button[data-testid=\"show-details\"]",
  "waitForSelector": "section[data-testid=\"product-details\"]",
  "timeoutMs": 10000
}
```

- `action` is required and must equal `click`.
- `selector` is required and must match exactly one visible element immediately before the click. Authors must use a precise selector such as an ID, a stable data attribute, or `:nth-of-type()` where necessary.
- `waitForSelector` is required and is waited for only after the click. It must target newly rendered or newly visible content.
- `timeoutMs` is optional. Default: `10000`; accepted range: `250`-`20000` milliseconds.
- The implementation uses the normal Puppeteer click path. It supports a same-page DOM update and a navigation as long as the post-click selector appears.

There is deliberately no generic `evaluate`, `type`, `select`, arbitrary delay, hover, form-submit, or popup-permission action. Hints remain extraction configuration, not a browser automation or login system.

## Result Semantics

The final `web_fetch` result remains one page result. Workflow extracts are merged in declaration order:

```md
## Product Summary

### Summary

Initial content...

## Product Details

### Details

Content revealed after the click...
```

- Stage labels make repeated sections unambiguous and preserve the interaction sequence.
- Each stage renders its own extracted tables before the stage text is merged, so tables stay with the state that produced them.
- Links are collected from every captured HTML state, then deduplicated by URL before the normal link-reference registration path.
- `title` and final `url` come from the final page state. This correctly represents a click that navigates.
- SEO analysis runs once on the final settled state. It should not repeat for every stage, because it is page metadata rather than sequential content.
- The normal response-level `maxChars` limit applies to the final merged text. Extraction snapshots use a bounded internal capture limit so an early stage is not silently lost before the aggregate limit is applied.

If any workflow step fails, fail the page extraction with an explicit error such as `Domain hint workflow step 2 click failed: selector matched 0 elements`. Do not return a plausible but incomplete sequence as a successful result.

## Implementation

### 1. Validate workflow hints

Extend `tests/domain-hints.test.js` with workflow validation helpers and add a reusable validation function in `src/domain-hints.js` if it keeps the rules out of the test file.

Validate:

- `workflow` is absent or is a non-empty array with at most 8 steps.
- Every step has only the documented properties for its action.
- `extract` labels and all nested existing section/field selectors are valid.
- `click.selector` and `click.waitForSelector` are valid CSS selectors.
- `click.timeoutMs` is an integer in the documented range.
- A workflow begins and ends with `extract`; no two `click` steps appear without an extraction between them.

Keep the existing first-match domain-hint behavior. A workflow belongs to the one selected hint, not to every matching domain entry.

### 2. Add page-state capture helpers

Refactor the serialization portion of `browserOpenAndExtract()` in `src/search.js` into small helpers:

- `capturePageState(page)` returns `{ html, url, title, browserText }` from the live DOM.
- `extractHintStage(pageState, hint, step, maxChars)` invokes the existing `extractTextFromHtml()` with the step's `content` while retaining the top-level hint options.
- `renderExtractedStage(label, extracted)` inserts that stage's tables into its text and wraps it in a level-two stage heading.
- `mergeExtractedStages(stages)` combines rendered text, structured tables, unique links, `textOriginalLength`, and truncation metadata in order.

Do not create a second extraction engine. Reuse `extractTextFromHtml()`, `insertTablesInline()`, and `extractLinksFromHtml()` so section, field, table, link, and skip-selector behavior stays identical to normal hints.

### 3. Execute the workflow in the existing page lifecycle

After the current top-level `waitForSelector` and stabilizer finish:

1. If `hint.workflow` is absent, preserve the current one-pass serialization and extraction path.
2. If it is present, iterate steps sequentially.
3. For an `extract` step, capture the current DOM and extract that step's content immediately.
4. For a `click` step, wait for the click selector, count its visible matches, require exactly one, click it, then wait for that step's `waitForSelector` with the step timeout.
5. After a click, run the configured stabilizer once more so frameworks that render in follow-up mutations have settled before the next extract.
6. After the final extract, capture the final page state for SEO analysis and final URL/title metadata.

Use existing `withPageTimeout()` around every Puppeteer operation. Add hard workflow bounds:

- Maximum 8 workflow steps.
- Maximum 4 click steps.
- Maximum 20 seconds per click readiness wait.
- Maximum 45 seconds for the complete workflow.

Check for bot challenges after navigation/stabilization and again after each click. Never attempt later configured actions if a challenge appears.

### 4. Preserve output and caching behavior

- The workflow is selected entirely from `domain-hints.json`; `web_fetch` inputs and cache keys do not change.
- Cached entries contain the final merged result, so Markdown and the planned JSON formatter receive the same stages/content from one extraction.
- Existing non-workflow hints must keep their text, tables, links, SEO, and truncation behavior unchanged.
- Add debug timing logs per workflow step only when `DEBUG=1`; do not remove existing production debug logs.

## Tests

### Unit tests

Add deterministic page mocks or a small local HTML fixture in `tests/search.test.js` that can change its returned DOM after a mocked click.

Cover:

1. No-workflow hints still take the existing single extraction path.
2. `extract -> click -> extract` captures both states in order with their stage labels.
3. A click waits for the declared selector before the next extraction.
4. The second extraction sees post-click content, not the initial DOM.
5. Tables stay with the stage where they were extracted and links from both stages are deduplicated.
6. A zero-match or multiple-match click selector returns a step-specific failure.
7. A missing post-click selector times out with a step-specific failure.
8. Invalid workflow shape, invalid selectors, excessive steps, invalid timeout, and illegal action order are rejected by domain-hint tests.
9. A click that changes `page.url()` uses the final URL and title in the result.
10. A workflow bot challenge aborts remaining actions.

### Live validation

Extend `tests/domain-hints-live.test.js` to execute workflow steps for hints that opt into a `testUrls` entry and are not bot-protected.

- Run the same click and post-click selector checks as production.
- Verify every configured extraction section exists at its corresponding stage.
- Keep live tests behind `LIVE_DOMAIN_HINTS=1`.
- Add the first production workflow only after browser inspection confirms the selectors, before/after DOM states, and output are stable.

## Documentation

Update the domain-hints workflow in `AGENTS.md`:

- Add `workflow` after the existing `waitForSelector`/`navigationWait` guidance.
- Document the two actions, required post-click selector, exact-selector rule, limits, and stage-order output.
- Add the browser-inspection routine for interactive pages: capture initial screenshot/DOM, inspect the exact control, click it in a persistent tab, inspect the post-click DOM, then write and live-test the hint.

## Rollout

1. Implement parsing, validation, page-state capture, and unit tests without adding any production workflow hint.
2. Test one controlled public page with a non-destructive expandable panel or load-more control.
3. Compare workflow output with screenshots before and after the click.
4. Add one real domain hint and run `LIVE_DOMAIN_HINTS=1` for that page.
5. Run the full container test suite and lint:

```bash
docker compose exec navigator npm install --include=dev
docker compose exec navigator npx vitest run
docker compose exec navigator npm run lint
```

## Non-Goals

- Authentication, credentials, CAPTCHA handling, payments, checkout, or any form submission.
- Arbitrary JavaScript in hint files.
- Recursive pagination or an unbounded "click until exhausted" loop.
- User-supplied click selectors through `web_fetch` arguments.
- Changing the extraction strategy for existing static hints.
