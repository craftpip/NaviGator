# Readability.js

> Readability.js is Mozilla's algorithm for extracting the main content from a web page. It's used in Firefox Reader View and is the most widely adopted content extraction algorithm.

**GitHub:** https://github.com/mozilla/readability
**Language:** JavaScript
**Stars:** 8K+
**License:** MPL-2.0

---

## Architecture

### Language & Framework
- **Language:** JavaScript (ES6+)
- **Framework:** Standalone library (no dependencies)
- **Browser:** Works in any DOM environment (browser, JSDOM, linkedom)
- **Deployment:** npm package, browser extension, Firefox built-in

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│              Readability Class                            │
│  constructor(document, options) → parse() → Article      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              _grabArticle() — Core Algorithm              │
│  Score blocks → Find container → Clean → Return          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Post-Processing                              │
│  Fix URLs → Remove wrappers → Strip classes → Return     │
└─────────────────────────────────────────────────────────┘
```

---

## Extraction Pipeline

### Pipeline Flow

1. **Preprocessing** — Remove script tags, CSS, normalize DOM
2. **Metadata Extraction** — Title, byline, excerpt, site name, publish time
3. **Core Algorithm** — `_grabArticle()` finds main content
4. **Cleanup** — `_prepArticle()` removes junk, fixes images
5. **Post-processing** — Fix URLs, remove wrappers, strip classes
6. **Return** — Article object with HTML + text + metadata

### The Core Algorithm (`_grabArticle`)

```
1. Initialize
   ├── Remove unlikely candidates
   └── Set up scoring structure

2. Score Blocks
   ├── Loop through all paragraphs (p, pre, td, headings, div)
   ├── Calculate content score for each
   │   ├── Text length (longer = better)
   │   ├── Punctuation density (commas = sentences)
   │   ├── Link density (link-heavy = navigation)
   │   └── Class/id bonuses/penalties
   ├── Push scores to parent containers
   └── Track top candidates

3. Find Container
   ├── Pick highest-scoring candidate
   ├── Check sibling scores
   └── Merge siblings with decent scores

4. Clean
   ├── Remove headers, footers, navs
   ├── Remove forms, embeds, weird lists
   ├── Fix images (relative → absolute URLs)
   └── Simplify structure

5. Return
   ├── content (HTML string)
   ├── textContent (plain text)
   └── metadata (title, byline, etc.)
