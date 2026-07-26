# Plan: Annotated Screenshot Tool — Visual Page Map with Element Selectors

## The Vision

A tool that takes a webpage and returns a **visual screenshot** where every interactive element is **numbered directly on the image**, paired with a **legend** that maps those numbers to selectors (CSS, XPath), element type, text, and bounding rect.

The result is both a screenshot (the LLM can SEE the page) and a document snapshot (the LLM can INTERACT with the page). It's a visual map with coordinates — the LLM looks at it, sees "oh, element [#3] is the search input", and immediately knows the selector to use.

---

## What the LLM Gets Back

```
### Annotated Screenshot

  ┌──────────────────────────────────────────────────────────────────┐
  │  [1] Home     About     Contact              [2] 🔍            │
  ├──────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │         Welcome to Our Platform                                  │
  │                                                                  │
  │         ┌──────────────────────────────────────────────┐        │
  │         │                                              │        │
  │   [3]   │  Enter your email address...          [4]   │        │
  │         │                                              │        │
  │         └──────────────────────────────────────────────┘        │
  │                                                                  │
  │         ┌──────────────────────────────────┐                    │
  │   [5]   │  Password...                     │                    │
  │         └──────────────────────────────────┘                    │
  │                                                                  │
  │              [ 6 ]  Sign In                                      │
  │                                                                  │
  │         [7] Forgot password?    [8] Create account               │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘

### Element Legend

| # | Tag       | Selector                    | XPath                      | Role      | Text / Placeholder        |
|---|-----------|-----------------------------|----------------------------|-----------|---------------------------|
| 1 | `<nav>`   | `nav`                       | `/html/body/header/nav[1]` | navigation| "Home About Contact"      |
| 2 | `<input>` | `#search`                   | `.../input[1]`             | searchbox | placeholder: "Search..."  |
| 3 | `<input>` | `input[name="email"]`       | `.../form/input[1]`        | textbox   | placeholder: "Enter your email..." |
| 4 | `<label>` | `label[for="email"]`        | `.../label[1]`             | —         | "Email Address"           |
| 5 | `<input>` | `input[name="password"]`    | `.../form/input[2]`        | textbox   | placeholder: "Password..."|
| 6 | `<button>`| `button[type="submit"]`     | `.../button[1]`            | button    | "Sign In"                 |
| 7 | `<a>`     | `a.forgot-password`         | `.../a[1]`                 | link      | "Forgot password?"        |
| 8 | `<a>`     | `a.create-account`          | `.../a[2]`                 | link      | "Create account"          |
```

The LLM sees the page, identifies the numbers, and knows exactly what CSS selector or XPath to use to click, type, or navigate.

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

### 2. ASCII Conversion Pipeline — VERIFIED WORKING

**Test:** Created a 200x100 canvas with gradient + red button + text, converted to base64, decoded via Canvas API, sampled to 80-char-wide ASCII.

**Result:** The ASCII output clearly shows:
- The gradient from dark (left ` .'`) to bright (right `@$`)
- The red button as a distinct character block in the middle rows
- The "Submit" text visible as character variations within the button area

**Algorithm (proven working):**
```
1. Decode base64 PNG → Blob → ImageBitmap
2. Scale to target width (e.g., 80-120 chars) with aspect correction
3. Draw to OffscreenCanvas(cols, rows)
4. getImageData() → Uint8ClampedArray (RGBA per pixel)
5. For each pixel: brightness = (0.299*R + 0.587*G + 0.114*B) / 255
6. Map brightness to character: ramp[Math.round(brightness * (ramp.length - 1))]
```

### 3. Performance — EXCELLENT

**Test:** 1920x1080 image (typical screenshot), 120-char-wide ASCII output.

| Metric | Value |
|--------|-------|
| Base64 size | 75 KB |
| Decode + ImageBitmap | 26 ms |
| ASCII conversion (120x30 grid) | <1 ms |
| **Total pipeline** | **~26 ms** |
| ASCII output dimensions | 120 cols × 30 rows |
| ASCII output size | ~3.6 KB (text) |

**Conclusion:** The entire ASCII conversion takes ~26ms. Well within any reasonable timeout.

### 4. Data Transfer Limits — SAFE

**Research:** Puppeteer's `page.evaluate()` has a ~100 MB limit for arguments/return values (verified via GitHub issues #5598, #3955).

**Our data sizes:**
- Screenshot base64 (1920x1080): ~75 KB (input to `page.evaluate`)
- ASCII grid (120x30): ~3.6 KB (return value)
- Element metadata (25 elements): ~5 KB (return value)
- **Total return:** ~8.6 KB — **0.008% of the 100 MB limit**

