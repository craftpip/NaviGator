# Crawlee

> Crawlee is a web scraping and browser automation library for Node.js. It provides a unified interface for HTTP and browser crawling with automatic scaling and proxy rotation.

**GitHub:** https://github.com/apify/crawlee
**Language:** TypeScript/Node.js
**Stars:** 15K+
**License:** Apache-2.0

---

## Architecture

### Core Components

```
Crawler (PlaywrightCrawler, HttpCrawler, CheerioCrawler)
  ↓
BrowserPool (manages browser instances)
  ↓
RequestQueue (URLs to crawl)
  ↓
Storage (datasets, key-value stores)
```

### Browser Pool

Manages multiple browser instances:
- Round-robin page creation
- Automatic browser retirement
- Fingerprint rotation
- Proxy integration

```javascript
const browserPool = new BrowserPool({
    browserPlugins: [new PlaywrightPlugin(playwright.chromium)],
    maxPagesPerBrowser: 10,
    useFingerprints: true,
});
```

### Crawler Types

**PlaywrightCrawler:**
- Full browser rendering
- JavaScript execution
- Screenshots, PDFs

**HttpCrawler:**
- HTTP requests (no browser)
- HTTP2 support
- TLS fingerprint replication

**CheerioCrawler:**
- HTTP + HTML parsing
- CSS selectors
- Fast, lightweight

---

## Extraction Approach

### No Built-in Content Extraction

Crawlee is a **framework**, not an extraction tool:
- Users write custom request handlers
- Define extraction logic
- No automatic content detection
- No Readability integration

### Extraction Libraries

Users typically combine with:
- **cheerio** — jQuery-like HTML parsing
- **jsdom** — DOM implementation
- **readability** — Article extraction
- **turndown** — HTML to Markdown

---

## Key Features

### Browser Pool Management

Automatic browser lifecycle:
```javascript
const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, enqueueLinks }) {
        const title = await page.title();
        await Dataset.pushData({ title, url: request.loadedUrl });
        await enqueueLinks();
    },
});
```

### Proxy Rotation

Built-in proxy support:
```javascript
const crawler = new PlaywrightCrawler({
    proxyConfiguration: new ProxyConfiguration({
        proxyUrls: ['http://user:pass@proxy1:8080', '...'],
    }),
});
```

### Persistent Storage

Built-in storage for crawled data:
```javascript
await Dataset.pushData({ title, url, content });
await KeyValueStore.setValue('key', value);
```

### Auto-Scaling

Automatic concurrency based on system resources:
- Monitor CPU, memory
- Adjust browser count
- Throttle requests

### Fingerprint Rotation

Automatic browser fingerprint changes:
```javascript
const browserPool = new BrowserPool({
    useFingerprints: true,
    fingerprintOptions: {
        browsers: ['chrome', 'firefox'],
        operatingSystems: ['windows', 'macos'],
    },
});
```

---

## What We Can Learn

### 1. Browser Pool Management (Medium Impact)

**What they do:** Automatic browser lifecycle, retirement, fingerprint rotation.

**Relevance:** Our `BrowserManager` does similar things. Could adopt fingerprint rotation for anti-bot.

### 2. Proxy Integration (Low Impact)

**What they do:** Built-in proxy configuration and rotation.

**Relevance:** We could add proxy support for bot-protected sites.

### 3. Auto-Scaling (Low Impact)

**What they do:** Automatic concurrency based on system resources.

**Relevance:** We could auto-scale browser instances based on load.

---

## Lessons for Us

**What Crawlee does better:**
1. Browser pool management (fingerprint rotation)
2. Proxy integration
3. Auto-scaling
4. Persistent storage

**What we do better:**
1. Content extraction (Readability, browserText)
2. Domain hints (per-site configs)
3. MCP integration
4. Tables and links extraction

**Adoption priority:** Low — Crawlee is a framework for building crawlers. We're an extraction tool. But browser pool concepts are worth considering.

---

*Last updated: 2026-07-26*
