# Manage Option Relationships

## Goal

Regroup `/console/manage` around settings that directly enable, constrain, or configure the same behavior. The current category is only a presentation category; it does not describe every runtime dependency.

This plan originally covered the 43 settings rendered on Manage and six active scheduler settings that were present in `docker-compose.yml` and `loadConfig()` but missing from `CONFIG_SCHEMA`.

## Current State

- The UI derives headings from `CONFIG_SCHEMA[].category`, with special subgroups only for browser executable/launch settings in `web-console/src/main.jsx`.
- Manage now shows 49 entries in the dependency-based groups below. The six `SEARCH_QUEUE_*` settings are included and hot-apply through the existing scheduler configuration path.
- `MCP_API_KEYS` is intentionally managed through `/console/keys`, not exposed as a raw environment-field in Manage.
- The six `SEARCH_QUEUE_*` settings are active in `src/engine-scheduler.js` and exposed through `CONFIG_SCHEMA`.

## Relationship Map

`A -> B` means B depends directly on A or uses A as part of the same runtime decision. `A <-> B` means the settings constrain each other.

### Browser Selection And Launch

```text
BROWSER_BACKEND
  -> direct web_fetch and web_page_screenshot backend
  -> default backend when a search route does not specify one
  -> browser prelaunch target
  -> HEADLESS, BROWSER_USER_AGENT, BROWSER_OP_TIMEOUT_MS

DEVTOOLS_BROWSER_BACKEND
  -> all devtools-tool browser pages
  -> HEADLESS, BROWSER_USER_AGENT, BROWSER_OP_TIMEOUT_MS, NAV_WAIT_UNTIL

PRELAUNCH_BROWSER
  -> BROWSER_BACKEND
  -> STARTUP_URL
  -> SEARCH_ROUTE_WARMUP_ENGINES

HEADLESS <-> ENABLE_VNC
  HEADLESS=false requires ENABLE_VNC=true.
  The VNC control always writes these as a pair and relaunches the default
  backend. VNC does not make Lightpanda graphical.

BROWSER_BACKEND=chromium
  -> CHROME_PATH, CHROME_USER_DATA_DIR, CHROME_PROFILE_DIR
BROWSER_BACKEND=cloakbrowser
  -> CLOAKBROWSER_BINARY_PATH
BROWSER_BACKEND=lightpanda
  -> LIGHTPANDA_PATH, LIGHTPANDA_PORT

BROWSER_USER_AGENT
  -> every browser backend and the DuckDuckGo API route
```

### Search Routes, Capacity, And Scheduler

```text
SEARCH_ENABLED_ENGINES
  -> the select_best candidate set
  -> all SEARCH_QUEUE_* scheduling rules
  -> SEARCH_ROUTE_CIRCUIT_OPEN_MS

SEARCH_ROUTE_WARMUP_ENGINES
  -> PRELAUNCH_BROWSER
  -> SEARCH_KEEP_MIN_WORKING_WINDOWS
  -> SEARCH_MAX_WORKING_WINDOWS

SEARCH_KEEP_MIN_WORKING_WINDOWS <-> SEARCH_MAX_WORKING_WINDOWS
  min <= max is enforced in both initial config loading and hot apply.

SEARCH_QUEUE_MIN_INTERVAL_MS <-> SEARCH_QUEUE_MAX_INTERVAL_MS
  min <= max is enforced by EngineScheduler.
SEARCH_QUEUE_ESCALATION_FACTOR
  -> cooldown growth between the queue min/max intervals.
SEARCH_QUEUE_READY_INTERVAL_MS
  -> minimum gap before a healthy engine may be selected again.
SEARCH_QUEUE_EXPLORATION_EVERY
  -> periodic non-leading healthy engine selection.
SEARCH_QUEUE_LATENCY_SAMPLES
  -> latency history used to rank ready engines.

SEARCH_ROUTE_CIRCUIT_OPEN_MS
  -> route-level cooldown after a browser-driver failure.
  This is distinct from, but operationally adjacent to, the scheduler's
  per-engine cooldown settings above.

OPEN_PAGE_MAX_PARALLEL <= MAX_CONCURRENT_PAGE_OPS
  The first caps one multi-target fetch/screenshot request; the second caps
  every browser page operation across all callers. This inequality is not
  currently validated, but is the safe operational relationship.

HUMAN_TYPING_DELAY
  -> devtools Input.insertText only; it is not a search setting.
```