**Strategy:** Take the screenshot in Node.js (via `page.screenshot()`), pass the base64 string into `page.evaluate()` for ASCII conversion, return the text grid. No issues.

### 5. Luminance Ramps — RESEARCHED

Multiple well-established ramps from the ASCII art community:

| Ramp | Characters | Best For |
|------|-----------|----------|
| **Classic (recommended)** | ` .'`^",:;Il!i><~+_-?][}{1)(\|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$` | 69 chars, fine gradation |
| Short | `@%#*+=-:.` | 10 chars, high contrast |
| Dense | `$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\|()1{}[]?-_+~<>i!lI;:,"^\`. ` | 70 chars, photographic |
| Block | `█▓▒░` | 4 chars, pixel art style |

**Recommendation:** Use the 69-char "classic" ramp. It provides enough gradation for webpage screenshots (which are mostly flat colors with text) while being short enough for clear visual distinction.

### 6. Aspect Ratio Correction — CRITICAL

Monospace characters are approximately **2:1 (height:width)** — each character is twice as tall as it is wide. Without correction, ASCII art appears vertically stretched.

**Formula (proven working):**
```
cols = targetWidth  // e.g., 100
rows = Math.round((pixelHeight / pixelWidth) * cols * 0.45)
```

The `0.45` factor (instead of `0.5`) accounts for the actual character cell ratio in most monospace fonts. This was verified in testing — the output looked proportional.

### 7. Element Extraction — PROVEN IN CODEBASE

The `devtools.js:getDocument()` function (lines 460-578) already implements:

- **CSS selector generation** via `cssPath(element)` — walks up the DOM, uses IDs when available, falls back to `:nth-of-type()`
- **XPath generation** via `xpathFor(element)` — full path from root
- **Visibility check** via `visible(element)` — checks bounding rect + computed style
- **Element description** — tag name, text, attributes, bounding rect

**Selector list (from devtools.js line 546-558):**
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

### 8. CSS Selector Quality — RESEARCHED

**Research:** Multiple CSS selector generator libraries exist (`css-selector-generator`, `@uindow/css`, `Selektra`, `get-selector`).

**Key insight:** The approach in `devtools.js` (walk up DOM, use IDs, fall back to `:nth-of-type`) is the standard approach used by all major selector generators. It's simple, fast, and produces unique selectors.

**Edge cases to handle:**
- Non-unique IDs (some sites like YouTube use duplicate IDs) — fallback to full path
- Dynamic class names (React/Tailwind) — don't rely on classes alone
- Shadow DOM — not a concern for initial implementation

### 9. Marker Placement on ASCII Grid — TESTED

**Test:** Placed 4 markers on a 120x30 grid at different positions. Collision avoidance worked — when two elements mapped to the same grid cell, the second was shifted down.

**Algorithm:**
```
1. For each element: gridX = round((rect.x / pixelWidth) * cols), gridY = round((rect.y / pixelHeight) * rows)
2. Clamp to grid bounds
3. Check if cell is occupied → shift down until free
4. Write marker characters into grid cells
```

**Marker format:** `[N]` (no `#` prefix — saves 1 char of width per marker). The bracket format is unambiguous and easy for LLMs to parse.

### 10. Return Size — OPTIMAL

| Component | Size | Notes |
|-----------|------|-------|
| ASCII art (120×30) | ~3.6 KB | Text, very compact |
| Element legend (25 elements) | ~4 KB | Markdown table |
| Total response | ~7.6 KB | Tiny compared to screenshot (50-200KB) |

**Advantage:** The ASCII response is **10-25x smaller** than a screenshot image, making it faster to transfer and process.

---

## Two Implementation Options

### Option A: ASCII Art (Pure Text, No Dependencies) — RECOMMENDED

Convert the screenshot to ASCII characters in the browser using Canvas API, then overlay `[N]` markers. Returns monospace text only.

**Pros:**
- Zero dependencies — Canvas API is built into Chromium
- Tiny response size (~7.6 KB)
- Works in any terminal, any context
- No image handling needed on the client side
- 26ms total conversion time
- Verified working in our environment

**Cons:**
- Visual fidelity is limited (resolution ≈ 100-200 chars wide)
- Small text and fine details get lost
- No color information

### Option B: Annotated PNG Screenshot (Visual Fidelity)

Take a real screenshot, overlay numbered badges on elements using Node.js image processing, return the annotated image as base64 PNG + the legend as text.

**Pros:**
- Full visual fidelity — the LLM sees the actual page
- Color, layout, fonts all preserved
- More intuitive to interpret

