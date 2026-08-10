# Scrapy

> Scrapy is a Python web crawling framework with a middleware pipeline architecture. It's the industry standard for large-scale web scraping.

**GitHub:** https://github.com/scrapy/scrapy
**Language:** Python
**Stars:** 15K+
**License:** BSD-3-Clause

---

## Architecture

### Core Components

```
Spider → Engine → Scheduler → Downloader → Spider
         ↓                        ↓
    Item Pipeline          Downloader Middleware
```

**Engine:** Controls data flow between components
**Scheduler:** Queues requests for download
**Downloader:** Fetches web pages
**Spider:** Parses responses, extracts data
**Item Pipeline:** Processes extracted items

### Middleware System

**Downloader Middleware:**
- `process_request()` — Before download
- `process_response()` — After download
- `process_exception()` — On error

**Spider Middleware:**
- `process_spider_input()` — Before spider
- `process_spider_output()` — After spider
- `process_spider_exception()` — On error

---

## Extraction Approach

### No Built-in Content Extraction

Scrapy is a **framework**, not an extraction tool:
- Users write custom spiders
- Define extraction rules (CSS/XPath)
- No automatic content detection
- No Readability integration

### Extraction Libraries

Users typically combine with:
- **parsel** — CSS/XPath selectors (built-in)
- **readability-lxml** — Article extraction
- **newspaper3k** — News extraction
- **beautifulsoup4** — HTML parsing

---

## Key Features

### Middleware Pipeline

Highly extensible via middleware:
```python
class CustomMiddleware:
    def process_request(self, request, spider):
        # Modify request before download
        request.headers['Custom'] = 'value'
    
    def process_response(self, request, response, spider):
        # Modify response after download
        return response
```

### Built-in Middleware

- **HttpCacheMiddleware** — HTTP caching
- **RetryMiddleware** — Automatic retries
- **RedirectMiddleware** — Follow redirects
- **RobotsTxtMiddleware** — robots.txt compliance
- **UserAgentMiddleware** — User agent rotation
- **HttpProxyMiddleware** — Proxy support

### Item Pipeline

Process extracted items:
```python
class ValidateItem:
    def process_item(self, item, spider):
        if not item.get('title'):
            raise DropItem("Missing title")
        return item
```

### Scaling Features

- Concurrent requests
- Auto-throttling
- Distributed crawling (Scrapy-Redis)
- Docker deployment

---

## What We Can Learn

### 1. Middleware Architecture (Medium Impact)

**What they do:** Pluggable middleware for request/response processing.

**Relevance:** We could add middleware-style hooks to our extraction pipeline:
- Pre-fetch middleware (modify URL, add headers)
- Post-fetch middleware (transform content)
- Error handling middleware

### 2. Built-in Caching (Medium Impact)

**What they do:** HttpCacheMiddleware for HTTP-level caching.

**Relevance:** We could add similar caching to our browser fetches.

### 3. Robots.txt Compliance (Low Impact)

**What they do:** Automatic robots.txt checking.

**Relevance:** We could add robots.txt checking to be more polite.

---

## Lessons for Us

**What Scrapy does better:**
1. Middleware architecture (highly extensible)
2. Built-in caching, retries, redirects
3. Scaling (concurrent, distributed)
4. Item pipelines (validation, transformation)

**What we do better:**
1. Content extraction (Readability, browserText)
2. Domain hints (per-site configs)
3. Browser rendering (SPAs)
4. MCP integration

**Adoption priority:** Low — Scrapy is a framework for building crawlers. We're an extraction tool. Different use cases. But middleware architecture is worth considering.

---

*Last updated: 2026-07-26*
