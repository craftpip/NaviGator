# ASCII Renders <Badge type="danger" text="Disabled by default" />

`web_page_ascii` captures a page as a terminal-friendly render using Unicode half-block characters. See page layout, colors, and element positions without leaving the terminal.

> **Disabled by default** — remove `web_page_ascii` from `DISABLE_TOOLS` in `.env` / Configs ([http://localhost:1994/console/manage](http://localhost:1994/console/manage)) and restart (`docker compose up -d`) to enable.

## Flow

```
URL ───→│ Browser → Screenshot → Downscale → ASCII → Response │──→ User
        └──────────────────────────────────────────────────────┘
```

Browser renders the page, takes a screenshot, downscales it to a character grid, maps pixel pairs to half-block cells, and returns the render plus an element legend.

## Request

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | — | Single URL to render (use this OR `ref_id`) |
| `ref_id` | `number` | — | Reference from a prior `web_search` |
| `width` | `number` | `100` | Render width in characters (40–200) |
| `fullPage` | `boolean` | `false` | Capture full scrollable page |
| `mode` | `string` | `color_ansi` | `color_ansi`, `grayscale_ansi`, or `ascii` |
| `elementLimit` | `number` | `25` | Maximum annotated elements (1–100) |
| `includeSelector` | `boolean` | `true` | Include CSS selectors in the legend |
| `includeXpath` | `boolean` | `true` | Include XPaths in the legend |

## Response

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█ [1] Navigator                 ▀▀▀
█   MCP Server for              ▀▀▀
█   web search & extraction     ▀▀▀
█                               ▀▀▀
█ [2] Get Started    [3] GitHub ▀▀▀
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄

| # | Element | Selector |
|---|---------|----------|
| 1 | Logo | header .logo |
| 2 | Get Started | a.cta-primary |
| 3 | GitHub | a[href*="github"] |
```

The `[N]` markers show where interactive elements are on the page.

## Render Modes

| Mode | Description | Size |
|------|-------------|------|
| `color_ansi` | Full truecolor half-blocks — real page colors | Largest |
| `grayscale_ansi` | Luminance-based gray half-blocks | Slightly smaller |
| `ascii` | Plain character ramp, no escape codes | ~6x smaller |

### Color ANSI (default)

The most detailed render. Uses `▀` and `█` block characters with truecolor ANSI escape codes. Each character cell represents two vertical pixels — the top pixel becomes the foreground color, the bottom becomes the background.

### Grayscale ANSI

Same as color, but converts each pixel to luminance first. Useful for terminals that don't support truecolor.

### ASCII

Plain text only — no escape codes. Uses character ramps like `@%#*+=-:. ` for light areas and ` .:-=+*#%@` for dark areas. Great for Discord, Slack, or any place that doesn't render ANSI codes.

## How It Works

1. Opens the page in a real browser
2. Scans the DOM for interactive elements
3. Takes a screenshot
4. Downscales the screenshot to a character grid
5. Maps each pixel pair to a half-block cell
6. Annotates elements with numbered markers
7. Returns the render + element legend

## Examples

### Basic render

```json
{
  "url": "https://news.ycombinator.com"
}
```

### Wide color render

```json
{
  "url": "https://github.com",
  "width": 160,
  "mode": "color_ansi",
  "elementLimit": 40
}
```

### Compact plain-text render

```json
{
  "ref_id": 3,
  "mode": "ascii",
  "width": 80
}
```

## Tips

- Use this for **layout understanding**, not text reading
- Pair with `web_fetch` — ASCII for shapes, fetch for readable text
- `ascii` mode works in Discord and other plain-text environments
- Increase `width` for more detail on complex pages
- The element legend tells you which selectors to use with DevTools

## Next Steps

- [Output Options](/guides/screenshots/output) — File and URL output
- [DevTools Overview](/guides/devtools/overview) — Interact with pages