### Page Loading And Extraction

```text
BROWSER_OP_TIMEOUT_MS
  -> page navigation, selector waits, extraction, screenshots, devtools, and
     search-browser drivers (DuckDuckGo API caps its own request at 15 seconds)

NAV_WAIT_UNTIL
  -> direct screenshots and devtools navigation
  This is separate from search-driver navigation, which owns route-specific
  wait behavior.

STABILIZE_STRATEGY
  -> web_fetch page settling after navigation
DOMAIN_HINTS_PATH
  -> per-domain extraction hints, including a hint-specific stabilization override
WEB_FETCH_MAX_CHARS
  -> default response truncation for web_fetch only
```

### HTTP Exposure, Console, And MCP Access

```text
ENABLE_HTTP_HEALTH OR ENABLE_HTTP_MCP
  -> starts the HTTP server

ENABLE_WEB_CONSOLE
  -> /console UI and all console management endpoints
  -> Web tools page additionally requires ENABLE_HTTP_MCP

ENABLE_HTTP_MCP
  -> /mcp transport
  -> Web tools console page (/console/mcp)
  -> MCP_ALLOW_UNAUTHENTICATED and API keys have no external effect unless this
     endpoint is enabled

MCP_ALLOW_UNAUTHENTICATED <-> API keys page
  When false, /mcp accepts only a configured API key. The API keys page owns
  key creation, revocation, and per-key tool access rather than raw MCP_API_KEYS.

ENABLE_STDIO_MCP
  -> stdio transport; independent of HTTP exposure
ENABLE_DEVTOOLS_MCP
  -> whether devtools tools are registered in MCP
  -> DEVTOOLS_BROWSER_BACKEND
DISABLE_TOOLS
  -> final tool exposure/filter for all transports; can disable either web or
     devtools tools regardless of the earlier enable settings.

MCP_API_PORT
  -> HTTP server listener and Docker port publication
MCP_API_HOST
  -> displayed/logged base URL only
```

### Screenshot Delivery And VNC

```text
ENABLE_SCREENSHOT_PATH
  -> allows file output and persists screenshot bytes
ENABLE_SCREENSHOT_DOWNLOAD_LINK
  -> enables /download/:id URLs
  -> URL output mode; it should be shown beside storage because a URL is only
     useful while its generated screenshot file is retained

ENABLE_VNC
  -> HEADLESS and VNC relaunch workflow
  -> VNC_PORT and NOVNC_PORT
VNC_PORT
  -> x11vnc listener
NOVNC_PORT
  -> noVNC listener, Docker port publication, and console Open VNC action
```

### Reliability And Diagnostics

```text
ENABLE_HANG_RESTART -> HANG_RESTART_TIMEOUT_MS
DEBUG -> detailed timing output for fetch-related operations
LOG_TOOL_ERRORS -> logs/tool-errors.log
```

## Recommended Target Groups

The numbers identify the intended order. Each setting appears once; cross-links should be shown as small inline dependency notes, not duplicated fields.

1. **Browser Defaults**
   `BROWSER_BACKEND`, `DEVTOOLS_BROWSER_BACKEND`, `BROWSER_USER_AGENT`, `BROWSER_OP_TIMEOUT_MS`

2. **Backend Installations**
   `CHROME_PATH`, `CHROME_USER_DATA_DIR`, `CHROME_PROFILE_DIR`, `CLOAKBROWSER_BINARY_PATH`, `LIGHTPANDA_PATH`, `LIGHTPANDA_PORT`
   Conditional display: only show the selected default/devtools backends by default, with an expandable "Other installed backends" area.

