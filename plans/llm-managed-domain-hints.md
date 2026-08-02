# LLM-Managed Domain Hints Plan

## Goal

Let an LLM use domain-hint rules dynamically while calling `web_fetch`, then optionally save validated rules for future requests without editing the repository's `domain-hints.json`.

This has two distinct capabilities:

1. **Call-scoped dynamic hints**: the LLM supplies selectors and extraction rules with one `web_fetch` call. The rule applies only to that request and is never written to disk.
2. **Managed persistent hints**: an explicitly enabled MCP management tool lets a trusted LLM validate, list, add, update, disable, or remove rules in a separate runtime hint store.

The static `domain-hints.json` remains source-controlled, reviewable, and unchanged by LLM requests.

## Why Two Layers

Passing a selector directly with `web_fetch` is useful for one-off pages and for iterating on a rule. Persisting every LLM guess automatically would pollute the shared hint set, serve stale cached output, and allow any connected MCP client to change extraction behavior permanently.

The two layers give an LLM a safe workflow:

1. Inspect a page with the existing browser tools.
2. Call `web_fetch` with a request-only `domainHint`.
3. Check that the output is clean and complete.
4. Call `domain_hints` with `operation: "validate"`.
5. Only when the result is confirmed, explicitly call `operation: "upsert"` to persist it.

Nothing is auto-saved after a fetch.

## Current Constraints

- `web_fetch` selects the first matching entry from the cached `domain-hints.json` list through `findDomainHint()`.
- The selected hint affects navigation waiting, stabilization, skip selectors, section extraction, tables, and SEO candidate selection.
- `web_fetch` caches structured extraction results by request arguments. A persisted hint update must invalidate relevant cached fetches or they will retain output from the old rule.
- Docker Compose bind-mounts the entire project folder at `/app`, including `domain-hints.json`. The static file is source-controlled project state, not a safe runtime database.
- The MCP server currently has no request-level authorization system. Any persistent mutation feature must therefore be disabled by default and separated from the static file.

## Request-Scoped Dynamic Hints

Add an optional `domainHint` object to `web_fetch`.

```json
{
  "url": "https://example.com/product/123",
  "domainHint": {
    "mode": "merge",
    "waitForSelector": "main.product",
    "preferReadability": false,
    "skipSelectors": [".cookie-banner", ".recommendations"],
    "content": {
      "sections": [
        { "selector": "main.product .summary", "label": "Summary", "priority": "high" },
        { "selector": "main.product .specifications", "label": "Specifications", "priority": "high" }
      ]
    }
  }
}
```

### Contract

- `domainHint` applies only to the current `web_fetch` request.
- It is allowed only when the request resolves to one URL. Reject it with `urls` or `ref_ids`, rather than accidentally applying one site's selector to every page in a batch.
- It uses the same validated extraction fields as a persisted hint, except matching metadata is omitted: no `domain`, `pathPattern`, `pageType`, `comment`, IDs, timestamps, or enabled flag.
- `mode` defaults to `merge`:
  - `merge`: resolve the normal effective hint first, then let request fields replace matching top-level fields. `content`, `flags`, and `workflow` are whole-object replacements, not deep merges.
  - `replace`: ignore the normally resolved hint and use only the supplied rule fragment.
- The normalized dynamic hint remains in the web-fetch cache key. Different selectors must never share a cached extraction.
- The default Markdown response remains unchanged. The dynamic rule changes only which content gets extracted.

### First-Version Safety Limit

Call-scoped hints initially support non-interactive extraction only:

- Allowed: `waitForSelector`, `stabilizeStrategy`, `content`, `skipSelectors`, `preferReadability`, and table extraction settings.
- Rejected: `workflow`, authentication flags, visual-only flags, arbitrary browser options, and any executable expression.

The sequential click workflow in `plans/domain-hint-workflows.md` remains separately opt-in. It can later be enabled for dynamic hints only behind an explicit configuration flag after the workflow feature is implemented and tested.

## Managed Persistent Hints

Add a new MCP tool, `domain_hints`, only when `ENABLE_DOMAIN_HINT_MANAGEMENT=1`.

### Tool operations

```json
{ "operation": "list" }
{ "operation": "get", "url": "https://example.com/page" }
{ "operation": "validate", "hint": { "domain": "example.com", "pathPattern": "/products/*", "...": "..." } }
{ "operation": "upsert", "hint": { "id": "example-product", "domain": "example.com", "pathPattern": "/products/*", "...": "..." } }
{ "operation": "disable", "id": "example-product" }
{ "operation": "remove", "id": "example-product" }
```