**Cons:**
- Needs an image processing library (e.g., `sharp` or `jimp`) for overlaying text/badges on the PNG
- Larger response size (screenshot is ~50-200KB base64)
- Adds a native dependency to the Docker build

### Option C: Both (Best of Both Worlds)

Return both the ASCII art version AND the regular screenshot, plus the legend. The ASCII art is the "quick glance" view, the screenshot is the "detailed" view.

**Pros:**
- LLM gets two views — ASCII for quick scanning, screenshot for detail
- Covers all use cases

**Cons:**
- Largest response
- Most complex implementation

---

## Recommended: Option A (ASCII) for Now

Option A is the fastest to build, has zero dependencies, and the ASCII art + legend combo is genuinely useful for LLMs. We can add Option B later as an enhancement.

---

## How It Works (Option A — ASCII Art)

### Flow

1. LLM calls `web_page_ascii` with a URL (or `ref_id` from search)
2. Server opens the page in Chromium
3. **Collect elements**: Run `page.evaluate()` to scan the DOM for interactive elements, get their bounding rects, selectors, XPaths
4. **Take screenshot**: `page.screenshot({ type: "png", encoding: "base64" })`
5. **Convert to ASCII**: Pass base64 into `page.evaluate()`, decode via Canvas API, sample pixels, map brightness to ASCII characters
6. **Annotate**: Place `[N]` markers at each element's position in the ASCII grid
7. **Build legend**: Format the element list as a markdown table with #, tag, selector, xpath, role, text
8. Return: annotated ASCII art + element legend

### Element Detection

Same selectors as `devtools.js:getDocument()` (line 546-578), expanded:

```
a[href], button, input, textarea, select,
[role='button'], [role='link'], [role='tab'], [role='searchbox'],
[role='textbox'], [role='menuitem'], [role='navigation'],
nav, main, article, h1, h2, h3,
[data-testid], [onclick], details, summary, label
```

Each element gets:
- 1-based index number
- Tag name
- CSS selector (via `cssPath()`)
- XPath (via `xpathFor()`)
- Role attribute
- Text content or placeholder
- Bounding rect `{ x, y, width, height }`

### ASCII Conversion (Browser Canvas API)

Runs inside `page.evaluate()`:

1. Decode base64 PNG → `Blob` → `ImageBitmap` (26ms for 1920x1080)
2. Scale to target width (default 100 chars), correct for terminal aspect ratio (chars are ~2:1 tall:wide, use factor 0.45)
3. Draw to `OffscreenCanvas(cols, rows)`
4. Read pixel data via `getImageData()` → `Uint8ClampedArray`
5. Map each pixel's brightness (0-255) to a character in the luminance ramp

```
Luminance formula: brightness = (0.299 * R + 0.587 * G + 0.114 * B) / 255
Luminance ramp (dark → bright, 69 chars):
 .'`^",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$
