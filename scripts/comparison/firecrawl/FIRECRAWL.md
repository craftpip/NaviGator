# Firecrawl

> Firecrawl is a web scraping API that converts URLs into LLM-ready markdown. It uses multiple scraping engines with automatic fallback and supports LLM-powered structured extraction.

**GitHub:** https://github.com/mendableai/firecrawl
**Language:** TypeScript/Node.js
**Stars:** 50K+
**License:** AGPL-3.0

---

## Architecture

### Language & Framework
- **Language:** TypeScript (Node.js)
- **Framework:** Express API + RabbitMQ workers + Redis state
- **Browser:** Playwright (Chromium) via "Fire Engine" microservice
- **Deployment:** Docker containers, distributed workers

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│                    API Layer (Express)                   │
│  POST /v1/scrape, POST /v1/crawl, POST /v1/extract     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Scrape Worker (RabbitMQ)                   │
│  scrapeURL() → Engine Selection → Fallback Loop         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Scraping Engines                            │
│  Fire Engine (Playwright) | Readability | Raw HTML       │
│  PDF Engine | Document Engine | Wikipedia Engine         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Transformer Pipeline (17+ stages)          │
│  HTML → Clean → Markdown → LLM Extract → Metadata       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Storage (Redis + GCS)                       │
│  Cache | Index | State | Results                        │
└─────────────────────────────────────────────────────────┘
```

---

## Extraction Pipeline

### Pipeline Flow

1. **URL Resolution** — Accept URL(s) with options
2. **Engine Selection** — Build fallback list based on feature flags
3. **Scrape Loop** — Try engines in order (waterfall pattern)
4. **Post-Processing** — Transform HTML to markdown/JSON
5. **LLM Extraction** — Optional structured data extraction
6. **Storage** — Cache results, index for future lookups

### Engine Selection

Firecrawl has multiple scraping engines, each with different capabilities:

| Engine | Type | Use Case |
|--------|------|----------|
| Fire Engine | Browser (Playwright) | JavaScript rendering, SPAs |
| Readability | Library | Article extraction |
| Raw HTML | HTTP | Simple pages, no JS needed |
| PDF Engine | Parser | PDF documents |
| Document Engine | LibreOffice | Office documents |
| Wikipedia | API | Wikipedia articles |

The `buildFallbackList()` function creates an ordered list based on:
1. Forced engine (if specified)
2. Index cache (if `maxAge` is set)
3. Specialty engines (PDF, document, Wikipedia)
4. Quality-sorted engines (filtered by feature support)

### Waterfall Pattern

Engines are tried sequentially with parallel racing:

1. First engine starts immediately
2. After `getEngineMaxReasonableTime(engine) + WATERFALL_DELAY_MS`, next engine starts
3. Multiple engines run concurrently
4. First success "snipes" others via `snipeAbort`
5. Failed engines are aborted to conserve resources

### Success Criteria

An engine's result is successful if:
1. Content length > 0 (after markdown conversion)
2. Status code is 2xx or 304, OR
3. Content exists even with bad status code

---

## Content Algorithms

### Primary Extraction

Firecrawl doesn't have its own extraction algorithm. Instead, it uses:

1. **Mozilla Readability** — For article extraction (same as Firefox Reader View)
2. **Custom HTML cleaning** — `htmlTransform` with `includeTags`, `excludeTags`, `onlyMainContent`
3. **Fallback** — If `onlyMainContent` results in empty markdown, retries with full content

### LLM-Powered Extraction (Extract Endpoint)

The `extract` endpoint uses LLMs to transform unstructured content into structured JSON:

1. **URL Discovery** — Uses LLM to generate search queries, retrieves URLs via search service
2. **Schema Normalization** — Dereferences and spreads complex schemas
3. **URL Reranking** — `rerankLinksWithLLM` scores links by relevance
4. **Entity Analysis** — Determines Single-Answer vs Multi-Entity extraction
5. **Execution**:
   - Single Answer: Scrapes content + single LLM completion
   - Multi-Entity: Batches extraction across multiple URLs

### Smart Scrape (Agent Endpoint)

When data is missing, triggers browser interactions:
- Clicks, accordions, form submissions
- Reveals hidden content before extraction

---

## Output Format

### Markdown Conversion

The `deriveMarkdownFromHTML` transformer converts cleaned HTML to markdown:
- Uses a custom markdown converter (inspired by Turndown)
- Supports headings, links, images, code blocks, lists
- Preserves structural elements

### Structured Extraction (LLM)

Returns JSON matching user-provided schema:
- Smart model selection (gpt-4o-mini → gpt-4.1 for recursive schemas)
- Token management (pre-trims content to fit context windows)
- Schema normalization (removes `additionalProperties`)

### Metadata

Extracts:
- OpenGraph tags
- Twitter card data
- Standard meta tags
- Favicon URLs

---

## Special Features

### Caching

- **Index Cache** — Cached results returned if `maxAge` is met
- **TTL-based** — Results expire after configured time
- **Redis + GCS** — State in Redis, blobs in Google Cloud Storage

### Bot Detection Bypass

- Multiple engines with different fingerprinting
- Proxy rotation (built-in provider support)
- Browser automation via Playwright (handles JS challenges)

### Anti-Bot Handling

- **Cloudflare** — Browser engine bypasses challenges
- **DataDome** — Proxy rotation + browser fingerprinting
- **Rate limiting** — Per-domain rate limits

### Multi-Engine Fallback

When one engine fails, automatically tries the next:
- Fire Engine timeout → Readability
- Readability empty → Raw HTML
- Raw HTML blocked → Fire Engine with proxy

### Diff Tracking

`deriveDiff` transformer compares current markdown against previously indexed version:
- Generates git-diff or structured JSON diff
- Shows additions and removals

---

## Fallback Strategy

### Engine-Level Fallback

```
Request → Engine Selection → Waterfall Loop
  │
  ├── Fire Engine (Playwright) → Success? → Return
  │     ↓ timeout/error
  ├── Readability → Success? → Return
  │     ↓ empty
  ├── Raw HTML → Success? → Return
  │     ↓ blocked
  └── Next engine in fallback list...
