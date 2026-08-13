# Generalize WebFetch — Make It Generic

## Plan Status

**Status: IN PROGRESS** — verified 2026-08-10. The CRITICAL items are mostly done; the DESIGN/MINOR items remain open.

### Checklist

| # | Issue | Status |
|---|-------|--------|
| 1 | Weather extraction hijacks every page | ✅ Done — `extractWeatherSummary()` removed |
| 2 | Stock options table trimming in generic pipeline | ✅ Done — `trimSparseTableColumns` / `isGroupOnlyHeader` gone |
| 3 | Tab-line filtering destroys legitimate content | ✅ Done — `stripTableNoise` gone |
| 4 | 2-second default navigation wait | ✅ Done — `navigationWait` removed from `src/search.js` |
| 5 | `waitForNetworkIdle` up to 10s | ✅ Done — now gated behind `stabilizeStrategy` config (`network_idle`/`content_idle`/`mutation`) |
| 6 | Link extraction runs but is never shown | ✅ Resolved by design — links kept invisible, surfaced via `web_page_links` (see AGENTS.md) |
| 7 | `includeSeoAnalysis` not in MCP schema | ❌ Open — still absent from `web_fetch` schema (`src/mcp-server.js`) |
| 8 | JSDOM parsed 3+ times per page | 🟡 Partial — text + tables share one DOM; `extractLinksFromHtml` still re-parses (`src/search.js:1563`) |
| 9 | Broken `[text][ref_id]` format for numeric content | ❌ Open — `enrichNumericLinkText` still in place (`src/search.js:1515`) |
| 10 | `header`/`footer` removed before hints run | ✅ Done — no longer in `NON_CONTENT_SELECTORS` (`src/search.js:238`) |
| 11 | Tables removed after extraction, blocking downstream | ✅ Resolved by design — tables are removed only *after* `extractTablesFromDocument()` captures them (`src/search.js:710,759`); sections/Readability then run on the table-free DOM so raw tabular noise never leaks |
| 12 | Framework-specific selectors in generic fallback | ❌ Open — `#__next`, `#root`, `#app-root`, `[data-reactroot]` still in `SEMANTIC_CONTENT_SELECTORS` |
| 13 | Bot detection only covers 2 vendors | 🟡 Partial — per-driver block checks moved into `src/engines/*`; not a configurable vendor list |
| 14 | Links inside tables silently dropped | ❌ Open — `if (a.closest("td, th")) return;` still at `src/search.js:1599` |
| 15 | `normalizeUrl()` leaks search redirect logic | 🟡 Partial — moved to `src/engines/util.js`; redirect unwrapping still shared with page-fetch dedup |
| 16 | Arbitrary Readability fallback thresholds | ❌ Open — `1.5x` ratio / 200-char check still at `src/search.js:783` |
| 17 | `uniqueLines()` filters short content silently | ❌ Open — `length < 3` still at `src/search.js` |
| 18 | `isLikelyJunkLine()` weather abbreviations | ✅ Done — `NNW`/`WNW`/`SSW`/`ENE` etc. gone |
| 19 | Console.log spam in production | ✅ Resolved by policy — debug logs kept intentionally (AGENTS.md rule); timing logs stay DEBUG-gated |

## What's Wrong

The `web_fetch` tool is not a generic web page extractor. It was built empirically against a specific set of sites (NSE India, GitHub, Indian news portals, weather sites), and the special cases leaked into the shared pipeline. Every page fetch pays for those special cases.

## Issues by Severity

### CRITICAL — Fix Now

~~**1. Weather extraction hijacks every page** — FIXED~~
`extractWeatherSummary()` removed. Weather keywords removed from `scoreTextBlock()` and `isLikelyJunkLine()`. The weather-specific regex patterns are gone from the generic pipeline.

**2. Stock options table trimming in generic pipeline**
`src/search.js:550-569`
`trimSparseTableColumns()` has `isGroupOnlyHeader = (i) => /^(calls|puts)$/i.test(...)` — hardcoded NSE India column header check. Runs on every table from every page.

**Fix:** Remove or gate behind a domain hint.

**3. Tab-line filtering destroys legitimate content**
`src/search.js:803-806`
`stripTableNoise()` removes ALL lines containing `\t`. Added for NSE India tab-separated data. Now any page with tab characters loses content.

**Fix:** Remove or only apply when table extraction ran and found data.

### PERFORMANCE — Fix Now

**4. 2-second default navigation wait on every page**
`src/search.js:2244`
```js
const navigationWaitMs = hint?.navigationWait != null ? hint.navigationWait : 2000;
```
Every page waits 2s after network idle. No opt-out. 5 pages in parallel = 2s across the board. Simple server-rendered pages pay this tax too.

**Fix:** Default to 0. Let hints opt in when needed.

**5. waitForNetworkIdle adds up to 10s per page**
`src/search.js:2240-2242`
```js
await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 });
```
Silent catch. Streaming/long-poll pages wait up to 10s with no feedback.

