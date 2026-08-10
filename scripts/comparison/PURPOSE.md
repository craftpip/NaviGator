# Comparison Research

> Purpose: Compare our web fetch extraction approach against similar open-source projects to identify actionable improvements.

## Why This Exists

Our `web_fetch` tool extracts clean text from any webpage using a real browser (Chromium), Readability for article extraction, and domain hints for specific sites. But we're not the only ones solving this problem. Other projects have different approaches, fallback chains, and output formats that might teach us something.

The goal is not to copy anyone. The goal is to understand what works, what doesn't, and what we can adopt to make our extraction better — especially for non-article pages where Readability struggles.

## What We're Comparing

We're analyzing these projects across7 dimensions:

1. **Architecture** — Language, framework, browser usage, deployment model
2. **Extraction Pipeline** — Fallback chain, strategy selection, content detection
3. **Content Algorithms** — How they find "the good stuff" (Readability vs heuristics vs ML vs LLM)
4. **Output Format** — Markdown conversion, table handling, link handling, metadata
5. **Special Features** — Caching, bot bypass, screenshots, structured extraction
6. **Fallback Strategy** — What happens when the primary extraction fails
7. **Lessons for Us** — Specific improvements we can adopt

## Projects Analyzed

### Tier 1 — Major Projects (detailed analysis)

| Project | Language | Stars | Primary Approach |
|---------|----------|-------|------------------|
| [Firecrawl](./firecrawl/FIRECRAWL.md) | TypeScript | 50K+ | Multi-engine fallback + LLM extraction |
| [Crawl4AI](./crawl4ai/CRAWL4AI.md) | Python | 74K+ | Async browser pool + content filters |
| [Jina Reader](./jina-reader/JINA-READER.md) | TypeScript | 11K+ | Readability + custom Turndown + VLM |
| [Trafilatura](./trafilatura/TRAFILATURA.md) | Python | 6K+ | Heuristic cascade + jusText fallback |
| [Readability.js](./readability/READABILITY.md) | JavaScript | 8K+ | Mozilla's scoring algorithm |
| [Essence](./essence/ESSENCE.md) | Rust | 2K+ | HTTP-first + auto Chromium fallback |

### Tier 2 — Additional Projects (overview analysis)

| Project | Language | Stars | Primary Approach |
|---------|----------|-------|------------------|
| [Scrapling](./scrapling/SCRAPLING.md) | Python | 3K+ | Stealthy HTTP + adaptive decoding |
| [Scrapy](./scrapy/SCRAPY.md) | Python | 15K+ | Framework + middleware pipeline |
| [Crawlee](./crawlee/CRAWLEE.md) | TypeScript | 15K+ | Framework + browser pool |
| [MinerU](./mineru-html/MINERU-HTML.md) | Python | 10K+ | Document extraction + OCR |
| [Pulldown](./pulldown/PULLDOWN.md) | Python | 1K+ | HTTP-first + markdown conversion |
| [Anakin](./anakin/ANAKIN.md) | Python | 500+ | AI-powered extraction |
| [Markgrab](./markgrab/MARKGRAB.md) | Python | 200+ | Screenshot-to-markdown |
| [WebToMD](./webtomd/WEBTOMD.md) | Python | 100+ | Browser + markdown conversion |

## How to Use This Research

1. **Read the SUMMARY.md** for cross-project analysis and key takeaways
2. **Read individual project files** for detailed architecture and pipeline analysis
3. **Look at "Lessons for Us" sections** in each file for specific improvements
4. **Prioritize improvements** based on effort vs impact

## Key Questions to Answer

After reading all analyses, we should be able to answer:

1. Should we adopt content filters (like Crawl4AI's BM25/Pruning) instead of relying on Readability?
2. ~~Should we implement a DOM-to-markdown converter (like Jina's MarkifyService) instead of plain text?~~ ✅ **Done** — TurndownService + GFM, integrated end-to-end
3. Should we add Readability retry with different options for short extractions?
4. Should we consider ML-based extraction (like Trafilatura's heuristic cascade) for better accuracy?

## Our Current Approach

For context, here's how our `web_fetch` works:

```
URL → Browser (Chromium) → page.goto()
  → Wait for content (stabilization)
  → Capture HTML + browserText
  → Domain hint lookup (first-match wins)
    → IF hint.flags.authWall/visualOnly → early return with error
    → IF hint.sections → section-based extraction via htmlToMarkdown (early return)
    → ELSE → Readability extraction
      → IF browserText has 1.5x+ more content → full DOM htmlToMarkdown instead
    → ELSE → candidate block scoring (link density + content heuristics)
  → Always extract tables → append as ### Table N
  → Always extract links → store for web_page_links tool
  → Convert all HTML to Markdown via TurndownService + GFM
  → Append truncation indicator if output exceeds maxChars
  → Cache result (5 min TTL, bypassable via bypassCache param)
```

**Strengths:**
- Real browser renders JavaScript (SPAs work)
- Domain hints give precise extraction for known sites
- **Markdown output** via TurndownService + GFM plugin (preserves headings, bold, code, lists, links)
- BrowserText fallback catches cases where Readability misses content
- Tables always extracted in clean pipe-separated format
- Link density scoring in candidate block selection
- Tool caching with per-tool TTL and bypass
- Links always extracted with ref_id system for `web_page_links` tool
- Domain hint structured fields (`text`, `list`, `markdown` formats)
- Auth wall / visual-only page detection

**Weaknesses:**
- No content filtering (BM25, pruning) for query-specific extraction
- No Readability retry with different options when primary extraction fails
- No LLM extraction for structured data

---

*Last updated: 2026-07-27*