- `list` returns managed hints only, with IDs, match fields, enabled state, priority, timestamps, and a compact rule summary.
- `get` reports the effective rule for a URL and its source: `request` is not applicable here, `managed`, `static`, or none. It must not expose unrelated rules.
- `validate` performs the exact same schema and selector validation as `upsert`, but makes no change.
- `upsert` creates or replaces a managed hint by stable `id`.
- `disable` preserves the rule and audit metadata but removes it from matching.
- `remove` permanently deletes a managed rule only from the managed store. It can never remove an entry from static `domain-hints.json`.

All operations return JSON text in MCP content, consistent with the planned `web_fetch` JSON representation. Mutation results include the saved rule ID, source, revision, and effective-match summary.

### Managed hint shape

Managed hints use the existing full hint shape plus management metadata:

```json
{
  "id": "example-product-v1",
  "enabled": true,
  "priority": 50,
  "domain": "example.com",
  "pathPattern": "/products/*",
  "pageType": "product",
  "comment": "Product summary and specifications verified on 2026-08-02.",
  "waitForSelector": "main.product",
  "preferReadability": false,
  "content": {
    "sections": [
      { "selector": "main.product", "label": "Product", "priority": "high" }
    ]
  },
  "createdAt": "2026-08-02T12:00:00.000Z",
  "updatedAt": "2026-08-02T12:00:00.000Z"
}
```

Rules:

- `id`, `domain`, `pathPattern`, `pageType`, and `comment` are required for managed rules.
- `id` matches `[a-z0-9][a-z0-9-]{0,79}`.
- `priority` is optional, integer `0`-`100`, default `50`.
- Existing selector, section, field, table, and workflow validation applies.
- LLM-generated comments must say what the rule targets and why it was chosen. They must not contain prompts, credentials, or unbounded page text.

## Resolution and Precedence

Build one effective rule for each requested URL using this order:

1. Request-scoped `domainHint` with `mode: "replace"`.
2. Request-scoped `domainHint` with `mode: "merge"` over the best persisted/base rule.
3. Enabled managed rule.
4. Static source-controlled rule from `domain-hints.json`.
5. No hint, using existing generic extraction.

Inside the managed store, matching rules are ordered by:

1. Higher `priority`.
2. More specific `pathPattern` (more literal path characters, then fewer wildcards).
3. Earlier stable file order as the tie-breaker.

Static hints retain their current first-match behavior and ordering. Managed hints are an overlay: they can override static behavior without modifying the static file.

## Persistence and Deployment

Add configuration:

| Variable | Default | Purpose |
|---|---|---|
| `ENABLE_DOMAIN_HINT_MANAGEMENT` | `0` | Advertise and enable the mutating `domain_hints` MCP tool. |
| `DOMAIN_HINTS_MANAGED_PATH` | `/data/navigator/domain-hints.managed.json` | Persistent runtime-overlay file. |
| `ENABLE_DYNAMIC_HINT_WORKFLOWS` | `0` | Future opt-in for call-scoped click workflows after the workflow feature ships. |

Update Docker Compose with a dedicated named volume mounted at `/data/navigator`. Do not store managed rules under `/app`, because that directory is the source bind mount.

Implement a `ManagedDomainHintStore` in `src/domain-hints.js`:

- Load the managed JSON array lazily and cache it with a monotonic revision number.
- Serialize mutations through one in-process write queue.
- Validate before mutating memory or disk.
- Write atomically: create a temporary file in the same directory, set mode `0600`, then rename it over the old file.
- Create an empty store if it does not yet exist.
- On every successful mutation, increment the revision, clear the domain-hint resolution cache, and clear the `web_fetch` cache.
- Never write the static hint file.

Managed rules are operational configuration, not Git changes. Exporting a good managed rule into `domain-hints.json` remains an explicit human review and commit step.

## Implementation

### 1. Canonical schema and resolver

Refactor the current informal test-only validation into reusable functions in `src/domain-hints.js`:

- `validateHintRule(rule, { scope })` validates static, managed, and request scopes without allowing scope-inappropriate fields.
- `validateSelector()` uses JSDOM exactly as current tests do for syntax validation.
- `resolveDomainHint({ url, staticHints, managedHints, requestHint })` returns `{ hint, source, revision }`.
- `mergeDomainHints(base, override)` creates a new object and never mutates cached static or managed rule objects.

Keep `findDomainHint()` as the static first-match helper or fold it into the resolver while retaining current behavior for static-only requests.

### 2. Integrate request hints with `web_fetch`

In `src/mcp-server.js`:

- Add the `domainHint` schema property as an object with documented fields and `mode: ["merge", "replace"]`.
- Validate a request hint before resolving target pages.
- Reject request hints for multi-target calls.
- Pass the normalized request hint to `openTargetsParallel()` and then `browserOpenAndExtract()`.
- Include the normalized request hint in cache arguments. Keep `maxChars`, `format`, and `bypassCache` excluded because they are response/cache-control concerns.

In `src/search.js`:

- Resolve the effective hint with static, managed, and request layers before navigation waits and extraction.
- Retain current behavior when no managed or request hint exists.
- Log only the rule source, ID, page type, and debug timing under `DEBUG=1`; do not log all selectors or content from a management request by default.

### 3. Add the management tool

In `src/mcp-server.js`:

- Advertise `domain_hints` only when management is enabled in config.
- Implement `list`, `get`, `validate`, `upsert`, `disable`, and `remove` through the managed store.
- Require `additionalProperties: false` for all operation schemas.
- Reject mutation operations when management is disabled, even if a caller invokes the handler directly.
- Record management operations in existing request telemetry, but redact rule bodies and selectors from error summaries.

### 4. Cache correctness

- Keep request-hint objects in the stable web-fetch cache key.
- Include the managed-hint revision in web-fetch cache arguments or clear the entire web-fetch cache after every managed mutation. Prefer revisioned cache keys if it can be done without retaining old revisions indefinitely; otherwise clear the small bounded cache immediately after mutation.
- Request-only hints must never change the managed revision or invalidate unrelated cache entries.
- Add a result metadata field internally for `hintSource` and `hintId`; expose it in JSON output once the web-fetch JSON formatter lands. Do not alter default Markdown output merely to display diagnostics.

### 5. Dynamic workflows, later

After `plans/domain-hint-workflows.md` is complete:

- Managed hints may contain a validated `workflow` because only a trusted, explicitly enabled management tool can save them.
- Request-scoped workflows remain rejected unless `ENABLE_DYNAMIC_HINT_WORKFLOWS=1`.
- When that flag is enabled, apply the exact workflow limits: extract/click actions only, exact one-element click selector, required post-click selector, 8-step/4-click/45-second bounds, no login or form actions.

## Tests

### Schema and resolver tests

1. Existing static hint selection remains first-match and unchanged.
2. Managed hints override static hints by priority and pattern specificity.
3. A request `merge` override preserves unspecified base fields.
4. A request `replace` override ignores the base rule.
5. Dynamic hints are rejected for multi-page fetches.
6. Invalid selectors, unknown properties, malformed IDs, invalid priority, and prohibited request-scope fields fail with actionable errors.

### Managed-store tests

1. First mutation creates the managed store atomically.
2. Upsert, list, get, disable, and remove persist and reload correctly.
3. Static hints are never modified.
4. Failed validation leaves in-memory and on-disk store contents unchanged.
5. Concurrent mutations are serialized and do not lose entries.
6. Store writes use a temporary sibling path and do not leave it behind after success or failure.

### Integration tests

1. A call-scoped `domainHint` changes extracted sections for one fetch and is not reused by a later plain fetch.
2. Distinct dynamic hints for the same URL do not share cache entries.
3. Upserting/disabling/removing a managed rule invalidates stale cached fetch output.
4. Management tool is absent when disabled and rejects direct mutation attempts.
5. Management response metadata does not leak full rules in telemetry logs.
6. Dynamic workflows are rejected by default and only accepted after their feature flag plus workflow implementation are present.

### Live verification

1. Inspect one stable public page using the persistent browser tools.
2. Fetch it with a request-only dynamic hint and compare text with the screenshot/DOM.
3. Validate and upsert the same rule into a temporary managed store.
4. Fetch without `domainHint` and verify the managed rule now applies.
5. Disable it, verify generic/static extraction resumes, then remove it.

Run all tests inside the container:

```bash
docker compose exec navigator npm install --include=dev
docker compose exec navigator npx vitest run
docker compose exec navigator npm run lint
```

## Documentation

Update `AGENTS.md` and the public tool contract with:

- The request-scoped `domainHint` format, merge/replace semantics, and single-target limit.
- The `domain_hints` management tool and its disabled-by-default requirement.
- Managed-store path, Docker volume, and backup/export guidance.
- The rule that a successful dynamic fetch does not auto-save a hint.
- The staged workflow-interaction capability and its default denial for call-scoped rules.

## Non-Goals

- Automatically trusting, saving, or promoting every LLM-generated selector.
- Allowing untrusted HTTP callers to mutate source-controlled hint files.
- Authentication, credential storage, checkout, form submission, arbitrary JavaScript, or CAPTCHA bypass.
- Synchronizing managed hints to Git automatically.
- Replacing domain-specific browser inspection and live validation with LLM guesses.
