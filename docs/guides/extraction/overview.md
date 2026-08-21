# Fetch Overview

`web_fetch` opens any URL in a real browser, renders JavaScript, and returns clean readable text. Navigator handles the messy work — navigation, stabilization, cleanup — so you get content your agent can use.

## Flow

```
        ┌─────────────────────────────────────────────────┐
        │ Domain Hint — "*"                               │
URL ───→│ Browser → Extractor → Post-processor → Response │──→ User
        └─────────────────────────────────────────────────┘
          per-site hints override default
```

Browser stabilizes the HTML, the extractor converts HTML → markdown, and the post-processor refines it — response stays inside the box before going to the user.

All defaults above are defined in [Domain Hints](/guides/extraction/domain-hints) — this page is the wildcard `domain: "*"` default; per-site hints override it.

## Request

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `urls` | `string[]` | — | URLs to fetch (use this OR `ref_ids`) |
| `ref_ids` | `number[]` | — | References from a prior `web_search` |
| `maxChars` | `number` | `90000` | Maximum characters per page |
| `bypassCache` | `boolean` | `false` | Skip cache, re-fetch |
| `format` | `string` | `readability_to_markdown` | Extraction format |

## Response

Markdown output (`urls: ["https://example.com"]`):

```
### [Example Domain](2)
- Status: Success
- URL: https://example.com/

This domain is for use in documentation examples without needing permission. Avoid use in operations.

[Learn more](3)
```

## Reference IDs & Links

Search results and every fetched page give you ref_ids. Search results appear as `[title](ref_id)`, and page links appear inline:

```
Check the [official documentation](42) for more details.
- [Related Guide](43)
```

The number is the ref_id — use it with `web_fetch` or `web_page_links` for both search results and page links. They're faster than URLs, deduped, keep their heading context, and are stored in SQLite so they survive restarts.

## Truncation

Text is capped at `maxChars` (default `90000`, up to `200000`). Large tables can push the total over `maxChars` — a `*(Response truncated — full page is 12345 chars, increase maxChars to see more)*` notice is appended.

> `WEB_FETCH_MAX_CHARS=90000` — default, change it to raise the cap

## Parallel Fetching

Pass multiple `urls` or `ref_ids` at once — pages open in parallel and each is stabilized independently. Use `ref_ids` from `web_search` for the fastest path.

> `OPEN_PAGE_MAX_PARALLEL` and `MAX_CONCURRENT_PAGE_OPS` bound how many pages can be open at once

## Stabilization

Every fetch stabilizes the page before extracting. The strategy lives in the wildcard hint (`domain: "*"` ) as `default.stabilizeStrategy`.

Default:

> `network_idle` — wait until 500ms of no network traffic (plus any `waitForSelector` you set)

Other methods:

| Method | What It Waits For |
|--------|-------------------|
| `network_idle` | 500ms with no network requests (default) |
| `content_idle` | Rendered text appears and settles |
| `mutation` | DOM stops changing |
| `none` | No wait — extract right after load |

You can also set `waitForSelector` — extraction waits until those selectors all appear (up to `BROWSER_OP_TIMEOUT_MS`, default `60000` ms) before stabilizing.

## Caching

Pages are cached for 5 minutes. Use `bypassCache: true` to force a fresh load. `maxChars` is excluded from the cache key, so a cached page can be re-read with a different `maxChars` without re-fetching.

## When to Use What

| Situation | Tool |
|-----------|------|
| "Read this article" | `web_fetch` |
| "What does this page say about X" | `web_fetch` |
| "Get the data from this table" | `web_fetch` with `format: "table"` |
| "See what this page looks like" | `web_page_screenshot` |
| "Click this button" | DevTools tools |

## Next Steps

- [Extraction Methods](/guides/extraction/formats) — Choose the right extraction method
- [Domain Hints](/guides/extraction/domain-hints) — Per-site extraction rules