3. **Browser Startup And Desktop Access**
   `PRELAUNCH_BROWSER`, `STARTUP_URL`, `HEADLESS`, `ENABLE_VNC`, `VNC_PORT`, `NOVNC_PORT`
   `HEADLESS` and `ENABLE_VNC` must be visually paired and saved together by the dedicated VNC action, not as unrelated table rows.

4. **Search Route Availability**
   `SEARCH_ENABLED_ENGINES`, `SEARCH_ROUTE_WARMUP_ENGINES`, `SEARCH_ROUTE_CIRCUIT_OPEN_MS`, `SEARCH_KEEP_MIN_WORKING_WINDOWS`, `SEARCH_MAX_WORKING_WINDOWS`

5. **Search Scheduler**
   `SEARCH_QUEUE_MIN_INTERVAL_MS`, `SEARCH_QUEUE_MAX_INTERVAL_MS`, `SEARCH_QUEUE_ESCALATION_FACTOR`, `SEARCH_QUEUE_READY_INTERVAL_MS`, `SEARCH_QUEUE_EXPLORATION_EVERY`, `SEARCH_QUEUE_LATENCY_SAMPLES`
   Add these missing six settings to `CONFIG_SCHEMA`, `HOT_APPLYERS`, validation, and the Manage view before this group is considered complete.

6. **Page Operations And Extraction**
   `OPEN_PAGE_MAX_PARALLEL`, `MAX_CONCURRENT_PAGE_OPS`, `NAV_WAIT_UNTIL`, `STABILIZE_STRATEGY`, `DOMAIN_HINTS_PATH`, `WEB_FETCH_MAX_CHARS`
   Include inline limits: `OPEN_PAGE_MAX_PARALLEL` should not exceed `MAX_CONCURRENT_PAGE_OPS`.

7. **MCP Transports And Tool Access**
   `ENABLE_HTTP_MCP`, `ENABLE_STDIO_MCP`, `ENABLE_DEVTOOLS_MCP`, `DISABLE_TOOLS`, `MCP_ALLOW_UNAUTHENTICATED`
   Link directly to API keys for credential management. Explain that API-key enforcement applies to HTTP MCP only.

8. **HTTP Server And Console**
   `ENABLE_HTTP_HEALTH`, `ENABLE_WEB_CONSOLE`, `MCP_API_PORT`, `MCP_API_HOST`
   The group caption must state that at least one HTTP endpoint is required for the server to start.

9. **Screenshot Storage And Downloads**
   `ENABLE_SCREENSHOT_PATH`, `ENABLE_SCREENSHOT_DOWNLOAD_LINK`

10. **Reliability And Logging**
    `ENABLE_HANG_RESTART`, `HANG_RESTART_TIMEOUT_MS`, `DEBUG`, `LOG_TOOL_ERRORS`

## Implementation Steps

1. Completed: confirmed this target information architecture with the user.
2. Completed: added the six `SEARCH_QUEUE_*` entries to `CONFIG_SCHEMA` with hot-apply support.
3. Completed: covered scheduler configuration with focused scheduler, config, and server tests.
4. Completed: replaced category-only headings with the explicit group map in `web-console/src/main.jsx`.
5. Completed: added dependency annotations for every group.
6. Completed: added the MCP-access link to `/console/keys`.
7. Completed: built, deployed, and verified the actual Manage page in Chromium.

## Decisions Needed

- Whether all backend installation fields should remain visible or be conditionally collapsed when their backend is not selected.
- Whether `MCP_ALLOW_UNAUTHENTICATED` should remain editable on Manage or move fully to API keys, where its related credentials already live.
- Whether the console should enforce `OPEN_PAGE_MAX_PARALLEL <= MAX_CONCURRENT_PAGE_OPS` or show it only as a warning.
