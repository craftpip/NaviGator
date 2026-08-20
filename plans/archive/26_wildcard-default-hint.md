# Plan 26: Wildcard Default Hint — Replace DEFAULT_EXTRACT_* Env Vars

**Created:** 2026-08-17
**Status:** Implemented

---

## Problem

Default web-fetch extraction settings (format, stabilization, skip selectors, wait-for selectors, wait-for content, post-processor) live as 6 separate `DEFAULT_EXTRACT_*` environment variables. These are edited in the Manage tab, disconnected from the hints system they configure. The hint system already has a `default` block format for these exact settings. A special wildcard hint would unify the two systems.

## Solution

Add a **wildcard hint** (`domain: "*"`) to `domain-hints.json` that serves as the catch-all default for all URLs. This hint:
- Is always present in the file (auto-created with defaults if missing)
- Cannot be deleted
- Has a simplified edit form (no path pattern, no requireSelector, no flow, no test URLs group)
- Has the test panel (test any URL against the default extraction settings)
- Replaces all 6 `DEFAULT_EXTRACT_*` environment variables (including `DEFAULT_EXTRACT_POST_PROCESSOR`)

## Scope

### In scope
- Wildcard hint creation, loading, matching, and extraction
- Console UI: special hints list entry, simplified editor, hidden test panel
- Removal of 6 `DEFAULT_EXTRACT_*` env vars from config, schema, hot-apply, docker-compose, .env.example (including `DEFAULT_EXTRACT_POST_PROCESSOR`)
- Migration: auto-create wildcard hint from existing env var values on first load
- `defaultExtractHint()` elimination — replaced by wildcard hint lookup
- Skip selectors: wildcard hint starts empty; both wildcard and domain hints can have skipSelectors (stacking)
- Manage tab: merged "Web Fetch Extraction" + "Post Processors" groups into single "Web Fetch" group
- Block editor fix: Extractor + Post-processor in flow blocks use 50-50 grid layout (matching default extraction section)

### Out of scope
- `DOMAIN_HINTS_PATH` — stays in Manage tab (path config, not extraction settings)
- Changes to flow extraction, block extraction, or the `/extract` test endpoint

---

## Design

### Wildcard hint identity

```json
{
  "domain": "*",
  "pathPattern": "/**",
  "pageType": "default",
  "comment": "Default extraction for all URLs. Edit in the Domain hints panel.",
  "default": {
    "format": "readability_to_markdown",
    "stabilizeStrategy": "network_idle",
    "postProcessor": "",
    "waitForSelector": [],
    "waitForContent": [],
    "skipSelectors": []
  }
}
```

All defaults are **explicit** — no hidden inheritance. `stabilizeStrategy` is `"network_idle"`, not empty. `postProcessor` is empty (none). What you see in the hint is what runs.

### Matching behavior

Wildcard hint is **excluded** from `findMatchingHints()` — it never matches via domain+path. Instead, it's loaded separately and used as the final fallback after all domain-specific hints fail:

```
1. findMatchingHints(url, hints) → domain-specific candidates (excludes domain:"*")
2. firstMatchingHint(page, candidates) → best domain-specific match
3. If no match → wildcard hint (loaded by getWildcardHint(hints))
4. If no wildcard hint → null (bare extraction, no customization)
```

### Skip selectors: stacking model

**Three sources, applied in order:**

1. **Wildcard hint** `default.skipSelectors` — global list, applied to ALL pages first
2. **Domain hint** `default.skipSelectors` — additional selectors, applied only when that domain hint matches
3. **Built-in Readability behavior** — `script`, `style`, `noscript`, `template` are stripped by Readability itself, no skip selector needed

Application order in `extractTextFromHtml()`:
```
1. Strip elements matching wildcard skipSelectors (global)
2. Strip elements matching domain hint skipSelectors (per-hint, if present)
3. Run Readability / extractor
```

The wildcard skip list is loaded once in `browserOpenAndExtract()` and passed through the pipeline as `defaultExtractSkipSelectors` (same parameter name, new source).

