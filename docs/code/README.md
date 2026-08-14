# Code Reference

This section explains how the implementation behaves and where its safe change boundaries are. It complements the architecture and API guides with the decisions behind the server, browser, drivers, state, runtime, and tests.

| Document | Source coverage |
|---|---|
| [Core Server and Search](core-server-search.md) | `src/mcp-server.js`, `src/search.js` |
| [Browser and DevTools](browser-and-devtools.md) | `src/browser.js`, `src/devtools.js` |
| [Support Modules](support-modules.md) | Configuration, hints, database, activity, Markdown, references, ASCII, VNC, auth, scheduler, and timers |
| [Search Drivers](search-drivers.md) | Every file under `src/engines/` and the route registry contract |
| [Runtime and Tests](runtime-and-tests.md) | `navigator.js`, Compose, entrypoint, web console, scripts, and tests |

## Maintenance Rule

Every implementation area must appear in one of these documents. Update the owning guide whenever a behavior, condition, fallback, storage contract, operational limit, or safe change boundary changes. Source references should help maintainers trace behavior, not replace this documentation with a code inventory.