```

### Feature Flag Retry

When certain errors occur, automatically adjusts feature flags:
- `AddFeatureError` — Adds flags, rebuilds meta, retries
- `RemoveFeatureError` — Removes flags, rebuilds meta, retries

### Retry Limits

`ScrapeRetryTracker` enforces limits:
- Max retries per error type
- Prevents infinite loops
- Throws `ScrapeRetryLimitError` when exceeded

---

## What We Can Learn

### 1. Multi-Engine Fallback (Medium Impact)

**What they do:** Try multiple engines in parallel with waterfall pattern. First success wins.

**What we could adopt:**
- Currently we have single-engine (Chromium) with fallback chain
- Could try multiple strategies in parallel and pick first success
- Already partially covered: Readability → browserText → candidate blocks

### 2. Index Cache (Medium Impact) ✅ Done

**What they do:** Cache results with TTL. Return cached version if fresh enough.

**What we adopted:**
- Tool caching with 5-min TTL (`mcp-server.js`)
- Per-tool cache for `web_search` and `web_fetch`
- `bypassCache` parameter to force refresh
- Max 200 cache entries with LRU pruning

### 3. LLM-Powered Extraction (High Impact)

**What they do:** Use LLMs to extract structured data from unstructured content.

**What we could adopt:**
- Add optional LLM extraction to `web_fetch`
- User provides schema → LLM extracts structured JSON
- Smart model selection based on schema complexity

### 4. Smart Scrape (Medium Impact)

**What they do:** When data is missing, trigger browser interactions (clicks, accordions).

**What we could adopt:**
- Add optional `actions` parameter to `web_fetch`
- Click "Load More" buttons, expand accordions
- Interact with page before extraction

### 5. Diff Tracking (Low Impact)

**What they do:** Compare current extraction against previous version.

**What we could adopt:**
- Store previous extraction for each URL
- Return diff when content changes
- Useful for monitoring page updates

---

## Lessons for Us

### What Firecrawl Does Better

1. **Multi-engine fallback** — We have one primary engine with fallback chain. Adding parallel strategies could improve success rate.
2. **LLM extraction** — We don't have structured data extraction. Adding optional LLM extraction would be powerful.
3. ~~**Caching** — We don't cache results. Adding URL-based caching would improve performance.~~ ✅ **Adopted** — Tool caching with 5-min TTL and bypass
4. **Diff tracking** — We don't track changes. Adding diff would help with monitoring.

### What We Do Better

1. **Domain hints** — We have per-site extraction configs. Firecrawl doesn't.
2. **BrowserText fallback** — We compare Readability output with browser text. Firecrawl doesn't.
3. **Tables** — We always extract tables in clean format. Firecrawl doesn't focus on tables.
4. **Links** — We always extract links with ref_ids. Firecrawl doesn't have this.

### Adoption Priority

| Improvement | Effort | Impact | Priority | Status |
|-------------|--------|--------|----------|--------|
| HTTP-first fetching | Medium | High | 1 | ❌ Rejected |
| Index cache | Low | Medium | 2 | ✅ Done |
| LLM extraction | High | High | 3 | ❌ Pending |
| Smart scrape | Medium | Medium | 4 | ❌ Pending |
| Diff tracking | Low | Low | 5 | ❌ Pending |

---

*Last updated: 2026-07-27*