**Key difference from current behavior:** The built-in 21-selector list (`DEFAULT_EXTRACT_SKIP_SELECTORS` constant in config.js) is removed. The wildcard hint starts empty. Users who had the old defaults can copy them into the wildcard hint during migration (or the migration auto-populates from their env var).

---

## Implementation Steps

### Step 1: Wildcard hint API (`src/domain-hints.js`)

**Add `getWildcardHint(hints)` function:**
```js
export function getWildcardHint(hints) {
  return hints.find(h => h?.domain === "*") || null;
}
```

**Add `ensureWildcardHint(hints)` function:**
- If a wildcard hint exists, return the array unchanged
- If not, create one with empty defaults:
  ```js
   {
     domain: "*",
     pathPattern: "/**",
     pageType: "default",
     comment: "Default extraction for all URLs.",
     default: {
       format: "readability_to_markdown",
       stabilizeStrategy: "network_idle",
       postProcessor: "",
       waitForSelector: [],
       waitForContent: [],
       skipSelectors: []
     }
   }
   ```
- If `DEFAULT_EXTRACT_*` env vars are set (including `DEFAULT_EXTRACT_POST_PROCESSOR`), populate from them (migration path — see Step 4)
- Prepend to array (index 0, always first)
- Return the modified array

**Modify `loadDomainHints()`:**
- After migration, call `ensureWildcardHint(migrated)` before returning
- This guarantees the wildcard hint always exists

**Modify `findMatchingHints()` (`isMatch()`):**
- Skip entries where `domain === "*"` — they should never match via the normal path
- The wildcard hint is loaded separately, not as a candidate

