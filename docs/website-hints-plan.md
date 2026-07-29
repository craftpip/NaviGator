# Website Hints — Content-Focused Extraction Plan

## Current Situation

Domain hints exist only for extraction *mechanics*: `waitForSelector`, `preferReadability`, `contentSelectors`, `skipSelectors`, `navigationWait`, `tableExtraction`, and `flags`. These control how the browser waits and which parts of the DOM are candidates for text extraction.

But the actual text extraction pipeline is the same for every page:

```
extractTextFromHtml()
  → Remove NON_CONTENT_SELECTORS (nav, footer, scripts, etc.)
  → If hint.skipSelectors, remove those too
  → Extract HTML <table> elements (unless disabled)
  → If preferReadability != false:
      → Try Readability.parse()
      → If article has text, use that
  → Fall back to collectCandidateBlocks()
      → Iterate SEMANTIC_CONTENT_SELECTORS (main, article, [role=main], etc.)
      → Score each block by length, link density, headings, depth
      → Pick the best candidate
  → If nothing found, use document.body.textContent
```

This has no concept of **page type** or **what content matters**. A GitHub profile gets the same treatment as a news article — Readability captures the profile README but misses the sidebar (name, bio, followers), pinned repos, and contribution graph. A GitHub issue list gets the same treatment as a Wikipedia article.

## Goal

For each domain + page type, write `content.sections` in the hint that define exactly which parts of the page carry useful content. The extraction pipeline then targets those sections, formats them as proper Markdown (`## Section Header`), and ignores everything else.

If no hint or no `content.sections` exists, fall back to the current generic pipeline (Readability → `collectCandidateBlocks` → body text).

## New Hint Fields

```json
{
  "domain": "github.com",
  "pathPattern": "/<user>$",
  "pageType": "profile",
  "waitForSelector": "turbo-frame#user-profile-frame",
  "navigationWait": 2000,
  "content": {
    "sections": [
      { "selector": "div.Layout-sidebar", "label": "Profile", "priority": "high" },
      { "selector": "ol.js-pinned-items-reorder-list", "label": "Pinned Repositories", "priority": "high" },
      { "selector": "turbo-frame#user-profile-frame", "label": "Contributions", "priority": "medium" }
    ]
  }
}
```

### New Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pageType` | `string` | yes | What kind of page: `profile`, `article`, `homepage`, `issues`, `prs`, `data-table`, `video`, `visual-only`, etc. |
| `content.sections` | `array` | no | Ordered list of CSS selectors defining what content to extract |
| `content.sections[].selector` | `string` | yes | CSS selector for a content block |
| `content.sections[].label` | `string` | yes | Heading label for this section in output (e.g. `"Pinned Repositories"`) |
| `content.sections[].priority` | `string` | yes | `high` = always include, `medium` = include if non-empty, `low` = include if room after higher priorities |

## Output Format

Each section is rendered as Markdown:

```markdown
## Profile

Boniface Pereira (craftpip)
☁️ Life is a big thrown exception.
Full stack web developer. A modern caveman.
India · https://boniface.pe/eira
116 followers · 7 following

## Pinned Repositories

- **jquery-confirm** — A multipurpose plugin for alert, confirm & dialog (JavaScript, ★1.9k)
- **copycat** — Sync your Spotify music with your MP3 player! (Python, ★5)
- **process-handler** — Get list of running processes by name or pid (PHP, ★8)

## Contributions

788 contributions in the last year
```

So:

```
## <label>

<text content of the section, cleaned>
```

Sections are concatenated in priority order, separated by a blank line.

## Extraction Flow Change

### In `extractTextFromHtml()` (search.js)

```
if hint.content?.sections exists:
  1. Apply skipSelectors (remove nav/footer noise)
  2. For each section sorted by priority high→low:
     - querySelectorAll(selector)
     - collect textContent
     - normalize and clean
     - format as "## <label>\n\n<text>"
     - add to output if it passes priority filter
  3. Extract tables from HTML <table> elements (unless disabled)
  4. Strip raw tab-separated table noise from output
  5. Insert clean formatted tables
  6. Truncate to maxChars

else:
  Fall back to current: Readability → collectCandidateBlocks → body text
```

