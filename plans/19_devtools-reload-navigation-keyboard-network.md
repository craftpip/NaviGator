# Devtools Round 2 — Reload, History Navigation, Keyboard, Network

## Plan Status

**Status: DRAFT** — 2026-08-14. Planned only; not yet implemented.

### Checklist

- [ ] 1. Add `Page.reload` tool — reload current page; `ignoreCache: true` = hard refresh.
- [ ] 2. Add `Page.goBack` / `Page.goForward` tools — session-history navigation.
- [ ] 3. Add `Input.dispatchKeyEvent` tool — press keys (Enter/Tab/Escape/arrows/F5/letters…) with modifier keys.
- [ ] 4. Add `Network.getRequests` tool — per-target rolling network request log (methods, statuses, failures).
- [ ] 5. Categorize `Network.*` as a devtools activity: extend the prefix list in `activityCategoryForTool()` (src/mcp-server.js:103).
- [ ] 6. Update tests: `tests/devtools.test.js` — schema asserts + `handleDevtoolsToolCall` dispatch for all 5 tools.
- [ ] 7. Update docs: `AGENTS.md` "Devtools tools (14)" → (18) and the devtools tool-table line; note the keyboard-shortcut limitation in the tool description.
- [ ] 8. Verify end-to-end: `npx vitest run tests/devtools.test.js`, `docker restart navigator`, live-tab reload/goBack/keyboard/network via MCP.

## Goal

Close the interactive-testing gaps in the devtools tool set so an LLM can drive a page the way a human dev does:

1. **Reload** — currently the LLM can only fake a reload via `Page.navigate` (cache-friendly `goto`) or `Runtime.evaluate("location.reload()")`. There is no hard refresh (bypass-cache) at all.
2. **History** — no way to go back/forward through the tab's session history.
3. **Keyboard** — no way to press keys (Enter to submit, Tab to move focus, Escape to dismiss, arrows to navigate a menu, F5, etc.); only mouse clicks and text typing exist.
4. **Network** — no visibility into what the page actually loaded (which requests failed, what statuses came back). Currently the only signal is `requestfailed` entries surfacing inside `Runtime.getConsoleMessages`.

## Current vs Target

| Tool | Current | Target |
|---|---|---|
| Reload | none (fake via `Page.navigate` / `location.reload()`) | `Page.reload(targetId, ignoreCache?)` |
| History | none | `Page.goBack(targetId)`, `Page.goForward(targetId)` |
| Keyboard | `Input.insertText` (typing only), `Input.dispatchMouseEvent` (clicks only) | `Input.dispatchKeyEvent(targetId, key, modifiers?, text?)` |
| Network | nothing | `Network.getRequests(targetId, limit?, filter?, failedOnly?, status?)` |

Devtools tool count: **14 → 18**.

## Design

### 1. `Page.reload`

**Schema** (`src/devtools.js` — `devtoolsToolDefinitions`):

```js
{
  name: "Page.reload",
  description: "Reload the current page in an existing testing tab. Set ignoreCache: true for a hard refresh that bypasses the HTTP cache during the reload.",
  inputSchema: {
    type: "object",
    properties: {
      targetId: { type: "string", description: "Target id from Target.createTarget." },
      ignoreCache: { type: "boolean", default: false, description: "Hard refresh — disable the HTTP cache for this reload, then re-enable it." }
    },
    required: ["targetId"],
    additionalProperties: false
  }
}
```

**Handler** (`reloadPage`, exported alongside the others):

```js
async function reloadPage(args = {}) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const ignoreCache = Boolean(args.ignoreCache);

  let cacheToggled = false;
  if (ignoreCache) {
    try {
      await state.page.setCacheEnabled(false);   // Network.setCacheDisabled
      cacheToggled = true;
    } catch {
      // Backend doesn't support Network.setCacheDisabled — degrade to a normal reload.
    }
  }

  await state.page.reload({
    waitUntil: manager.config.navWaitUntil,
    timeout: manager.config.browserOpTimeoutMs
  });

  if (cacheToggled) {
    try { await state.page.setCacheEnabled(true); } catch { /* best-effort re-enable */ }
  }

  await refreshTitle(state);
  return { ...buildTargetSummary(state), reloaded: true, ignoreCache: cacheToggled };
}
```

