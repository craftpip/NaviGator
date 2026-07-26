# Summary — Cross-Project Analysis

> Key takeaways from analyzing 14 web extraction projects. Focus on actionable improvements for our tool.

---

## TL;DR

**What everyone does:** Readability + Turndown (HTML to markdown) + browser rendering (optional).

**What we do differently:** Domain hints, browserText fallback, tables always extracted, links with ref_ids.

**What we're missing:** HTTP-first fetching, content filters, DOM-to-markdown conversion, LLM extraction.

**Top 3 improvements to adopt:**
1. HTTP-first fetching (like Essence) — Speed up simple pages
2. Content filters (like Crawl4AI) — Remove noise before Readability
3. DOM-to-markdown conversion (like Jina) — Better structure than plain text

---

## Architecture Comparison

| Project | Language | Browser | HTTP-First | Fallback Chain |
|---------|----------|---------|------------|----------------|
| **Us** | JavaScript | Chromium | No | Readability → candidate blocks |
| Firecrawl | TypeScript | Playwright | No | Multi-engine waterfall |
| Crawl4AI | Python | Playwright | No | Content filters |
| Jina Reader | TypeScript | Puppeteer | No | Browser/Curl auto |
| Trafilatura | Python | None | Yes | 4-stage cascade |
| Readability.js | JavaScript | None | Yes | N/A (library) |
| Essence | Rust | Chromium | Yes | HTTP → Browser |

**Key insight:** Most projects use HTTP-first with browser fallback. We always use browser.

---

## Extraction Strategy Comparison

| Project | Primary | Fallback | LLM | Content Filters |
|---------|---------|----------|-----|-----------------|
| **Us** | Readability | BrowserText, candidate blocks | No | No |
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
| **Us** | Plain text | Always | With ref_ids | SEO analysis | No |
| Firecrawl | Yes | Yes | Yes | Yes | No |
| Crawl4AI | Yes | Basic | Yes | Yes | Yes |
| Jina Reader | Yes | Yes | Yes | Yes | Yes |
| Trafilatura | Yes | Optional | Optional | Yes | No |
| Readability.js | HTML | No | No | Yes | No |
| Essence | Yes | Yes | Yes | Yes | No |

**Key insight:** Most projects output markdown. We output plain text. Jina and Crawl4AI have citation systems.

---

## What Everyone Does Well

### 1. HTTP-First Fetching (Essence, Trafilatura)
- Try HTTP first (~100ms)
- Fall back to browser if needed (~2-5s)
- 10-50x faster for simple pages

### 2. Content Filters (Crawl4AI)
- BM25 for query-specific extraction
- Pruning for general noise removal
- Better than Readability for non-article pages

### 3. DOM-to-Markdown (Jina, Crawl4AI)
- Convert HTML structure to markdown
- Preserve headings, code, lists
- Better output than plain text

### 4. Multi-Engine Fallback (Firecrawl)
- Try multiple engines in parallel
- First success wins
- Higher success rate

### 5. LLM Extraction (Firecrawl, Crawl4AI)
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

### 3. Tables Always Extracted
- Clean pipe-separated format
- No flag needed (always on)
- Better than most projects

### 4. Links with ref_ids
- Always extract links
- Store for web_page_links tool
- Unique to our MCP integration

### 5. MCP Integration
- Built-in MCP server
- Tools for search, fetch, screenshot, links
- Other projects don't have this

---

## Top Improvements to Adopt

### Priority 1: HTTP-First Fetching (High Impact, Medium Effort)

**What:** Try HTTP first, fall back to browser if content density low.

**How:**
1. Fetch HTML with `reqwest` (or similar)
2. Check content density (text-to-HTML ratio)
3. Check for hydration markers (`__NEXT_DATA__`, `__NUXT__`)
4. If density OK and no markers → use HTTP result
5. If density low or markers found → use browser

**Benefit:** 10-50x faster for simple pages (blogs, docs, news).

**Reference:** Essence (HTTP → Browser waterfall)

