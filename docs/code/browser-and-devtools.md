# Browser And Devtools

`src/browser.js` owns browser processes, backend selection, global page capacity, and reusable search windows. `src/devtools.js` exposes a bounded persistent-tab debugging surface over that manager. The separation matters: direct fetches create short-lived pages, while devtools targets deliberately keep a page and its observed state alive.

## Backend Dispatch

Navigator supports Chromium, CloakBrowser, and Lightpanda. A direct page operation uses the requested backend or `BROWSER_BACKEND`; a search route always wins over that default and uses the backend declared in the engine registry. This means changing the default backend changes `web_fetch` and direct screenshots, but does not redirect a route such as `bing_lp` or `google_cb`.

All new pages receive the configured user agent and navigation/default timeouts. Chromium pages are opened as real CDP windows rather than reusing a tab. Chromium maintains a keepalive page so the process does not exit after temporary pages close. CloakBrowser launches with its humanization and fingerprint configuration. Lightpanda first attempts to attach to an existing CDP endpoint, otherwise starts an owned server, waits up to 15 seconds for it, and adds navigator anti-automation patches before page scripts run.

Backend disconnect events clear only the affected pooled search windows. This is intentional: a failed backend must not return detached pages to future requests, but working backends can continue.

## Chromium Profile Recovery

Chromium uses the configured user-data and profile directory. A launch that fails for a profile lock first removes known singleton lock files and retries. If it remains locked, the manager creates a temporary profile clone that omits locks and volatile caches; a non-default configured profile is copied to `Default` inside that clone. The temporary clone is removed on shutdown.

Do not generalize this cleanup to arbitrary profile files. The recovery path is deliberately limited to known Chromium lock state so it does not discard user browser data.

## Capacity And Search Windows

Every temporary direct page and search route must run through the global page-operation limiter. It queues callers once `MAX_CONCURRENT_PAGE_OPS` is reached and releases exactly one waiter after a task finishes, including failures. This prevents parallel fetches, screenshots, and searches from exhausting browser resources.

Search has a second level of reuse: browser routes acquire a working page from a pool, submit the search, extract results, and release it. Pools are per engine for CloakBrowser and Chromium routes. Lightpanda routes use one shared pool and are limited to one window because they share a backend. Startup warmup can keep a configured minimum number of persistent windows open; demand above that minimum creates temporary windows up to the configured maximum. On release, excess nonpersistent windows close, while remaining pages can be promoted to satisfy the minimum. Closed or detached pages are pruned before reuse and wake queued waiters.

Source: backend and pool policy in `BrowserManager.newPage()`, `_poolEngine()`, and search-window acquire/release paths in `src/browser.js`.

## Lifecycle, Health, And VNC

Browser instances are initialized lazily and concurrent callers share the same launch promise. Optional prelaunch starts the default backend and warms browser search routes; warmup failures are isolated so normal demand can retry later. Instance statistics are bounded to 750 ms per backend so `/stats` cannot hang on a broken CDP connection.

Changing headless/VNC mode restarts all active graphical backends, not only the configured default. Search and devtools can use a different graphical backend. Lightpanda is CDP-only, so a Lightpanda default may still restart a graphical route for VNC. Shutdown closes browser instances, disconnects rather than closes an externally owned Lightpanda server, terminates an owned one, clears pools, and removes any temporary Chromium profile.

## Persistent Devtools Targets

Developer browser tools are disabled unless `ENABLE_DEVTOOLS_MCP=1`. A target is a persistent page identified by a caller-supplied or random ID. It may open a direct URL or a remembered link reference and uses the configured devtools backend. The manager allows at most 20 active targets; duplicate IDs are rejected.

Each target records its creation and last activity times, title, console messages, and network requests. Observers capture console output, page errors, failed requests, responses, main-frame navigation, and page close events. Console and network histories are each capped at 200 entries. Accessing a target refreshes its activity and tab timer.

`Page.reload` reloads a target and can temporarily disable the HTTP cache for a hard refresh. `Page.goBack` and `Page.goForward` use session history and report when no entry exists in that direction. `Input.dispatchKeyEvent` supports normal renderer keyboard input with ordered modifiers; browser-level shortcuts such as Ctrl+R and F12 cannot be synthesized, so callers must use `Page.reload` instead. `Network.getRequests` reads the per-target rolling request buffer and can filter by URL substring, exact status, or failed requests.

An inactivity sweep runs every 30 seconds. It closes targets idle for five minutes, remembers that closure for ten minutes, and returns a precise "closed due to inactivity" error during that retention period. Explicit close removes the target and tab timer immediately. Navigation is a convenience operation: if its target ID does not exist, it creates that target at the requested URL; other unknown IDs remain errors.

## Inspection And Interaction Model

The devtools API is designed for iterative browser work: create a target, inspect its document, verify a selector, interact, then inspect the changed state. It returns JSON through the MCP formatter rather than flattened prose.

Document and selector inspection reports real DOM attributes, input values, visibility, geometry, generated CSS paths, and XPath. A document snapshot prioritizes semantic content and controls. CSS and XPath lookup both work; CSS removes unsupported text-pseudo syntax before querying. When an element cannot be resolved, element-oriented tools include the page identity and direct callers to document inspection instead of issuing a blind click.

Raw and compact HTML choose `main`, `article`, `[role=main]`, `#content`, or `.content` when no locator is supplied. Compact HTML clones the selected subtree, removes executable/media/noise nodes and comments, preserves useful form/table/link attributes, strips noisy attributes, removes empty nodes, and reports before/after sizes. Both HTML modes cap output at 120,000 characters and mark truncation.

Runtime evaluation is intentionally constrained at the response boundary: values are serialized with depth four, up to 25 object keys or collection entries, cycle markers, DOM element descriptions, and bounded error stacks. Evaluation itself is arbitrary page JavaScript, so it is a debugging capability, not a content-extraction fallback.

Input tools resolve a CSS or XPath target, scroll it into view, and operate at its physical center or through the keyboard. Text insertion focuses the element, clears its old value, types, and returns the read-back value. Key events hold modifiers in the supplied order and release them in reverse. Synthetic keys cannot trigger browser-level shortcuts such as reload or DevTools.

All page evaluation, DOM inspection, and screenshot operations use the configured browser-operation timeout. Target screenshots are always JPEG, default to full-page output, clamp quality to 1-100, and return metadata plus base64 data.

## Safe Changes

- Do not bypass `BrowserManager` to create a page: it would skip backend dispatch, timeouts, user-agent setup, and capacity accounting.
- Preserve route-backend precedence over the default backend; changing it breaks the search-engine registry contract.
- Keep Lightpanda search windows shared and serial. Treating them as independent engine pools permits unsafe concurrent use.
- Do not make persistent devtools targets participate in temporary-page cleanup or extraction pools.
- Keep target, console, network, DOM, and runtime response bounds. These tools are exposed to LLM clients and unbounded page state can consume the MCP response budget.
- Keep inactivity cleanup and its closed-target retention message. It prevents leaked testing tabs while explaining why a formerly valid target ID no longer works.