- Puppeteer's `page.reload({ waitUntil, timeout })` keeps the existing wait-until handling; the cache toggle is what makes it a *hard* refresh (the CDP equivalent of `Page.reload { ignoreCache: true }`, but keep the try/catch so lightpanda/other backends degrade gracefully instead of failing the whole call).
- `cacheToggled` reports whether the hard-refresh actually engaged (useful on backends that don't support it).

### 2. `Page.goBack` / `Page.goForward`

**Schemas** — identical shape; only name/description differ.

```js
{
  name: "Page.goBack",
  description: "Navigate to the previous entry in the tab's session history (browser back button). Returns navigated: false when there is no back history.",
  inputSchema: { /* targetId required only */ }
}
{
  name: "Page.goForward",
  description: "Navigate to the next entry in the tab's session history (browser forward button). Returns navigated: false when there is no forward history.",
  inputSchema: { /* targetId required only */ }
}
```

**Handler** — one shared function, direction via a second param:

```js
async function goHistory(args = {}, direction) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const opts = { waitUntil: manager.config.navWaitUntil, timeout: manager.config.browserOpTimeoutMs };
  const response = direction === "forward"
    ? await state.page.goForward(opts)
    : await state.page.goBack(opts);
  await refreshTitle(state);
  return { ...buildTargetSummary(state), direction, navigated: !!response };
}
```

- Puppeteer's `page.goBack()` / `page.goForward()` return `null` when there is no history in that direction — surfaced as `navigated: false` so the LLM knows the tab didn't move.

### 3. `Input.dispatchKeyEvent`

**Schema**:

```js
{
  name: "Input.dispatchKeyEvent",
  description: "Press a keyboard key in the page — Enter, Tab, Escape, Backspace, ArrowUp/Down/Left/Right, Home, End, PageUp/PageDown, F1-F12, Space, or a letter/digit/punctuation character — optionally with modifier keys held down. Note: synthetic key events cannot trigger browser-level shortcuts (e.g. Ctrl+R, F12) — use Page.reload for refreshing. Returns the target summary after the press.",
  inputSchema: {
    type: "object",
    properties: {
      targetId: { type: "string", description: "Target id from Target.createTarget." },
      key: { type: "string", description: "Key to press — a single character or a key name such as Enter, Tab, Escape, Backspace, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown, F1-F12, Space, Meta, Control, Shift, Alt." },
      modifiers: { type: "array", items: { type: "string" }, description: "Modifier keys to hold during the press, e.g. [\"Shift\", \"Control\"]. Pressed in array order, released in reverse." },
      text: { type: "string", description: "Optional text to inject for the key (used for keys that insert text)." }
    },
    required: ["targetId", "key"],
    additionalProperties: false
  }
}
```

**Handler**:

```js
async function dispatchKeyEvent(args = {}) {
  assertString(args.targetId, "targetId");
  assertString(args.key, "key");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const modifiers = Array.isArray(args.modifiers) ? args.modifiers.map(String) : [];

  for (const mod of modifiers) await state.page.keyboard.down(mod);
  try {
    await state.page.keyboard.press(args.key, args.text ? { text: String(args.text) } : {});
  } finally {
    for (const mod of [...modifiers].reverse()) await state.page.keyboard.up(mod);
  }

  await new Promise((r) => setTimeout(r, manager.config.humanTypingDelay || 0));
  return { ...buildTargetSummary(state), pressed: args.key, modifiers };
}
```

- Uses Puppeteer `page.keyboard.down/up/press`. Modifiers held via down/up around the press (Ctrl+Shift+Enter style combos).
- **Documented limitation:** puppeteer sends synthetic input into the renderer, not the browser UI — so Ctrl+R / F5 / F12 will *not* trigger browser shortcuts. That's exactly why `Page.reload` exists.

### 4. `Network.getRequests`

**Per-target rolling buffer.** Initialized in `createTarget`'s state object (src/devtools.js:217) and fed by new page-event listeners in `installPageObservers` (src/devtools.js:133). Bounded by `MAX_NETWORK_REQUESTS = 200`.

New state field + constant:

```js
const MAX_NETWORK_REQUESTS = 200;
// state: networkRequests: []
```

**Listeners** (append inside `installPageObservers(state)`):

```js
const pendingRequests = new Map();
page.on("request", (request) => {
  pendingRequests.set(request.id(), {
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType() || "other",
    startedAt: Date.now()
  });
});
page.on("response", (response) => {
  const req = response.request();
  const pending = pendingRequests.get(req.id());
  recordNetworkRequest(state, {
    method: req.method(),
    url: response.url(),
    resourceType: req.resourceType() || "other",
    status: response.status(),
    ok: response.ok(),
    fromCache: response.fromCache(),
    durationMs: pending ? Date.now() - pending.startedAt : null,
    failed: false
  });
  if (pending) pendingRequests.delete(req.id());
});
page.on("requestfailed", (request) => {
  const pending = pendingRequests.get(request.id());
  recordNetworkRequest(state, {
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType() || "other",
    status: null,
    ok: false,
    fromCache: false,
    durationMs: pending ? Date.now() - pending.startedAt : null,
    failed: true,
    error: request.failure()?.errorText || "request failed"
  });
  pendingRequests.delete(request.id());
});
```

Helper (module scope):

```js
function recordNetworkRequest(state, entry) {
  state.networkRequests.push(entry);
  while (state.networkRequests.length > MAX_NETWORK_REQUESTS) state.networkRequests.shift();
}
```

**Schema**:

```js
{
  name: "Network.getRequests",
  description: "List the network requests the tab has made (per-target rolling buffer of the last 200). Each entry shows method, url, status, resourceType, ok/failed, and fromCache. Filter by URL substring, failed-only, or exact status. Useful to see what a page actually loaded and which requests failed.",
  inputSchema: {
    type: "object",
    properties: {
      targetId: { type: "string", description: "Target id from Target.createTarget." },
      limit: { type: "number", default: 25, description: "Max requests to return (newest first), 1-200." },
      filter: { type: "string", description: "Case-insensitive substring matched against the request URL." },
      failedOnly: { type: "boolean", default: false, description: "Return only failed requests." },
      status: { type: "number", description: "Return only requests with this HTTP status (e.g. 404)." }
    },
    required: ["targetId"],
    additionalProperties: false
  }
}
```

**Handler**:

```js
async function getNetworkRequests(args = {}) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const limit = Math.min(Math.max(1, Math.floor(Number(args.limit)) || 25), MAX_NETWORK_REQUESTS);
  const filter = typeof args.filter === "string" && args.filter.trim() ? args.filter.trim().toLowerCase() : null;
  const failedOnly = Boolean(args.failedOnly);
  const statusFilter = Number.isFinite(Number(args.status)) ? Number(args.status) : null;

  let entries = state.networkRequests || [];
  if (failedOnly) entries = entries.filter((e) => e.failed);
  if (filter) entries = entries.filter((e) => e.url.toLowerCase().includes(filter));
  if (statusFilter !== null) entries = entries.filter((e) => e.status === statusFilter);

  return {
    targetId: state.targetId,
    url: state.page.url(),
    total: (state.networkRequests || []).length,
    shown: Math.min(entries.length, limit),
    failed: entries.filter((e) => e.failed).length,
    requests: entries.slice(-limit).reverse()
  };
}
```

### Dispatch (`handleDevtoolsToolCall`, src/devtools.js:1555)

```js
if (name === "Page.reload") return reloadPage(args);
if (name === "Page.goBack") return goHistory(args, "back");
if (name === "Page.goForward") return goHistory(args, "forward");
if (name === "Input.dispatchKeyEvent") return dispatchKeyEvent(args);
if (name === "Network.getRequests") return getNetworkRequests(args);
```

## Change Locations

### Code — `src/devtools.js`

| Line | What | Change |
|---|---|---|
| ~8 | constants | Add `MAX_NETWORK_REQUESTS = 200` |
| ~133 | `installPageObservers(state)` | Add `request` / `response` / `requestfailed` listeners + `pendingRequests` map |
| ~217 | `createTarget` state object | Add `networkRequests: []` |
| ~1358 | `devtoolsToolDefinitions` | Append 5 new tool definitions (18 total) |
| ~1555 | `handleDevtoolsToolCall` | Add 5 dispatch branches |
| ~1573 (after) | new handlers | `reloadPage`, `goHistory`, `dispatchKeyEvent`, `getNetworkRequests`, `recordNetworkRequest` |

### Code — `src/mcp-server.js`

| Line | What | Change |
|---|---|---|
| 103 | `activityCategoryForTool()` prefix list | Add `"Network."` so `Network.getRequests` counts as a devtools activity (`category === "devtools"` in the live activity feed + request stats). |

No config changes, no new env vars, no schema changes to existing tools.

## Implementation Notes

1. **Hard refresh = cache toggle, not CDP `Page.reload`.** `page.setCacheEnabled(false)` (→ `Network.setCacheDisabled`) + `page.reload()` + re-enable keeps puppeteer's `waitUntil` handling and degrades gracefully (try/catch) on backends without `Network.setCacheDisabled`. The `cacheToggled` return flag reports whether it actually engaged.
2. **Puppeteer API surface used** (all standard, present in puppeteer-core 24): `page.reload({waitUntil, timeout})`, `page.goBack()` / `page.goForward()` (return `null` on empty history), `page.keyboard.down/up/press`, `page.setCacheEnabled(bool)`, and the `request`/`response`/`requestfailed` events. No new dependencies.
3. **Network buffer is per-target and process-local** — starts empty on `Target.createTarget`, bounded at 200, dropped on close. No persistence. Lightpanda may emit fewer/coarser network events than Chromium (its CDP is a fork subset) — the tool just returns what the backend reports; empty `requests` on lightpanda is acceptable, not an error.
4. **Modifiers are held, then released** around the key press (down in order, up in reverse) — enables combos like `Shift+Enter` or `Control+A`. For a browser-level refresh combo the LLM should use `Page.reload` (synthetic keys can't trigger browser UI shortcuts).
5. **`formatDevtoolsToolResponse` needs no change** — it just JSON-serializes the handler payload.
6. **No cache-key / session concerns** — devtools tools are not cached and don't touch the ref-id memory.

## Verification

```bash
docker compose exec navigator npm install --include=dev   # dev deps are pruned on every container start
docker compose exec navigator npx vitest run tests/devtools.test.js

# Code is bind-mounted; restart so the live server picks up the new module code
docker compose restart navigator

# Live check via MCP tools (names as exposed to the LLM client):
#   browser_Target_createTarget(url: "https://example.com")
#   browser_Network_getRequests(targetId: "<id>")            → lists loaded requests
#   browser_Page_reload(targetId: "<id>", ignoreCache: true) → reloaded: true, cacheToggled: true
#   browser_Input_dispatchKeyEvent(targetId: "<id>", key: "F5")  → pressed, but NO browser reload (expected)
#   browser_Page_goBack(targetId: "<id>")                    → navigated: true, url changed
#   browser_Page_goForward(targetId: "<id>")                 → navigated: true, url back to original
```

Also confirm:
- `tools/list` (via `curl POST /mcp` or the web console) shows 18 devtools tool definitions.
- `Network.getRequests` with `filter: "api"` and `failedOnly: true` narrow correctly.
- `Page.goBack` on a freshly created `about:blank` target returns `navigated: false` (no crash).

## Risks / Decisions

- **`setCacheEnabled` on lightpanda:** may throw → caught, falls back to a normal reload, `cacheToggled: false`. Verified `cacheToggled` makes the degradation visible instead of silently claiming a hard refresh.
- **Network event fidelity per backend:** Chromium/cloakbrowser give full request/response/failure data; lightpanda may give less. Documented as acceptable — the tool reports what the backend sees.
- **Tool count is asserted in tests** (`tests/devtools.test.js:16-33`) — extend the names list rather than replacing it, so the existing assertions keep guarding the original 14.
- **`activityCategoryForTool` prefix list is the only cross-file change** — miss it and `Network.getRequests` gets bucketed as a `web` activity in stats/feed. Covered by checklist item 5.