**Fix:** Remove or make configurable with a sane default.

**6. Link extraction runs on every fetch but is never shown**
`src/search.js:2310`
Every page fetch creates a separate JSDOM parse of the full HTML to extract links. Links are stored invisibly — never in output. The caller must call `web_page_links` separately.

**Fix:** Either show links inline or make extraction lazy/deferred.

**7. SEO analysis is non-opt-out in MCP**
`src/mcp-server.js:1197` / schema `src/mcp-server.js:1019-1045`
MCP schema has no `includeSeoAnalysis` parameter but handler defaults to `true`. HTTP `/extract` passes `false` but MCP callers can't opt out. `captureSeoSnapshot()` does heavy DOM walking with JS `eval()` inside the browser.

**Fix:** Add `includeSeoAnalysis` to the MCP schema.

**8. JSDOM parsed 3+ times per page**
`src/search.js:892, 2107` (+ htmlToMarkdown path)
1. `extractTextFromHtml()` creates JSDOM
2. `extractTablesFromDocument()` uses that same DOM
3. `extractLinksFromHtml()` creates ANOTHER JSDOM from the same HTML string
4. `htmlToMarkdown(doc.body.innerHTML)` also re-parses

**Fix:** Reuse the JSDOM instance across extraction steps.

### DESIGN — Fix Soon

**9. Broken `[text][ref_id]` format for numeric content**
`src/search.js:2059-2103`
`enrichNumericLinkText()` is a workaround for the ambiguous format. `Python [5][88]` — is `[5]` link text or ref_id? URL-path heuristics are GitHub-tuned.

**Fix:** Change the inline format to something unambiguous (e.g., `[text](ref:N)` or `[text] ^N^`).

**10. `header`/`footer` removed before hints run**
`src/search.js:299-322, 899`
`NON_CONTENT_SELECTORS` strips `header`, `footer`, `nav`, `aside`. This happens at line 899 BEFORE hint section extraction at line 920. Hints can't recover content from these elements.

**Fix:** Remove `header`/`footer` from `NON_CONTENT_SELECTORS` (as AGENTS.md already notes they contain real content on portfolio/personal sites). Or run hint sections first.

**11. Tables removed after extraction, blocking downstream**
`src/search.js:916-918`
Tables are removed from DOM after `extractTablesFromDocument()`. Readability and sections can't see them.

**Fix:** Don't remove — or clone the DOM first.

**12. Framework-specific selectors in generic fallback**
`src/search.js:8-13, 324-341`
`#__next` (Next.js), `#root` (CRA), `#app-root`, `[data-reactroot]` — hardcoded framework root IDs.

**Fix:** Use `[data-reactroot], [data-v-app], [data-sveltekit], #__nuxt` etc. as a configurable list, or rely on semantic selectors (`main`, `article`) instead.

### MINOR — Fix When Touching Related Code

**13. Bot detection only covers 2 vendors**
`src/search.js:2270-2280`
Cloudflare and DataDome only. Every other bot protection is invisible.

**Fix:** Make vendor patterns configurable/extensible.

**14. Links inside tables silently dropped**
`src/search.js:2143`
`if (a.closest("td, th")) return;` — pricing tables, comparison pages lose all linked content.

**Fix:** Remove this filter or add a per-table opt-in.

**15. `normalizeUrl()` leaks search redirect logic**
`src/search.js:175-190`
Google/DuckDuckGo redirect unwrapping runs during page fetch dedup. Direct redirect URLs get unexpected resolution.

**Fix:** Move search redirect unwrapping to the search pipeline only.

**16. Arbitrary Readability fallback thresholds**
`src/search.js:980-995`
1.5x ratio and 200-char minimum for browserText vs article.textContent fallback — untuned, no rationale.

**Fix:** Document or remove.

**17. `uniqueLines()` filters short content silently**
`src/search.js:382`
`if (normalized.length < 3) continue;` — drops "7", "A1", short labels.

**Fix:** Make the threshold configurable or remove it.

**18. `isLikelyJunkLine()` has weather abbreviations**
`src/search.js:401-402`
`NNW`, `WNW`, `SSW`, `ENE`, `W`, `NW`, `SW`, `NE`, `SE` flagged as junk on every page.

**Fix:** Remove these from junk detection.

**19. Console.log spam in production**
Lines 887, 973, 975-978, 983, 986, 1004, 1017, 1019, 1033 — dozens of debug logs per page fetch.

**Fix:** Gate behind a DEBUG flag or remove.

## Fix Order

1. ~~Weather hijack (#1)~~ — DONE
2. Default navigation wait → 0 (#4) — biggest perf win
3. `includeSeoAnalysis` in MCP schema (#7) — lets callers opt out
4. Tab-line stripping → gate behind table extraction (#3)
5. Stock table trimming → gate behind hint (#2)
6. JSDOM reuse (#8) — reduces parses per page
7. `header`/`footer` removal (#10) — content loss
8. Everything else
