# Search Overview

<span class="tool-name">web_search</span> finds information across the web using multiple search engines with automatic failover.

## Request Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `queries` | `string[]` | *required* | One or more search queries to run (query variations) |
| `limit` | `number` | `5` | Results per query |
| `engine` | `string` | `select_best` | `select_best` auto-picks the best engine; or name an explicit registered route |
| `bypassCache` | `boolean` | `false` | Skip cached data and refresh the response |

## What You Get Back

Markdown output (`queries: ["who is Albert Einstein"]`):

```
Query: who is Albert Einstein

**Instant Answer:** Albert Einstein was a German-born theoretical physicist best known
for developing the theory of relativity. His mass–energy equivalence formula E = mc²
has been called "the world's most famous equation". He received the 1921 Nobel Prize
in Physics for his services to theoretical physics.

Results:
- **Albert Einstein | Biography, Relativity, Education, Discoveries ...** [britannica.com](5711)
  German-born physicist best known for developing the theory of relativity…

- **Albert Einstein – Biographical - NobelPrize.org** [nobelprize.org](5712)
  The Nobel Prize in Physics 1921 was awarded to Albert Einstein "for his services
  to Theoretical Physics, and especially for his discovery of the law of the
  photoelectric effect"…
```

## Instant Answers

Every search also queries the DuckDuckGo Instant Answer API — the example above shows a direct answer
returned alongside results. It is free with no published rate limit and no paid tier.

> Disable with `ENABLE_INSTANT_ANSWERS=0`

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

You can also use `urls: ["https://..."]` directly — `ref_id` is just faster and avoids URL resolution
overhead.

> Turn off reference ID conversion with `LINK_REFS=0`

## Caching

Results are cached for 5 minutes. This means:

- Repeated identical queries return instantly
- Use `bypassCache: true` for time-sensitive searches
- Cache clears on server restart

## Next Steps

- [Engines](/guides/search/engines) — Available engines and routing
- [Results](/guides/search/results) — Understanding search output
- [Tips](/guides/search/tips) — Advanced search techniques
