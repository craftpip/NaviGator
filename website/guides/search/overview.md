# Search Overview

`web_search` finds information across the web using multiple search engines with automatic failover.

## Basic Usage

```json
{
  "queries": ["your search query"]
}
```

That's it. Navigator picks the best available engine and returns results.

## What You Get Back

Each result contains:

| Field | Description |
|-------|-------------|
| `title` | Page title |
| `snippet` | Brief description from the search engine |
| `llmText` | Extended text for LLM context |
| `ref_id` | Numeric reference for fetching/screenshotting |
| `link` | Markdown link with the ref_id |
| `url` | Direct URL to the page |

Example output:

```
Results:
- **Node.js Releases** [nodejs.org](1)
  Node.js 24.x is the current LTS release...
  
- **Version Schedule** [github.com](2)
  Upcoming releases and their status...
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `queries` | `string[]` | *required* | Search queries (one or more) |
| `limit` | `number` | `5` | Results per query |
| `engine` | `string` | `select_best` | Route selection strategy |
| `bypassCache` | `boolean` | `false` | Skip cache, fetch fresh |

## Using Reference IDs

After searching, use `ref_id` to work with results:

```json
// Fetch the first result
{ "ref_ids": [1] }

// Screenshot it
{ "ref_ids": [1], "quality": "medium" }

// Follow a link from the page
{ "ref_ids": [42] }
```

Reference IDs are faster than URLs and avoid URL resolution overhead.

## Instant Answers

Every search also queries the DuckDuckGo Instant Answer API. For factual queries, you might see a direct answer:

```
Query: What is the speed of light

**Instant Answer:** The speed of light in vacuum is exactly 299,792,458 metres per second.

Results:
...
```

Disable with `ENABLE_INSTANT_ANSWERS=0`.

## Caching

Results are cached for 5 minutes. This means:

- Repeated identical queries return instantly
- Use `bypassCache: true` for time-sensitive searches
- Cache clears on server restart

## How Routing Works

When you search with `select_best` (the default):

1. The scheduler ranks available routes by recent health
2. The top-ranked route is tried first
3. If it fails, the next route is tried automatically
4. Failed routes enter a cooldown period
5. Routes recover gradually

This means your searches almost never fail, even if individual engines are temporarily down.

See [Engines](/guides/search/engines) for the full list of available routes.

## Next Steps

- [Engines](/guides/search/engines) — Available engines and routing
- [Results](/guides/search/results) — Understanding search output
- [Tips](/guides/search/tips) — Advanced search techniques
