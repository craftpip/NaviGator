# Jina Reader

> Jina Reader is an API-first application that converts URLs to LLM-friendly markdown. It uses headless Chrome with Readability + custom Turndown conversion and supports VLM-based image descriptions.

**GitHub:** https://github.com/jina-ai/reader
**Language:** TypeScript/Node.js
**Stars:** 11K+
**License:** Apache-2.0

---

## Architecture

### Language & Framework
- **Language:** TypeScript (Node.js)
- **Framework:** KoaServer (civkit) with Dependency Injection
- **Browser:** Puppeteer (headless Chrome)
- **Deployment:** Docker on GCP Cloud Run, stateless mode

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│              Stand-Alone Servers                         │
│  crawl.ts (r.jina.ai) | search.ts (s.jina.ai) | serp.ts │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              CrawlerHost                                 │
│  Engine Selection → Page Fetch → Snapshot → Format       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              SnapshotFormatter                           │
│  JSDOM Narrowing → Readability → MarkifyService → Output │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              ThreadedServiceRegistry                     │
│  Worker thread pool for CPU-intensive operations         │
└─────────────────────────────────────────────────────────┘
```

---

## Extraction Pipeline

### Pipeline Flow

1. **URL Resolution** — Accept URL with options
2. **Engine Selection** — Browser, Curl, or Auto (combined)
3. **Page Fetch** — Render page, capture snapshot
4. **DOM Narrowing** — JSDOMControl filters content
5. **Readability** — Extract main article content
6. **HTML to Markdown** — MarkifyService converts
7. **Formatting** — Metadata, images, links, chunks

### Engine Options

**Browser Engine (Puppeteer):**
- Full JavaScript rendering
- Handles SPAs, dynamic content
- Shadow DOM expansion
- Iframe injection

**Curl Engine (curl-impersonate):**
- Lightweight HTTP fetch
- No JavaScript execution
- Simulated cookie layer
- Faster but limited

**Auto Engine (default):**
- Combined use of both
- Browser for JS-heavy pages
- Curl for simple pages

### DOM Narrowing

`JSDomControl` uses `linkedom` (lightweight JSDOM alternative):

1. **Selector Filtering**
   - `targetSelector` — Keep only specific elements
   - `removeSelector` — Strip unwanted elements (ads, nav)

2. **Shadow DOM Expansion**
   - `withShadowDom` — Expand shadow roots
   - Capture full DOM tree

3. **Iframe Injection**
   - `withIframe` — Inline iframe content
   - Or represent as quoted text blocks

4. **Readability**
   - `@mozilla/readability` — Extract main content
   - Strip sidebars, footers, nav

---

## Content Algorithms

### Readability Integration

Uses Mozilla's Readability (same as Firefox Reader View):
- Scores content blocks
- Finds main article container
- Removes noise (nav, footer, ads)
- Returns clean HTML

### MarkifyService (HTML to Markdown)

Custom implementation inspired by Turndown:
- Rule-based processing for each HTML tag
- `fnMap` maps tags to processing functions
- Custom rules for headings, links, images, code

**Features:**
- Heading styles: ATX (`#`) vs Setext (`===`)
- Link styles: Inline, referenced, or discarded
- Image tracking with URLs
- Code block language detection

### VLM Integration

**AltTextService:**
- Uses `jina-vlm` small vision-language model
- Generates image descriptions
- Crucial for LLM context when processing visual content

**readerlm-v2:**
- Small language model for HTML-to-markdown
- 3x improvement over v1
- Supports structured data extraction

---

## Output Format

### Markdown Output

