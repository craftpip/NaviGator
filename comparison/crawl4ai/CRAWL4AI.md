# Crawl4AI

> Crawl4AI is an asynchronous web crawler designed for LLM-friendly data extraction. It generates clean markdown with configurable content filters and supports multiple extraction strategies.

**GitHub:** https://github.com/unclecode/crawl4ai
**Language:** Python
**Stars:** 74K+
**License:** Apache-2.0

---

## Architecture

### Language & Framework
- **Language:** Python (async/await)
- **Framework:** AsyncWebCrawler with strategy pattern
- **Browser:** Playwright (Chromium) via AsyncPlaywrightCrawlerStrategy
- **Deployment:** Python package, Docker API, CLI

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│              AsyncWebCrawler (Main Entry)                │
│  arun() → arun_many() → Strategy Selection              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Browser Management                          │
│  AsyncPlaywrightCrawlerStrategy → BrowserManager         │
│  Session management, page pooling, anti-detection        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Content Processing Pipeline                 │
│  1. Scraping (LXML) → 2. Filtering → 3. Markdown → 4. Extraction │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              CrawlResult (Output)                        │
│  html, cleaned_html, markdown, media, links, metadata   │
└─────────────────────────────────────────────────────────┘
```

---

## Extraction Pipeline

### Pipeline Flow

1. **Browser Launch** — AsyncPlaywrightCrawlerStrategy manages Chromium
2. **Page Navigation** — Navigate to URL with configurable timeouts
3. **Content Stabilization** — Wait for JS rendering, network idle
4. **Scraping** — LXMLWebScrapingStrategy extracts structure
5. **Filtering** — Optional content filters (BM25, Pruning, LLM)
6. **Markdown Generation** — DefaultMarkdownGenerator converts HTML
7. **Extraction** — Optional strategies (LLM, CSS, Cosine)

### Configuration

Two main config objects:

**BrowserConfig** — Browser behavior:
- `headless` — Run headless or full UI
- `user_agent` — Custom user agent
- `javascript_enabled` — Enable/disable JS
- `browser_type` — Chromium, Firefox, WebKit

**CrawlerRunConfig** — Crawl behavior:
- `cache_mode` — BYPASS, ENABLED, READ_ONLY, WRITE_ONLY
- `extraction_strategy` — LLM, CSS, XPath, Cosine
- `markdown_generator` — DefaultMarkdownGenerator
- `word_count_threshold` — Minimum word count
- `page_timeout` — Navigation timeout

---

## Content Algorithms

### Scraping Strategy

`LXMLWebScrapingStrategy` uses fast LXML parsing:
- Extracts media items (images, videos, audio)
- Extracts links (internal, external)
- Extracts metadata (title, description, OG tags)
- Cleans HTML (removes scripts, styles, nav, footer)

### Content Filters

Three filter types for noise removal:

**PruningContentFilter:**
- Heuristic-based noise removal
- Analyzes text density, link density, HTML structure
- Removes known patterns (nav, footer, ads)
- Threshold-based (0.0-1.0)

**BM25ContentFilter:**
- Query-specific content ranking
- Uses BM25 scoring algorithm
- Keeps content blocks relevant to user query
- Stemming support

**LLMContentFilter:**
- Uses LLM to identify relevant content
- Preserves meaning and structure
- Best quality, highest cost

### Markdown Generation

`DefaultMarkdownGenerator` converts HTML to markdown:
- Preserves headings, code blocks, bullet points
- Removes extraneous tags (scripts, styles)
- Citation system: links → `[text][1]` + bibliography
- Multiple output variants:
  - `raw_markdown` — Full conversion
  - `fit_markdown` — After content filtering
  - `markdown_with_citations` — Links as footnotes
  - `references_markdown` — Bibliography section

### Extraction Strategies

**LLMExtractionStrategy:**
- Uses LLMs to map text to Pydantic schema
- Supports OpenAI, Ollama, any provider
- Smart chunking for context window limits
- Schema-based structured output

**CosineStrategy:**
- Uses sentence-transformers (`all-MiniLM-L6-v2`)
- Clusters similar text blocks
- Extracts meaningful segments by semantic relevance
- No LLM required

**JsonCssExtractionStrategy:**
- Template-based CSS selector extraction
- Repeated patterns → JSON array
- LLM can auto-generate schema from HTML

---

## Output Format

### CrawlResult Object

```python
{
    "html": "Original HTML",
    "cleaned_html": "Cleaned HTML after scraping",
    "markdown": {
        "raw_markdown": "Full markdown",
        "fit_markdown": "Filtered markdown",
        "markdown_with_citations": "With footnotes",
        "references_markdown": "Bibliography"
    },
    "media": {
        "images": [...],
        "videos": [...],
        "audios": [...]
    },
    "links": {
        "internal": [...],
        "external": [...]
    },
    "metadata": {
        "title": "...",
        "description": "...",
        "language": "..."
    },
    "extracted_content": "JSON from extraction strategy"
}
```

### Markdown Features

- Headings (`#`, `##`, `###`)
- Code blocks (with language detection)
- Bullet points, numbered lists
- Links (inline or referenced)
- Images
- Blockquotes
- Tables (basic)

