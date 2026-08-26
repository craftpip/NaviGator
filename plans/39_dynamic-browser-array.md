# Plan 39: Dynamic Browser Array

**Created:** 2026-08-26
**Status:** Draft v2

## Goal

Replace three hardcoded browser backends with a dynamic system where:
- **Built-in browsers** (Chromium, Lightpanda) ship with Navigator and are managed internally
- **Add-on browsers** (CloakBrowser, or any CDP-compatible browser) connect via a CDP WebSocket URL provided by the user

Navigator never downloads, bundles, or redistributes add-on browser binaries. Users run them externally and point Navigator at the CDP URL.

---

## 1. Architecture: Built-in vs Add-on

### Built-in browsers (shipped with Navigator)

| Browser | Launch method | Docker image |
|---------|--------------|-------------|
| **Chromium** | `puppeteer.launch()` — Navigator spawns the process | Binary baked into image (`/usr/bin/chromium`) |
| **Lightpanda** | `puppeteer.connect()` to `ws://127.0.0.1:{port}`, spawns if not running | Binary baked into image (optional, or connect to external) |

Built-in browsers have full lifecycle management: Navigator launches, monitors, and shuts them down.

### Add-on browsers (user-provided CDP URL)

| Browser | Launch method | Docker image |
|---------|--------------|-------------|
| **CloakBrowser** (or any CDP browser) | `puppeteer.connect({ browserWSEndpoint: cdpUrl })` | **NOT in image** — user runs it externally |

Add-on browsers are pure CDP clients — Navigator connects to an already-running browser. No lifecycle management (no launch, no shutdown). The user is responsible for starting/stopping the browser.

### Why this model?

1. **Legal safety** — CloakBrowser's binary license prohibits redistribution. Navigator never touches the binary.
2. **Simplicity** — add-on browsers are just a `puppeteer.connect()` call. No per-backend launch logic.
3. **Extensibility** — any CDP-compatible browser (Playwright, Selenium, rod, etc.) works as an add-on with zero code changes.
4. **Separation of concerns** — Navigator manages its own browsers; add-ons are external dependencies.

---

## 2. New Config Format

### Env var: `BROWSERS`

Replaces `BROWSER_BACKEND` and `DEVTOOLS_BROWSER_BACKEND` entirely.

```bash
# Default — built-in browsers only
BROWSERS='[
  {"name":"chromium","role":["default"]},
  {"name":"lightpanda","role":["search"]}
]'

# With CloakBrowser add-on for search
BROWSERS='[
  {"name":"chromium","role":["default"]},
  {"name":"lightpanda","role":["search"]},
  {"name":"cloakbrowser","role":["search"],"cdpUrl":"ws://127.0.0.1:9222","connect":"cloakbrowser"}
]'
```

### Entry schema

```js
{
  name: string,           // Unique identifier (e.g., "chromium", "cloakbrowser", "my-playwright")
  role: string[],         // Which tools use this browser (see roles below)
  index: number,          // Priority order within role — lower = tried first (0, 1, 2, ...)
  cdpUrl?: string,        // WebSocket URL — presence makes this an add-on browser
  connect?: string,       // Built-in driver type to use for page creation (only for add-ons)
}
```

### Chromium is always present

Chromium is the only built-in browser and **must always be in the `BROWSERS` array**. It cannot be removed. When the user saves or updates the array, the system ensures Chromium exists:

- If `BROWSERS` is empty or missing Chromium → auto-add `{"name":"chromium","role":["default"],"index":N}` (N = next available index)
- User can reorder Chromium (e.g., push to index 1, put Lightpanda at index 0)
- User cannot delete Chromium — the system re-adds it on next save

This guarantees the user always has a working browser, even if all add-ons go down.

### Roles

| Role | Tools |
|------|-------|
| `"default"` | Everything — all web tools + devtools |
| `"search"` | `web_search` only |
| `"fetch"` | `web_fetch` only |
| `"screenshot"` | `web_page_screenshot`, `web_page_ascii`, `web_page_svg` |
| `"devtools"` | All `browser_*` devtools tools |

A browser can have multiple roles. `"role": ["search", "fetch"]` means it handles both search and fetch but not screenshots or devtools.

### Derived fields

```js
// loadConfig() return adds:
browsers: [
  { name: "chromium",     role: ["default"],        short: "ch",  addOn: false },
  { name: "lightpanda",   role: ["search"],          short: "lp",  addOn: false },
  { name: "cloakbrowser", role: ["search"],          short: "cb",  addOn: true, cdpUrl: "ws://...", connect: "cloakbrowser" },
],

// Derived convenience fields (kept for backward compat):
defaultBackend:  "chromium",
devtoolsBackend: "chromium",
```

---

## 3. Engine Routing with Add-ons

### The problem

Engine drivers declare `backend: "cloakbrowser"` (e.g., `duckduckgo_cb`). When CloakBrowser is an add-on (not built-in), the engine registry still says `backend: "cloakbrowser"` — but there's no built-in `"cloakbrowser"` backend. The engine needs to route to the add-on instead.

