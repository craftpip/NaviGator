# Summary — Cross-Project Analysis

> Key takeaways from analyzing 14 web extraction projects. Focus on actionable improvements for our tool.

---

## TL;DR

**What everyone does:** Readability + Turndown (HTML to markdown) + browser rendering (optional).

**What we do differently:** Domain hints, browserText fallback, tables always extracted, links with ref_ids.

**What we've added since:** DOM-to-markdown conversion (Turndown + GFM), tool caching, link density scoring, truncation indicator, domain hint structured fields, auth wall detection.

**What we're still missing:** Content filters (BM25/pruning), Readability retry, LLM extraction.

**Remaining improvements to adopt:**
1. Content filters (like Crawl4AI) — Remove noise before Readability
2. Readability retry with different options — Higher success rate for edge cases

**What we've already adopted:**
- ✅ DOM-to-markdown conversion via TurndownService + GFM
- ✅ Tool caching with per-tool TTL and bypass param
- ✅ Link density scoring in candidate block selection
- ✅ Truncation indicator when output exceeds maxChars

---

## Architecture Comparison

| Project | Language | Browser | HTTP-First | Fallback Chain |
|---------|----------|---------|------------|----------------|
| **Us** | JavaScript | Chromium | Rejected | Markdown → Readability → candidate blocks + caching |
| Firecrawl | TypeScript | Playwright | No | Multi-engine waterfall |
| Crawl4AI | Python | Playwright | No | Content filters |
| Jina Reader | TypeScript | Puppeteer | No | Browser/Curl auto |
| Trafilatura | Python | None | Yes | 4-stage cascade |
| Readability.js | JavaScript | None | Yes | N/A (library) |
| Essence | Rust | Chromium | Yes | HTTP → Browser |

**Key insight:** HTTP-first works for others because they cold-launch browsers. Since we prelaunch and pool pages, browser overhead is already minimal. Bot detection on HTTP-only requests makes it unreliable for our use case.

---

## Extraction Strategy Comparison

| Project | Primary | Fallback | LLM | Content Filters |
|---------|---------|----------|-----|-----------------|
| **Us** | Markdown (Turndown) | BrowserText, candidate blocks, link density | No | No |
| Firecrawl | Readability | Multi-engine | Yes (extract) | No |
| Crawl4AI | HTML-to-text | Content filters | Yes (optional) | BM25, Pruning |
| Jina Reader | Readability | Custom Markify | Yes (VLM) | No |
| Trafilatura | Heuristics | jusText, Readability | No | No |
| Readability.js | Scoring | Retry | No | No |
| Essence | HTTP extraction | Browser | No | No |

**Key insight:** Most projects have fallback chains. We have Readability → browserText → candidate blocks.

---

## Output Format Comparison

| Project | Markdown | Tables | Links | Metadata | Citations |
|---------|----------|--------|-------|----------|-----------|
| **Us** | Markdown (Turndown + GFM) | Always | With ref_ids | SEO analysis | No |
| Firecrawl | Yes | Yes | Yes | Yes | No |
| Crawl4AI | Yes | Basic | Yes | Yes | Yes |
| Jina Reader | Yes | Yes | Yes | Yes | Yes |
| Trafilatura | Yes | Optional | Optional | Yes | No |
| Readability.js | HTML | No | No | Yes | No |
| Essence | Yes | Yes | Yes | Yes | No |

**Key insight:** Most projects output markdown. We now output markdown too (Turndown + GFM). Jina and Crawl4AI have citation systems.

---

## What Everyone Does Well

### 1. Content Filters (Crawl4AI)
- BM25 for query-specific extraction
- Pruning for general noise removal
- Better than Readability for non-article pages

### 3. Multi-Engine Fallback (Firecrawl)
- Try multiple engines in parallel
- First success wins
- Higher success rate

### 4. LLM Extraction (Firecrawl, Crawl4AI)
- Extract structured data from unstructured content
- User defines schema
- LLM extracts matching data

---

## What We Do Well

### 1. Domain Hints (Unique)
- Per-site extraction configs
- Precise selectors for known sites
- No other project has this

### 2. BrowserText Fallback (Unique)
- Compare Readability with browser text
- Use browser text if significantly more content
- Catches cases where Readability misses

### 3. Markdown Output
- TurndownService + GFM plugin
- Preserves headings, bold, code, lists, links, tables
- Matches industry standard output format

### 4. Tables Always Extracted
- Clean pipe-separated format
- No flag needed (always on)
- Better than most projects

### 5. Links with ref_ids
- Always extract links
- Store for web_page_links tool
- Unique to our MCP integration

### 6. MCP Integration
- Built-in MCP server
- Tools for search, fetch, screenshot, links
- Other projects don't have this

---

## Top Improvements to Adopt

### ✅ Already Adopted

| Feature | Status | Where |
|---------|--------|-------|
| DOM-to-markdown conversion | ✅ Done | `src/markdown.js` via TurndownService + GFM |
| Tool caching | ✅ Done | `mcp-server.js` — per-tool cache with 5 min TTL, `bypassCache` param |
| Link density scoring | ✅ Done | `search.js:1216` — candidate scoring with link density penalty |
| Truncation indicator | ✅ Done | `search.js:2257` — appended when output exceeds maxChars |

