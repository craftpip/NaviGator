# Archived ASCII Screenshot Reference

> Archived: superseded by `docs/architecture/browser-runtime.md` and `docs/code/support-modules.md`. Retained for historical research only; do not treat its implementation details as current.

## The Vision

A tool that takes a webpage and returns a **truecolor half-block render** of the page — real screenshot, downscaled to a grid, drawn with `▀ ▄ █` characters and per-cell RGB ANSI escape codes (the chafa approach) — where every interactive element is **numbered directly on the render**, paired with a **legend** that maps those numbers to selectors (CSS, XPath), element type, text, and bounding rect.

The result is both a screenshot (the LLM can SEE the page, including color and layout) and a document snapshot (the LLM can INTERACT with the page). It's a visual map with coordinates — the LLM looks at it, sees "oh, element [#3] is the search input", and immediately knows the selector to use.

The **wireframe approach is dropped** — structural boxes made of `─│┌┐└┘` gave no visual fidelity. The **photographic luminance-ramp approach is also dropped** — `$@%` grayscale ramps lose all color and look like noise. Chafa-style half-blocks with truecolor are the middle ground: real colors, real layout, compact text output.

---

## What the LLM Gets Back

```ansi
### Page Wireframe — example.com

\x1b[38;2;10;10;10m\x1b[48;2;255;255;255m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\x1b[0m
\x1b[38;2;10;10;10m\x1b[48;2;255;255;255m▀▀▀\x1b[48;2;220;50;50m[1] Home About Contact \x1b[48;2;255;255;255m▀▀▀\x1b[0m
\x1b[38;2;20;20;20m\x1b[48;2;245;245;245m▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\x1b[0m
...
```

