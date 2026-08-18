# Extraction Overview

`web_fetch` opens any URL in a real browser, renders JavaScript, and returns clean readable text. Navigator handles the messy work — navigation, stabilization, cleanup — so you get content your agent can use.

## Basic Usage

```json
{
  "urls": ["https://example.com/article"]
}
```

Navigator returns cleaned, structured content:

```
# Article Title

Article content with paragraphs, headings, and structure...

## Table: Data
| Column 1 | Column 2 |
|----------|----------|
| value    | value    |

Links:
- [Related Article](42)
- [Source Code](43)
```

## What You Get

| Component | Description |
|-----------|-------------|
| **Readable text** | Cleaned content with headings and paragraphs |
| **Tables** | Extracted and formatted as markdown or pipe-separated |
| **Links** | Inline as `[text](ref_id)`, resolvable with `web_page_links` |
| **SEO metadata** | Title, description, canonical URL |
| **Warnings** | Any issues encountered during extraction |

## How It Works

1. **Navigate** to the URL in a real Chromium browser
2. **Wait** for the page to stabilize (JavaScript renders, network settles)
3. **Apply** domain hints if they exist for this site
4. **Extract** content using the best available method:
   - Domain hint selectors (if configured)
   - Mozilla Readability (strips nav, ads, sidebars)
   - Semantic block detection (finds article-like content)
   - Body text fallback

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `urls` | `string[]` | — | URLs to fetch (use this OR `ref_ids`) |
| `ref_ids` | `number[]` | — | References from a prior `web_search` |
| `maxChars` | `number` | `90000` | Maximum characters per page |
| `bypassCache` | `boolean` | `false` | Skip cache, re-fetch |
| `format` | `string` | `readability_to_markdown` | Extraction format |

## Using Reference IDs

Fetch search results directly:

```json
// Search first
{ "queries": ["React hooks guide"], "limit": 5 }

// Then fetch the best result
{ "ref_ids": [1] }
```

This is faster than copying URLs and avoids URL resolution.

## When to Use What

| Situation | Tool |
|-----------|------|
| "Read this article" | `web_fetch` |
| "What does this page say about X" | `web_fetch` |
| "Get the data from this table" | `web_fetch` with `format: "table"` |
| "See what this page looks like" | `web_page_screenshot` |
| "Click this button" | DevTools tools |

## Next Steps

- [Extractor Formats](/guides/extraction/formats) — Choose the right format
- [Domain Hints](/guides/extraction/domain-hints) — Per-site extraction rules
- [Link Navigation](/guides/extraction/links) — Follow links deeper
