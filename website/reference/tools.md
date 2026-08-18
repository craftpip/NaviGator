# All Tools Reference

Complete reference for every MCP tool Navigator provides.

---

## web_search

Search the web across multiple engines with automatic failover.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `queries` | `string[]` | *required* | One or more search queries |
| `limit` | `number` | `5` | Results per query |
| `engine` | `string` | `select_best` | Route selection strategy or specific route name |
| `bypassCache` | `boolean` | `false` | Skip cache, fetch fresh results |

### Output

```
Query: <query text>

**Instant Answer:** <direct answer if available>

Results:
- **<title>** [<domain>](<ref_id>)
  <snippet text>

Errors:
- <route>: "<error message>"
```

### Example

```json
{ "queries": ["Node.js LTS version"], "limit": 5 }
```

---

## web_fetch

Open pages in a real browser, render JavaScript, return clean readable text.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `urls` | `string[]` | — | URLs to fetch (mutually exclusive with `ref_ids`) |
| `ref_ids` | `number[]` | — | References from a prior `web_search` |
| `maxChars` | `number` | `90000` | Maximum characters per page |
| `bypassCache` | `boolean` | `false` | Skip cache, re-fetch |
| `format` | `string` | `readability_to_markdown` | Extraction format |

### Formats

`readability_to_markdown`, `html_to_markdown`, `text`, `html`, `table`, `table_json`, `table_csv`, `list`, or any configured AI model id.

### Output

Clean markdown text with inline links (`[text](ref_id)`), tables, and warnings.

### Example

```json
{ "urls": ["https://example.com"], "maxChars": 15000 }
```

---

## web_page_screenshot

Capture rendered page appearance as JPEG images.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `urls` | `string[]` | — | URLs to screenshot |
| `ref_ids` | `number[]` | — | References from a prior `web_search` |
| `targetId` | `string` | — | Screenshot an existing DevTools tab |
| `quality` | `string` | `medium` | `low` (30), `medium` (55), `high` (75) |
| `fullPage` | `boolean` | `true` | Capture entire scrollable page |
| `output` | `string` | `base64` | `base64`, `file`, or `url` |

### Output

Inline base64 JPEG, file path, or download URL.

### Example

```json
{ "urls": ["https://example.com"], "quality": "low", "fullPage": false }
```

---

## web_page_links

Resolve inline link reference IDs from `web_fetch` output to their full URLs.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `ref_ids` | `number[]` | One or more inline link reference IDs |

### Output

```
- (<ref_id>): <url>
```

### Example

```json
{ "ref_ids": [42, 43] }
```

---

## web_page_ascii

Capture a webpage as a Chafa-style half-block render with element markers.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | — | Single URL to render |
| `ref_id` | `number` | — | Reference from a prior `web_search` |
| `width` | `number` | `100` | Render width in characters (40–200) |
| `fullPage` | `boolean` | `false` | Capture full scrollable page |
| `mode` | `string` | `color_ansi` | `color_ansi`, `grayscale_ansi`, or `ascii` |
| `elementLimit` | `number` | `25` | Maximum annotated elements (1–100) |
| `includeSelector` | `boolean` | `true` | Include CSS selectors in legend |
| `includeXpath` | `boolean` | `true` | Include XPaths in legend |

### Output

ANSI render in a code block + element legend markdown table.

### Example

```json
{ "url": "https://example.com", "width": 120, "mode": "ascii" }
```

---

## DevTools Tools (19)

Enabled with `ENABLE_DEVTOOLS_MCP=1`. All tools require a `targetId` from `Target.createTarget`.

### Target Management

| Tool | Parameters | Description |
|------|------------|-------------|
| `Target.createTarget` | `url?`, `targetId?`, `viewport?` | Create a persistent tab |
| `Target.getTargets` | — | List open tabs |
| `Target.closeTarget` | `targetId` | Close a tab |

### Navigation

| Tool | Parameters | Description |
|------|------------|-------------|
| `Page.navigate` | `targetId`, `url` | Navigate to URL |
| `Page.reload` | `targetId`, `ignoreCache?` | Reload page |
| `Page.goBack` | `targetId` | Browser back |
| `Page.goForward` | `targetId` | Browser forward |

### DOM Inspection

| Tool | Parameters | Description |
|------|------------|-------------|
| `DOM.getDocument` | `targetId`, `limit?` | Get page structure |
| `DOM.querySelector` | `targetId`, `selector?`, `xpath?` | Find single element |
| `DOM.querySelectorAll` | `targetId`, `selector?`, `xpath?`, `limit?` | Find multiple elements |
| `DOM.getOuterHTML` | `targetId`, `selector?`, `xpath?`, `maxChars?` | Get raw HTML |
| `DOM.scrollIntoViewIfNeeded` | `targetId`, `selector?`, `xpath?` | Scroll element into view |

### Input

| Tool | Parameters | Description |
|------|------------|-------------|
| `Input.dispatchMouseEvent` | `targetId`, `selector?`, `xpath?`, `button?`, `clickCount?` | Click element |
| `Input.insertText` | `targetId`, `text`, `selector?`, `xpath?` | Type text |
| `Input.dispatchKeyEvent` | `targetId`, `key`, `modifiers?`, `text?` | Keyboard event |

### Runtime & Network

| Tool | Parameters | Description |
|------|------------|-------------|
| `Runtime.evaluate` | `targetId`, `expression` | Execute JavaScript |
| `Runtime.getConsoleMessages` | `targetId`, `limit?` | Read console output |
| `Network.getRequests` | `targetId`, `limit?`, `filter?`, `failedOnly?`, `status?` | View network requests |