**Modify `validateHintRule()`:**
- When `domain === "*"`, skip `pathPattern` requirement (it's always `/**`)
- When `domain === "*"`, skip `requireSelector` validation (not allowed)
- Reject `flow` on wildcard hint (only `default` allowed)
- `skipSelectors` remains valid on both wildcard and domain hints (no schema change needed — it's already in the `default` block)

**Modify `createHint()` / `updateHint()`:**
- `createHint`: reject `domain === "*"` (wildcard is auto-managed, not user-created)
- `updateHint`: allow updating wildcard hint at index 0 (the only way to edit it)
- `deleteHint`: reject deleting wildcard hint (index 0 when `domain === "*"`)

### Step 2: Search flow (`src/search.js`)

**Replace `defaultExtractHint(config)` calls with wildcard hint lookup:**

Current (lines 2580-2583, 2714-2716):
```js
hint = defaultExtractHint(manager.config);
```

New:
```js
hint = getWildcardHint(hints);
```

The `hints` array (from `getDomainHints(config)`) already includes the wildcard hint at index 0. `getWildcardHint()` extracts it.

**Remove `defaultExtractHint()` function** (lines 2089-2097) — no longer needed.

**Simplify `stabilizePage()` fallback chain:**

Current (lines 2102-2107):
```js
const stabilizeStrategy =
  strategyOverride ||
  hint?.default?.stabilizeStrategy ||
  config?.defaultExtractStabilizeStrategy ||
  "network_idle";
```

New (remove the `config` fallback):
```js
const stabilizeStrategy =
  strategyOverride ||
  hint?.default?.stabilizeStrategy ||
  "network_idle";
```

This works because:
- No hint matches → wildcard hint is `hint` → `stabilizeStrategy: "network_idle"` (explicit in the hint)
- Domain hint matches → uses its `stabilizeStrategy` if set, otherwise falls through to `"network_idle"`
- User wants no stabilization → set `stabilizeStrategy: "none"` in the wildcard hint

**Load skip selectors from wildcard hint:**

Current (line 2563):
```js
const defaultExtractSkipSelectors = manager.config.defaultExtractSkipSelectors ?? DEFAULT_EXTRACT_SKIP_SELECTORS;
```

New:
```js
const wildcard = getWildcardHint(hints);
const defaultExtractSkipSelectors = wildcard?.default?.skipSelectors ?? [];
```

Empty array is the correct default — wildcard hint starts with `skipSelectors: []`. The parameter flows through the pipeline unchanged.

**Remove the `DEFAULT_EXTRACT_SKIP_SELECTORS` import** from config.js (line 2) — no longer used.

### Step 3: Config removal

**`src/config.js`:**
- Remove from `loadConfig()`: lines 479-483 (all 6 `defaultExtract*` properties, including `defaultExtractPostProcessor`)
- Remove `DEFAULT_EXTRACT_SKIP_SELECTORS` constant (lines 327-350) — no longer needed
- Remove `DEFAULT_EXTRACT_FORMAT_DEFAULT` constant (line 92)
- Remove `parseDefaultExtractFormat()` export — no longer needed
- Remove `parseDefaultExtractPostProcessor()` export — no longer needed
- Keep `parseSelectorList()` and `parseStabilizeStrategy()` — still used by other config paths

**`src/config-schema.js`:**
- Remove 6 entries (lines 46-51): `DEFAULT_EXTRACT_SKIP_SELECTORS`, `DEFAULT_EXTRACT_FORMAT`, `DEFAULT_EXTRACT_STABILIZE_STRATEGY`, `DEFAULT_EXTRACT_WAIT_FOR_SELECTOR`, `DEFAULT_EXTRACT_WAIT_FOR_CONTENT`, `DEFAULT_EXTRACT_POST_PROCESSOR`

**`src/config-manager.js`:**
- Remove 6 hot-apply appliers (lines 83-88)

**`src/mcp-server.js`:**
- Remove special-case for `DEFAULT_EXTRACT_STABILIZE_STRATEGY` in `getConsoleConfigPayload()` (lines 415-416)
- Add `ensureWildcardHint` import and call `ensureWildcardHint(hints)` in GET `/console/api/hints` so wildcard appears in the list

**`docker-compose.yml`:**
- Remove 6 env var passthrough lines (including `DEFAULT_EXTRACT_POST_PROCESSOR`)

**`.env.example`:**
- Remove 6 entries (including `DEFAULT_EXTRACT_POST_PROCESSOR`)

### Step 4: Migration

**Auto-create wildcard hint from env vars (one-time):**

In `ensureWildcardHint(hints)`:
1. If wildcard hint exists → return
2. Check if any `DEFAULT_EXTRACT_*` env vars are set (including `DEFAULT_EXTRACT_POST_PROCESSOR`)
3. If yes → build wildcard hint from their values:
   ```js
    const d = {
      format: "readability_to_markdown",
      stabilizeStrategy: "network_idle",
      postProcessor: "",
      waitForSelector: [],
      waitForContent: [],
      skipSelectors: []
    };
   if (process.env.DEFAULT_EXTRACT_FORMAT) {
     d.format = parseDefaultExtractFormat(process.env.DEFAULT_EXTRACT_FORMAT);
   }
   if (process.env.DEFAULT_EXTRACT_STABILIZE_STRATEGY) {
     d.stabilizeStrategy = process.env.DEFAULT_EXTRACT_STABILIZE_STRATEGY;
   }
   if (process.env.DEFAULT_EXTRACT_POST_PROCESSOR) {
     d.postProcessor = process.env.DEFAULT_EXTRACT_POST_PROCESSOR;
   }
   if (process.env.DEFAULT_EXTRACT_WAIT_FOR_SELECTOR) {
     d.waitForSelector = parseSelectorList(process.env.DEFAULT_EXTRACT_WAIT_FOR_SELECTOR, []);
   }
   if (process.env.DEFAULT_EXTRACT_WAIT_FOR_CONTENT) {
     d.waitForContent = parseSelectorList(process.env.DEFAULT_EXTRACT_WAIT_FOR_CONTENT, []);
   }
   if (process.env.DEFAULT_EXTRACT_SKIP_SELECTORS) {
     d.skipSelectors = parseSelectorList(process.env.DEFAULT_EXTRACT_SKIP_SELECTORS, []);
   }
   ```
4. If no env vars set → use empty defaults (the shape above)
5. Create the wildcard hint, prepend to array, save to file
6. Log: `[domain-hints] created wildcard default hint`

Note: `parseDefaultExtractFormat` is kept as a local helper in `domain-hints.js` for migration only, or inlined. It's removed from `config.js` exports.

### Step 5: Console UI (`web-console/src/main.jsx`)

**Hints list (`Hints` component):**
- Wildcard hint renders first in the list (it's at index 0)
- Visual indicator: "default" badge next to the domain `*` entry
- Cannot be deleted (no delete button for index 0 when `domain === "*"`)
- Cannot be reordered

**Hint editor (`HintEditorPane`):**
- Detect wildcard hint: `hint.domain === "*"`
- **Target group:** Hide `pathPattern` field (always `/**`), hide `requireSelector` field
- **What gets extracted:** Hide mode switch (always "Default extraction", no flow option)
- **Testing group:** Hide test URLs group (wildcard hint is not tied to a domain)
- **Test panel:** Shown — test any URL against the wildcard hint's default extraction settings
- **Domain field:** Show but disabled (always `*`)
- Show a note: "This is the default extraction hint — it applies to all URLs that don't match a specific domain hint."
- **skipSelectors** field is shown and editable (same line-list as domain hints use)

**Manage tab:**
- Merged "Web Fetch Extraction" + "Post Processors" groups into single "Web Fetch" group
- Group keys: `["DOMAIN_HINTS_PATH", "POST_PROCESSOR_MODELS"]`
- Removed `DEFAULT_EXTRACT_POST_PROCESSOR` `ValueControl` special case from the Manage panel

**Stabilize strategy dropdown:**
- Removed the empty "—" option — only `network_idle`, `content_idle`, `mutation`, `none` remain

**Block editor (`BlockRowEditor`):**
- Extractor + Post-processor now use `hint-options-grid` (50-50 layout) instead of inline flex row
- This applies to ALL flow block editors, not just specific hints

### Step 6: Tests

**`tests/config.test.js`:**
- Remove tests for `DEFAULT_EXTRACT_*` env var parsing (lines 166-212)
- Remove `DEFAULT_EXTRACT_SKIP_SELECTORS` tests (lines 195-212)

**`tests/domain-hints*.test.js` (or new file):**
- `getWildcardHint` returns wildcard hint from array
- `getWildcardHint` returns null when no wildcard hint
- `ensureWildcardHint` creates hint with empty defaults when missing
- `ensureWildcardHint` preserves existing wildcard hint
- `ensureWildcardHint` migrates from env vars when set
- `findMatchingHints` excludes `domain: "*"` entries
- `validateHintRule` accepts wildcard hint without pathPattern
- `validateHintRule` rejects flow on wildcard hint
- `createHint` rejects `domain: "*"`
- `deleteHint` rejects deleting wildcard hint

**`tests/search.test.js`:**
- Update "DEFAULT_EXTRACT (no-hint defaults)" test (line 440) to use wildcard hint
- Update "a matching domain hint wins over DEFAULT_EXTRACT" test (line 475)
- Update skip selectors test (line 414) — now sources from wildcard hint
- Add test: wildcard hint skip selectors are applied globally
- Add test: domain hint skip selectors stack on top of wildcard skip selectors

**`tests/mcp-server.test.js`:**
- Remove hot-apply test for `DEFAULT_EXTRACT_*` vars (lines 416-433)

### Step 7: Documentation

**`AGENTS.md`:**
- Update Environment Variables table: remove 5 `DEFAULT_EXTRACT_*` entries
- Replace "DEFAULT_EXTRACT" section (line 967) with wildcard hint documentation
- Update "Domain Hints Workflow" to mention the wildcard hint
- Update skip selectors documentation

**`README.md`:**
- Update configuration section: remove 5 env var descriptions
- Add wildcard hint documentation

---

## File Change Summary

| File | Change |
|------|--------|
| `src/domain-hints.js` | Add `getWildcardHint()`, `ensureWildcardHint()`; modify `loadDomainHints()`, `findMatchingHints()`/`isMatch()`, `validateHintRule()`, `createHint()`, `deleteHint()` |
| `src/search.js` | Replace `defaultExtractHint()` calls with `getWildcardHint()`; load skip selectors from wildcard hint; remove `defaultExtractHint()` function; remove `DEFAULT_EXTRACT_SKIP_SELECTORS` import; remove `config.defaultExtractPostProcessor` fallbacks |
| `src/config.js` | Remove 6 `defaultExtract*` properties from `loadConfig()` (including `defaultExtractPostProcessor`); remove `DEFAULT_EXTRACT_SKIP_SELECTORS` constant; remove `DEFAULT_EXTRACT_FORMAT_DEFAULT`; remove `parseDefaultExtractFormat()` and `parseDefaultExtractPostProcessor()` |
| `src/config-schema.js` | Remove 6 `DEFAULT_EXTRACT_*` entries |
| `src/config-manager.js` | Remove 6 hot-apply appliers |
| `src/mcp-server.js` | Remove `DEFAULT_EXTRACT_STABILIZE_STRATEGY` special case; add `ensureWildcardHint` import and call in GET `/console/api/hints`; wildcard guards in `createHint`/`deleteHint` |
| `web-console/src/main.jsx` | Wildcard hint list indicator; simplified editor form; hidden test URLs; merged manage groups; removed `DEFAULT_EXTRACT_POST_PROCESSOR` ValueControl; stabilize strategy dropdown cleanup; block editor 50-50 grid fix |
| `docker-compose.yml` | Remove 6 env var lines |
| `.env.example` | Remove 6 entries |
| `tests/config.test.js` | Remove old DEFAULT_EXTRACT tests |
| `tests/search.test.js` | Update default-extract and skip-selector tests |
| `tests/mcp-server.test.js` | Remove hot-apply test |
| `tests/domain-hints.test.js` | Add wildcard hint tests; account for wildcard at index 0 |
| `tests/domain-hints-api.test.js` | Update GET hints count to include wildcard |
| `AGENTS.md` | Update docs |
| `README.md` | Update docs |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Existing users have `DEFAULT_EXTRACT_*` env vars set (including `DEFAULT_EXTRACT_POST_PROCESSOR`) | Migration reads them on first load, creates the wildcard hint, saves to file. Env vars become ignored after that. |
| Users manually edited `DEFAULT_EXTRACT_SKIP_SELECTORS` to a custom list | Migration preserves their custom list in the wildcard hint's `skipSelectors`. |
| Wildcard hint at index 0 could be confusing in the hints list | Visual indicator ("default" badge) + simplified form makes it clear. |
| `findMatchingHints` behavior change (excluding `domain: "*"`) | Low risk — no existing hints use `domain: "*"`. The function is internal. |
| Removing the built-in 21-selector list | Readability already strips `script`/`style`/`noscript`/`template` internally. Users add what they need to the wildcard hint. |
| `DEFAULT_EXTRACT_POST_PROCESSOR` removed | Post-processor now lives in wildcard hint's `default.postProcessor`. Migration reads the env var. |

---

## Verification

1. **Unit tests:** `npx vitest run` — all 520 tests pass after updates
2. **Migration test:** Start with `DEFAULT_EXTRACT_FORMAT=html_to_markdown` and `DEFAULT_EXTRACT_POST_PROCESSOR=reader_lm` env vars, no wildcard hint in file → verify hint is created with both values
3. **Extraction test:** `curl "http://localhost:3000/extract?url=https://example.com"` → verify extraction uses wildcard hint settings
4. **Domain hint wins:** `curl "http://localhost:3000/extract?url=https://github.com/user"` → verify GitHub flow hint is used, not wildcard
5. **Console test:** Open `/console/hints` → verify wildcard hint appears first with "default" badge, simplified form (no pathPattern/requireSelector/flow toggle), test panel works with any URL
6. **Skip selectors test:** Wildcard hint has `skipSelectors: ["nav"]` → verify `nav` elements are stripped from ALL pages, not just unmatched ones
7. **Stacking test:** Domain hint has `skipSelectors: [".ad-banner"]` → verify both wildcard and domain skip selectors apply
8. **Manage tab test:** Verify "Web Fetch" group contains `DOMAIN_HINTS_PATH` + `POST_PROCESSOR_MODELS`; no `DEFAULT_EXTRACT_POST_PROCESSOR` ValueControl
9. **Block editor test:** Open a flow hint → verify Extractor + Post-processor use 50-50 grid layout (not inline flex)
10. **Env var removal:** Verify `DEFAULT_EXTRACT_*` (all 6) are no longer in Manage tab, docker-compose.yml, .env.example