### No changes to

- `waitForSelector`, `navigationWait`, `preferReadability`, `skipSelectors`, `tableExtraction`, `flags` — remain as-is for browser wait behavior.
- No hint data exposed in output (hints are internal only).
- All rules live in `domain-hints.json` — no hard-coded selectors.

## Examples

### GitHub Profile

```json
{
  "domain": "github.com",
  "pathPattern": "/<user>$",
  "pageType": "profile",
  "waitForSelector": "turbo-frame#user-profile-frame",
  "navigationWait": 2000,
  "content": {
    "sections": [
      { "selector": "div.Layout-sidebar", "label": "Profile", "priority": "high" },
      { "selector": "ol.js-pinned-items-reorder-list", "label": "Pinned Repositories", "priority": "high" },
      { "selector": "turbo-frame#user-profile-frame", "label": "Contributions", "priority": "medium" }
    ]
  }
}
```

### GitHub Issues

```json
{
  "domain": "github.com",
  "pathPattern": "/<user>/<repo>/issues",
  "pageType": "issues",
  "waitForSelector": "turbo-frame#repo-content-turbo-frame",
  "content": {
    "sections": [
      { "selector": "div.js-issue-row", "label": "Issues", "priority": "high" }
    ]
  }
}
```

### NDTV Article

```json
{
  "domain": "www.ndtv.com",
  "pathPattern": "/article/**",
  "pageType": "article",
  "content": {
    "sections": [
      { "selector": "article.vjl-Mid-2", "label": "Article", "priority": "high" },
      { "selector": "main.vjl-cnt", "label": "More", "priority": "low" }
    ]
  }
}
```

### NDTV Homepage

```json
{
  "domain": "www.ndtv.com",
  "pathPattern": "/?$",
  "pageType": "homepage",
  "content": {
    "sections": [
      { "selector": "main.vjl-cnt", "label": "Headlines", "priority": "high" }
    ]
  }
}
```

### NSE Option Chain

```json
{
  "domain": "nseindia.com",
  "pathPattern": "/option-chain*",
  "pageType": "data-table",
  "waitForSelector": "#optionChainTable",
  "navigationWait": 6000,
  "content": {
    "sections": [
      { "selector": "div.top-header", "label": "Summary", "priority": "high" }
    ]
  }
}
```

### Wikipedia

```json
{
  "domain": "en.wikipedia.org",
  "pathPattern": "/wiki/**",
  "pageType": "article",
  "skipSelectors": [".navbox", ".navbox-styles", ".mw-empty-elt"],
  "content": {
    "sections": [
      { "selector": "main#content", "label": "Article", "priority": "high" }
    ]
  }
}
```

### YouTube Video

```json
{
  "domain": "www.youtube.com",
  "pathPattern": "/watch**",
  "pageType": "video",
  "content": {
    "sections": [
      { "selector": "ytd-watch-flexy", "label": "Video", "priority": "high" }
    ]
  }
}
```

## Implementation Steps

1. Update `extractTextFromHtml()` in `src/search.js` to handle `content.sections` — collect text from each section selector, format as `## <label>\n\n<text>`, merge by priority.
2. Add `pageType` and `content.sections` to all 53 `domain-hints.json` entries.
3. Keep the existing fallback (Readability → candidate blocks → body text) when no `content.sections` exists.
4. Remove all `hintApplied` output (no hint data in LLM output).
5. Copy to Docker, restart, test key sites.

## Future Possibilities (not in scope now)

- `content.labels` — structured field extraction (title, author, date, etc.) for known page types.
- `content.sections[].maxChars` — per-section truncation.
- `content.sections[].format` — format hint (`text`, `list`, `key-value`, `table`).
- Dynamic `pathPattern` matching with named groups (e.g., extract username from path).
