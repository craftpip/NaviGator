# First Search

Test that Navigator is working by running your first web search.

## The Basic Flow

1. **Search** the web
2. **Read** the best result
3. **Get** your answer

## Step 1: Search

Ask your agent to search for something:

> "Search for the latest Node.js LTS version"

Your agent calls `web_search`:

```json
{
  "queries": ["Node.js LTS version 2026"],
  "limit": 5
}
```

Navigator returns results with reference IDs:

```
Query: Node.js LTS version 2026

Results:
- **Node.js Releases** [nodejs.org](1)
  Node.js 24.x is the current LTS release...
  
- **Node.js Version Schedule** [github.com](2)
  Upcoming LTS releases and their status...
```

## Step 2: Read the Page

The agent picks the best result and reads it:

```json
{
  "ref_ids": [1]
}
```

Navigator opens the page in a real browser, renders JavaScript, and returns clean text:

```
# Node.js Releases

Current LTS: Node.js 24.x
Release date: April 2026
...
```

## Step 3: Get the Answer

Your agent now has the information and can answer your question.

## Understanding Reference IDs

Every search result gets a **reference ID** (the number in parentheses). These let you:

- **Fetch the page** without copying URLs: `web_fetch(ref_ids: [1])`
- **Screenshot it**: `web_page_screenshot(ref_ids: [1])`
- **Follow links** from the page: `web_page_links(ref_ids: [42])`

Reference IDs are session-local — they work until the server restarts.

## Trying More Tools

### Screenshot a page

> "Take a screenshot of https://github.com"

```json
{
  "urls": ["https://github.com"],
  "quality": "low"
}
```

### Read a page directly

> "Read the article at https://example.com/article"

```json
{
  "urls": ["https://example.com/article"]
}
```

### Search with multiple queries

> "Compare React and Vue for a new project"

```json
{
  "queries": [
    "React vs Vue 2026 comparison",
    "React pros cons 2026",
    "Vue pros cons 2026"
  ],
  "limit": 5
}
```

## Tips

- Use multiple query variations for better coverage
- Reference IDs are faster than URLs — prefer them when possible
- The cache stores results for 5 minutes, so repeated queries are instant
- Use `bypassCache: true` for breaking news or live data

## Next Steps

- [Search Overview](/guides/search/overview) — Learn more about web_search
- [Extraction Overview](/guides/extraction/overview) — Understand web_fetch
- [Screenshot Overview](/guides/screenshots/overview) — Capture pages visually
