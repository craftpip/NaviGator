# Tool error logging (LOG_TOOL_ERRORS, default on)

## Plan Status

**Status: COMPLETE — ABSORBED** (verified + absorbed 2026-08-10). Implemented and committed (`880574e feat: add LOG_TOOL_ERRORS for persistent tool error logging`). Durable knowledge folded into `AGENTS.md` → [Navigator CLI and Stats](#navigator-cli-and-stats) → Tool error logging; this file archived to `plans/archive/` for history.

### Checklist

- [x] Config: `logToolErrors` (`src/config.js:272`), default `true`, independent of `DEBUG`.
- [x] `logToolError()` helper (`src/mcp-server.js`, exported) — JSON line, redacted args, stack, transport/session/ms context.
- [x] Wired into the SDK catch path (`CallToolRequestSchema` handler) — stdio + session HTTP.
- [x] Stateless POST gap closed (`handleStatelessMcpPost` `tools/call` wrapped in try/catch).
- [x] `redactArgs` (secrets + `insertText` typed text → char count only).
- [x] File output `logs/tool-errors.log`, auto-mkdir, ~5MB rotation to `.1`; `*.log` gitignored.
- [x] Tests (6) in `tests/mcp-server.test.js`: disabled writes nothing, enabled writes line, default-on, redaction, rotation.
- [x] Live verification: failing `web_fetch` writes `logs/tool-errors.log` on host bind mount.
- [x] Consumed by web console `/console/logs` handler (`src/mcp-server.js:2416`).

## Goal

Keep a persistent, greppable log of every tool call that errors, so when a
similar problem shows up again we can fix it straight from the log instead of
reproducing the whole session. Gated by `LOG_TOOL_ERRORS` — default **true**, so
production logs errors too. Set `LOG_TOOL_ERRORS=false` to turn it off. This is
deliberately NOT tied to `DEBUG` (`DEBUG` stays about verbose `web_fetch`
timing; error logs should exist in production).

Status: implemented.

## Config

`src/config.js:272`:

```js
logToolErrors: parseBoolean(process.env.LOG_TOOL_ERRORS, true),
```

Default `true`. No compose change needed to enable — it's on out of the box.

## What exists today

- Every tool call already logs to console: `📡 <req>`, `📨 <ms>ms`, and on
  error `❌ tool <name> failed: <msg>` + stack. Always on, but only in `docker
  logs` — no persistent file, no structured record.
- `web_fetch` per-step timing logs are DEBUG-gated (the `debug` param threaded
  through `openTargetsParallel` / `extractTextFromHtml`). Error logging is a
  separate concern from that.
- `logEvent(label, payload)` (src/mcp-server.js:270) is a console-only formatter
  for boot/http lifecycle lines. Not file-backed.

## The two error paths (the important part)

| Path | Where errors surface | Context kept? |
|------|----------------------|---------------|
| SDK transport — stdio + session HTTP (`CallToolRequestSchema`, src/mcp-server.js:1750) | catch at line 1767 logs `❌ tool <name> failed` + stack | Yes — tool name + args via `mcpRequestSummary` |
| Stateless POST (`handleStatelessMcpPost`, src/mcp-server.js:1684) | had NO try/catch around `handleToolCall` — errors bubbled to the outer http catch as a generic `http.error` 500 | No — tool name and args were lost |

All tools (web_search/web_fetch/devtools) go through `handleToolCall`, so both
paths cover everything — devtools errors included, no changes needed in
`src/devtools.js`.

## What was built

### 1. `logToolError` helper in `src/mcp-server.js` (exported)

```js
export async function logToolError({ tool, args, error, ms, transport, sessionId, logToolErrors, logPath, maxBytes }) {
  if (logToolErrors === undefined) logToolErrors = manager?.config?.logToolErrors;
  if (!logToolErrors) return;
  const entry = {
    ts: new Date().toISOString(),
    level: "tool_error",
    tool,
    transport,               // "mcp" | "stateless"
    ...(sessionId ? { sessionId } : {}),
    ...(Number.isFinite(ms) ? { ms } : {}),
    args: redactArgs(args),  // never secrets
    error: String(error?.message || error),
    ...(error?.stack ? { stack: truncateStr(String(error.stack), 2000) } : {})
  };
  await appendToolErrorLog(logPath || TOOL_ERROR_LOG_PATH, JSON.stringify(entry) + "\n", maxBytes || MAX_TOOL_ERROR_LOG_BYTES);
}
```

- Gate reads `manager?.config?.logToolErrors` (module-scope `manager`, same
  pattern as `runWithHangGuard`). `logPath` / `maxBytes` / `logToolErrors`
  params are test seams — call sites never pass them.
- `transport` values are `"mcp"` (SDK handler — stdio and session HTTP both go
  through `CallToolRequestSchema`) and `"stateless"` (raw POST without session).
- `redactArgs` (exported): keys matching
  `/password|passwd|token|secret|api[_-]?key|authorization|bearer|cookie/i`
  → `"[REDACTED]"`. For `Input.insertText`, the `text` value is logged only as
  `"<N chars>"` (typing a password is exactly what insertText does).
- File: one JSON line per error, appended to `logs/tool-errors.log` under the
  working dir (`/app/logs` on the host since the repo is bind-mounted).
  Auto-mkdir. Past ~5MB, rotates to `tool-errors.log.1` and starts fresh.
  `*.log` is already in `.gitignore`.

### 2. Wired into the SDK catch (src/mcp-server.js:1767)

`logToolError({ tool: name, args, error, ms: Date.now() - t0, transport: "mcp" })`
next to the existing `❌` console lines. Console lines untouched.

### 3. Closed the stateless gap (src/mcp-server.js:1684)

`tools/call` branch of `handleStatelessMcpPost` wrapped in try/catch —
logs with full context, then rethrows to keep the current 500 behavior.

### 4. Tests

In `tests/mcp-server.test.js` (6 tests):

- `logToolErrors: false` → nothing written, no file created.
- `logToolErrors: true` → file created, one JSON line, has tool + error + ts.
- default (no param, manager config has `logToolErrors: true`) → writes.
- secrets redacted: `insertText` `text: "hunter2"` writes `"<7 chars>"` not
  `hunter2`; an `apiKey` arg writes `"[REDACTED]"`.
- rotation: tiny `maxBytes` forces a `.1` backup.

## Verification

- `npx vitest run tests/mcp-server.test.js` green (61 tests).
- Live, no flag (production config, `LOG_TOOL_ERRORS` unset → default true):
  failing `web_fetch` writes `logs/tool-errors.log` with one JSON line
  (tool, redacted args, error, stack). Confirmed on host at
  `/www1/navigator/logs/tool-errors.log` (bind mount).

## Out of scope

- Not touching `docker logs` console lines (project rule: keep console logging).
- Not tying error logging to `DEBUG` — `LOG_TOOL_ERRORS` is its own switch,
  default true.
- No changes in `src/devtools.js` — its errors already flow through the two
  paths above.
