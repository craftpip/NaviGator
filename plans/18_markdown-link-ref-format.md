# Markdown Link Ref Format — `[text][ref_id]` → `[text](ref_id)`

## Plan Status

**Status: COMPLETE** — 2026-08-14. All code, tests, and docs updated; container restarted; live verification passed. Decisions made with the user:
- Search result labels render the **domain as the link text**: `- **Title** [vitest.dev](4)` (ref is the link destination).
- Page/screenshot headers render the **title as the link text**: `### [Title](5)`.

### Checklist

- [x] 1. Rewrite inline link refs in `web_fetch` text output: `src/mcp-server.js:1545` → `[text](ref)`.
- [x] 2. Switch result-ref labels in both `web_search` formatters: `src/mcp-server.js:1171` and `:1225` → `- **Title** [domain](ref)`.
- [x] 3. Switch page/screenshot header ref labels: `src/mcp-server.js:1354` (web_fetch) and `:1392` (screenshot) → `### [Title](ref)`.
- [x] 4. Switch `web_page_links` list output: `src/mcp-server.js:2338/2340` → `- (ref): url`.
- [x] 5. Update footer note wording (`src/mcp-server.js:1201` and `:1240`).
- [x] 6. Update internal response-summary regexes: `mcpResponseSummary` (`src/mcp-server.js:960`) and `extractDomains` fallback (`src/mcp-server.js:946`).
- [x] 7. Update tool descriptions (`src/mcp-server.js:1776` — `web_page_links`) and `decorateResultLinks` display (`src/mcp-server.js:1116`).
- [x] 8. Update tests: `tests/mcp-server.test.js:954` (search result regex), `:956` (footer note), `:978` (page header), `:1061` (inline link rewrite), `:1070` (web_page_links output).
- [x] 9. Update docs: `AGENTS.md` tool contract + "Format Ambiguity With Numeric Link Text" learning, `docs/web-fetch-docs.md` pipeline + links section.
- [x] 10. Verify end-to-end: unit tests pass (2 pre-existing unrelated failures), `docker restart navigator`, live `web_fetch`/`web_search`/`web_page_links` all confirmed in the new format.

## Goal

Links in MCP tool output currently use Markdown *reference-style* syntax: `[text][ref_id]` (e.g. `[110 Bible Verses About Not Giving Up When Life Gets Hard][8353]`). The LLM (and any markdown renderer) cannot reliably distinguish the `ref_id` from the link text when the text is itself numeric — `Python [5][88] [1][89]` is unparseable. This is documented in `AGENTS.md` under "Format Ambiguity With Numeric Link Text".

Change every `ref_id` rendered into tool output to the *inline* syntax `[text](ref_id)` (e.g. `[110 Bible Verses About Not Giving Up When Life Gets Hard](8353)`), so each ref becomes the destination of a proper Markdown link — valid, unambiguous, and clickable in any markdown renderer.

## Current vs Target

| Where | Current | Target |
|---|---|---|
| `web_fetch` inline link (the main change) | `[documentation][17]` | `[documentation](17)` |
| `web_search` result label | `- **Vitest Guide** [4] (vitest.dev)` | `- **Vitest Guide** [vitest.dev](4)` (domain as link text) |
| `web_fetch` / screenshot page header | `### [5] Title` | `### [Title](5)` (title as link text) |
| `web_page_links` list | `- [5]: https://…` | `- (5): https://…` |
| Footer note | `*Square brackets contain ref_ids.*` | `*Link destinations in parentheses are ref_ids.*` |

## Change Locations (complete survey)

### Code — `src/mcp-server.js`

| Line | What | Change |
|---|---|---|
| 1545 | Inline link rewrite in `openTargetsParallel()`: `return \`[${…}][${ref}]\`;` | `return \`[${…}](${ref})\`;` — the user-visible `[text][ref_id]` → `[text](ref_id)` change. The `isNumeric && enriched` enrichment logic stays untouched. |
| 1171 | `formatSearchResponse()` (session path) result label `` `[${refId}]` `` | `` `(${refId})` `` |
| 1225 | `formatSearchResponse()` (stateless path) result label `` `[${refId}]` `` | `` `(${refId})` `` |
| 1354 | `formatOpenPageResponse()` header ref `` `[${entry.ref_id}]` `` | `` `(${entry.ref_id})` `` |
| 1392 | `formatScreenshotResponse()` header ref `` `[${entry.ref_id}]` `` | `` `(${entry.ref_id})` `` |
| 2338 / 2340 | `web_page_links` list output `` `- [${id}]: url` `` | `` `- (${id}): url` `` |
| 1201 / 1240 | Footer note `*Square brackets contain ref_ids.*` | `*Numbers in parentheses are ref_ids.*` |
| 960 | `mcpResponseSummary()` regex `^\s*- \*\*.+?\*\* \[\d+\]` (search-result detection) | `^\s*- \*\*.+?\*\* \(\d+\)` |
| 946 | `extractDomains()` fallback regex `\[\d+\].*?\]\s+(https?://…)` (stale; only matched the old layout) | Update to `\(\d+\)` or remove if dead |
| 1776 | `web_page_links` tool description "(shown inline in web_fetch output as [ref_id])" | "(shown inline in web_fetch output as (ref_id))" |

