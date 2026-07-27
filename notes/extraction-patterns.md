# Web Fetch — Extraction Patterns & Competitive Landscape

> Comparison of how different projects handle web content extraction, and where our approach fits.

---

## The Landscape (2026)

Six major tools dominate the web-fetch-for-LLMs space. Three architectures, each with a different answer to "who pays the rendering cost?"

| Tool | Architecture | Extraction | Self-hosted | Stars |
|------|-------------|-----------|-------------|-------|
| **Firecrawl** | Managed Playwright fleet | Rust transformer + Go/Turndown markdown | AGPL-3.0 (must open-source mods) | 136k |
| **Crawl4AI** | Self-hosted Playwright pool | Heuristic/BM25 + CSS/XPath + LLM | Apache-2.0, `pip install` | 69k |
| **Jina Reader** | Hosted Chrome + curl-impersonate | Readability + Turndown + optional ReaderLM-v2 | Docker compose | 11k |
| **Spider Cloud** | Rust HTTP + headless Chrome (3 modes) | Readability + CSS extraction map + AI | MIT (spider-rs) | — |
| **weblens-mcp** | Self-hosted Playwright | Readability + JSDOM (MCP server) | npm package | small |
| **NaviGator** (us) | Multi-backend browser (Cloakbrowser/Chromium/Lightpanda) | Readability + domain hints + candidate blocks + JSDOM tables | Docker compose | — |

---

## Architecture Comparison

### Who pays the rendering cost?

| Approach | Tools | Tradeoff |
|----------|-------|----------|
| **Managed browser fleet** | Firecrawl (cloud) | Zero ops, but $83+/mo at scale |
| **Self-hosted Playwright** | Crawl4AI, weblens-mcp | Full control, but you own browser memory/ops |
| **Hybrid (smart routing)** | Jina (Chrome vs curl), Spider (3 modes), **us** (Cloakbrowser/Chromium/Lightpanda) | Best of both — static pages don't need a browser |
| **URL prefix (zero-config)** | Jina Reader (`r.jina.ai/`) | Simplest possible API, no SDK needed |

**Our edge:** We're the only tool with 3 browser backends and automatic routing. Static pages go to Lightpanda (~50ms), search engines go to Cloakbrowser (anti-bot), JS-heavy pages go to Chromium. Nobody else does this.

### HTML → Markdown conversion

| Tool | Method | Fallback chain |
|------|--------|---------------|
| **Firecrawl** | Rust transformer → Go shared library → Turndown.js | 3-tier, each independent |
| **Crawl4AI** | Custom "Fit Markdown" with BM25 filtering | Heuristic noise removal before conversion |
| **Jina Reader** | Turndown (default) or ReaderLM-v2 (AI, 3x cost) | Auto-selects engine |
| **Spider** | Readability mode or direct CSS extraction | CSS map → structured JSON |
| **weblens-mcp** | Readability `textContent` (no markdown conversion) | Falls back to raw `innerText` |
| **us** | Readability HTML → `htmlToMarkdown()` (custom) | Sections (hints) → Readability → candidate blocks |

**Key insight:** We use Readability's **HTML output** (`article.content`) and convert it ourselves. This preserves structure (headings, lists, links). weblens-mcp uses `textContent` which loses everything. Firecrawl avoids Readability entirely with their own Rust transformer.

### Content extraction strategies

| Strategy | Who uses it | How it works |
|----------|-------------|-------------|
| **Readability scoring** | us, Jina, weblens-mcp | Score paragraphs, find best container, extract |
| **CSS/XPath selectors** | us (hints), Firecrawl (`onlyMainContent`), Spider (`css_extraction_map`) | Target specific elements by selector |
| **BM25 heuristic filtering** | Crawl4AI | Score content blocks against page vocabulary |
| **Rust native transformer** | Firecrawl | Compiled HTML cleaning, fastest approach |
| **LLM-based extraction** | Firecrawl (schema), Crawl4AI (optional), Jina (ReaderLM-v2) | Feed markdown to LLM, extract structured data |
| **Domain hints (persistent registry)** | **Only us** | JSON config mapping domains to selectors, waits, flags |

**Key insight:** Nobody else has a persistent domain-hint registry. Firecrawl's `onlyMainContent` is a hardcoded exclude list. Crawl4AI lets you pass selectors per-crawl. Jina lets you pass selectors per-request. We're the only ones with a persistent, deployable JSON config that encodes site-specific knowledge.

---

## Table Handling — The Biggest Gap

This is where we're strongest and where others are weakest.

