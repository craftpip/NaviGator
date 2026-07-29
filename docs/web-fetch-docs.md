# Web Fetch — Extraction Pipeline Documentation

> Last updated: 2026-07-26
> Status: Active development

---

## What is Web Fetch?

`web_fetch` is the core content extraction tool. It opens a real browser (CloakBrowser/Chromium), renders JavaScript, and extracts clean readable text from any webpage. It handles SPAs, paywalls, bot protection, and dynamic content.

The goal: given any URL, return structured text content, tables, links, and metadata that an LLM can understand and work with.

---

## Pipeline Flow

```
User calls web_fetch(url: "https://example.com")
  │
  ├── 1. URL Resolution
  │     resolveOpenTarget() — resolves ref_id or direct URL to URL array
  │
  ├── 2. Parallel Fetch
  │     openTargetsParallel() — concurrent extraction with page pool limits
  │
  ├── 3. Per-URL Extraction (browserOpenAndExtract)
  │     │
  │     ├── 3a. Domain Hint Lookup
  │     │     findDomainHint(url, hints) — first-match wins
  │     │
  │     ├── 3b. Browser Navigation
  │     │     manager.newPage() → page.goto(url, waitUntil: domcontentloaded)
  │     │
  │     ├── 3c. Content Stabilization
  │     │     waitForSelector (if hint) → waitForContent (poll innerText) → waitForNetworkIdle → navigationWait
  │     │
  │     ├── 3d. Data Capture
  │     │     captureSeoSnapshot() — DOM scoring, headings, candidates
  │     │     page.content() — serialized HTML
  │     │     page.evaluate(document.body.innerText) — browser-computed text (browserText)
  │     │
  │     ├── 3e. Bot Detection
  │     │     Cloudflare, DataDome, empty title checks
  │     │
  │     ├── 3f. Text Extraction (extractTextFromHtml)
  │     │     │
  │     │     ├── Strip <style> tags, parse into JSDOM
  │     │     ├── Remove non-content nodes (scripts, nav, footer, cookies)
  │     │     ├── Extract tables (always)
  │     │     ├── IF hint.sections → section-based output (early return)
  │     │     ├── ELSE IF Readability succeeds → article text
  │     │     │     └── IF browserText has 1.5x+ more content → use browserText instead
  │     │     ├── ELSE → candidate block scoring → best text
  │     │     └── Append tables as ### Table N blocks
  │     │
  │     ├── 3g. Link Extraction (extractLinksFromHtml)
  │     │     Always runs. Stores links for web_page_links tool.
  │     │
  │     └── 3h. Format Response
  │           formatOpenPageResponse() — markdown with text + tables
  │
  └── 4. Cache & Return
        Store result in tool cache, return to caller
```

---

## Text Extraction Strategies

`extractTextFromHtml()` in `src/search.js` tries three strategies in order:

### Strategy 1: Domain Hints (Sections)

**When:** URL matches a hint with `content.sections`
**How:** Selectors target specific DOM elements, extract textContent, dedup, render as indented markdown
**Output:** `  - **Label**\n    - line\n    - line`
**Returns early** — Readability never runs

**Example (GitHub profile):**
```json
{
  "selector": "h1.vcard-names",
  "label": "Name",
  "priority": "high"
}
```

**When sections produce output, Readability is skipped entirely.** This is by design — sections give structured, labeled content. Readability would give unstructured prose.

### Strategy 2: Readability (Mozilla)

**When:** No domain hint sections match, or hint has no sections
**How:** Mozilla's Readability algorithm (same as Firefox Reader View) parses the JSDOM document
**Output:** Article text as clean prose

**Limitations:**
- Designed for article pages (blogs, news, documentation)
- Misses card grids, portfolio pages, SPA layouts
- Returns partial content when page has mixed content types (e.g., bio + project cards)
- Treats `<a>` link content as navigation noise

**The browserText fallback (Strategy 2b):**
When Readability returns text but the browser's `innerText` has 1.5x+ more content (with >200 extra chars), the browser text is used instead. This catches:
- Angular/React SPAs with component-based layouts
- Portfolio pages with card grids
- Landing pages with mixed content regions
- Any page where Readability grabs a small fragment

### Strategy 3: Candidate Blocks

**When:** Readability returns null or empty text
**How:** `collectCandidateBlocks()` finds semantic content containers via selectors, scores them by:
- Word count
- Punctuation density
- Weather keyword hits (legacy — was originally for weather sites)
- Negative score for link-heavy text

