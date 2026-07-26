# Scrapling

> Scrapling is an adaptive web scraping framework with anti-bot bypass capabilities and intelligent element tracking across website changes.

**GitHub:** https://github.com/D4Vinci/Scrapling
**Language:** Python
**Stars:** 3K+
**License:** BSD-3-Clause

---

## Architecture

- **Language:** Python
- **Browser:** Playwright (Chromium) via Patchright
- **HTTP:** curl-impersonate for TLS fingerprinting
- **Key Innovation:** Adaptive element tracking (survives website changes)

---

## Key Features

### Adaptive Element Tracking

Scrapling remembers element properties and relocates them after website changes:

```python
# Save element properties
element = page.css('#product', auto_save=True)

# Later, when website changes, relocate automatically
element = page.css('#product', adaptive=True)  # Still finds it!
```

Uses similarity algorithms (no AI) to match elements based on:
- Element structure
- Text content
- Position in DOM
- CSS class patterns

### Anti-Bot Bypass

**StealthyFetcher:**
- Bypasses Cloudflare Turnstile/Interstitial automatically
- Bypasses CDP runtime leaks and WebRTC leaks
- Canvas noise to prevent fingerprinting
- Patches headless mode detection
- Isolated JS execution context

**DynamicFetcher:**
- Full Playwright browser automation
- JavaScript rendering
- Network idle detection

### Multi-Session Support

Route requests to different sessions:
```python
class MultiSessionSpider(Spider):
    def configure_sessions(self, manager):
        manager.add("fast", FetcherSession(impersonate="chrome"))
        manager.add("stealth", AsyncStealthySession(headless=True))
    
    async def parse(self, response):
        if "protected" in link:
            yield Request(link, sid="stealth")
        else:
            yield Request(link, sid="fast")
```

---

## Extraction Approach

### No Built-in Content Extraction

Scrapling focuses on **fetching** and **parsing**, not content extraction:
- Fetches pages (HTTP or browser)
- Parses HTML with CSS/XPath selectors
- Extracts data using user-defined selectors
- No Readability or automatic content detection

### CLI Extraction

Basic extraction to files:
```bash
scrapling extract get 'https://example.com' content.md
scrapling extract fetch 'https://example.com' content.txt --css-selector '#main'
```

---

## What We Can Learn

### 1. Adaptive Element Tracking (Low Impact for Us)

**What they do:** Remember element properties, relocate after website changes.

**Relevance:** Our domain hints serve a similar purpose but are manually maintained. Adaptive tracking would auto-update hints, but adds complexity.

### 2. Anti-Bot Bypass (Medium Impact)

**What they do:** Advanced Cloudflare bypass, fingerprint spoofing.

**Relevance:** We could adopt some techniques for bot-protected sites. Currently we detect bot blocks but don't bypass them.

### 3. Multi-Session Routing (Low Impact)

**What they do:** Route requests to different sessions (fast vs stealth).

**Relevance:** We already have browser backends (cloakbrowser, chromium, lightpanda). Similar concept.

---

## Lessons for Us

**What Scrapling does better:**
1. Anti-bot bypass (Cloudflare, fingerprinting)
2. Adaptive element tracking
3. Multi-session routing

**What we do better:**
1. Content extraction (Readability, browserText fallback)
2. Domain hints (per-site configs)
3. Tables and links extraction
4. MCP integration

**Adoption priority:** Low — Scrapling is a fetching framework, not an extraction tool. Our needs are different.

---

*Last updated: 2026-07-26*