```

---

## Content Algorithms

### Scoring Rules

**Positive Signals:**
- More text (longer paragraphs)
- More commas (sentences = real writing)
- Class/id with positive names ("article", "content", "story")
- `<p>`, `<pre>`, `<td>` elements
- Headings (`<h1>`-`<h6>`)

**Negative Signals:**
- Link-heavy text (navigation)
- Class/id with negative names ("comment", "sidebar", "footer")
- Very short text
- `<div>` without much text

**Score Propagation:**
- Leaf blocks get initial score
- Parent containers get child scores
- Grandparents get less (dampened)
- Top candidate is often a parent, not a leaf

### Unlikely Candidate Removal

Before scoring, remove blocks with:
- Class names: `combx`, `comment`, `community`, `disqus`, `extra`, `foot`, `header`, `menu`, `related`, `remark`, `rss`, `shoutbox`, `sidebar`, `sponsor`, `ad-break`, `agegate`, `pagination`, `pager`, `popup`, `tweet`
- Same patterns in IDs

### Link Density Check

```javascript
// Link density = text in links / total text
// High link density = navigation, not content
function getLinkDensity(el) {
    const text = el.textContent || "";
    const textLength = text.trim().length;
    if (textLength === 0) return 0;
    let linkLength = 0;
    for (const link of el.querySelectorAll("a")) {
        linkLength += (link.textContent || "").trim().length;
    }
    return linkLength / textLength;
}
```

### Conditional Cleanup

Remove only when it looks like junk:
- Forms (unless they're content)
- Embeds (videos, tweets)
- Weird lists (too many items)
- Images without captions

---

## Output Format

### Article Object

```javascript
{
    title: "Article Title",
    content: "<div>...clean HTML...</div>",
    textContent: "Clean text content...",
    length: 1234,  // characters
    excerpt: "Short description...",
    byline: "Author Name",
    dir: "ltr",
    siteName: "Site Name",
    lang: "en",
    publishedTime: "2024-01-01T00:00:00Z"
}
```

### Content HTML

Clean HTML with:
- Absolute URLs (links, images, video/audio, srcset)
- No `javascript:` links
- Simplified structure (removed nested wrappers)
- Optional: stripped class attributes

### textContent

Plain text with:
- All HTML tags removed
- Proper text extraction
- No structural information

---

## Special Features

### `isProbablyReaderable()`

Quick check before full parse:
- Look for candidate nodes (p, pre, article, div)
- Score based on text length
- Return boolean (probably worth parsing?)

### Metadata Extraction

**Sources (by priority):**
1. JSON-LD (Schema.org)
2. OpenGraph tags
3. Meta tags
4. Title element

**Fields extracted:**
- title
- byline (author)
- excerpt (description)
- siteName
- publishedTime
- lang
- dir (text direction)

### Configuration Options

```javascript
{
    debug: false,              // Enable logging
    maxElemsToParse: 0,        // No limit
    nbTopCandidates: 5,        // Top candidates to consider
    charThreshold: 500,        // Min article length
    disableJSONLD: false,      // Skip JSON-LD parsing
    linkDensityModifier: 0,    // Adjust link density threshold
    allowedVideoRegex: undefined, // Custom video URL regex
    serializer: el => el.innerHTML, // Custom serializer
}
```

### Retry Logic

If initial extraction is too short:
- Retry with less aggressive cleanup
- Try different flags
- Higher likelihood of finding content

---

## Limitations

### When Readability Fails

1. **Not enough text** — Page is a list or short announcement
2. **Too many links** — Navigation blocks win if page is mostly links
3. **Content split** — Article broken into many small blocks
4. **Bad DOM** — Poor nesting scores wrong container
5. **Heavy templates** — Header/sidebar/footer has more text than article

### Common Failure Modes

**Card Grids:**
- Portfolio sites with project cards
- Product listings
- Readability treats as navigation

**SPAs:**
- Angular/React component-based layouts
- Content in custom elements
- Empty shell if not rendered

**Mixed Content:**
- Bio + project cards
- Sidebar + main content
- Grabs first `<p>` block and stops

**Link-Heavy Content:**
- Documentation with lots of links
- Tutorial with code examples
- Scores `<a>` text as low-quality

---

## What We Can Learn

### 1. Link Density Modifier (High Impact)

**What they do:** Configurable link density threshold.

**What we could adopt:**
- Add link density penalty to `scoreTextBlock()`
- Current scoring doesn't consider link density
- Strong signal for navigation vs content

### 2. Score Propagation (Medium Impact)

**What they do:** Push child scores to parent containers.

**What we could adopt:**
- Our candidate block scoring doesn't propagate
- Parent containers often hold the real content
- Could improve extraction for split articles

### 3. Retry Logic (Medium Impact)

**What they do:** Retry with less aggressive cleanup if result too short.

**What we could adopt:**
- Add retry with different Readability options
- Try `charThreshold: 0` for short pages
- Try `maxElemsToParse: 0` for complex pages

### 4. JSON-LD Metadata (Low Impact)

**What they do:** Extract metadata from JSON-LD first.

**What we could adopt:**
- Our SEO analysis doesn't check JSON-LD
- JSON-LD often has better metadata than meta tags
- Add to `captureSeoSnapshot()`

### 5. Conditional Cleanup (Medium Impact)

**What they do:** Remove only when it looks like junk.

**What we could adopt:**
- Our `NON_CONTENT_SELECTORS` is too aggressive
- Remove forms, embeds only when they look like junk
- Keep them when they're content

---

## Lessons for Us

### What Readability Does Better

1. **Score propagation** — Parent containers get child scores. We don't propagate.
2. **Link density** — Strong signal for navigation vs content. We don't use this.
3. **Retry logic** — Less aggressive cleanup if result too short. We don't retry.
4. **Metadata extraction** — JSON-LD, OpenGraph, meta tags. We only have SEO analysis.
5. **Conditional cleanup** — Remove only when junk. We remove aggressively.

### What We Do Better

1. **Browser rendering** — We use real browser. Readability works on static HTML.
2. **BrowserText fallback** — We compare with browser text. Readability doesn't.
3. **Domain hints** — We have per-site configs. Readability doesn't.
4. **Tables** — We always extract tables. Readability doesn't focus on tables.
5. **Links** — We always extract links with ref_ids. Readability doesn't have this.

### Adoption Priority

| Improvement | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| Link density scoring | Low | High | 1 |
| Score propagation | Medium | Medium | 2 |
| Retry with different options | Low | Medium | 3 |
| JSON-LD metadata | Low | Low | 4 |
| Conditional cleanup | Medium | Medium | 5 |

---

*Last updated: 2026-07-26*