**Selectors used (in order):**
- `main`, `article`, `[role='main']`, `section`
- `.content`, `#content`, `.main`, `#main`
- `#__next`, `#root`, `#app-root`, `[data-reactroot]`
- `.article-body`, `.post-content`, `.entry-content`
- `[itemprop='articleBody']`

**Fallback:** If no candidates found, uses `doc.body?.textContent` directly.

---

## Domain Hints

Domain hints are per-site extraction configurations stored in `domain-hints.json`. They override the default extraction behavior.

### How Matching Works

`findDomainHint(url, hints)` iterates hints in order. First match wins.

- Domain is matched against `new URL(url).hostname`
- Path is matched against `new URL(url).pathname` using glob patterns
- `/*` = one path segment, `/*/*` = two segments, `/**` = everything
- Pattern `*` compiles to `[^/]*` (no slash matching)

### Hint Properties

| Property | Type | Purpose |
|----------|------|---------|
| `domain` | string | Domain to match (exact hostname) |
| `pathPattern` | string | Glob pattern for path matching |
| `pageType` | string | Classification (homepage, article, video, etc.) |
| `waitForSelector` | string | CSS selector to wait for before extraction |
| `navigationWait` | number | Extra wait time in ms after content loads |
| `preferReadability` | boolean | `false` skips Readability entirely |
| `tableExtraction` | string | `"disabled"` skips table extraction |
| `skipSelectors` | string[] | CSS selectors to remove from DOM before extraction |
| `content.sections` | array | Targeted content selectors with labels |
| `flags` | object | Special flags: `authWall`, `paywall`, `visualOnly`, etc. |

### Sections Format

```json
{
  "content": {
    "sections": [
      { "selector": "h1.vcard-names", "label": "Name", "priority": "high" },
      { "selector": "div.js-profile-editable-area", "label": "Profile", "priority": "high" },
      { "selector": "ol.js-pinned-items-reorder-list", "label": "Pinned Repos", "priority": "high" }
    ]
  }
}
```

- `priority: "high"` — always included
- `priority: "medium"` — included only if text > 50 chars
- `priority: "low"` — reserved, currently unused

### Special Flags

| Flag | Behavior |
|------|----------|
| `authWall: true` | Returns early with "Auth wall" error message |
| `visualOnly: true` | Returns early with "Visual-only" error message |
| `paywall: true` | Informational — extraction still attempts |
| `botProtected: true` | Informational — extraction still attempts |
| `requiresChromium: true` | Informational — notes chromium backend needed |

### Current Hints (40 entries, 37 domains)

Active domains with hints: economictimes.indiatimes.com, en.wikipedia.org, github.com (4 page types), mausam.imd.gov.in, mumbaimirror.indiatimes.com, stackoverflow.com, timesofindia.indiatimes.com, www.accuweather.com, www.afternoonvoice.com, www.bbc.com, www.business-standard.com, www.cricbuzz.com, www.deccanherald.com, www.divyamarathi.com, www.esakal.com, www.financialexpress.com, www.firstpost.com, www.flipkart.com, www.freepressjournal.in, www.hindustantimes.com, www.indiatimes.com, www.irctc.co.in, www.livemint.com, www.loksatta.com, www.lokmat.com, maharashtratimes.com, www.mid-day.com, www.moneycontrol.com, www.mumbailive.com, www.news18.com, www.pudhari.news, www.reuters.com, www.skymetweather.com, www.tarunbharat.com, www.thehindu.com, www.tribuneindia.com, www.youtube.com

---

## Tables

Tables are **always extracted** — there is no flag to disable this (except via domain hint `tableExtraction: "disabled"`).

### How It Works

1. `extractTablesFromDocument()` scans JSDOM for `<table>` elements
2. Each table's rows and cells are extracted
3. Empty tables (no body cell with >2 chars) are filtered out via `hasDataContent` check
4. Tables are appended to output as `### Table N` blocks with pipe-separated format

### Row Limiting

`maxTableRows` parameter limits rows per table. Default: no limit.

### Output Format

```
### Table 1
| Column A | Column B |
|----------|----------|
| value 1  | value 2  |
```

---

## Links

Links are **always extracted** but **never shown in the text output**. They are stored in `pageLinksByPageRef` and accessible via `web_page_links(ref_id)`.