| Tool | Table approach | Quality |
|------|---------------|---------|
| **us** | JSDOM `extractTablesFromDocument()` → pipe-separated markdown tables | Best — always runs, handles empty/short cells |
| **Firecrawl** | Go `plugin.Table` or `joplin-turndown-plugin-gfm` | Good — GFM tables in markdown output |
| **Crawl4AI** | Markdown tables via Playwright rendering | Good for rendered tables |
| **Jina Reader** | ReaderLM-v2 semantic table understanding | Good with AI, basic without |
| **weblens-mcp** | None — Readability `textContent` flattens tables | Poor — tables become text soup |
| **Spider** | CSS selectors or readability mode | Depends on mode |

**Key insight:** Most tools just run Turndown with GFM table support and hope for the best. We have a dedicated JSDOM-based table extractor that:
- Detects `<table>` elements by structure (th, thead, tfoot, caption)
- Filters out empty/layout tables
- Limits rows via `maxTableRows`
- Appends as clean `### Table N` sections
- Handles financial data (NSE option chains with 255 links, no price noise in link output)

---

## Link Extraction — Approaches

| Tool | Link strategy | Details |
|------|-------------|---------|
| **us** | Always extracted, stored by ref_id, accessible via `web_page_links()` | Links never shown in output — LLM explores them on demand |
| **Firecrawl** | Preserved in markdown, `/map` endpoint for site-wide discovery | Links inline in output |
| **Crawl4AI** | Full URL discovery via deep crawl (BFS/DFS) | Links as `[^N]` citations |
| **Jina Reader** | Preserved in markdown, optional "Buttons & Links" section | Links inline |
| **weblens-mcp** | Navigation links only (nav/header/sidebar), content links stripped | Missing article links entirely |
| **Spider** | Separate `spider_links` tool | Links in metadata |

**Our edge:** The ref_id system is unique. Links are always extracted but never pollute the output. The LLM can explore any link via `web_page_links(ref_id)` → `web_fetch(ref_id: link_ref_id)`. This is cleaner than inline markdown links (which bloat token count) and cleaner than weblens-mcp (which strips content links entirely).

---

## Readability.js — Deep Dive

### How it works (the algorithm)

1. **Preprocess** — remove scripts, styles, hidden elements, normalize DOM
2. **Score candidates** — `_grabArticle()` scores `<p>`, `<td>`, headings, `<div>` nodes
3. **Propagation** — scores propagate up the tree (parent gets full score, grandparent gets fraction)
4. **Pick winner** — highest-scoring container becomes "the article"
5. **Sibling merging** — look through siblings for additional content (threshold: `max(10, score * 0.2)`)
6. **Clean** — remove forms, embeds, fix images
7. **Retry** — if result too short, retry with less aggressive cleanup

### Scoring formula (simplified)

```
textScore = words + commas*2 + length_bonus(capped at 3)
classIdBonus = +30 for "article", "content", "main", "text"
classIdPenalty = -20 for "sidebar", "footer", "menu", "comment"
linkDensityPenalty = text_in_links / total_text (high = navigation, not content)
```

### Table detection in Readability

`_markDataTables()` distinguishes data tables from layout tables:
1. `role="presentation"` → layout (skip)
2. Has `<th>`, `<thead>`, `<caption>`, `<summary>` → data (keep)
3. Nested `<table>` → layout (skip)
4. ≥10 rows OR >4 cols → data (keep)
5. Protected from `_cleanConditionally` removal

### Known limitations

| Limitation | Impact on us |
|-----------|-------------|
| **SPA blindness** | We solve this with browser rendering + `waitForSelector` |
| **Single-subtree assumption** | Multi-part articles lose content — our hints solve this |
| **Table vs article scoring** | Tables can score higher than prose — we extract tables separately |
| **Layout table confusion** | Readability tries to detect but isn't perfect — our hints override |
| **Short cell values lost** | `<td>7</td>` scores 0 (length < 25) — we preserve via JSDOM extraction |
| **Non-article pages** | Homepages, feeds, dashboards fail — our hints + candidate blocks handle this |

### Benchmark data

| Metric | Readability.js | Trafilatura (Python) |
|--------|---------------|---------------------|
| Median F1 | **0.94** | 0.91 |
| Pages within 5% of ground truth | **88%** | 78% |
| Median runtime/page | **18ms** | 85ms |
| Bundle size | ~90KB | ~120MB |

**Readability is still the best JS-based extractor.** The only Python alternative that beats it on F1 is Trafilatura (0.958), but it's 5x slower and 1000x larger.

---

## Turndown — HTML to Markdown

| Metric | Turndown + GFM | Pandoc (gfm) |
|--------|---------------|-------------|
| Median F1 | 0.96 | 0.97 |
| Runtime/page | **9ms** | 78ms |
| Bundle | ~45KB | ~140MB |
| Browser-compatible | ✅ | ❌ |

