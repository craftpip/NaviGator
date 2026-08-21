# Search Results

Understand what Navigator returns from a search and how to use the results.

## Response Format

A search returns results organized by query:

```
Query: Node.js LTS version

**Instant Answer:** Node.js 24.x is the current LTS...

Results:
- **Node.js Releases** [nodejs.org](1)
  Current LTS: Node.js 24.x. Release date: April 2026...
  
- **Version Schedule** [github.com](2)
  Upcoming LTS releases and their support status...
```

## Reference IDs

Every result gets a unique `ref_id`. This is a number you can use to:

```json
// Fetch the page content
{ "ref_ids": [1] }

// Take a screenshot
{ "ref_ids": [1], "quality": "low" }

// Follow a link from that page
{ "web_page_links": { "ref_ids": [42] } }
```

Reference IDs are session-local — they work until the server restarts.

## Multiple Queries

When you search with multiple queries, results are grouped:

```
Query 1: React vs Vue 2026
Query 2: React performance comparison

Results:
- **React vs Vue** [blog.example.com](1)
  ...
- **Performance Benchmarks** [benchmarks.dev](2)
  ...
```

Results from different queries may overlap. Navigator deduplicates by URL.

## Instant Answers

For factual queries, you may see a direct answer before the results:

```
Query: What is the capital of France

**Instant Answer:** Paris is the capital of France.

Results:
- **Paris** [wikipedia.org](1)
  ...
```

Instant answers come from the DuckDuckGo Instant Answer API and appear when available.

## Caching

Results are cached for 5 minutes. The same query within 5 minutes returns instantly from cache.

To bypass the cache:

```json
{
  "queries": ["breaking news today"],
  "bypassCache": true
}
```

## Next Steps

- [Tips](/guides/search/tips) — Advanced search techniques
- [Extraction Overview](/guides/extraction/overview) — Read page content