### How It Works

1. `extractLinksFromHtml()` parses HTML, finds all `<a href>` elements
2. Resolves relative URLs to absolute
3. Associates each link with nearest heading context
4. Skips: anchor-only links, `javascript:` links, links inside `<td>/<th>`
5. Deduplicates by URL, keeping most specific heading context
6. Each link gets its own `ref_id` via `rememberLink()`

### Accessing Links

```
web_fetch(url: "https://example.com")  → returns page with Links: N metadata
web_page_links(ref_id: N)              → lists all links with their ref_ids
web_fetch(ref_id: link_ref_id)          → fetches a specific link's content
```

### Link Memory

- `linkMemoryByRef` — maps ref_id → {url, text}
- `linkMemoryByUrl` — maps url → ref_id (dedup)
- `pageLinksByPageRef` — maps page ref_id → [{ref_id, url, text}, ...]
- All memory is process-local, resets on server restart

---

## SEO Analysis

`captureSeoSnapshot()` runs IN the browser context (not JSDOM) and captures:

- Document height and scroll dimensions
- All headings (h1-h4) with text
- Candidate content blocks (same selectors as `collectCandidateBlocks`)
- Metadata: title, description, canonical URL

`buildSeoAnalysis()` combines the snapshot with the extracted text to produce:
- `mainContentText` — best text from candidates
- `headingStructure` — outline of headings
- `metadata` — page metadata

SEO analysis is optional — controlled by `includeSeoAnalysis` parameter.

---

## Bot Detection

After page load, the extraction checks for:

1. **Cloudflare**: `cf-browser-verification` or `__cf_challenge` in HTML
2. **DataDome**: `data-dome` in HTML, or "Please enable JS" / "disable any ad blocker" in body text
3. **Empty title**: Title is empty or matches domain-only pattern (`/^[a-z0-9-]+\.[a-z]{2,}$/i`)

If detected, returns early with `{ text: "", error: "Bot block detected" }`.

---

## Content Stabilization

Before extraction, the pipeline waits for the page to stabilize:

1. **`waitForSelector`** (if hint): Waits up to 20s for a CSS selector to appear
2. **`waitForContent`**: Polls `document.body.innerText.length` every 500ms until it stabilizes (max 5s)
3. **`waitForNetworkIdle`**: Waits for 500ms of no network activity (max 10s)
4. **`navigationWait`**: Extra delay for SPAs (default 2s, configurable per hint)

---

## Non-Content Removal

Before extraction, these elements are stripped from the JSDOM document:

```javascript
const NON_CONTENT_SELECTORS = [
  "script", "style", "noscript", "template", "svg", "canvas", "iframe",
  "header", "footer", "nav", "aside", "select", "option",
  ".cookie", ".cookies", "[class*='cookie']", "[id*='cookie']",
  "[class*='consent']", "[id*='consent']",
  "[class*='subscribe']", "[id*='subscribe']",
  "[class*='banner']", "[id*='banner']",
  "[role='dialog']"
];
```

Additionally, `<style>` tags are stripped from raw HTML before JSDOM parsing (prevents cssstyle crashes on `border: inherit` shorthand).

---

## Known Limitations

### Readability Gaps