### ❌ Rejected: HTTP-First Fetching

**Decision:** Not adopting. Rationale:
- Bot detection on bare HTTP (Wikipedia, Stack Overflow, etc.) makes success unreliable
- No reliable way to know in advance if a page needs a browser — always-runs, always-wastes
- Browser is prelaunched and pooled, so incremental cost is already low
- Most real-world sites (JS-heavy, SPA, Cloudflare) need the browser anyway
- Would add a wasted HTTP round-trip on top of browser for the dominant case

### Priority 1: Content Filters (High Impact, Medium Effort)

**What:** Add BM25 and Pruning filters to remove noise before Readability.

**How:**
1. Add `PruningContentFilter` — Remove boilerplate (nav, footer, ads)
2. Add `BM25ContentFilter` — Keep query-relevant content
3. Run filters before Readability
4. Improve accuracy for non-article pages

**Benefit:** Better extraction for pages with mixed content.

**Reference:** Crawl4AI (BM25, Pruning filters)

### Priority 3: Readability Retry (Medium Impact, Low Effort)

**What:** Retry Readability with different options if result too short.

**How:**
1. Check if extraction is too short (< 500 chars)
2. Retry with `charThreshold: 0`
3. Retry with `maxElemsToParse: 0`
4. Use longer/more-complete extraction

**Benefit:** Higher success rate for edge cases.

**Reference:** Readability.js (retry logic), Trafilatura (4-stage cascade)

---

## What We Should NOT Adopt

### 1. LLM Extraction (Expensive)
- LLM extraction is slow and costly
- Domain hints are faster and cheaper for known sites
- Only add if user explicitly needs structured data

### 2. Screenshot-to-Markdown (Slow)
- Screenshot conversion is slow and expensive
- HTML extraction is better for most cases
- Only add for visual content that can't be extracted from HTML

### 3. Multi-Session Routing (Complex)
- Our browser backends serve similar purpose
- Adds complexity without clear benefit
- Keep it simple

---

## Cross-Project Patterns

### Pattern 1: Content Filters Before Readability
Projects that use filters (Crawl4AI) get better results than those that don't (us).

### Pattern 2: Markdown Standard
All projects output markdown. We now do too (Turndown + GFM). Matches the industry standard.

### Pattern 3: Citation Systems
Jina and Crawl4AI convert links to footnotes for cleaner LLM input. Worth considering.

### Pattern 4: Retry/Cascade
Projects with fallback chains (Trafilatura, Firecrawl) have higher success rates.

---

## Implementation Status

### ✅ Phase 1: Quick Wins (Done)
1. ~~Link density scoring (low effort, medium impact)~~ ✅ Done
2. Tool caching with bypass (medium effort, high impact) ✅ Done
3. Truncation indicator (low effort, medium impact) ✅ Done
4. ~~Retry with different Readability options (low effort, medium impact)~~ Still pending

### ✅ Phase 2: DOM-to-Markdown (Done)
1. ~~TurndownService integration~~ ✅ Done (`src/markdown.js`)
2. ~~GFM plugin support~~ ✅ Done
3. ~~Noise selector filtering~~ ✅ Done
4. ~~Integration with extraction pipeline~~ ✅ Done

### ❌ Phase 3: HTTP-First — Rejected
1. ~~Add HTTP fetching~~ — Bot detection makes it unreliable
2. ~~Content density detection~~ — Always-runs, always-wastes with prelaunched browser
3. ~~Hydration marker detection~~ — Dominant case needs browser anyway
4. ~~HTTP → Browser fallback~~ — Extra latency for no benefit

### Phase 3: Content Filters (2-3 weeks)
1. PruningContentFilter implementation
2. BM25ContentFilter implementation
3. Integration with extraction pipeline

---

## Key Questions Answered

### 1. Should we add HTTP-first fetching?
**No.** Rejected — bot detection on simple sites makes it unreliable, and with a prelaunched browser pool the savings don't materialize.

### 2. Should we add content filters?
**Yes.** Crawl4AI's filters improve accuracy significantly. Low effort, high impact.

### 3. Should we add DOM-to-markdown conversion?
**Yes — and we did.** TurndownService + GFM, integrated into the full extraction pipeline. Output is now markdown.

### 4. Should we add LLM extraction?
**Maybe.** Only if users need structured data. Domain hints are faster and cheaper.

### 5. Should we add multi-engine fallback?
**Maybe.** Our circuit-breaker + fallback chain already handles engine failures. Full multi-parallel is complex and likely not worth it since the fallback chain already works.

---

## Conclusion

Our tool has unique strengths (domain hints, browserText fallback, tables, links, MCP, markdown output) but is still missing content filters for noise removal before Readability.

**What we've adopted since the research began:**
- ✅ DOM-to-markdown conversion (Turndown + GFM)
- ✅ Tool caching (per-tool TTL, bypass param)
- ✅ Link density scoring
- ✅ Truncation indicator

**Remaining improvements:**
1. **Content filters** — Remove noise before Readability
2. **Readability retry** — Higher success rate for edge cases

---

*Last updated: 2026-07-27*
