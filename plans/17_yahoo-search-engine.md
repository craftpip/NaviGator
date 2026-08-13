# 17 — Add Yahoo Search Engine

Add Yahoo Search (`https://search.yahoo.com/`) as a browser search route. Follows
the exact same pattern as the Bing routes: a shared base driver + thin route
subclasses registered in `src/engines/index.js`. Everything else (circuit
breakers, fallback, scheduling, console, warmup, stats) is keyed off
`SUPPORTED_ENGINES` / engine metadata and picks up the new route automatically —
no orchestrator changes.

## Route choice

| Route | Backend | Pool | Exposed in MCP |
|-------|---------|------|----------------|
| `yahoo_cb` | `cloakbrowser` | `engine` | yes |

**One route only (`yahoo_cb`)** — requested scope. Yahoo's SERP is
React/Tailwind, client-rendered — needs a real JS engine. CloakBrowser is the
anti-bot backend and the default (`BROWSER_BACKEND`), so `yahoo_cb` is the
primary route. **No lightpanda route** — the SERP won't reliably render there
and we have no evidence it works; adding one later is cheap.

`homeUrl` = `https://search.yahoo.com/` (the search host, where the input lives,
not `www.yahoo.com`).

## Verified Yahoo SERP facts (live check 2026-08-13)

- **SERP URL:** `https://search.yahoo.com/search?p=<encoded query>` (canonical
  param is `p`).
- **Search input:** `<input name="p" type="text">` (no id on the live page;
  legacy id was `yschsp`).
- **Results container:** `#web > ol > li`. Row classes: `first` / (none) / `last`.
- **Not every `li` is a result** — the mid-page "related searches" block is also
  an `li` containing `h2.title`. Filter rows to those with a real title link.
- **Title:** `li > div.dd.algo > div.compTitle > a[data-matarget="algo"] > h3.title`.
  The `h3` text is the title; the anchor's `href` is the URL.
- **Snippet:** `li div.compText > p` (class `fc-dustygray fz-14 ...`).
- **Hrefs observed were direct** (e.g. `https://blog.logrocket.com/...`), but Yahoo
  historically wraps links in `https://r.search.yahoo.com/.../RU=.../RV=.../RK=...`
  redirects — unwrap defensively in `normalizeUrl`.
- **Answer boxes are rare** — live tests of a knowledge-card query (`capital of
  france`) returned no answer card, only organic `li` results. Extract any
  `#web .compCardList` / `.compList` / `.dd.AnswerBox` text as a best-effort
  `directAnswers[]`; empty results are fine.

## Files to change

### 1. `src/engines/yahoo-driver.js` (new) — base driver

Mirror `bing-driver.js`. Extends `BrowserSearchDriver` (`./browser-driver.js`).

```js
const RESULT_SELECTORS = ["#web", "#web ol", "#web li.first", "#web li.last"];
const EXTRACT_PAGE = () => {
  const rows = Array.from(document.querySelectorAll("#web ol li")).filter((row) =>
    row.querySelector("h3 a, a[data-matarget='algo']")
  );
  const results = rows.map((row) => {
    const anchor = row.querySelector("h3 a") || row.querySelector("a[data-matarget='algo']");
    const titleEl = row.querySelector("h3");
    const snippetEl = row.querySelector(".compText p");
    return {
      title: titleEl?.textContent || "",
      url: anchor?.href || "",
      snippet: snippetEl?.textContent || ""
    };
  });
  const directAnswers = Array.from(
    document.querySelectorAll("#web .compCardList, #web .compList, #web .dd.AnswerBox")
  ).map((node) => ({ source: "direct_answer", text: node?.textContent || "" }));
  return { results, directAnswers };
};
```

Class fields: `inputSelectors = ["input[name='p']", "input#yschsp"]`,
`resultSelectors = RESULT_SELECTORS`.

`searchUrl(query)` → `` `https://search.yahoo.com/search?p=${encodeURIComponent(query)}` ``.

`assertNotBlocked(page)` — read `document.body.innerText` (same shape as Bing);
throw on `/captcha|unusual traffic|request blocked|are you human|verify you're human/i`.
Yahoo's block page also sometimes 302s to a `https://search.yahoo.com/` bare page
with no `#web` — the `submit()` result-selector timeout already covers that case,
but an explicit check is friendlier for the console.

`extract(page)` → `this.extractViaEvaluate(page, EXTRACT_PAGE)`.

### 2. `src/engines/yahoo-cb.js` (new) — cloakbrowser route

```js
import { YahooDriver } from "./yahoo-driver.js";
export class YahooCbDriver extends YahooDriver {
  id = "yahoo_cb";
  backend = "cloakbrowser";
  pool = "engine";
  homeUrl = "https://search.yahoo.com/";
}
```

### 3. `src/engines/index.js` — register

- Add `import { YahooCbDriver } from "./yahoo-cb.js";`.
- Append `YahooCbDriver` to `DRIVER_CLASSES`. Registry validation
  (unique id, known backend, homeUrl, pool, `searchUrl`/`extract`) runs at load
  time and covers the new route for free.

### 4. `src/engines/util.js` — Yahoo redirect unwrap in `normalizeUrl`