### The solution: `connect` field creates backend aliases

When `newPage()` is called with an engine whose `backend` is `"cloakbrowser"`:

1. Check if a browser in the `browsers` array has `connect: "cloakbrowser"` → route to that add-on
2. If no add-on matches, check if a built-in driver named `"cloakbrowser"` exists → use it
3. If neither exists, fall through to the default backend

```js
// Pseudocode for newPage() engine routing
async newPage(options) {
  const engine = options.engine || "";
  const routeBackend = getEngineMetadata(engine)?.backend;

  if (routeBackend) {
    // Check for add-on that connects as this backend type
    const addOn = this.config.browsers.find(b => b.addOn && b.connect === routeBackend);
    if (addOn) return this._connectAddOnPage(addOn);

    // Check for built-in driver
    if (BACKEND_DRIVERS.has(routeBackend)) {
      return BACKEND_DRIVERS.get(routeBackend).newPage(this, this.config);
    }
  }

  // Fall through to default
  return this._resolveDefaultPage(options);
}
```

### Why this works without changing engine drivers

Engine drivers for DDG, Bing, Yahoo, Brave, and Startpage are **backend-agnostic** — the `-cb` and `-ch` variants differ only in the `backend` field (verified by code comparison). The only engine with different extraction logic per backend is Google (the `-lp` variant has different CSS selectors because Lightpanda renders Google's DOM differently).

Since add-on browsers connect via CDP (they render like normal Chromium), the standard extraction selectors work. No per-engine code changes needed.

---

## 4. Consolidated Engine Model

### Two driver types

Every driver is one of two types:

| Type | Protocol | Example |
|------|----------|---------|
| **Browser driver** | CDP — connects to any browser via WebSocket | `duckduckgo`, `google`, `bing` |
| **API driver** | HTTP — pure fetch, no browser | `duckduckgo_api`, `exa_api` |

Browser drivers are **backend-agnostic**. They use CDP commands (`page.goto()`, `page.evaluate()`, `page.waitForSelector()`) which work identically on Chromium, CloakBrowser, or any CDP-compatible browser. The driver doesn't know or care which browser it's running on.

### Delete google-lp.js

Lightpanda's DOM engine is too different for Google's CSS selectors to work. Rather than maintaining a separate lightpanda variant with different selectors, **Google simply doesn't run on Lightpanda**. The system routes Google to Chromium or CloakBrowser instead. Delete `google-lp.js` entirely.

### Consolidated engine registry

**Before (11 browser engine IDs):**

```
duckduckgo_cb, duckduckgo_ch, google_cb, google_ch, google_lp,
bing_cb, bing_lp, brave_cb, startpage_cb, yahoo_cb
```

**After (7 clean IDs):**

```
duckduckgo, google, bing, brave, startpage, yahoo, mojeek
```

Each file is named after its search engine. No suffixes.

| Old files | New file | Notes |
|-----------|----------|-------|
| `duckduckgo-cb.js` + `duckduckgo-ch.js` + `duckduckgo-browser.js` | **`duckduckgo.js`** | Merge into one |
| `google-cb.js` + `google-ch.js` + `google-driver.js` | **`google.js`** | Merge into one |
| `google-lp.js` | **DELETE** | Not needed |
| `bing-cb.js` + `bing-lp.js` + `bing-driver.js` | **`bing.js`** | Merge into one |
| `brave-cb.js` | **`brave.js`** | Rename |
| `startpage-cb.js` | **`startpage.js`** | Rename (keep `withNavigationRetry`) |
| `yahoo-cb.js` + `yahoo-driver.js` | **`yahoo.js`** | Merge into one |
| `mojeek-lp.js` | **`mojeek.js`** | Rename |

### What the driver looks like

```js
// src/engines/duckduckgo.js
import { BrowserSearchDriver } from "./browser-driver.js";

export class DuckDuckGoEngine extends BrowserSearchDriver {
  id = "duckduckgo";
  pool = "engine";
  homeUrl = "https://duckduckgo.com/";

  // submit(), extract(), assertNotBlocked() — all live here
  // Works on ANY CDP browser — no backend reference
}
```

No `backends` array. No `backend` property. The driver is pure search logic. The system decides which browser runs it.

### Engine selection: role-based routing

Each browser has a `role` array and an `index` for priority. Tools select browsers by role, trying lower index first:

```js
// In search.js — pick browser by role, sorted by index
function selectBrowserByRole(role, config, manager) {
  // Get all browsers with this role, sorted by index
  const candidates = config.browsers
    .filter(b => b.role.includes("default") || b.role.includes(role))
    .sort((a, b) => a.index - b.index);

  for (const entry of candidates) {
    if (entry.addOn) {
      // Add-on browser — check if connected
      const state = manager._backendState.get(`addon_${entry.name}`);
      if (state?.browser?.connected) return { browser: entry.name, cdpUrl: entry.cdpUrl };
      // Not connected — skip, try next (no circuit breaker)
    } else {
      // Built-in browser — always available
      return { browser: entry.name };
    }
  }
  // No browser available with this role
  return null;
}
```

**No circuit breaker for browser failover.** If a browser goes offline, skip it and try the next one. The browser may come back soon — no need to trip a breaker.

**Example with 3 search browsers:**

```bash
BROWSERS='[
  {"name":"chromium","role":["default"],"index":0},
  {"name":"lightpanda","role":["search"],"index":0},
  {"name":"cloakbrowser","role":["search"],"index":1,"cdpUrl":"ws://127.0.0.1:9222","connect":"cloakbrowser"},
  {"name":"playwright","role":["search"],"index":2,"cdpUrl":"ws://127.0.0.1:9223","connect":"chromium"}
]'
```

`web_search` tries: lightpanda (index 0) → cloakbrowser (index 1) → playwright (index 2)

### Fallback chain for a single search

```
User: web_search(["python tutorial"])
  │
  ├─ "python tutorial" → try duckduckgo
  │   ├─ Pick search-role browser: lightpanda
  │   │   ├─ Success → return results
  │   │   └─ Failure → try next search-role browser
  │   ├─ Pick search-role browser: cloakbrowser
  │   │   ├─ Success → return results
  │   │   └─ Failure → try next engine
  │   └─ Both down → try google
  │       ├─ Pick search-role browser: lightpanda → search
  │       ├─ Pick search-role browser: cloakbrowser → search
  │       └─ ... (cascade continues)
  │
  └─ All browser engines exhausted → try API engines
      ├─ duckduckgo_api → HTTP fetch, no browser needed
      └─ exa_api → HTTP fetch, no browser needed
```

### What changes vs. current

| Current | New |
|---------|-----|
| 11 browser engine IDs | 7 clean IDs |
| Engine hardcodes `backend: "cloakbrowser"` | Engine is backend-agnostic |
| System picks engine, uses its fixed backend | System picks engine AND best available browser |
| If backend is down, engine fails | If one browser is down, tries next browser |
| `_cb`, `_ch`, `_lp` are separate files | One file per search engine |
| `google-lp.js` with different selectors | Deleted — Google doesn't run on Lightpanda |

---

## 5. Add-on Page Creation

### The `_connectAddOnPage()` method

New method on `BrowserManager` that handles all add-on browsers:

```js
async _connectAddOnPage(addOnEntry) {
  const stateKey = `addon_${addOnEntry.name}`;
  let state = this._backendState.get(stateKey);

  // Reuse existing connection if alive
  if (state?.browser?.connected) {
    return state.browser.newPage();
  }

  // Connect to external CDP
  const browser = await puppeteer.connect({
    browserWSEndpoint: addOnEntry.cdpUrl,
    defaultViewport: { width: 1920, height: 1080 },
  });

  // Store state (owned: false = don't close on shutdown)
  this._backendState.set(stateKey, {
    browser,
    owned: false,
    connected: true,
  });

  // Track disconnection
  browser.on("disconnected", () => {
    this._backendState.delete(stateKey);
  });

  return browser.newPage();
}
```

Key properties:
- **No launch logic** — the browser is already running externally
- **No shutdown** — `owned: false`, so `shutdown()` calls `browser.disconnect()` (not `close()`)
- **Connection reuse** — if the CDP connection is alive, reuse it
- **Auto-cleanup** — `disconnected` event clears state

### What add-on browsers DON'T get

- No `prelaunch()` — user manages the browser process
- No `relaunch()` — user restarts their own browser
- No process ID tracking — Navigator doesn't own the process
- No binary path resolution — user provides the CDP URL

---

## 6. File-by-File Changes

### `src/config.js` (~15 change sites)

| What | Change |
|------|--------|
| `BROWSER_BACKEND_VALUES` (line 22) | Keep for built-in type validation; add-ons use arbitrary names |
| `parseBrowserBackend()` (line 171) | Keep as internal helper for fallback synthesis |
| `formatBrowserBackendShort()` (line 177) | Make dynamic: derive from `browsers[].short` |
| `loadConfig()` (lines 382-386) | Parse `BROWSERS` env var, validate `role` array + `index`, ensure Chromium present |
| `loadConfig()` return shape | Add `browsers` array with `role` array, `index`, `addOn` flag; keep derived fields |
| Path-finding functions (lines 204-303) | Keep for built-in browsers; add-ons don't need them |

### `src/browser.js` (~60 change sites)

| What | Change |
|------|--------|
| Constructor (lines 112-140) | Add `_backendState = new Map()`; keep built-in fields during migration |
| `newPage()` (lines 835-851) | Add add-on routing before built-in dispatch |
| Add `_connectAddOnPage()` | New method for CDP connect to external browsers |
| `_poolEngine()` (lines 854-861) | Replace hardcoded checks with generic logic |
| `getHealth()` (lines 1014-1049) | Add `addOns` map showing connection status of each add-on |
| `getInstanceStats()` (lines 1052-1058) | Include add-on connection status |
| `shutdown()` (lines 1246-1300) | Disconnect add-ons (not close); close built-ins |
| `prelaunchIfConfigured()` (lines 1136-1173) | Skip add-ons (no prelaunch) |
| `relaunchDefaultBackend()` (lines 1182-1243) | Skip add-ons (user-managed) |
| Built-in driver extraction | Move `ChromiumDriver` / `LightpandaDriver` into registry (Phase 2) |

### `src/devtools.js` (2 change sites)

| What | Change |
|------|--------|
| `normalizeBackend()` (line 74-81) | Allow add-on names in the valid set (from `config.browsers` with `"devtools"` or `"default"` role) |
| All devtools tool handlers | Add optional `browser` param — routes to browser with `"devtools"` or `"default"` role |

### `src/search.js` (2 change sites)

| What | Change |
|------|--------|
| `hasLightpandaRoute` (line 1019) | Replace `backend === "lightpanda"` with `pool === "shared"` |
| Lightpanda retry (line 1079) | Generalize — not specific to lightpanda |

### `src/mcp-server.js` (4 change sites)

| What | Change |
|------|--------|
| `formatBrowserBackendShort` fallback (line 971) | Use `config.browsers` to resolve |
| Health endpoint | Add `addOns` to response; keep aliases |
| **New tool: `list_browsers`** | Returns all browsers from config + connection status + role |
| All MCP tool handlers | Use role-based browser selection from `BROWSERS` config |

### `src/engines/driver.js` (1 change site)

| What | Change |
|------|--------|
| `KNOWN_BACKENDS` (line 1) | Keep as built-in type set; add-ons don't need to be in it (routed via `connect` field) |

### `src/config-schema.js` (2 change sites)

| What | Change |
|------|--------|
| `BROWSER_BACKEND` schema (line 4) | Replace with `BROWSERS` schema (includes `role` array field) |
| `DEVTOOLS_BROWSER_BACKEND` schema (line 5) | Remove — derived from `BROWSERS` |

### Web console (3 change sites)

| File | Change |
|------|--------|
| `main.jsx` line 355 | Render from `health.backends` + `health.addOns` dynamically |
| `status/index.jsx` line 342 | Same |
| `lib/format.js` line 66-73 | Dynamic backend name → short lookup |

### Engine files (consolidation — ~15 files → 7 clean files)

| Old files | New file | Change |
|-----------|----------|--------|
| `src/engines/duckduckgo-cb.js` | Delete | Merged into `duckduckgo.js` |
| `src/engines/duckduckgo-ch.js` | Delete | Merged into `duckduckgo.js` |
| `src/engines/duckduckgo-browser.js` | `src/engines/duckduckgo.js` | Rename + remove backend reference |
| `src/engines/google-cb.js` | Delete | Merged into `google.js` |
| `src/engines/google-ch.js` | Delete | Merged into `google.js` |
| `src/engines/google-driver.js` | `src/engines/google.js` | Rename + remove backend reference |
| `src/engines/google-lp.js` | **DELETE** | Not needed — Google doesn't run on Lightpanda |
| `src/engines/bing-cb.js` | Delete | Merged into `bing.js` |
| `src/engines/bing-lp.js` | Delete | Merged into `bing.js` |
| `src/engines/bing-driver.js` | `src/engines/bing.js` | Rename + remove backend reference |
| `src/engines/brave-cb.js` | `src/engines/brave.js` | Rename + remove backend reference |
| `src/engines/startpage-cb.js` | `src/engines/startpage.js` | Rename + remove backend reference (keep `withNavigationRetry`) |
| `src/engines/yahoo-cb.js` | Delete | Merged into `yahoo.js` |
| `src/engines/yahoo-driver.js` | `src/engines/yahoo.js` | Rename + remove backend reference |
| `src/engines/mojeek-lp.js` | `src/engines/mojeek.js` | Rename + remove backend reference |
| `src/engines/driver.js` | `src/engines/driver.js` | Remove `KNOWN_BACKENDS` (no longer needed) |
| `src/engines/index.js` | `src/engines/index.js` | Update registry — clean engine names only |

### Deployment files

| File | Change |
|------|--------|
| `docker-compose.yml` | Replace `BROWSER_BACKEND` / `DEVTOOLS_BROWSER_BACKEND` with `BROWSERS` |
| `.env` | Default: `[{"name":"chromium","role":["default"]},{"name":"lightpanda","role":["search"]}]` |
| `.env.example` | Update with new format + add-on example |
| `docker/Dockerfile` | **Remove** `npx --no-install cloakbrowser install` (line 35) |

### Test files (~120+ sites)

| File | Change |
|------|--------|
| All test files | Replace `defaultBackend: "cloakbrowser"` with `browsers: [{name:"chromium",role:["default"]}]` |
| `tests/browser.test.js` | Update backend state access patterns |
| `vitest.config.js` | Remove cloakbrowser mock alias (no longer built-in) |

### MCP tool changes

| Tool | Role | Change |
|------|------|--------|
| **New: `list_browsers`** | — | Returns all configured browsers with role array, connection status, and type |
| All devtools tools | `"devtools"` | Add optional `browser` param — defaults to first browser with `"devtools"` or `"default"` role |
| `web_search` | `"search"` | Uses first browser with `"search"` or `"default"` role |
| `web_fetch` | `"fetch"` | Uses first browser with `"fetch"` or `"default"` role |
| `web_page_screenshot` | `"screenshot"` | Uses first browser with `"screenshot"` or `"default"` role |

**New `list_browsers` tool output:**

```json
{
  "browsers": [
    {"name": "chromium", "role": ["default"], "type": "builtin", "connected": true},
    {"name": "lightpanda", "role": ["search"], "type": "builtin", "connected": true},
    {"name": "cloakbrowser", "role": ["search"], "type": "addon", "connected": true, "cdpUrl": "ws://cloakbrowser:9222"}
  ]
}
```

**Devtools `browser` param example:**

```json
// No browser specified → uses first browser with "devtools" or "default" role
{"tool": "browser_Target_createTarget", "args": {"url": "https://example.com"}}

// Explicit browser → must be in config and have "devtools" or "default" role
{"tool": "browser_Target_createTarget", "args": {"url": "https://example.com", "browser": "playwright"}}
```

When `browser` is omitted, uses the first browser with `"devtools"` or `"default"` role. When specified, routes to that specific browser (must be in `BROWSERS` config, have `"devtools"` or `"default"` in its role array, and connected).

---

## 7. Implementation Order

### Phase 1: Config layer
1. Add `parseBrowsers()` to `src/config.js` — parse `BROWSERS` env, validate `role` array
2. Add `browsers` array to `loadConfig()` return with `role` array, `addOn` flag derived from `cdpUrl` presence
3. Derive `defaultBackend` / `devtoolsBackend` from `browsers` array (first matching role)
4. Fall back to hardcoded defaults when `BROWSERS` is unset
5. **Test:** existing tests pass

### Phase 2: Add-on routing in newPage()
1. Add `_connectAddOnPage()` method to `BrowserManager`
2. Extend `newPage()` to check add-on browsers before built-in dispatch
3. Add add-on connection tracking to `_backendState`
4. Add add-on disconnect handling
5. **Test:** add-on routing with a mock CDP endpoint

### Phase 3: Built-in driver registry
1. Extract `ChromiumDriver` from `getBrowser()` / `_newChromiumPage()` / `launchBrowser()`
2. Extract `LightpandaDriver` from `getLightpandaBrowser()` / `_newLightpandaPage()` / `_spawnLightpanda()`
3. Register in `BACKEND_DRIVERS` map
4. Replace `newPage()` built-in if/else with registry dispatch
5. **Test:** existing tests pass

### Phase 4: Consolidated engine model
1. Create `src/engines/duckduckgo.js` — merge `duckduckgo-cb.js` + `duckduckgo-ch.js` + `duckduckgo-browser.js` into one clean file
2. Create `src/engines/google.js` — merge `google-cb.js` + `google-ch.js` + `google-driver.js` into one clean file
3. **DELETE** `google-lp.js` — Google doesn't run on Lightpanda
4. Create `src/engines/bing.js` — merge `bing-cb.js` + `bing-lp.js` + `bing-driver.js` into one clean file
5. Rename `brave-cb.js` → `brave.js`
6. Rename `startpage-cb.js` → `startpage.js` (keep `withNavigationRetry`)
7. Create `src/engines/yahoo.js` — merge `yahoo-cb.js` + `yahoo-driver.js` into one clean file
8. Rename `mojeek-lp.js` → `mojeek.js`
9. Update `src/engines/index.js` — register new engine classes
10. Update `src/search.js` — engine selection picks best available browser from BROWSERS config
11. Delete old per-backend engine files
12. **Test:** all search tests pass with consolidated engines

### Phase 5: Health, stats, lifecycle + auto-reconnect
1. Update `getHealth()` — add `addOns: { [name]: { connected, cdpUrl } }` map
2. Update `getInstanceStats()` — include add-on status
3. Update `shutdown()` — disconnect add-ons, close built-ins
4. Update `prelaunchIfConfigured()` — skip add-ons
5. Update `relaunchDefaultBackend()` — skip add-ons
6. Update `_poolEngine()` — generic pool logic
7. Add `AddOnHealthMonitor` — background 10s interval, auto-reconnect on disconnection
8. Add browser backend circuit breakers — trip on repeated connection failures
9. **Test:** existing tests pass + auto-reconnect with mock CDP endpoint

### Phase 6: Peripheral updates
1. `src/devtools.js` — allow add-on names in `normalizeBackend()`
2. `src/search.js` — generalize lightpanda-specific checks
3. `src/mcp-server.js` — health endpoint shape
4. `src/engines/driver.js` — `KNOWN_BACKENDS` stays as built-in set
5. Web console — dynamic backend rendering (3 files)
6. **Test:** existing tests pass

### Phase 7: Deployment + cleanup
1. Update `docker-compose.yml` with `BROWSERS` env var (default: chromium + lightpanda only)
2. Update `.env`, `.env.example`, `.env.example.full`
3. **Remove** `npx --no-install cloakbrowser install` from Dockerfile
4. Remove cloakbrowser from `vitest.config.js` mock aliases
5. Update `AGENTS.md`, `README.md`
6. Rebuild console
7. **Test:** `docker compose build && docker compose up -d` → health check → full test suite

---

## 8. Migration: Old Env Vars → New

When `BROWSERS` is **not set**, synthesize from old vars:

```js
function synthesizeBrowsersFromLegacy() {
  const defaultBackend = parseBrowserBackend(process.env.BROWSER_BACKEND, "chromium");
  const devtoolsBackend = parseBrowserBackend(
    process.env.DEVTOOLS_BROWSER_BACKEND,
    defaultBackend
  );

  const browsers = [];
  const seen = new Set();

  // Default backend (does everything)
  if (!seen.has(defaultBackend)) {
    browsers.push({ name: defaultBackend, role: ["default"], index: 0 });
    seen.add(defaultBackend);
  }
  // Devtools backend
  if (!seen.has(devtoolsBackend)) {
    browsers.push({ name: devtoolsBackend, role: ["devtools"], index: browsers.length });
    seen.add(devtoolsBackend);
  }
  // Lightpanda for search
  if (!seen.has("lightpanda")) {
    browsers.push({ name: "lightpanda", role: ["search"], index: browsers.length });
    seen.add("lightpanda");
  }

  // Ensure Chromium is always present
  if (!browsers.some(b => b.name === "chromium")) {
    browsers.push({ name: "chromium", role: ["default"], index: browsers.length });
  }

  console.warn(
    "⚠️  BROWSERS env var not set. Using defaults. " +
    "Set BROWSERS to configure browsers explicitly."
  );

  return browsers;
}
```

**Key change from v1:** Default is now `chromium` (not `cloakbrowser`), since CloakBrowser is an add-on.

---

## 9. Example Configurations

### Minimal (built-in only)
```bash
BROWSERS='[
  {"name":"chromium","role":["default"],"index":0},
  {"name":"lightpanda","role":["search"],"index":0}
]'
```

### Lightpanda higher priority than Chromium for search
```bash
BROWSERS='[
  {"name":"lightpanda","role":["search"],"index":0},
  {"name":"chromium","role":["default"],"index":1}
]'
```

`web_search` tries: lightpanda (0) → chromium (1) as fallback

### With CloakBrowser add-on for search
```bash
BROWSERS='[
  {"name":"lightpanda","role":["search"],"index":0},
  {"name":"cloakbrowser","role":["search"],"index":1,"cdpUrl":"ws://127.0.0.1:9222","connect":"cloakbrowser"},
  {"name":"chromium","role":["default"],"index":2}
]'
```

`web_search` tries: lightpanda (0) → cloakbrowser (1) → chromium (2) as final fallback

### CloakBrowser as default (user runs it externally)
```bash
BROWSERS='[
  {"name":"cloakbrowser","role":["default"],"index":0,"cdpUrl":"ws://127.0.0.1:9222","connect":"cloakbrowser"},
  {"name":"lightpanda","role":["search"],"index":0}
]'
```

### 3 search browsers with priority order
```bash
BROWSERS='[
  {"name":"chromium","role":["default"],"index":0},
  {"name":"lightpanda","role":["search"],"index":0},
  {"name":"cloakbrowser","role":["search"],"index":1,"cdpUrl":"ws://127.0.0.1:9222","connect":"cloakbrowser"},
  {"name":"playwright","role":["search"],"index":2,"cdpUrl":"ws://127.0.0.1:9223","connect":"chromium"}
]'
```

`web_search` tries: lightpanda (0) → cloakbrowser (1) → playwright (2)

### Separate browsers for each role
```bash
BROWSERS='[
  {"name":"chromium","role":["fetch","screenshot"],"index":0},
  {"name":"lightpanda","role":["search"],"index":0},
  {"name":"cloakbrowser","role":["search"],"index":1,"cdpUrl":"ws://127.0.0.1:9222","connect":"cloakbrowser"},
  {"name":"playwright","role":["devtools"],"index":0,"cdpUrl":"ws://127.0.0.1:9223","connect":"chromium"}
]'
```

---

## 10. Resilience — The User Never Starves

The system must always provide results, even when browsers fail. The strategy: **degrade gracefully across three layers** — browser fallback, engine fallback, API fallback.

### Failure Scenarios and Responses

| Scenario | Impact | Response |
|----------|--------|----------|
| Add-on browser not running | Engine routes to it fail | Auto-reconnect + circuit breaker trips → other engines tried |
| Add-on browser crashes mid-operation | In-flight requests fail | `disconnected` event fires → state cleared → next request reconnects |
| Add-on browser hangs (not crashes) | Commands time out at `BROWSER_OP_TIMEOUT_MS` (60s) | Timeout error → circuit breaker trips → fallback engines |
| Built-in Chromium crashes | All Chromium routes fail | Navigator relaunches in-process (existing behavior) |
| Lightpanda crashes | Lightpanda routes fail | Navigator respawns or reconnects (existing behavior) |
| All browser engines down | No browser-based results | API engines (`duckduckgo_api`, `exa_api`, etc.) provide results |
| CDP URL changes (restart on different port) | Connection fails | Auto-reconnect tries the configured `cdpUrl` (user updates config) |
| `BROWSERS` JSON parse failure | Config invalid | Fall back to built-in defaults + log error |

### Layer 1: Auto-Reconnect (background health monitor)

A background `setInterval` runs every **10 seconds** and checks each add-on browser's connection:

```js
class AddOnHealthMonitor {
  constructor(manager, browsers) {
    this.manager = manager;
    this.browsers = browsers.filter(b => b.addOn);
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => this.check(), 10_000);
    this.interval.unref(); // don't block process exit
  }

  async check() {
    for (const entry of this.browsers) {
      const stateKey = `addon_${entry.name}`;
      const state = this.manager._backendState.get(stateKey);

      if (!state || !state.browser?.connected) {
        // Not connected — try to reconnect
        await this.reconnect(entry);
        continue;
      }

      // Connected — verify with lightweight CDP command
      try {
        await Promise.race([
          state.browser.version(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("health timeout")), 5000)
          )
        ]);
        // Healthy — update status
        state.lastHealthy = Date.now();
      } catch {
        // Unhealthy — disconnect and reconnect
        try { state.browser.disconnect(); } catch {}
        this.manager._backendState.delete(stateKey);
        await this.reconnect(entry);
      }
    }
  }

  async reconnect(entry) {
    try {
      const browser = await puppeteer.connect({
        browserWSEndpoint: entry.cdpUrl,
        defaultViewport: { width: 1920, height: 1080 },
      });

      this.manager._backendState.set(`addon_${entry.name}`, {
        browser,
        owned: false,
        connected: true,
        lastHealthy: Date.now(),
        reconnectCount: (this.manager._backendState.get(`addon_${entry.name}`)?.reconnectCount || 0) + 1,
      });

      browser.on("disconnected", () => {
        this.manager._backendState.delete(`addon_${entry.name}`);
      });

      console.log(`✅ Add-on "${entry.name}" reconnected to ${entry.cdpUrl}`);
    } catch (error) {
      // Browser still unavailable — will retry on next cycle
      console.log(`⚠️ Add-on "${entry.name}" unreachable (${entry.cdpUrl}): ${error.message}`);
    }
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }
}
```

**Key behaviors:**
- Runs every 10s in background, `.unref()` so it doesn't block process exit
- Lightweight health check: `browser.version()` (1 CDP command, fast)
- On failure: disconnect + reconnect to the same `cdpUrl`
- On success: update `lastHealthy` timestamp
- Logs reconnection attempts for debugging
- Tracks `reconnectCount` for monitoring

### Layer 2: Health-Aware Engine Routing

When selecting which search engine to use, **skip engines whose backend browser is unhealthy**:

```js
// In the engine selection logic (search.js)
function getAvailableEngines(config, engineHealth) {
  return config.searchEnabledEngines.filter(engine => {
    const meta = getEngineMetadata(engine);
    if (!meta || meta.backend === "api") return true; // API engines always available

    // Check if the browser backend is healthy
    const backendName = meta.backend;
    const addOn = config.browsers.find(b => b.addOn && b.connect === backendName);
    if (addOn) {
      const state = manager._backendState.get(`addon_${addOn.name}`);
      if (!state?.browser?.connected) return false; // Skip — browser down
    }
    return true;
  });
}
```

**This means:** If CloakBrowser is down, `duckduckgo_cb` is skipped. The system tries `duckduckgo_ch` (Chromium), `google_lp` (Lightpanda), or `duckduckgo_api` (no browser needed). The user still gets search results.

### Layer 3: Browser Fallback for web_fetch

If the primary browser (default role) is down, try another available browser:

```js
// In browserOpenAndExtract() (search.js)
async function browserOpenAndExtract(options) {
  const manager = await getBrowserManager();
  const defaultBackend = manager.config.defaultBackend;

  // Try default browser first
  try {
    const page = await manager.newPage({ backend: defaultBackend });
    return await extractFromPage(page, options);
  } catch (error) {
    if (!isConnectionError(error)) throw error;

    // Default browser down — try fallback
    console.log(`⚠️ Default browser "${defaultBackend}" unavailable, trying fallback...`);

    const fallbacks = manager.config.browsers
      .filter(b => b.name !== defaultBackend && !b.addOn) // try other built-ins first
      .concat(manager.config.browsers.filter(b => b.addOn)); // then add-ons

    for (const fallback of fallbacks) {
      try {
        const page = await manager.newPage({ backend: fallback.name });
        return await extractFromPage(page, options);
      } catch {
        continue; // try next fallback
      }
    }

    throw new Error(`All browsers unavailable. Default: ${defaultBackend}`);
  }
}
```

**This means:** If Chromium is down, `web_fetch` tries Lightpanda, then any add-on browser. The user gets the page content even if their preferred browser is unavailable.

### Layer 4: Circuit Breakers (existing + extended)

Navigator already has circuit breakers for search engine routes. Extend to **browser backends**:

| Circuit Breaker | Scope | Trip condition | Recovery |
|----------------|-------|---------------|----------|
| Search engine route | Per engine (existing) | N failures in time window | Auto-recovery after cooldown |
| Browser backend | Per browser name (new) | N connection failures | Auto-recovery after cooldown |
| Add-on browser | Per add-on name (new) | N health check failures | Auto-reconnect attempts |

When a browser backend's circuit breaker trips:
- Engines routed to that backend are skipped
- `web_fetch` falls back to other browsers
- Health check continues in background
- Circuit recovers when browser becomes available

### The Full Fallback Chain

```
User calls web_search("query")
  │
  ├─ Engine selection: pick best available engine
  │   ├─ Browser engines: check if backend is healthy
  │   │   ├─ duckduckgo_cb → CloakBrowser healthy? → use it
  │   │   ├─ duckduckgo_cb → CloakBrowser down? → skip
  │   │   ├─ google_lp → Lightpanda healthy? → use it
  │   │   └─ duckduckgo_ch → Chromium healthy? → use it
  │   └─ API engines: always available
  │       └─ duckduckgo_api → no browser needed → use it
  │
  ├─ Search executes on selected engine
  │   ├─ Success → return results
  │   └─ Failure → circuit breaker trips → try next engine
  │
  └─ Final fallback: API engine guaranteed to work
      └─ duckduckgo_api or exa_api → results returned

User calls web_fetch(url)
  │
  ├─ Try default browser
  │   ├─ Success → return extracted content
  │   └─ Failure (connection error) → try fallback
  │       ├─ Try other built-in browsers
  │       │   └─ Success → return extracted content
  │       ├─ Try add-on browsers
  │       │   └─ Success → return extracted content
  │       └─ All failed → return error with details
```

### Monitoring and Observability

The health endpoint exposes all resilience state:

```json
{
  "ok": true,
  "browsers": {
    "chromium": { "role": ["default"], "connected": true, "type": "builtin" },
    "lightpanda": { "role": ["search"], "connected": true, "type": "builtin" },
    "cloakbrowser": { "role": ["search"], "connected": true, "type": "addon", "cdpUrl": "ws://cloakbrowser:9222", "lastHealthy": 1693000000000 }
  },
  "circuitBreakers": {
    "duckduckgo": { "open": false, "failures": 0 },
    "google": { "open": false, "failures": 1 }
  },
  "addOnHealth": {
    "cloakbrowser": { "connected": true, "reconnectCount": 0, "lastHealthy": 1693000000000 }
  }
}
```

---

## 13. Risks

| Risk | Mitigation |
|------|-----------|
| Add-on browser not running when needed | Auto-reconnect (10s interval) + circuit breaker + engine fallback |
| Add-on browser crashes mid-operation | `disconnected` event + auto-reconnect + other engines provide results |
| Add-on browser hangs | `BROWSER_OP_TIMEOUT_MS` timeout + circuit breaker + fallback |
| CDP URL changes (user restarts on different port) | User updates `BROWSERS` config + restart, or auto-reconnect tries new URL |
| `BROWSERS` JSON parse failure | Fall back to built-in defaults + log error |
| Engine routing to down browser | Health-aware routing skips unhealthy backends |
| All browsers down | API engines (`duckduckgo_api`, `exa_api`) always work — no browser needed |
| Auto-reconnect loop (browser permanently down) | Exponential backoff on reconnect attempts, log warnings, don't spam |
| Docker image includes Lightpanda binary | Lightpanda is BSD-licensed, safe to ship. Can be made add-on too. |

---

## 14. Future Extensibility

Adding any CDP-compatible browser as an add-on requires **zero code changes**:

```bash
# Playwright's browser
BROWSERS='[
  {"name":"chromium","role":["default"]},
  {"name":"lightpanda","role":["search"]},
  {"name":"playwright","role":["devtools"],"cdpUrl":"ws://127.0.0.1:9222","connect":"chromium"}
]'
```

Adding a new **built-in** browser (with full lifecycle management) requires:
1. Create `XyzDriver` class in `src/browser.js`
2. Register in `BACKEND_DRIVERS` map
3. Add to `KNOWN_BACKENDS` in `src/engines/driver.js`
4. Add binary to Dockerfile
5. Set `BROWSERS='[...,{"name":"xyz","role":["search"]}]'`