---

## Special Features

### Content Filtering

**Query-Specific Extraction:**
```python
# Keep only content about "machine learning"
filter = BM25ContentFilter(user_query="machine learning", bm25_threshold=1.2)
```

**General Noise Removal:**
```python
# Remove boilerplate automatically
filter = PruningContentFilter(threshold=0.4, threshold_type="fixed")
```

**Two-Pass Filtering:**
```python
# First: remove global clutter
pruned = PruningContentFilter().filter(html)
# Second: keep query-relevant content
filtered = BM25ContentFilter(query="topic").filter(pruned)
```

### Citation System

Links converted to footnotes for cleaner LLM input:
```markdown
According to recent research[1], the field has grown significantly.

## References
[1]: https://example.com/research
```

### Session Management

Reuse browser sessions for multi-page crawling:
```python
# Click "Next Page" button
js_code = "document.querySelector('.next').click()"
config = CrawlerRunConfig(js_code=js_code, session_id="session1")
```

### Parallel Crawling

`arun_many()` with `MemoryAdaptiveDispatcher`:
- Auto-adjusts concurrency based on system resources
- Streaming mode (process as available)
- Batch mode (wait for all)

---

## Fallback Strategy

### No Built-in Fallback Chain

Crawl4AI doesn't have automatic engine fallback like Firecrawl. Instead:
- Uses Playwright browser for all rendering
- Content filters handle noise removal
- Extraction strategies handle data extraction

### Manual Fallback

Users can implement fallback by trying different configs:
```python
# Try with filtering first
result = await crawler.arun(url, config=config_with_filter)
if not result.markdown.fit_markdown:
    # Try without filtering
    result = await crawler.arun(url, config=config_without_filter)
```

---

## What We Can Learn

### 1. Content Filters (High Impact)

**What they do:** BM25 and Pruning filters remove noise before markdown conversion.

**What we could adopt:**
- Add BM25ContentFilter for query-specific extraction
- Add PruningContentFilter for general noise removal
- Run filters before Readability to improve accuracy

### 2. Citation System (Medium Impact)

**What they do:** Convert links to footnotes for cleaner LLM input.

**What we could adopt:**
- Add optional citation mode to `web_fetch`
- Links as `[text][1]` instead of inline `[text](url)`
- Bibliography section at end

### 3. Multiple Markdown Variants (Low Impact)

**What they do:** Return raw, fit, and citation markdown variants.

**What we could adopt:**
- Add `format` parameter: `plain`, `markdown`, `citations`
- Let users choose output style

### 4. CSS Extraction Strategy (Medium Impact)

**What they do:** Use CSS selectors to extract repeated patterns into JSON.

**What we could adopt:**
- Add optional `schema` parameter to `web_fetch`
- Extract structured data matching user-defined schema
- Similar to Firecrawl's LLM extraction but without LLM

### 5. Session Management (Low Impact)

**What they do:** Reuse browser sessions for multi-page crawling.

**What we could adopt:**
- Our `BrowserManager` already has page pooling
- Could add explicit session management for multi-page tasks

---

## Lessons for Us

### What Crawl4AI Does Better

1. **Content filters** — BM25 and Pruning remove noise before extraction. We rely on Readability which can be too aggressive.
2. **Citation system** — Links as footnotes give cleaner LLM input. Our inline links add noise.
3. **Multiple output variants** — Raw, fit, citation markdown. We have one format (Turndown + GFM).
4. **Extraction strategies** — LLM, CSS, Cosine options. We only have Readability.

### What We Do Better

1. **BrowserText fallback** — We compare Readability with browser text. Crawl4AI doesn't.
2. **Domain hints** — We have per-site configs. Crawl4AI doesn't.
3. **Tables** — We always extract tables in clean format. Crawl4AI doesn't focus on tables.
4. **Links** — We always extract links with ref_ids. Crawl4AI doesn't have this.

### Adoption Priority

| Improvement | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| PruningContentFilter | Medium | High | 1 |
| BM25ContentFilter | Medium | High | 2 |
| Citation system | Low | Medium | 3 |
| CSS extraction | Medium | Medium | 4 |
| Multiple output variants | Low | Low | 5 |

---

*Last updated: 2026-07-27*