### Tests — `tests/mcp-server.test.js`

| Line | What | Change |
|---|---|---|
| 954 | `expect(text).toMatch(/- \*\*Vitest Guide\*\* \[\d+\] \(vitest.dev\)/)` | `(- \*\*Vitest Guide\*\* \(\d+\) \(vitest.dev\))` |
| 956 | `expect(text).toContain("*Square brackets contain ref_ids.*")` | Assert the new footer note |
| 1061 | `text.match(/\[documentation\]\[(\d+)\]/)` | `text.match(/\[documentation\]\((\d+)\)/)` |
| 1063 | `expect(text).not.toContain("[documentation](https://docs.example.com/guide)")` | Unchanged — still must not leak the real URL |

`web_page_links` assertions (line ~1069) only check the resolved URL, not the label format — safe, but add a `- (N): url` assertion while there.

### Docs

| File | What | Change |
|---|---|---|
| `AGENTS.md` | Tool contract `web_fetch` / `web_page_links` (lines ~52, 58, 65) | `[text][ref_id]` → `[text](ref_id)`; output `- [ref_id]: url` → `- (ref_id): url` |
| `AGENTS.md` | "Format Ambiguity With Numeric Link Text" learning (lines ~761-765) | Rewrite: the inline form resolves the ambiguity; keep the note as history or mark resolved |
| `AGENTS.md` | `web_page_links` input examples "(e.g. [4, 5, 6])" | Cosmetic — can stay (input array syntax) |
| `docs/web-fetch-docs.md` | Pipeline step "Replace markdown links [text](url) → [text][ref_id]" (line ~117) | `→ [text](ref_id)` |
| `docs/web-fetch-docs.md` | Links section (lines ~288-310) | Match new format |

## Implementation Notes

1. **The rewrite regex stays the same.** Line 1540 `\[([^\]]+)\]\(([^)]+)\)` matches `[text](url)`; only the emitted output changes. A single pass means `[text](ref)` output is never re-matched.
2. **`[text](ref)` is valid Markdown** — that is the point. Rendered as a link to "8353", which is what the user wants (respect Markdown semantics). No escaping of the numeric destination needed.
3. **Numeric-text enrichment is preserved.** `isNumeric && enriched ? enriched : text` still swaps numeric link text for the anchor text, so `[5][88]`-style collisions become `[documentation](88)`.
4. **Search result labels** use the domain as link text: `- **Title** [vitest.dev](4)` (user decision). Falls back to the title text (or `link`) when a result has no domain. Page/screenshot headers use the title as link text: `### [Title](5)` (user decision).
5. **Only output rendering changes.** `rememberLink()`, `getLinkRefByUrl()`, `ref-memory.js`, the cache payload, and the tool *input* schemas (`ref_id`, `ref_ids`) are untouched. The `web_fetch(ref_id: N)` / `web_page_links(ref_id: N)` call contract is unchanged.
6. **Cache invalidation:** `web_fetch`/`web_search` responses are cached; the cache stores the structured payload and formatting happens on read, so old cached entries render with the new format automatically — no cache bump needed. (`formatOpenPageResponse`/`formatSearchResponse` run on both cache-hit and cache-miss paths.)

## Verification

```bash
docker compose exec navigator npm install --include=dev    # dev deps are pruned on every container start
docker compose exec navigator npx vitest run tests/mcp-server.test.js

# Code is bind-mounted; restart so the live server picks up the new module code
docker compose restart navigator

# Live check — the exact user example pattern:
#   web_fetch → text should contain [110 Bible Verses …](8353), not [110 Bible Verses …][8353]
curl -s "http://localhost:3000/extract?url=<a link-heavy page>&maxChars=2000" | grep -o '\[[^]]*\]([0-9]*)' | head
```

Also confirm:
- `web_search` result lines render `- **Title** [domain](N) …`.
- `web_page_links` returns `- (N): url`.
- `mcporter` or `curl POST /mcp` `tools/list` shows the updated `web_page_links` description.
- No `[N]`-style ref artifacts remain in `web_fetch` text output.

## Risks / Decisions

- **Numeric link text + parens:** with `(ref)` as the destination, a numeric-looking URL fragment (e.g. `[5](88)`) is now readable — this is the exact fix for the documented ambiguity.
- **Docs claims may be stale** (e.g. `AGENTS.md` mentions a `## Links` section that no longer exists). Fix adjacent wording while touching the same paragraphs, but keep the diff focused.
- **`mcpResponseSummary` regex** is used for console/summary logging; if missed, search responses still summarize but with "(N)" the result-count detection silently breaks — covered by checklist item 6.