`r.search.yahoo.com` links are `https://r.search.yahoo.com/_ylt=.../RU=<base64url>/RV=.../RK=...` —
the `RU` path segment is the target URL base64-encoded. Add a handler:

```js
if (parsed.hostname === "r.search.yahoo.com") {
  const ru = parsed.pathname.split("/").find((seg) => seg.startsWith("RU="));
  if (ru) {
    const decoded = Buffer.from(ru.slice(3), "base64url").toString("utf8");
    if (decoded) return decoded;
  }
}
```

(Keep it a single decode, base64url — observed links are direct, so a light
handler is enough. Same pattern/comment style as `decodeBingRedirectUrl`.)

### 5. `src/config.js` — default enabled engines

Add `"yahoo_cb"` to `DEFAULT_SEARCH_ENABLED_ENGINES` (the
frozen array, lines ~225–236). `parseEngines` validates against
`SEARCH_ENGINE_VALUES` (derived from `SUPPORTED_ENGINES`), so it starts working
the moment the registry has the route. Order it alongside the other cloakbrowser
routes (after `bing_cb` / `bing_lp`).

### 6. Tests

- `tests/engines.test.js`
  - Update the registry assertion (line ~37): `"registers all 10 internal
    routes"` → `11`, and the expected array gains `"yahoo_cb"`
    (alphabetical: after `mojeek_lp`).
  - Add a `yahoo_cb` extraction case to `cases` (sample HTML: `div#web > ol >
    li > div.dd.algo > div.compTitle > a[data-matarget="algo"] > h3.title` +
    `div.compText > p`, plus a "related searches" `li` with `h2.title` that must
    be filtered out, plus a `#web .compCardList` answer node).
  - Add a block-detection test: `yahoo_cb` throws on a captcha page text, passes
    on a normal results page.
- `tests/browser.test.js`
  - `_poolEngine`: `expect(manager._poolEngine("yahoo_cb")).toBe("yahoo_cb")`
    (engine pool) alongside the cloakbrowser/chromium pool tests (~lines 277–288).
  - `newPage` dispatch table (~line 304): add `["yahoo_cb", "cloakbrowser"]`.
- `tests/config.test.js` — the `DEFAULT_SEARCH_ENABLED_ENGINES` expected arrays
  (~lines 180, 332) gain `yahoo_cb`.

### 7. No changes needed (verify, don't edit)

- `src/mcp-server.js` — the `web_search` `engine` param is a free-form string
  (no hardcoded enum in the schema); dispatch validates against
  `SUPPORTED_ENGINES`. `CONSOLE_ENGINE_REGISTRY` is derived from
  `SUPPORTED_ENGINES`. No edit.
- `src/search.js` — `runSearchEngine` / circuit breakers / `recordEngineAttempt`
  are metadata-keyed. No edit.
- `src/browser.js` — `newPage()` routes by `getEngineMetadata(engine).backend`;
  `_poolEngine` routes by `.pool`. No edit.
- `src/engine-scheduler.js`, `src/config-schema.js`, `navigator.js` — generic.
  No edit.
- AGENTS.md route tables + config docs — update after the code lands (optional
  but keep in sync).

## Deploy & verify (closing the loop)

The repo is bind-mounted; a code change is invisible until the container
restarts.

1. `docker compose exec navigator npm install --include=dev` (entrypoint prunes
   dev deps on every restart) — or run tests before restarting from the host.
2. Run tests:
   - `npx vitest run tests/engines.test.js tests/browser.test.js tests/config.test.js`
3. `docker compose restart navigator`
4. Verify the route is live:
   - `curl -s http://10.69.1.164:3000/console/api/engines` (or check the console
     "engines" view) shows `yahoo_cb` with backend `cloakbrowser`.
   - Direct route call: `curl -s 'http://localhost:3000/mcp' -H 'Content-Type:
     application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"web_search","arguments":{"query":"test","engine":"yahoo_cb"}}}'`
     returns results tagged `engine: yahoo_cb`.
   - `select_best` eventually schedules `yahoo_cb` once enabled (it's in the
     default enabled list); check the console engine-health view for it.
5. Spot-check extraction against a live SERP (via the devtools tab) if the DOM
   has changed since 2026-08-13.

## Known risks

- **DOM churn:** Yahoo's markup is Tailwind/class-heavy and changes often. Keep
  selectors structural (`h3.title`, `.compText p`, `a[data-matarget]`) rather
  than color/size utility classes (`fc-*`, `fz-*`, `mt-38`).
- **JS-rendered SERP:** works on cloakbrowser/chromium only. No `_lp` route.
- **Answer boxes:** rare on Yahoo; `directAnswers` may be empty for most
  queries. That's expected, not a bug.
- **Redirects:** live SERP returned direct hrefs, but `r.search.yahoo.com`
  redirects are the historical default — the `normalizeUrl` handler is the
  safety net.

## Definition of done

- [ ] `yahoo-driver.js`, `yahoo-cb.js` created and registered
- [ ] `normalizeUrl` unwraps `r.search.yahoo.com`
- [ ] `DEFAULT_SEARCH_ENABLED_ENGINES` includes `yahoo_cb`
- [ ] All three test files updated and passing
- [ ] Container restarted; `/console/api/engines` lists `yahoo_cb`
- [ ] Live `web_search` with `engine: "yahoo_cb"` returns real results