```

### Marker Placement

- Map each element's pixel rect to grid coords: `gridX = round((rect.x / pixelWidth) * cols)`
- Place `[N]` at the element's top-left corner
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
│  - Gets element metadata (positions, selectors) │
│  - Feeds data into the transformer              │
│                                                 │
│  This is either:                                │
│  • Test harness (scripts/ascii-screenshot.js)   │
│  • MCP server (src/mcp-server.js)              │
└──────────────────────┬──────────────────────────┘
                       │ base64 + elements JSON
                       ▼
┌─────────────────────────────────────────────────┐
│  TRANSFORMER (src/ascii.js)                     │
│  - Pure data transformation                     │
│  - Zero browser dependency                      │
│  - Screenshot → ASCII art                       │
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

### Step 1: Create `src/ascii.js` — Pure Transformer

Zero browser dependency. Accepts pre-computed data, returns formatted output.

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `screenshotToAscii(base64Png, options)` | base64 string + `{ width }` | `{ ascii: string, cols, rows, pixelWidth, pixelHeight }` | Decode image, sample pixels, map to ASCII characters |
| `annotateGrid(ascii, elements, dims)` | ASCII string + element array + `{ pixelWidth, pixelHeight, cols, rows }` | `{ annotated: string, placed: [] }` | Place `[N]` markers at element positions with collision avoidance |
| `formatLegend(elements, options)` | element array + `{ includeSelector, includeXpath }` | markdown string | Build the markdown table legend |
| `transform(screenshotBase64, elements, options)` | base64 + elements + `{ width, includeSelector, includeXpath }` | `{ ascii, legend, stats }` | **Main entry point** — calls the above three in sequence |

**Note on image decoding:** The ASCII conversion uses the browser's Canvas API via `page.evaluate()` (tested, works, 26ms). So `screenshotToAscii()` is designed to be called inside `page.evaluate()` by the caller, OR we find a pure Node.js PNG decoder. For the standalone CLI, the caller wraps this call. For the MCP server, same pattern.

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

### Step 2: Create `scripts/ascii-screenshot.js` — Test Harness (temporary)

Thin Puppeteer wrapper (~40-60 lines). **This is a test tool only** — used to verify the transformer works before integrating into the MCP server. Gets deleted or kept as a dev utility after.

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
6. Convert to ASCII via `page.evaluate()` (Canvas API)
7. Call `src/ascii.js` transformer functions for annotation + legend
8. Print result to stdout
9. Close browser

### Step 3: Test the Transformer

```bash
node scripts/ascii-screenshot.js https://example.com
node scripts/ascii-screenshot.js https://github.com --width 120 --elements 30
```

Verify:
- ASCII art renders the page visually
- Element markers appear at correct positions
- Legend has selectors, XPaths, text
- Output is clean markdown

**If tests pass → proceed to Phase 2. If not → fix `src/ascii.js` until they do.**

### Phase 2: MCP Server Integration

### Step 4: Add tool schema in `src/mcp-server.js` `getToolsListResponse()`

New tool `web_page_ascii` after `web_page_screenshot` (~line 1067):

```js
{
  name: "web_page_ascii",
  description: "Capture a webpage as annotated ASCII art with element selectors...",
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

### Step 5: Add handler in `src/mcp-server.js` `handleToolCall()`

New `if (name === "web_page_ascii")` block after `web_page_screenshot` handler (~line 1215):

```
1.  Resolve URL (from url or ref_id)
2.  Get BrowserManager
3.  Open page with manager.newPage()
4.  Navigate, wait for content
5.  Collect elements via page.evaluate() (same as CLI wrapper)
6.  Take screenshot via page.screenshot({ type: "png", encoding: "base64" })
7.  Convert to ASCII via page.evaluate() (Canvas API)
8.  Call annotateGrid() from src/ascii.js
9.  Call formatLegend() from src/ascii.js
10. Format response with asMarkdownContent(ascii + legend)
11. Close page in finally block
```

### Step 6: Update `AGENTS.md`

Add `web_page_ascii` to the Tool Contract and Code References.

---

## Files

| File | Action | What | Lines |
|------|--------|------|-------|
| `src/ascii.js` | **Create** | Pure transformer — the permanent reusable module | ~150 |
| `scripts/ascii-screenshot.js` | **Create (temporary)** | Test harness to verify the transformer works | ~60 |
| `src/mcp-server.js` | **Edit** | Add tool schema + handler, imports `src/ascii.js` | ~120 |
| `AGENTS.md` | **Edit** | Document the new tool | ~20 |

The CLI wrapper is a test tool. The permanent code is `src/ascii.js` + the MCP server integration.

---

## Key Design Decisions

1. **Pure transformer pattern** — `src/ascii.js` has zero browser dependency. It accepts data, returns data. Testable with fixtures.
2. **CLI wrapper is a temporary test harness** — `scripts/ascii-screenshot.js` exists only to verify the transformer works. Not part of the final product.
3. **MCP server is the real consumer** — Once the transformer is verified, the MCP server calls `src/ascii.js` directly. No wrapper needed.
4. **Viewport-based** (`fullPage: false`) — Full-page ASCII would be thousands of lines. Above-the-fold is what matters.
5. **Reuses `devtools.js` patterns** — Same `cssPath()`, `xpathFor()`, element selectors for consistency.
6. **Marker format `[N]`** — Unambiguous, easy for LLMs to parse and reference in follow-up tool calls.
7. **Legend as markdown table** — Clean, scannable, easy to search by column.
8. **Aspect ratio factor 0.45** — Verified in testing to produce proportional output for monospace fonts.
9. **69-char luminance ramp** — Enough gradation for webpages (mostly flat colors + text), short enough for visual clarity.
10. **Canvas API runs inside `page.evaluate()`** — The ASCII pixel conversion uses the browser's Canvas API (tested, 26ms). Both the test harness and MCP server handle this in their caller code.

---

## Future Enhancements

- **Option B**: Annotated PNG screenshot with numbered badges (needs `sharp` dependency)
- **Option C**: Return both ASCII + annotated PNG
- **Highlight mode**: Return only elements matching a filter (e.g., "show me all buttons")
- **Color ASCII**: Use ANSI color codes for terminal rendering
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