### Priority 2: Content Filters (High Impact, Medium Effort)

**What:** Add BM25 and Pruning filters to remove noise before Readability.

**How:**
1. Add `PruningContentFilter` — Remove boilerplate (nav, footer, ads)
2. Add `BM25ContentFilter` — Keep query-relevant content
3. Run filters before Readability
4. Improve accuracy for non-article pages

**Benefit:** Better extraction for pages with mixed content.

**Reference:** Crawl4AI (BM25, Pruning filters)

### Priority 3: DOM-to-Markdown Conversion (High Impact, High Effort)

**What:** Convert HTML structure to markdown instead of plain text.

**How:**
1. Walk visible DOM tree
2. Convert structural elements:
   - Headings → `#`, `##`, `###`
   - Bold → `**text**`
   - Links → `[text](url)`
   - Code blocks → ``` ``` ```
   - Lists → `- item`
3. Filter out noise (scripts, styles, nav)

**Benefit:** Better output for documentation, code, lists.

**Reference:** Jina Reader (MarkifyService), Crawl4AI (DefaultMarkdownGenerator)

### Priority 4: Link Density Scoring (Medium Impact, Low Effort)

**What:** Use link density as signal for navigation vs content.

**How:**
1. Calculate link density for each text block:
   ```
   linkDensity = textInLinks / totalText
   ```
2. Penalize high link density (navigation)
3. Boost low link density (content)

**Benefit:** Better extraction for link-heavy pages.

**Reference:** Readability.js (link density check), Trafilatura (link density scoring)

### Priority 5: Retry with Different Options (Medium Impact, Low Effort)

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

### Pattern 1: HTTP-First, Browser-Second
Almost every project tries HTTP first, falls back to browser. We should too.

### Pattern 2: Content Filters Before Readability
Projects that use filters (Crawl4AI) get better results than those that don't (us).

### Pattern 3: Markdown > Plain Text
All projects output markdown. We output plain text. Markdown preserves structure.

### Pattern 4: Citation Systems
Jina and Crawl4AI convert links to footnotes for cleaner LLM input. Worth considering.

### Pattern 5: Retry/Cascade
Projects with fallback chains (Trafilatura, Firecrawl) have higher success rates.

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)
1. Link density scoring (low effort, medium impact)
2. Retry with different Readability options (low effort, medium impact)

### Phase 2: HTTP-First (1-2 weeks)
1. Add HTTP fetching (reqwest or similar)
2. Content density detection
3. Hydration marker detection
4. HTTP → Browser fallback

### Phase 3: Content Filters (2-3 weeks)
1. PruningContentFilter implementation
2. BM25ContentFilter implementation
3. Integration with extraction pipeline

### Phase 4: DOM-to-Markdown (3-4 weeks)
1. DOM walker implementation
2. Structural element conversion
3. Noise filtering
4. Integration with extraction pipeline

---

## Key Questions Answered

### 1. Should we add HTTP-first fetching?
**Yes.** Almost every project does this. 10-50x faster for simple pages.

### 2. Should we add content filters?
**Yes.** Crawl4AI's filters improve accuracy significantly. Low effort, high impact.

### 3. Should we add DOM-to-markdown conversion?
**Yes.** We output plain text, everyone else outputs markdown. Higher quality output.

### 4. Should we add LLM extraction?
**Maybe.** Only if users need structured data. Domain hints are faster and cheaper.

### 5. Should we add multi-engine fallback?
**Maybe.** HTTP-first fetching covers most cases. Full multi-engine is complex.

---

## Conclusion

Our tool has unique strengths (domain hints, browserText fallback, tables, links, MCP) but is missing key features that other projects have (HTTP-first, content filters, markdown conversion).

The top 3 improvements to adopt:
1. **HTTP-first fetching** — Speed up simple pages
2. **Content filters** — Remove noise before Readability
3. **DOM-to-markdown** — Better structure than plain text

These would bring us in line with the best practices in the field while keeping our unique advantages.

---

*Last updated: 2026-07-26*
