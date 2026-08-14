# Browser Runtime and DevTools

## BrowserManager

`BrowserManager` in `src/browser.js` owns all browser instances and page lifetime. `getBrowserManager()` returns the process singleton.

It supports three backends:

| Backend | Implementation | Typical use |
|---|---|---|
| `chromium` | locally launched Puppeteer Chromium | compatible rendering and screenshots |
| `cloakbrowser` | `cloakbrowser/puppeteer` | default browser-backed route with anti-bot profile behavior |
| `lightpanda` | CDP connection to `lightpanda serve` / StealthPanda | lightweight route backend and shared search pool |

The direct-page backend comes from `BROWSER_BACKEND`. A known search route overrides this with its registry backend. DevTools uses `DEVTOOLS_BROWSER_BACKEND`, which defaults to the direct-page backend.

## Browser Lifetime

- Chromium launches with the configured profile directory and a keep-alive page so it can recover from an idle page close.
- CloakBrowser is located through its configured/downloader path and launched through its Puppeteer interface.
- Lightpanda is connected by CDP when available or started as a server. New documents receive fingerprint patches.
- `prelaunchIfConfigured()` starts the default backend and warms browser-only routes. API drivers are never warmed.
- Backend instance health includes connection state, PID, spawned-process count, and tabs.

## Page Slots and Search Windows

Search, fetch, screenshot, and ASCII operations pass through `withPageSlot()`, a global semaphore controlled by `MAX_CONCURRENT_PAGE_OPS`. Persistent DevTools target operations use their own target limits and do not consume this semaphore.

Search pages use a separate reusable window pool:

- `engine` routes get a pool keyed by their route ID.
- `shared` routes use `_shared`; this is used by all Lightpanda search routes and remains capped at one window.
- `acquireSearchWindow()` obtains or opens a suitable page.
- `releaseSearchWindow()` keeps configured warm windows and closes surplus nonpersistent pages.
- A failed browser search page is closed before release, preventing reuse of broken page state.

Fetches, screenshots, and ASCII renderings open short-lived direct-backend pages rather than borrowing search windows.

## Screenshots

`browserCaptureScreenshot()` opens a page, waits for content, measures the viewport/document, captures a JPEG, and returns the encoded image plus metadata. `web_page_screenshot` can also capture an existing persistent DevTools target through `captureTargetScreenshot()`.

Storage capability is controlled by `ENABLE_SCREENSHOT_PATH` and `ENABLE_SCREENSHOT_DOWNLOAD_LINK`. Callers request `output: "file"` or `output: "url"` to use it; otherwise the default response remains inline base64 JPEG.

## ASCII Screenshots

`web_page_ascii` uses two modules:

1. `pixel-sampler.js` sends `SAMPLE_PIXELS_CODE` to the page. It decodes the real PNG, downscales with `OffscreenCanvas`, and returns packed RGB values.
2. `ascii.js` renders pairs of pixel rows into terminal cells. ANSI mode uses `▀` with separate foreground/background colors or `█` when colors match. Plain mode uses a luminance ramp.

`asciiGridDims()` limits widths to 40-200 columns and full-page output to 200 rows. `placeMarkers()` adds collision-aware numbered markers which are explained in the generated DOM legend.

## Persistent DevTools Targets

`src/devtools.js` supplies browser-testing tools for a target that survives across calls.

- At most 20 targets may be open.
- Each target has a page, ID, URL/title metadata, console buffer, network buffer, and activity timestamp.
- Console and network buffers retain up to 200 entries each.
- Operations refresh the target timer.
- A cleanup timer closes targets after five minutes idle and retains a short-lived record so callers receive a useful inactivity error.

`DOM.getDocument` returns an LLM-oriented summary of landmarks and interactive elements with selectors, XPath, attributes, geometry, and visibility. Runtime evaluation serializes results safely, limiting arrays/objects and recursive depth. Input tools require a valid CSS selector or XPath and `Input.insertText` clears the existing editable value before typing.
