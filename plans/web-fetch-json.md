# web_fetch JSON Output - Validated Plan

## Goal

Add an output `format` to `web_fetch` and `GET /extract`:

- `markdown` is the default and retains the current human-readable response.
- `json` returns a stable, structured extraction payload for callers that need text, tables, links, and SEO data without parsing Markdown.

This is a response-format feature. Page navigation and extraction stay shared between both formats.

## Validated Current State

The extraction pipeline is already structured, and `web_fetch` caches the unformatted `openTargetsParallel()` result. Markdown formatting happens after the cache read on both the cache-hit and cache-miss paths.

There are a few implementation details the original plan must account for:

1. `browserOpenAndExtract()` currently returns table objects as `{ caption, context, headers, rows }`, not just `{ context, headers, rows }`.
2. Extracted links are currently `{ href, text }`. `openTargetsParallel()` registers their URLs and rewrites Markdown links in `text`, but it does not put a `ref_id` on the stored link objects.
3. A successful single-page fetch is stored as one entry, while multi-page fetches use `{ count, successCount, results }`. JSON must normalize both cases into one public shape.
4. `format` would currently be part of the web-fetch cache key because only `maxChars` is excluded. It must be excluded too: cache the shared structured extraction once, then format it per request.
5. Truncation is not format-neutral today. `browserOpenAndExtract()` and `truncateResultsText()` append a Markdown truncation note directly to `text`. A JSON response should instead expose metadata. Move that presentation note into the Markdown formatter while retaining extraction-level truncation metadata.
6. `maxChars` is a response limit over the cached extraction. The extractor is currently called with its default extraction limit, so a later request with a larger `maxChars` cannot restore text that was already capped during extraction. Preserve that existing behavior; document the reported original length rather than claiming JSON returns unlimited content.

## Public JSON Contract

Always return one envelope, including for a single successful URL:

```json
{
  "count": 1,
  "successCount": 1,
  "results": [
    {
      "ok": true,
      "ref_id": 1644,
      "title": "Low on 10 year average earnings",
      "url": "https://www.screener.in/screens/6994/low-on-10-year-average-earnings/",
      "text": "Graham liked to value stocks...",
      "textOriginalLength": 8234,
      "truncated": false,
      "tables": [
        {
          "caption": "Table 1",
          "context": "Value stocks",
          "headers": ["S.No.", "Name", "CMP Rs.", "P/E"],
          "rows": [["1.", "Coal India", "414.15", "8.18"]]
        }
      ],
      "links": [
        {
          "ref_id": 1655,
          "url": "https://example.com/pratyush",
          "text": "Pratyush"
        }
      ],
      "seo": {
        "title": "...",
        "mainContentText": "...",
        "candidates": []
      }
    }
  ]
}
```

An unsuccessful entry has only the applicable public fields:

```json
{
  "ok": false,
  "ref_id": 1644,
  "url": "https://example.com",
  "error": "upstream navigation failed"
}
```

Rules:

- Keep `ok` on every entry. It is required to distinguish partial batch failures; removing it does not meaningfully reduce output.
- Omit absent optional fields instead of returning empty placeholders.
- Do not expose the internal `index` field.
- Preserve table cells as strings. Do not coerce financial-looking values to numbers.
- Keep full, already-sanitized `seo` data. `buildSeoAnalysis()` limits candidate counts and snippets, so no new SEO extraction path is needed.
- `truncated` is true when either the extractor had to cap the source text or this response applied the requested `maxChars` limit. `textOriginalLength` remains the best available source-text length.
- Compact `JSON.stringify(payload)` is the intended wire format. MCP still returns it in a `content: [{ type: "text", text }]` response so clients without `structuredContent` support can consume it.

## Implementation

### 1. Make truncation metadata format-neutral

Update `src/search.js` in `browserOpenAndExtract()` so it does not append `*(Response truncated ...)*` to `result.text`.

- Retain the existing extraction cap and `textOriginalLength` produced by `extractTextFromHtml()`.
- Add an explicit `truncated` boolean to the returned extraction result when `textOriginalLength > extracted.text.length` or adding extracted tables causes the result to exceed the extraction limit.
- Keep the actual text free of Markdown-only presentation notices.

Replace `truncateResultsText()` in `src/mcp-server.js` with a format-neutral response preparation helper that clones entries, applies a requested `maxChars` text cap, and sets `truncated` plus `textOriginalLength`. It must not mutate cached payloads or add a Markdown note.

`formatOpenPageResponse()` appends the existing human-readable truncation note when `entry.truncated` is true. This keeps default Markdown behavior materially unchanged. The JSON formatter emits the metadata only.

### 2. Decorate links before caching

In `openTargetsParallel()`:

- Register every `page.links[].href` with `rememberLink()` as today.
- Replace the cached `result.links` with public link entries `{ ref_id, url, text }`.
- Keep Markdown link-reference rewriting working by matching the same decorated URLs.

This makes JSON link IDs immediately usable with `web_page_links(ref_id)` and `web_fetch(ref_id)`.

### 3. Add a public JSON formatter

Add `formatOpenPageJson(payload)` beside `formatOpenPageResponse()` in `src/mcp-server.js`.

- Use `normalizeResultEntries(payload)` to handle cached single-page and batch payloads.
- Create the consistent `{ count, successCount, results }` envelope described above.
- Project each entry to public fields, preserving `ok`, `ref_id`, `title`, `url`, `text`, `textOriginalLength`, `truncated`, `tables`, `links`, `seo`, and `error` where applicable.
- Do not include `results: undefined`, the internal `index`, or Markdown-only truncation text.
- Return `asMarkdownContent(JSON.stringify(jsonPayload))`. The helper name is historical; it creates an MCP text content object and does not set a Markdown MIME type.

### 4. Add and normalize `format`

Add this property to the `web_fetch` schema:

```js
format: {
  type: "string",
  enum: ["markdown", "json"],
  default: "markdown",
  description: "Response format: markdown (default) or json (structured extraction data)."
}
```

Add a small `parseOpenPageFormat(value)` helper so the MCP dispatcher and HTTP endpoint share the same default. Accept only `json` as JSON; use `markdown` otherwise for the HTTP query endpoint.

### 5. Cache by extraction arguments only

Replace `excludeMaxChars(getCacheArgs(args))` with a web-fetch cache-argument helper that removes all read-time arguments:

```js
const { maxChars, format, ...cacheArgs } = getCacheArgs(args);
return cacheArgs;
```

Use the selected formatter after response preparation in both `handleToolCallInner()` paths:

- Cache hit: cached structured result -> prepare for requested `maxChars` -> selected formatter.
- Cache miss: extraction -> cache structured result -> prepare for requested `maxChars` -> selected formatter.

`bypassCache` remains excluded by `getCacheArgs()`.

### 6. Add `/extract?format=json`

In the `/extract` handler:

- Read `format` with `parseOpenPageFormat(url.searchParams.get("format"))`.
- Prepare the result with the same format-neutral truncation helper as MCP.
- For `json`, call `sendJson(res, 200, formatOpenPageJsonPayload(prepared))` so the body is JSON and the content type is `application/json`.
- For `markdown`, call the existing `sendMarkdown()` path with `formatOpenPageResponse(prepared).content[0].text`.

Keep the endpoint uncached, as it is today. Its response shape must be identical to the MCP JSON text after parsing.

## Tests

Update `tests/mcp-server.test.js`:

1. Extend the web-fetch schema assertion with `format` and verify its enum and default.
2. Add a JSON MCP test using mocked text, a table with `caption/context/headers/rows`, links with `href/text`, and SEO data. Parse `body.result.content[0].text` and verify the public envelope, string table cells, decorated link `ref_id`, and no `index` field.
3. Add a partial-batch JSON test confirming successful and failed entries preserve their individual `ok` values and errors.
4. Add a truncation test. JSON must expose `truncated: true`, retain `textOriginalLength`, and contain no `Response truncated` Markdown text. Markdown must still show its truncation note.
5. Add an HTTP `GET /extract?url=...&format=json` test for `application/json` and the same parsed shape.
6. Add a cache test: fetch Markdown first, then JSON for the same URL, and assert `browserOpenAndExtract` ran once. Repeat in the reverse order if practical. This proves `format` is excluded from the cache key.
7. Update existing tests that assert the exact schema-property list.

Add or update `tests/search.test.js` to verify extraction returns truncation metadata rather than embedding the Markdown note.

## Documentation

Update the `web_fetch` section in `AGENTS.md`:

- Add `format: "markdown" | "json"`.
- Describe JSON as the structured `{ count, successCount, results }` response.
- Correct stale details while touching this section: `maxTableRows` is not in the live schema, and the `web_page_links` description incorrectly refers to a `## Links` section even though Markdown emits references inline.

## Verification

Run inside the container after its normal dev-dependency install step:

```bash
docker compose exec navigator npm install --include=dev
docker compose exec navigator npx vitest run tests/mcp-server.test.js tests/search.test.js
docker compose exec navigator npm run lint
```

Then validate both representations through the running HTTP server:

```bash
docker exec navigator curl -s "http://localhost:3000/extract?url=https://example.com&format=json" | python3 -m json.tool
docker exec navigator curl -s "http://localhost:3000/extract?url=https://example.com&maxChars=2000"
```

Finally, use `mcporter` to confirm the MCP transport returns parseable JSON text:

```bash
npx --yes mcporter call local-navigator.web_fetch --config <config> '{"url":"https://example.com","format":"json"}'
```