Turndown is 9x faster than Pandoc with nearly identical quality. It's the standard for JS pipelines.

**Our custom `htmlToMarkdown()`** is a lightweight alternative that handles the specific patterns we care about (headings, bold, lists, links, code blocks). It's not as full-featured as Turndown but avoids the dependency.

---

## Alternatives to Readability

| Tool | F1 | Speed | Tables | Language | Notes |
|------|-----|-------|--------|----------|-------|
| **Readability.js** | 0.94 | 18ms | Via converter | English-tuned | Best JS option |
| **Trafilatura** | 0.958 | 85ms | Limited | All major | Best Python option |
| **Newspaper4k** | 0.949 | Slower | No | 80+ languages | NLP-based |
| **readdown** | N/A | ~40% faster than Readability+Turndown | Yes (layout tables unwrapped) | JS | New, combined extractor+converter |
| **ReaderLM-v2** | ROUGE-L 0.86 | Slow (needs GPU) | Yes | 29 languages | AI model (1.5B params) |

**readdown** is interesting — it's a single dependency that combines extraction + conversion, claims better heading detection and layout table handling. Worth investigating.

---

## What We Do Better Than Everyone

1. **Domain hints** — persistent, deployable site-specific knowledge. Nobody else has this.
2. **Multi-backend routing** — Cloakbrowser for anti-bot, Chromium for JS, Lightpanda for speed. Nobody else does this.
3. **Table extraction** — dedicated JSDOM parser, not just Turndown GFM. Handles empty tables, short cells, row limits.
4. **Link ref_id system** — links extracted but not shown. LLM explores on demand. Zero token waste.
5. **Triple fallback** — hints → Readability → candidate blocks. Handles any page type.
6. **SSE keepalive** — 30+ min session stability. Other MCP servers die at ~5 min.

## Where Others Beat Us

1. **Full-site crawling** — Firecrawl's `/crawl` and `/map` endpoints. We only fetch single pages.
2. **Schema-based extraction** — Firecrawl's LLM-powered structured extraction. We don't have this.
3. **Adaptive crawling** — Crawl4AI builds confidence scores on selectors over time. We're static.
4. **Managed anti-bot** — Firecrawl has proxy rotation + fingerprinting. We rely on Cloakbrowser.
5. **Speed** — Spider claims ~50ms for HTTP mode. Our browser-based approach is inherently slower.
6. **Markdown fidelity** — Turndown+GFM (used by Firecrawl/Jina) has F1 0.96. Our custom converter is simpler.
7. **Community/docs** — Crawl4AI (69k stars) and Firecrawl (136k stars) have massive communities. We're small.

---

## Potential Improvements to Consider

### Short-term (use what we have better)
- **Turndown integration** — replace custom `htmlToMarkdown()` with Turndown+GFM for higher fidelity
- **readdown evaluation** — single dependency, faster, better heading/table handling
- **More domain hints** — expand coverage (we have ~15 entries, Firecrawl's exclude list has ~40 selectors)

### Medium-term (architectural)
- **Full-site crawling** — BFS/DFS with crash recovery (Crawl4AI pattern)
- **CSS extraction maps** — Spider's `css_extraction_map` pattern for structured JSON output
- **Adaptive hints** — Crawl4AI's confidence scoring on selectors

### Long-term (new capabilities)
- **Schema-based extraction** — LLM-powered structured extraction (Firecrawl pattern)
- **URL mapping** — discover all pages on a domain (Firecrawl `/map`)
- **Proxy rotation** — managed anti-bot (Firecrawl pattern)

---

## Sources

- https://github.com/mendableai/firecrawl (136k stars)
- https://github.com/unclecode/crawl4ai (69k stars)
- https://github.com/jina-ai/reader (11k stars)
- https://github.com/Bariskau/weblens-mcp
- https://github.com/spider-cloud/spider
- https://github.com/mozilla/readability
- https://github.com/mixmark-io/turndown
- https://github.com/aleclarson/readdown
- https://webcrawlerapi.com/blog/mozilla-readability-algorithm-readabilityjs
- https://mdisbetter.com/blog/web-content-extraction-readability-vs-trafilatura
- https://bulkmd.app/blog/readability-vs-trafilatura-extractors
- https://bulkmd.app/blog/turndown-vs-pandoc-vs-marked-serializers
- https://toolhalla.ai/blog/firecrawl-vs-crawl4ai-vs-jina-reader
- https://use-apify.com/blog/firecrawl-vs-jina-reader
- https://spider.cloud/blog/best-web-scraping-apis-for-ai