Wrapped in a ` ```ansi ` code block so renderers with ANSI support show it as a real image. Every cell is one of:

| Char | Meaning |
|------|---------|
| `▀` (U+2580) | Two different colors stacked — top pixel is fg, bottom pixel is bg |
| `█` (U+2588) | Both stacked pixels are the same color — fg only |
| `[N]` | Marker — drawn inverted (black text on bright bg) so it pops on any page |

The LLM sees the page layout, reads the colors/layout, identifies the numbered markers, and knows exactly what CSS selector or XPath to use to click, type, or navigate.

### Element Legend

| # | Kind | Tag | Selector | XPath | Text |
|---|------|-----|----------|-------|------|
| 1 | link | `a` | `nav > a:nth-of-type(1)` | `/html/body/header/nav[1]/a[1]` | Home |
| 2 | interactive | `input` | `input[name="email"]` | `/html/body/form/input[1]` | placeholder: "Enter your email..." |

---

## Research Findings

### 1. Canvas API in Headless Chromium — VERIFIED WORKING

**Test environment:** Docker container (Debian Bookworm) with Chromium via CloakBrowser/Puppeteer.

All Canvas API features we need are confirmed working inside `page.evaluate()`:

| Feature | Status | Test Result |
|---------|--------|-------------|
| `OffscreenCanvas` | ✅ Works | `typeof OffscreenCanvas !== 'undefined'` → `true` |
| `createImageBitmap()` | ✅ Works | Decoded PNG blob → ImageBitmap successfully |
| `CanvasRenderingContext2D.getImageData()` | ✅ Works | Returns `Uint8ClampedArray` with RGBA pixel data |
| `OffscreenCanvas.getContext('2d')` | ✅ Works | Full 2D context with drawImage, getImageData |
| Full pipeline (blob → ImageBitmap → OffscreenCanvas → getImageData) | ✅ Works | All pixel values correct |
| `canvas.toBlob()` | ✅ Works | Produces valid PNG blobs |

**Key finding:** `OffscreenCanvas` has been available in Chromium since March 2023 (MDN). No polyfill needed.

**Rendering strategy:** Draw the decoded screenshot scaled down onto a tiny `OffscreenCanvas(cols, rows*2)` — each terminal cell is 1 column wide and 2 pixel-rows tall (half-blocks), so the canvas is `cols` wide × `rows*2` high. Read it back with `getImageData()`. That single scaled `drawImage` does all the downsampling for us — Chromium handles the averaging.

### 2. Half-Block Rendering — THE CHAFA TECHNIQUE

Chafa (HP's terminal graphics library) renders images at 2× the horizontal density of plain ASCII by exploiting one fact: a terminal cell can display **two colors at once** — the foreground of the top half (`▀` U+2580) and the background of the bottom half. So:

- Each character cell = **2 vertical pixel rows** of the page.
- Top pixel row → cell **foreground** color.
- Bottom pixel row → cell **background** color.
- When both rows are the same color, use `█` (U+2588) with only a foreground.

**Why it wins over the options we rejected:**

| Approach | Fidelity | Verdict |
|----------|----------|---------|
| Luminance ramp (`$@%`, grayscale) | No color, lossy | **Rejected** — looks like noise |
| Structural wireframe (`─│┌┐`) | No actual pixels | **Rejected** — can't see the page |
| Chafa half-blocks + truecolor | Real colors, 2× density | **Chosen** |

### 3. ANSI Truecolor — VERIFIED SUPPORTED

`\x1b[38;2;R;G;Bm` (foreground) and `\x1b[48;2;R;G;Bm` (background) are 24-bit color codes. Supported by all modern terminals and by markdown renderers that implement ANSI code blocks (```ansi). The MCP output is plain text — escape codes included — so any consumer can render or strip them.

**Size control — run-length encoding:** Adjacent cells usually share colors (flat backgrounds, text runs). Instead of emitting `\x1b[38;2;..m\x1b[48;2;..m` per cell, only emit escape codes **when the color pair changes**. A solid background collapses to one escape + a run of `▀`. Typical savings: 80-90% of the raw per-cell cost.

**Greedy row state:** Each row resets with `\x1b[0m`. Within a row, track current fg/bg and emit only on change. Markers switch to inverted colors (`\x1b[30m\x1b[48;2;255;255;0m` = black on yellow) and flip back after.

### 4. Performance — EXCELLENT

| Step | Cost |
|------|------|
| Screenshot (1920×1080, base64) | ~75 KB |
| Decode + ImageBitmap | ~26 ms |
| Scaled drawImage → getImageData (grid-sized canvas) | <2 ms |
| Half-block render (JS, RLE) | <1 ms |
| **Total pipeline** | **~30 ms** |

### 5. Data Transfer Limits — SAFE

Puppeteer's `page.evaluate()` has a ~100 MB limit for args/return values (verified via GitHub issues #5598, #3955).

**Our data sizes:**
- Screenshot base64 (1920×1080): ~75 KB (input)
- Sampled grid (120×60 cells = 120×120 samples × 3 bytes): ~43 KB (return value)
- Element metadata (25 elements): ~5 KB
- **Total:** well under 1% of the 100 MB limit

### 6. Aspect Ratio Correction — CRITICAL

Monospace characters are approximately **2:1 (height:width)** — each character is twice as tall as it is wide.

**Formula:**
```
cols = targetWidth             // e.g., 100
rows = Math.round(cols * (pixelHeight / pixelWidth) / 2)
```

The `/ 2` is not a font guess — it's the half-block density: every cell holds 2 vertical pixel rows, so we need `rows = pixelRows / 2` for a proportional result. A 1920×1080 viewport at 100 cols → `100 * 0.5625 / 2 = 28` rows.

### 7. Element Extraction — PROVEN IN CODEBASE

The `devtools.js:getDocument()` function already implements:

- **CSS selector generation** via `cssPath(element)` — walks up the DOM, uses IDs when available, falls back to `:nth-of-type()`
- **XPath generation** via `xpathFor(element)` — full path from root
- **Visibility check** via `visible(element)` — checks bounding rect + computed style
- **Element description** — tag name, text, attributes, bounding rect

**Element selector list (from devtools.js line 546-558):**
```
main, article, h1, h2, button, a[href], input, textarea, select,
[role='button'], [role='link'], [data-testid]
```

**Our expansion (for ascii tool):**
```
a[href], button, input, textarea, select,
[role='button'], [role='link'], [role='tab'], [role='searchbox'],
[role='textbox'], [role='menuitem'], [role='navigation'],
nav, main, article, h1, h2, h3,
[data-testid], [onclick], details, summary, label
```

### 8. Marker Placement on Half-Block Grid — PLAN

Each element's pixel rect maps to grid coords:

```
cellCol = round((rect.x / pixelWidth) * cols)
cellRow = round((rect.y / pixelHeight) * rows)
```

- Write `[N]` starting at the element's top-left grid cell, using inverted colors (`\x1b[30m` + bright bg) so the marker is readable on any page color.
- Markers that collide (same cells) shift down until free.
- Elements that don't fit (off-viewport, too small) get listed in the legend only.
- Marker cells are **drawn last**, after the page render, so they always sit on top of the image.

### 9. Return Size — OPTIMAL

| Component | Size | Notes |
|-----------|------|-------|
| ANSI render (100×28, RLE) | ~2-6 KB | Runs of same-color cells collapse |
| Element legend (25 elements) | ~4 KB | Markdown table |
| Total response | ~6-10 KB | Tiny vs. screenshot (50-200KB) |

**Advantage:** The ANSI response is **10-25x smaller** than a screenshot image, renders as a real colored picture in supporting terminals, and every marker is directly addressable.

---

## How It Works

### Flow

1. LLM calls `web_page_ascii` with a URL (or `ref_id` from search)
2. Server opens the page in Chromium
3. **Collect elements**: `page.evaluate()` scans the DOM for interactive elements, gets bounding rects, selectors, XPaths
4. **Take screenshot**: `page.screenshot({ type: "png", encoding: "base64" })`
5. **Sample pixels**: pass base64 into `page.evaluate()`, decode via Canvas API, scale down to `cols × rows*2`, read back `getImageData()` — returns a compact RGB grid
6. **Render half-blocks**: map each pair of pixel rows to `▀`/`█` with per-cell truecolor, run-length encoded
7. **Annotate**: overlay `[N]` markers at each element's grid position (inverted colors, collision-avoided)
8. **Build legend**: format the element list as a markdown table with #, tag, selector, xpath, text
9. Return: annotated ANSI art (```ansi code block) + element legend

### ASCII Conversion (Browser Canvas API)

Runs inside `page.evaluate()`:

```js
// base64 → Blob → ImageBitmap
const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
const img = await createImageBitmap(blob);

// Scale to grid: cols × (rows*2) — each cell holds 2 vertical pixel rows
const canvas = new OffscreenCanvas(cols, rows * 2);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0, cols, rows * 2);

// Read back RGB grid
const data = ctx.getImageData(0, 0, cols, rows * 2).data;
```

### Half-Block Render (Pure JS Transformer — src/ascii.js)

```js
// For each cell (c, r):
const topR   = data[((r*2)     * cols + c) * 4 + 0];  // top pixel row
const topG   = data[((r*2)     * cols + c) * 4 + 1];
const topB   = data[((r*2)     * cols + c) * 4 + 2];
const botR   = data[((r*2 + 1) * cols + c) * 4 + 0];  // bottom pixel row
const botG   = data[((r*2 + 1) * cols + c) * 4 + 1];
const botB   = data[((r*2 + 1) * cols + c) * 4 + 2];

const same = topR === botR && topG === botG && topB === botB;
const ch   = same ? "█" : "▀";
const fg   = same ? [topR, topG, topB] : [topR, topG, topB];  // fg = top
const bg   = same ? null            : [botR, botG, botB];     // bg = bottom
```

- Run-length: emit `\x1b[38;2;R;G;Bm` (+ `\x1b[48;2;R;G;Bm`) only when the fg/bg pair changes.
- Row end: `\x1b[0m\n`.
- Markers applied after rendering, overwriting cell content with inverted colors.

### Marker Placement

- Map each element's pixel rect to grid coords: `cellCol = round(rect.x / pixelWidth * cols)`, `cellRow = round(rect.y / pixelHeight * rows)`
- Place `[N]` at the element's top-left corner (inverted colors)
- If markers overlap, offset vertically to avoid collision
- Elements that don't fit (off-screen, too small) get listed in the legend only

---

## Architecture: Modular Design

The system is split into two layers with clear boundaries:

```
┌─────────────────────────────────────────────────┐
│  CALLER (browser integration)                   │
│  - Launches Puppeteer                           │
│  - Gets screenshot (base64)                     │
│  - Samples pixels to grid via page.evaluate()   │
│  - Gets element metadata (positions, selectors) │
│  - Feeds data into the transformer              │
│                                                 │
│  This is either:                                │
│  • Test harness (scripts/ascii-screenshot.js)   │
│  • MCP server (src/mcp-server.js)              │
└──────────────────────┬──────────────────────────┘
                       │ RGB grid + elements JSON
                       ▼
┌─────────────────────────────────────────────────┐
│  TRANSFORMER (src/ascii.js)                     │
│  - Pure data transformation                     │
│  - Zero browser dependency                      │
│  - RGB grid → half-block ANSI render            │
│  - Elements → annotated markers + legend        │
│  - Testable with any input data                 │
└─────────────────────────────────────────────────┘
```

**Why this matters:**
- The transformer is testable with fixture data (no browser needed for unit tests)
- The same module serves both the CLI script and the MCP server
- The browser integration is a thin wrapper (~40 lines), the real logic is the transformer

---

## Implementation Steps

### Phase 1: Build + Test the Pure Transformer

### Step 1: Rewrite `src/ascii.js` — Pure Transformer

Zero browser dependency. Accepts a pre-computed RGB grid + element metadata, returns the ANSI render + legend.

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `renderHalfBlocks(grid, cols, rows)` | RGB grid + grid dims | `{ ansi, stats }` | Map pixel-row pairs to `▀`/`█` with RLE truecolor escape codes |
| `annotateGrid(ansi, grid, elements, dims)` | render + element array + dims | `{ annotated, placed }` | Overlay `[N]` markers with collision avoidance |
| `formatLegend(elements, options)` | element array + `{ includeSelector, includeXpath }` | markdown string | Build the markdown table legend |
| `transform(samples, cols, rows, elements, options)` | RGB grid + dims + elements + `{ width, includeSelector, includeXpath }` | `{ ansi, legend, stats }` | **Main entry point** — calls the above in sequence |

**Element data shape (provided by the caller):**
```js
[
  {
    index: 1,                          // 1-based, used as marker number
    tagName: "button",
    selector: "button[type='submit']", // CSS selector
    xpath: "/html/body/form/button[1]",
    role: "button",
    text: "Sign In",
    rect: { x: 100, y: 300, width: 200, height: 50 }  // pixel coords
  },
  // ...
]
```

### Step 2: Update `scripts/ascii-screenshot.js` — Test Harness (temporary)

Thin Puppeteer wrapper. **This is a test tool only** — used to verify the transformer works before integrating into the MCP server. Gets deleted or kept as a dev utility after.

```
Usage:
  node scripts/ascii-screenshot.js <url> [options]

Options:
  --width <n>       ASCII art width in characters (default: 100)
  --elements <n>    Max elements to annotate (default: 25)
  --full-page       Capture full scrollable page (default: viewport only)
```

**Flow:**
1. Parse CLI args
2. Launch Puppeteer (via project's `BrowserManager`)
3. Navigate to URL, wait for content
4. Collect elements via `page.evaluate()` (reuses `devtools.js` patterns)
5. Take screenshot via `page.screenshot()`
6. Sample pixels to grid via `page.evaluate()` (Canvas API)
7. Call `src/ascii.js` transformer functions for render + annotation + legend
8. Print result to stdout
9. Close browser

### Step 3: Test the Transformer

```bash
node scripts/ascii-screenshot.js https://example.com
node scripts/ascii-screenshot.js https://github.com --width 120 --elements 30
```

Verify:
- ANSI render shows the page layout in real colors
- Element markers appear at correct positions
- Legend has selectors, XPaths, text
- Output is clean markdown (```ansi block + table)

**If tests pass → proceed to Phase 2. If not → fix `src/ascii.js` until they do.**

### Phase 2: MCP Server Integration

### Step 4: Re-enable tool schema in `src/mcp-server.js` `getToolsListResponse()`

Currently disabled at ~line 1114 (`/* web_page_ascii — disabled (WIP...) */`). Re-enable with the same input schema (no changes needed):

```js
{
  name: "web_page_ascii",
  description: "Capture a webpage as chafa-style half-block render with element selectors...",
  inputSchema: {
    type: "object",
    properties: {
      url:              { type: "string" },
      ref_id:           { type: "number" },
      width:            { type: "number", default: 100 },
      fullPage:         { type: "boolean", default: false },
      elementLimit:     { type: "number", default: 25 },
      includeSelector:  { type: "boolean", default: true },
      includeXpath:     { type: "boolean", default: true }
    }
  }
}
```

### Step 5: Update handler in `src/mcp-server.js` `handleToolCall()`

Replace the wireframe path (currently at ~line 1296-1549) with:

```
1.  Resolve URL (from url or ref_id)
2.  Get BrowserManager
3.  Open page with manager.newPage()
4.  Navigate, wait for content
5.  Collect elements via page.evaluate() (same as CLI wrapper)
6.  Take screenshot via page.screenshot({ type: "png", encoding: "base64" })
7.  Sample pixels to grid via page.evaluate() (Canvas API)
8.  Call renderHalfBlocks() from src/ascii.js
9.  Call annotateGrid() + formatLegend() from src/ascii.js
10. Format response with asMarkdownContent("```ansi\n" + ansi + "\n```" + legend)
11. Close page in finally block
```

### Step 6: Update `AGENTS.md`

Replace the "ASCII Screenshot — Wireframe Approach" learning with the chafa approach.

---

## Files

| File | Action | What | Lines |
|------|--------|------|-------|
| `src/ascii.js` | **Rewrite** | Pure transformer — half-block ANSI renderer | ~180 |
| `scripts/ascii-screenshot.js` | **Update** | Test harness — screenshot + sample + render | ~70 |
| `src/mcp-server.js` | **Edit** | Re-enable tool schema + rewrite handler | ~120 |
| `AGENTS.md` | **Edit** | Update the tool documentation + learning | ~20 |

The CLI wrapper is a test tool. The permanent code is `src/ascii.js` + the MCP server integration.

---

## Key Design Decisions

1. **Chafa-style half-blocks, not wireframe, not luminance ramp** — `▀`/`█` with truecolor gives real visual fidelity in ~6KB of text. Both previous approaches are rejected (no pixels / no color).
2. **Pure transformer pattern** — `src/ascii.js` has zero browser dependency. It accepts a pre-sampled RGB grid, returns the ANSI render + legend. Testable with fixtures.
3. **Sampling in the browser, rendering in Node** — `page.evaluate()` decodes the PNG and downscales (Chromium does the averaging), returning a compact RGB grid. The transformer does pure text work.
4. **Run-length encoded escape codes** — emit `\x1b[38;2;..m\x1b[48;2;..m` only on color change. Solid backgrounds collapse to a single escape + a char run. 80-90% savings.
5. **Aspect ratio `/ 2`** — each cell holds 2 vertical pixel rows (half-block density), so `rows = cols * (h/w) / 2`. Not a font guess, exact math.
6. **Markers inverted** — black text on bright bg, drawn after the page so they always sit on top. Collision shifts down.
7. **Legend as markdown table** — Clean, scannable, easy to search by column.
8. **Reuses `devtools.js` patterns** — Same `cssPath()`, `xpathFor()`, element selectors for consistency.
9. **Viewport-based** (`fullPage: false`) — Full-page render would be thousands of lines. Above-the-fold is what matters.

---

## Future Enhancements

- **Annotated PNG screenshot with numbered badges** (needs `sharp` dependency) — for consumers that can't render ANSI
- **Both**: ANSI render + annotated PNG, caller picks
- **Dithering**: chafa-style error diffusion for gradient-heavy pages
- **Quadrant blocks** (`▖▗▘▝▜` U+2596-259F): 4 colors per cell at half resolution — higher color fidelity, higher escape cost
- **Highlight mode**: Return only elements matching a filter (e.g., "show me all buttons")
- **Interactive mode**: Re-annotate after page changes (e.g., after clicking a tab)

---

## Appendix: Code References in Existing Codebase

| What | File | Lines |
|------|------|-------|
| CSS selector generation (`cssPath`) | `src/devtools.js` | 325-347, 473-495 |
| XPath generation (`xpathFor`) | `src/devtools.js` | 349-364, 497-512 |
| Element visibility check | `src/devtools.js` | 514-518 |
| Element description | `src/devtools.js` | 366-391, 520-543 |
| DOM selector list | `src/devtools.js` | 546-558 |
| Screenshot capture | `src/search.js` | 1856-1926 |
| Tool schema pattern | `src/mcp-server.js` | 940-1067 |
| Tool handler pattern | `src/mcp-server.js` | 1073-1227 |
| Response formatting | `src/mcp-server.js` | 88-97, 693-735 |
| BrowserManager.newPage() | `src/browser.js` | 742-763 |
