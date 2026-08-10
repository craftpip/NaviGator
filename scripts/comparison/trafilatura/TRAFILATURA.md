# Trafilatura

> Trafilatura is a Python package for web scraping that combines heuristic-based extraction with jusText and readability fallbacks. It consistently outperforms other open-source libraries in text extraction benchmarks.

**GitHub:** https://github.com/adbar/trafilatura
**Language:** Python
**Stars:** 6K+
**License:** Apache-2.0

---

## Architecture

### Language & Framework
- **Language:** Python
- **Framework:** Standalone package + CLI
- **Browser:** None (HTTP-only via requests)
- **Deployment:** pip install, CLI, R (reticulate), GUI

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│              Main Entry Points                           │
│  extract() → bare_extraction() → trafilatura_sequence()  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Extraction Cascade                          │
│  1. Main Extractor → 2. Fallback (readability/justext)  │
│  3. Baseline Rescue → 4. Recall Escalation              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Output Formatting                           │
│  txt | csv | json | markdown | xml | xmltei | html       │
└─────────────────────────────────────────────────────────┘
```

---

## Extraction Pipeline

### Pipeline Flow

1. **HTML Input** — Accept URL, HTML string, or parsed tree
2. **Tree Preparation** — Clean, convert tags, handle comments
3. **Main Extraction** — Trafilatura's own heuristic algorithm
4. **Fallback Comparison** — Compare with readability/justext
5. **Baseline Rescue** — If short, try baseline extraction
6. **Recall Escalation** — If still short, retry in recall mode
7. **Output Formatting** — Convert to chosen format

### The Cascade (`trafilatura_sequence`)

```
Stage 1: Main Extractor
  │
  ├── Extract content using XPath expressions
  ├── Score by text length, link density, punctuation
  └── Return result
  │
  ▼ (if fast mode, skip Stage 2)
Stage 2: Fallback Comparison
  │
  ├── readability-lxml extraction
  ├── jusText extraction
  ├── Compare with main extraction
  └── Return best result
  │
  ▼ (if still short)
Stage 3: Baseline Rescue
  │
  ├── Extract "wild" text elements
  ├── Look for div elements without paragraphs
  └── Return baseline result
  │
  ▼ (if still short)
Stage 4: Recall Escalation
  │
  ├── Retry whole cascade with recall focus
  ├── Try jusText alongside
  └── Return if clearly bigger
```

---

## Content Algorithms

### Main Extractor (Trafilatura's Own)

**Content Delimitation:**
- XPath expressions targeting common HTML elements/attributes
- Idiosyncrasies of main content management systems
- Negative perspective: exclude unwanted parts (nav, footer, ads)
- Positive perspective: center on desirable content

**Scoring Heuristics:**
- Element type (p, div, article, etc.)
- Text length (longer = better)
- Link density (link-heavy = navigation)
- Punctuation density (commas = sentences)
- Position/depth in HTML tree

**Processing:**
- Check relevance (notably by element type, text length, link density)
- Simplify HTML structure
- Preserve formatting (paragraphs, titles, lists, quotes, code)

### Fallback: readability-lxml

Mozilla's Readability algorithm (Python port):
- Scores content blocks
- Finds main article container
- Removes noise
- Returns clean HTML

### Fallback: jusText

Heuristic-based text extraction:
- Classifies text blocks as "boilerplate" or "content"
- Uses features like text length, link density, word frequency
- Highly configurable

### Baseline Rescue

If all else fails, extract "wild" text:
- Look for any element with useful text content
- Discard unwanted parts
- Look for div elements without paragraphs

### Recall Escalation

When extraction is too short:
- Retry with `focus="recall"` (more aggressive)
- Accept if clearly bigger (1.5x+)
- Try jusText alongside (reaches content rule-based retry misses)

---

## Output Formats

### Plain Text (default)
```text
Title

Main content with paragraphs.

Another paragraph.
```

### Markdown
```markdown
# Title

Main content with paragraphs.

Another paragraph.
```

### JSON
```json
{
    "title": "Title",
    "author": "Author",
    "date": "2024-01-01",
    "text": "Main content...",
    "comments": "Comments...",
    "language": "en"
}
```

### XML / XML-TEI
```xml
<div type="article">
  <head>Title</head>
  <p>Main content...</p>
