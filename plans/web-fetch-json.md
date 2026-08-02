# web_fetch JSON Website Content Plan

## Goal

Keep the existing `web_fetch` JSON response exactly as it is, except for the website-content field.

Today `format: "json"` returns this:

```json
{
  "count": 1,
  "successCount": 1,
  "results": [
    {
      "ok": true,
      "title": "Example",
      "url": "https://example.com",
      "text": "## Website heading\n\nWebsite paragraph in Markdown."
    }
  ]
}
```

The envelope is already correct. The problem is only `results[].text`: it contains Markdown.

Change only that field for `format: "json"` so it contains the website content as JSON:

```json
{
  "count": 1,
  "successCount": 1,
  "results": [
    {
      "ok": true,
      "title": "Example",
      "url": "https://example.com",
      "text": {
        "type": "document",
        "blocks": [
          { "type": "heading", "level": 2, "text": "Website heading" },
          {
            "type": "paragraph",
            "inlines": [
              { "type": "text", "text": "Website paragraph in " },
              { "type": "strong", "inlines": [{ "type": "text", "text": "JSON" }] },
              { "type": "text", "text": "." }
            ]
          }
        ]
      }
    }
  ]
}
```

Nothing else changes:

- Keep the existing outer `{ count, successCount, results }` envelope.
- Keep `ok`, `ref_id`, `title`, `url`, `textOriginalLength`, `truncated`, `tables`, `links`, `seo`, and `error` exactly as currently exposed.
- Keep table, link, SEO, error, truncation, link-reference, HTTP, cache, and batch behavior from the existing implementation.
- Keep default `format: "markdown"` output exactly as it is, including its website Markdown and truncation note.
- Do not rename `text` to `content`, remove fields, change table placement, or redesign the public response shape.

## Text JSON Contract

For a successful result with `format: "json"`, `text` is always a JSON document:

```json
{
  "type": "document",
  "blocks": []
}
```

It is empty when no readable website content exists. It must never contain Navigator-generated Markdown syntax such as `##`, `- item`, `[link](url)`, pipe tables, or truncation notes.

The typed blocks represent only the website content that is currently emitted as Markdown:

- `heading`: `{ "type": "heading", "level": 1, "text": "..." }`
- `paragraph`: `{ "type": "paragraph", "inlines": [...] }`
- `list`: `{ "type": "list", "ordered": false, "items": [{ "blocks": [...] }] }`
- `quote`: `{ "type": "quote", "blocks": [...] }`
- `code`: `{ "type": "code", "text": "...", "language": "js" }`
- `horizontalRule`: `{ "type": "horizontalRule" }`
- `details`: `{ "type": "details", "summary": "...", "blocks": [...] }`
- `definitionList`: `{ "type": "definitionList", "items": [{ "term": "...", "definitions": ["..."] }] }`
- `image`: `{ "type": "image", "alt": "...", "url": "..." }` when alt text is meaningful

Inline nodes are:

- `{ "type": "text", "text": "..." }`
- `{ "type": "link", "text": "...", "url": "...", "ref_id": 123 }`
- `{ "type": "strong" | "emphasis" | "delete" | "code", "inlines": [...] }`

Tables remain in the existing top-level `tables` field. Do not move or duplicate them inside `text`; that is outside this correction.

## Implementation

### 1. Preserve the existing Markdown extraction

Do not replace the existing `text` string returned by `extractTextFromHtml()` and `browserOpenAndExtract()`. It remains the canonical output for `format: "markdown"` and all existing Markdown behavior.

Alongside that existing string, produce an internal structured representation of the same selected website HTML, for example `textJson`. This is internal only and must not affect Markdown rendering.

The selected HTML is already available in each extraction branch:

- domain-hint section elements
- Readability `article.content`
- full document fallback used when browser text is more complete
- candidate/fallback content

Create the JSON structure directly from that selected, cleaned HTML with a JSDOM DOM walker. Do not parse the generated Markdown back into JSON.

### 2. Keep JSON text limited to website content

