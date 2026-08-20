# Screenshot Overview

Capture what web pages actually look like. `web_page_screenshot` takes JPEG screenshots of any page — full-page or viewport-only.

## Basic Usage

```json
{
  "urls": ["https://example.com"]
}
```

Returns an inline base64 JPEG image.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `urls` | `string[]` | — | URLs to screenshot (use this OR `ref_ids` OR `targetId`) |
| `ref_ids` | `number[]` | — | References from a prior `web_search` |
| `targetId` | `string` | — | Screenshot an existing DevTools tab |
| `quality` | `string` | `medium` | `low` (30), `medium` (55), or `high` (75) |
| `fullPage` | `boolean` | `true` | Capture entire scrollable page |
| `output` | `string` | `base64` | `base64`, `file`, or `url` |

## Quality Presets

| Preset | JPEG Quality | File Size | When to use |
|--------|-------------|-----------|-------------|
| `low` | 30 | Smallest | Quick checks, layout verification |
| `medium` | 55 | Balanced | General use, most tasks |
| `high` | 75 | Largest | Detail inspection, final verification |

## Full Page vs Viewport

**Full page** (`fullPage: true`, default):
Captures everything, including content below the fold. Good for seeing the complete layout.

**Viewport only** (`fullPage: false`):
Captures only what's visible in the browser window. Good for seeing what a user sees on load.

```json
// Full page
{ "urls": ["https://example.com"], "fullPage: true }

// Viewport only
{ "urls": ["https://example.com"], "fullPage: false }
```

## Using Reference IDs

Screenshot search results directly:

```json
// Search
{ "queries": ["React documentation"], "limit": 5 }

// Screenshot the first result
{ "ref_ids": [1], "quality": "low" }
```

## Screenshot a DevTools Tab

If you have an open DevTools tab:

```json
{
  "targetId": "ABC123",
  "quality": "high",
  "fullPage": false
}
```

## Tips

- Use `low` quality for quick visual checks
- Use `fullPage: false` to see the "above the fold" experience
- Pair with `web_fetch` — screenshot for visual context, fetch for text
- Screenshots include JavaScript-rendered content

## Next Steps

- [ASCII Renders](/guides/screenshots/ascii) — Terminal-friendly renders
- [Output Options](/guides/screenshots/output) — File and URL output