Readability (Mozilla's algorithm) is designed for article pages. It struggles with:

- **Card grids** (portfolio sites, product listings) — treats as navigation
- **Angular/React SPAs** with component-based layouts — misses content in custom elements
- **Mixed content pages** — grabs the first `<p>` block and stops
- **Link-heavy content** — scores `<a>` text as low-quality

The `browserText` fallback (Strategy 2b) helps for cases where body text has significantly more content than Readability captured, but the formatting may be messy for inline elements.

### JSDOM Limitations

JSDOM doesn't do CSS layout. This means:
- `textContent` concatenates inline elements without spacing
- No `innerText` computation (must come from browser)
- No visibility/display detection (elements hidden via CSS still appear)

### Text Formatting

When using `browserText` (browser's `innerText`), the output is plain text with proper line breaks but no structural formatting. When using JSDOM's `textContent`, inline elements get concatenated without spacing.

### Weather Site Special Case

The extraction has special handling for weather sites:
- `extractWeatherSummary()` detects weather keywords and formats a compact summary
- `scoreTextBlock()` gives bonus points to weather-related content

This is a legacy feature from when the tool was focused on weather data extraction.

---

## Future Improvements

### Priority 1: Better Generic Extraction

**Problem:** The tool relies heavily on domain hints for non-article pages. Sites without hints often get poor extraction.

**Approach:** Improve the `browserText` fallback to handle more cases:
- When Readability returns short text AND browserText has more content, use browserText
- Add text processing to handle inline element concatenation (detect lowercase→uppercase boundaries, digit→letter transitions)
- Consider using `innerText` from the browser as the primary source for non-article pages

### Priority 2: DOM-to-Markdown Converter

**Problem:** The tool converts DOM to plain text, losing structural information (headings, lists, code blocks).

**Approach:** Build a DOM-to-markdown transformer that:
- Walks the visible DOM tree
- Converts structural elements to markdown (headings → `##`, bold → `**`, links → `[text](url)`)
- Filters out junk (scripts, styles, nav, footer, cookies)
- Preserves list structure, code blocks, blockquotes

This would give better output than Readability for many page types.

### Priority 3: Content Region Detection

**Problem:** The tool doesn't know which part of the page is "content" vs "navigation" vs "sidebar".

**Approach:** Build heuristics for detecting content regions:
- Analyze DOM tree depth and text density
- Identify main content blocks vs navigation/sidebars
- Use heading hierarchy to understand page structure
- Detect card grids, lists, and other common patterns

### Priority 4: Per-Page-Type Extraction

**Problem:** Different page types (articles, profiles, lists, dashboards) need different extraction strategies.

**Approach:** Classify pages by type and apply the right strategy:
- Articles → Readability (already works well)
- Profiles → sections-based extraction
- Lists → structured list extraction
- Dashboards → data-focused extraction

### Priority 5: Learning System

**Problem:** The tool doesn't learn from successful extractions.

**Approach:** Track what works:
- Record which strategy produced the best output for each domain
- Auto-generate domain hints from successful extractions
- Build a knowledge base of site patterns

---

## Code References

| Component | File | Lines |
|-----------|------|-------|
| `extractTextFromHtml()` | `src/search.js` | 856-989 |
| `browserOpenAndExtract()` | `src/search.js` | 2030-2186 |
| `extractLinksFromHtml()` | `src/search.js` | 1956-2028 |
| `collectCandidateBlocks()` | `src/search.js` | 422-440 |
| `captureSeoSnapshot()` | `src/search.js` | 993-1100 |
| `formatOpenPageResponse()` | `src/mcp-server.js` | 893-915 |
| `handleToolCall()` (web_fetch) | `src/mcp-server.js` | 1171-1209 |
| `openTargetsParallel()` | `src/mcp-server.js` | 846-892 |
| `findDomainHint()` | `src/domain-hints.js` | 74-80 |
| `domain-hints.json` | `domain-hints.json` | — |

---

## Testing

### Quick Test

```bash
curl "http://localhost:3000/extract?url=https://example.com&maxChars=2000"
```

### MCP Test

```bash
npx --yes mcporter call local-navigator.web_fetch '{"url": "https://example.com"}'
```

### Container Deploy

```bash
docker compose build && docker compose down && docker compose up -d
sleep 10 && docker exec navigator curl -s localhost:3000/health
```

---

## Domain Hints Workflow

### Per-Site Routine

1. Open page in browser tab
2. Take screenshot — see what matters visually
3. Inspect DOM structure — find selectors for content
4. Test extraction WITHOUT hints first
5. Write hint with precise selectors
6. Deploy and test
7. Tune until output is clean

### Key Rules

- **Select ONLY the useful content container** — exclude nav, footer, sidebars, ads, buttons
- **No overlapping selectors** — one element should not be a child of another selected element
- **Test without hints first** — see what the fallback produces before adding hints
- **One site at a time** — test, tune, perfect, then move on
- **Smart hints, not smart code** — formatting decisions belong in the hint, not in extraction logic

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOMAIN_HINTS_PATH` | `./domain-hints.json` | Path to hints file |
| `BROWSER_BACKEND` | `cloakbrowser` | Default browser backend |
| `BROWSER_OP_TIMEOUT_MS` | `60000` | Per-operation timeout |
| `PRELAUNCH_BROWSER` | `1` | Prelaunch browser on start |
| `CHROME_PATH` | `/usr/bin/chromium` | Chromium path |
| `HEADLESS` | `true` | Headless mode |