Clean, LLM-friendly markdown:
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
    "url": "https://example.com",
    "publishedTime": "2024-01-01",
    "lang": "en",
    "dir": "ltr"
}
```

### Chunking (RAG Support)

For long pages, structured chunking:

| Strategy | Description |
|----------|-------------|
| Header-based | Split by `\n(?=#{1,6} )` |
| Hierarchical | Tree structure with parent/child |
| Representation | Join with `\u001d` delimiter |

---

## Special Features

### Caching

**Stateless Mode (open source):**
- No caching
- Fetch fresh every time

**Bucket-Cached Mode:**
- S3-like object storage
- TTL-based expiration
- Return cached if fresh

**SaaS Mode:**
- MongoDB + S3
- Indexed caching
- Rate limiting

### Proxy Support

**Built-in Proxy:**
- Rotates residential/datacenter IPs
- Handles common anti-bot challenges
- Country-specific routing

**Custom Proxy:**
- `x-proxy-url` header
- Supports http, https, socks4, socks5
- Auth via URL

### Search Integration

`s.jina.ai` endpoint:
- Search web for query
- Fetch top 5 results
- Apply `r.jina.ai` to each
- Return content + URLs

### Custom JavaScript

`x-executing-js` header:
- Execute custom JS before extraction
- Modify page content
- Interact with elements

---

## Fallback Strategy

### Auto Engine Fallback

`auto` engine combines Browser and Curl:
1. Try Curl first (faster)
2. If content insufficient, try Browser
3. Return best result

### No Multi-Engine Fallback

Unlike Firecrawl, Jina Reader doesn't have waterfall pattern:
- Single engine per request
- User chooses engine or uses auto
- No automatic retry with different engines

---

## What We Can Learn

### 1. MarkifyService (High Impact) ✅ Done

**What they do:** Custom HTML-to-markdown converter with rule-based processing.

**What we adopted:**
- Built DOM-to-markdown converter via TurndownService + GFM (`src/markdown.js`)
- Noise selector filtering before conversion
- Relative URL resolution, details/dl/sub/sup/abbr/q handling
- Integrated end-to-end into `web_fetch` extraction pipeline

### 2. DOM Narrowing (Medium Impact)

**What they do:** JSDOMControl filters content before Readability.

**What we could adopt:**
- Apply `targetSelector` / `removeSelector` before extraction
- Use domain hints' `skipSelectors` more aggressively
- Clean DOM before Readability runs

### 3. VLM Image Descriptions (Low Impact)

**What they do:** Generate image descriptions for LLM context.

**What we could adopt:**
- Add optional image description generation
- Use vision model to describe images
- Useful for visual content

### 4. Header-Based Chunking (Medium Impact)

**What they do:** Split long pages by headers for RAG.

**What we could adopt:**
- Add optional chunking to `web_fetch`
- Split output by headers
- Useful for long documentation pages

### 5. Curl Engine (Medium Impact) ❌ Rejected

**What they do:** Lightweight HTTP fetch for simple pages.

**Our decision:** Not adopting — bot detection makes bare HTTP unreliable, and with prelaunched browser pooling the speed gap doesn't justify the complexity.

---

## Lessons for Us

### What Jina Reader Does Better

1. ~~**MarkifyService** — Custom HTML-to-markdown with proper formatting. We only output plain text.~~ ✅ **Adopted** — TurndownService + GFM, integrated end-to-end.
2. **DOM narrowing** — Pre-filtering before Readability. We only remove a few selectors.
3. **VLM integration** — Image descriptions for LLM context. We don't describe images.
4. **Chunking** — Header-based splitting for RAG. We don't chunk output.

### What We Do Better

1. **BrowserText fallback** — We compare Readability with browser text. Jina doesn't.
2. **Domain hints** — We have per-site configs. Jina doesn't.
3. **Tables** — We always extract tables in clean format. Jina doesn't focus on tables.
4. **Links** — We always extract links with ref_ids. Jina doesn't have this.

### Adoption Priority

| Improvement | Effort | Impact | Priority | Status |
|-------------|--------|--------|----------|--------|
| DOM-to-markdown converter | High | High | 1 | ✅ Done |
| HTTP-first fetching | Medium | High | 2 | ❌ Rejected |
| DOM narrowing | Medium | Medium | 3 | ❌ Pending |
| Header-based chunking | Low | Medium | 4 |
| VLM image descriptions | High | Low | 5 |

---

*Last updated: 2026-07-27*
