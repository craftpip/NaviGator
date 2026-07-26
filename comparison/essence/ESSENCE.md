# Essence

> Essence is a fast, open-source web retrieval engine built in Rust. It fetches pages via lightweight HTTP with automatic fallback to headless Chromium for JavaScript-heavy sites, producing clean LLM-ready Markdown.

**GitHub:** https://github.com/ruchit-p/essence
**Language:** Rust
**Stars:** 2K+
**License:** MIT

---

## Architecture

### Language & Framework
- **Language:** Rust
- **Framework:** Axum (HTTP server) + Tokio (async runtime)
- **Browser:** Chromium via CDP (chrome-devtools-protocol)
- **Deployment:** Single binary, zero dependencies

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│              REST API + MCP Server                       │
│  POST /api/v1/scrape, /crawl, /map, /search             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Engine Waterfall                             │
│  HTTP Engine (fast) → Browser Engine (fallback)          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Format Layer                                │
│  Markdown → Metadata → Links → Images                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Infrastructure                              │
│  Cache (moka) | Rate Limit (governor) | Robots.txt      │
└─────────────────────────────────────────────────────────┘
```

---

## Extraction Pipeline

### Pipeline Flow

```
Request → HTTP Engine (fast, lightweight)
              ↓ content density too low?
          Browser Engine (Chromium CDP)
              ↓
          Markdown Output (clean, LLM-ready)
```

### Two-Tier Rendering

**HTTP Engine (default):**
- Lightweight fetch via `reqwest`
- Fast (~100ms)
- Used when HTML has sufficient content density
- No JavaScript execution

**Browser Engine (fallback):**
- Full Chromium automation via CDP
- Slower (~2-5s)
- Activated for SPAs, anti-bot pages
- Full JavaScript rendering

### Auto-Detection Triggers

Browser fallback triggered when:
1. **Content density too low** — Too little text in HTML
2. **Hydration markers** — `__NEXT_DATA__`, `__NUXT__`, etc.
3. **Meta-refresh redirects** — Page redirects via meta
4. **Anti-fetch response headers** — Headers requiring JS

---

## Content Algorithms

### HTTP Engine Extraction

Uses `scraper` crate (Rust's equivalent of cheerio):
- Parse HTML with CSS selectors
- Extract main content area
- Remove noise (nav, footer, ads)
- Convert to markdown

### Browser Engine Extraction

Full Chromium rendering:
- Navigate to URL
- Wait for content stabilization
- Extract rendered HTML
- Apply same extraction as HTTP engine

### Markdown Conversion

Custom Rust implementation:
- Preserve headings (`#`, `##`, `###`)
- Preserve code blocks (with language)
- Preserve lists (bullet, numbered)
- Preserve links (inline)
- Preserve images
- Remove noise (scripts, styles, nav)

### Main Content Detection

`onlyMainContent: true` (default):
- Detect main content area
- Remove sidebars, headers, footers
- Focus on article body

---

## Output Format

### Markdown Output

```markdown
# Page Title

Main content with proper formatting.

## Headings
- Lists
- **Bold**
- *Italic*

## Code
```python
def hello():
    print("world")
```

## Links
[Link text](https://example.com)

## Images
![Alt text](https://example.com/image.jpg)
```

### Metadata

```json
{
    "title": "Page Title",
    "description": "Page description",
    "language": "en",
    "url": "https://example.com",
    "statusCode": 200,
    "wordCount": 1234,
    "readingTime": 5
}
```

### Links & Images

```json
{
    "links": [
        "https://example.com/about",
        "https://example.com/contact"
    ],
    "images": [
        "https://example.com/hero.jpg"
    ]
}
```

---

## Special Features

### Engine Waterfall

Automatic HTTP → Browser fallback:
```rust
// Configuration
ENGINE_WATERFALL_ENABLED = true
ENGINE_WATERFALL_DELAY_MS = 5000  // Delay before browser fallback
```

### Content Caching

In-memory caching via `moka`:
- Cached by URL
- TTL-based expiration
- Fast repeat requests

### Robots.txt Compliance

