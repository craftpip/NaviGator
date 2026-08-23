# Screenshot Overview

`web_page_screenshot` opens any URL in a real browser, renders JavaScript, and returns a JPEG of what the page actually looks like. Navigator handles navigation and rendering — you get a visual you can use.

## Flow

```
        ┌─────────────────────────────────┐
URL ───→│ Browser → Screenshot → Response │──→ User
        └─────────────────────────────────┘
              fullPage / quality
```

Browser renders the page (including JS), the screenshot captures it as a JPEG (full-page or viewport), and the response returns it as base64/file/url.

## Request

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `urls` | `string[]` | — | URLs to screenshot (use this OR `ref_ids` OR `targetId`) |
| `ref_ids` | `number[]` | — | References from a prior `web_search` |
| `targetId` | `string` | — | Screenshot an existing DevTools tab |
| `quality` | `string` | `medium` | `low` (30), `medium` (55), or `high` (75) |
| `fullPage` | `boolean` | `true` | Capture entire scrollable page |
| `viewport` | `object` | — | `{ width, height }` — `fullPage: true` → only `width` is applied; `fullPage: false` → both `width` and `height` are applied |
| `output` | `string` | `base64` | `base64`, `file`, or `url` |

## Response

With `output: "base64"` (default):

```
Captured 1 screenshot(s); 1 succeeded.

### [Example Domain](2)
- Status: Success
- URL: https://example.com/
- Content-Type: image/jpeg

![Example Domain](data:image/jpeg;base64,/9j/...)
```

The `data:image/jpeg;base64,...` string is the JPEG.

For `output: "file"` (`File: ...`) and `output: "url"` (`Download: http://localhost:1994/download/<uuid>`) see [Screenshot Output](/guides/screenshots/output) — they require `ENABLE_SCREENSHOT_PATH` / `ENABLE_SCREENSHOT_DOWNLOAD_LINK` (and the `/tmp/screenshots:/app/screenshots` bind for Docker).

## Quality Presets

| Preset | JPEG Quality | File Size | Use for |
|--------|-------------|-----------|---------|
| `low` | 30 | 1× | Layout checks — text is not reliably OCRable |
| `medium` | 55 | ~1.38× | **Recommended** — crisp, fully OCRable text at balanced size |
| `high` | 75 | ~1.78× | Final verification — maximum detail |

## Viewport

`viewport: { width, height }` controls the browser viewport:

- `fullPage: true` — only `width` is applied (height is the full scrollable height)
- `fullPage: false` — both `width` and `height` are applied

```json
// Full page — width only
{ "urls": ["https://example.com"], "fullPage": true, "viewport": { "width": 1280 } }

// Viewport — width and height
{ "urls": ["https://example.com"], "fullPage": false, "viewport": { "width": 1280, "height": 800 } }
```

## Tips

- Use `low` quality for quick visual checks
- Use `fullPage: false` to see the "above the fold" experience
- Pair with `web_fetch` — screenshot for visual context, fetch for text
- Screenshots include JavaScript-rendered content

## Next Steps

- [ASCII Renders](/guides/screenshots/ascii) — Terminal-friendly renders
- [Output Options](/guides/screenshots/output) — File and URL output