The formatter currently creates the outer JSON object in `buildOpenPageJsonPayload()` and copies `entry.text` unchanged. Change only this projection:

- Markdown formatter: continue using the existing string `entry.text`.
- JSON formatter: set its existing `text` property to `entry.textJson`.

Every other projection line in `buildOpenPageJsonPayload()` stays unchanged. In particular, retain `tables`, `links`, `seo`, length metadata, and errors in their current positions and shapes.

### 3. Build JSON blocks from the same cleaned content

Add a small DOM-to-JSON-content transformer beside the existing HTML-to-Markdown conversion. It must:

- Traverse only useful selected content after existing noise removal.
- Preserve source order.
- Convert headings, paragraphs, lists, quote, code, inline formatting, links, images, details, and definition lists using the contract above.
- Ignore presentation-only wrappers while traversing their children.
- Leave table extraction to the existing table pipeline; exclude table nodes from `textJson` just as the Markdown text pipeline does.
- Return an empty document rather than `null` for valid pages with no readable content.

For domain hints, keep their current Markdown construction unchanged. Build `textJson` from the same selected section/field HTML in parallel. Do not alter the hint schema, priorities, labels, or Markdown output.

### 4. Decorate JSON links using the existing registry

`openTargetsParallel()` already decorates the top-level `links` array and rewrites only the Markdown `text` string.

After the existing link registration, walk `result.textJson` and add the matching `ref_id` to each inline `link` node. Do not change the existing Markdown rewrite or the public `links` array.

### 5. Truncate JSON content without changing existing behavior

Keep the existing Markdown truncation behavior and metadata unchanged.

For the JSON formatter only, create a cloned, document-aware limited version of `textJson` using the requested `maxChars` budget. Preserve complete JSON nodes where possible; if a final text node must be shortened, shorten only its string value. Set the existing `truncated` flag as today.

Do not add Markdown truncation text to JSON `text`. The Markdown formatter keeps its current note.

Cached extraction entries must retain the complete `textJson`; response preparation must not mutate the cached document.

### 6. Keep cache and transport behavior unchanged

Retain the existing `format`-agnostic cache behavior. Markdown and JSON for the same URL must reuse one extraction result that contains both `text` (Markdown) and internal `textJson` (JSON content).

Keep current MCP behavior: JSON remains serialized as MCP text content. Keep current HTTP behavior: `/extract?format=json` remains an `application/json` response with the same envelope.

## Tests

Keep the existing JSON envelope tests and add focused assertions that only the website-content field changed:

1. A JSON response keeps its current count, success count, metadata, tables, links, SEO, and error fields.
2. JSON `results[0].text` is a document object, not a Markdown string.
3. Heading, paragraph, nested lists, quote, code, inline formatting, and links are typed nodes with no generated Markdown syntax.
4. Tables remain only in the existing top-level `tables` property.
5. JSON inline links receive the existing link `ref_id`; Markdown continues to render `[text][ref_id]`.
6. The default Markdown response for the same mocked result is byte-for-byte unchanged where practical, and still has string website Markdown in `text` before formatting.
7. JSON truncation preserves valid document JSON and has no Markdown truncation message; Markdown truncation behavior remains unchanged.
8. Markdown then JSON, and JSON then Markdown, reuse one call to `browserOpenAndExtract()`.
9. `/extract?format=json` returns the same envelope with object-valued `text`.

## Documentation

Update the `web_fetch` schema description and `AGENTS.md` to say:

- `format: "markdown"` returns the current readable Markdown response.
- `format: "json"` keeps the same response envelope but returns the extracted website content in `results[].text` as a typed JSON document.
- Tables, links, SEO, and all other response fields retain their existing shapes.

## Verification

```bash
docker compose exec navigator npm install --include=dev
```

Then compare the same page in both formats:

```bash
docker exec navigator curl -s "http://localhost:3000/extract?url=https://example.com" 
```

Verify that the only JSON-contract difference is `results[].text`: Markdown format renders it as Markdown; JSON format returns it as a typed JSON website-content document.