</div>
```

### CSV
```csv
title\tauthor\tdate\ttext
Title\tAuthor\t2024-01-01\tMain content...
```

---

## Special Features

### Metadata Extraction

Extracts:
- Title (by descending frequency)
- Site name
- Author
- Date (via htmldate library)
- Categories and tags
- Language detection (CLD3)

### Crawl Discovery

- Sitemaps (XML and TXT formats)
- Web feeds (ATOM, RDF, RSS)
- URL filtering and prioritization
- Language-aware heuristics

### Deduplication

- Remove duplicate segments
- Remove duplicate documents
- Configurable via `deduplicate` parameter

### Comments Extraction

Optional extraction of:
- Forum posts
- Article comments
- Thread discussions

### Formatting Preservation

- Paragraphs
- Headings (titles)
- Lists
- Quotes
- Code blocks
- Line breaks
- In-line text formatting (bold, italic)

---

## Fallback Strategy

### 4-Stage Cascade

1. **Main Extractor** — Trafilatura's own heuristic algorithm
2. **Fallback Comparison** — Compare with readability/justext (if not fast mode)
3. **Baseline Rescue** — If short, try baseline extraction
4. **Recall Escalation** — If still short, retry in recall mode

### Comparison Logic

When comparing with fallbacks:
- All algorithms are fairly reliable
- Much longer is better (mostly)
- Check for "impurities" (media elements, navigation)
- Use heuristics to determine best extraction

### Recall Escalation Triggers

Stage 4 activates when:
- `focus == "balanced"` (default)
- Extraction is short (< 3000 chars)
- Covers little of the page (< 20% of page text)

### Acceptance Criteria

Recall escalation accepted if:
- `r_len >= min_extracted_size` AND `r_len > 1.5x * len_text`
- OR `j_len > r_len` AND `j_len > 2.0x * len_text`

---

## What We Can Learn

### 1. Heuristic Cascade (High Impact)

**What they do:** 4-stage extraction cascade with comparison and escalation.

**What we could adopt:**
- Add jusText as fallback when Readability returns empty
- Compare Readability output with jusText
- Use longer/more-complete extraction
- Add recall escalation for short extractions

### 2. Link Density Scoring (Medium Impact) ✅ Done

**What they do:** Score content blocks by link density (link-heavy = navigation).

**What we adopted:**
- Link density scoring in candidate block selection (`search.js:1216`)
- Penalty: `linkDensity * 400` subtracted from score
- Strong signal for navigation vs content, now integrated

### 3. Metadata Extraction (Medium Impact)

**What they do:** Extract title, author, date, categories, tags, language.

**What we could adopt:**
- Add metadata extraction to `web_fetch`
- Return title, author, date, language
- Currently only in SEO analysis (optional)

### 4. Baseline Rescue (Low Impact)

**What they do:** If all else fails, extract "wild" text elements.

**What we could adopt:**
- Our candidate block scoring is similar
- Could add more aggressive baseline when Readability fails

### 5. Formatting Preservation (Medium Impact) ✅ Done

**What they do:** Preserve paragraphs, headings, lists, code, quotes.

**What we adopted:**
- DOM-to-markdown converter via TurndownService + GFM (`src/markdown.js`)
- Preserves headings, bold, code, lists, links, tables
- Integrated end-to-end into `web_fetch` extraction pipeline

---

## Lessons for Us

### What Trafilatura Does Better

1. **Heuristic cascade** — 4-stage extraction with comparison. We only have Readability + candidate blocks.
2. ~~**Link density scoring** — Strong signal for navigation vs content. We don't use this.~~ ✅ **Adopted**
3. **Metadata extraction** — Title, author, date, language. We only have SEO analysis.
4. ~~**Formatting preservation** — Preserve structure. We output plain text.~~ ✅ **Adopted** — Markdown via Turndown + GFM
5. **Recall escalation** — Retry when extraction is short. We don't have this.

### What We Do Better

1. **Browser rendering** — We use real browser (Chromium). Trafilatura is HTTP-only.
2. **BrowserText fallback** — We compare Readability with browser text. Trafilatura doesn't.
3. **Domain hints** — We have per-site configs. Trafilatura doesn't.
4. **Tables** — We always extract tables in clean format. Trafilatura doesn't focus on tables.
5. **Links** — We always extract links with ref_ids. Trafilatura doesn't have this.

### Adoption Priority

| Improvement | Effort | Impact | Priority | Status |
|-------------|--------|--------|----------|--------|
| jusText fallback | Low | High | 1 | ❌ Pending |
| Link density scoring | Low | Medium | 2 | ✅ Done |
| Metadata extraction | Low | Medium | 3 | ❌ Pending |
| DOM-to-markdown | High | High | 4 | ✅ Done |
| Recall escalation | Medium | Medium | 5 | ❌ Pending |

---

*Last updated: 2026-07-27*
