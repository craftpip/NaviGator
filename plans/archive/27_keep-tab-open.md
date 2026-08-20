# Plan 27: Keep Tab Open — Replace Cached HTML in Hint Test Panel

**Created:** 2026-08-17
**Status:** Implemented

---

## Problem

The hint test panel's "Use cached page HTML" checkbox caches HTML in a server-side Map and re-extracts from the snapshot. This causes stale-cache bugs — the second run after toggling cache produces wrong output because the cached HTML doesn't reflect the actual page state.

## Solution

Replace "Use cached page HTML" with "Keep window open" — a persistent browser tab that stays alive between test runs. Each test navigates the same live tab and extracts from real DOM. The tab auto-closes after 5 minutes of inactivity (existing target timeout).

## Scope

### In scope
- New console API endpoints for tab lifecycle (create, close)
- `/extract` endpoint accepts `targetId` to navigate an existing tab
- Hint test panel: replace `useCachedHtml` with `keepTabOpen` + `targetId`
- Remove all `cacheHtml` param handling from the test panel

### Out of scope
- Changes to `web_fetch` MCP tool's caching
- Changes to `/extract` endpoint's existing `cacheHtml` behavior (other callers)
- Changes to `browserOpenAndExtract()` cached HTML paths

---

## Design

### Server: Tab management endpoints

**`POST /console/api/tabs`** — create a persistent tab
- Body: `{ url?: string, viewport?: { width, height } }`
- Calls devtools `createTarget({ url, viewport })`
- Returns `{ targetId }`
- The tab stays alive with 5-minute inactivity timeout (existing behavior)

**`DELETE /console/api/tabs/:targetId`** — close a persistent tab
- Calls devtools `closeTarget({ targetId })`
- Returns `{ ok: true }`
- Safe to call if already closed (no-op)

### Server: `/extract` with `targetId`

When `targetId` query param is provided:
1. Look up the persistent tab by ID (from devtools `targetsById`)
2. Navigate the existing page to the test URL
3. Wait for stabilization
4. Extract from the live page using the hint (same extraction pipeline)
5. Return the result — page stays open for next run
6. Do NOT close the page

When `targetId` is NOT provided: existing behavior (open new page, extract, close).

### Client: HintTestPanel

- `keepTabOpen` state (boolean) replaces `useCachedHtml`
- `targetId` ref stores the persistent tab ID
- When "Keep window open" toggled ON: `POST /console/api/tabs` → store targetId
- When "Keep window open" toggled OFF: `DELETE /console/api/tabs/:targetId` → clear
- Each test run: if targetId, append `&targetId=xxx` to `/extract` URL
- Status bar shows "tab open" instead of "cache: hit/miss"
- Component unmount: close tab if still open

---

## File Change Summary

| File | Change |
|------|--------|
| `src/mcp-server.js` | Add `POST /console/api/tabs`, `DELETE /console/api/tabs/:targetId`; add `targetId` path in `/extract` endpoint |
| `src/web-console/src/main.jsx` | Replace `useCachedHtml` with `keepTabOpen` + `targetId` in `HintTestPanel` |