Automatic robots.txt parsing:
- Respect `Crawl-delay`
- Respect `Disallow` paths
- Per-domain rate limiting

### Rate Limiting

Per-domain rate limiting via `governor`:
- `CRAWL_RATE_LIMIT_PER_SEC = 2`
- Prevents abuse
- Configurable per domain

### MCP Server

Built-in Model Context Protocol server:
- `scrape` — Single page extraction
- `crawl` — Multi-page traversal
- `map` — Site structure discovery
- `search` — Web search + scrape

### Structured Extraction

CSS selector-based extraction:
```json
{
    "url": "https://example.com",
    "formats": ["markdown", "links", "metadata"]
}
```

---

## Fallback Strategy

### HTTP → Browser Waterfall

```
Request → HTTP Engine
              │
              ├── Success (content density OK) → Return
              │
              └── Failure (content too short, hydration markers)
                          │
                          ▼
                    Browser Engine
                          │
                          ├── Success → Return
                          │
                          └── Failure → Return error
```

### Auto-Detection

```rust
fn should_use_browser(html: &str, url: &str) -> bool {
    // Content density check
    if text_density(html) < THRESHOLD {
        return true;
    }
    
    // Hydration markers
    if html.contains("__NEXT_DATA__") ||
       html.contains("__NUXT__") ||
       html.contains("react-root") {
        return true;
    }
    
    // Meta-refresh
    if has_meta_refresh(html) {
        return true;
    }
    
    false
}
```

### Retry Logic

```rust
RETRY_MAX_ATTEMPTS = 3
RETRY_INITIAL_DELAY_MS = 500
RETRY_MAX_DELAY_MS = 30000
```

---

## What We Can Learn

### 1. HTTP-First Fetching (High Impact)

**What they do:** Try HTTP first, fall back to browser if needed.

**What we could adopt:**
- Add HTTP-first fetching for simple pages
- Fall back to Chromium if content density low
- Speed: ~100ms vs ~2-5s
- This is Priority 1 in our roadmap

### 2. Content Density Detection (Medium Impact)

**What they do:** Analyze HTML to decide if browser is needed.

**What we could adopt:**
- Measure text-to-HTML ratio
- Check for hydration markers
- Decide if browser rendering is necessary
- Avoid browser overhead for simple pages

### 3. Hydration Marker Detection (Low Impact)

**What they do:** Check for `__NEXT_DATA__`, `__NUXT__`, etc.

**What we could adopt:**
- Detect SPA frameworks
- Trigger browser rendering for SPAs
- Skip browser for static pages

### 4. In-Memory Caching (Medium Impact)

**What they do:** Cache results in memory via `moka`.

**What we could adopt:**
- Add URL-based caching
- TTL-based expiration
- Our `pageLinksByPageRef` is similar but process-local

### 5. Robots.txt Compliance (Low Impact)

**What they do:** Automatically parse and respect robots.txt.

**What we could adopt:**
- Add robots.txt checking
- Respect Crawl-delay
- More polite crawling

---

## Lessons for Us

### What Essence Does Better

1. **HTTP-first fetching** — Fast for simple pages. We always use browser.
2. **Content density detection** — Decide if browser needed. We always render.
3. **Hydration markers** — Detect SPAs automatically. We don't check.
4. **In-memory caching** — Fast repeat requests. We don't cache.
5. **Robots.txt** — Polite crawling. We don't check.

### What We Do Better

1. **BrowserText fallback** — We compare Readability with browser text. Essence doesn't.
2. **Domain hints** — We have per-site configs. Essence doesn't.
3. **Tables** — We always extract tables in clean format. Essence doesn't focus on tables.
4. **Links** — We always extract links with ref_ids. Essence doesn't have this.
5. **Readability** — We use Mozilla's algorithm. Essence uses basic extraction.

### Adoption Priority

| Improvement | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| HTTP-first fetching | Medium | High | 1 |
| Content density detection | Low | High | 2 |
| In-memory caching | Low | Medium | 3 |
| Hydration marker detection | Low | Low | 4 |
| Robots.txt compliance | Low | Low | 5 |

---

*Last updated: 2026-07-26*
