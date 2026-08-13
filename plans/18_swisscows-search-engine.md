# 18 — Add Swisscows Search Engine

Add Swisscows (`https://swisscows.com/en/web`) as a browser search route. Follows
the exact same pattern as the Yahoo/Startpage plans: a shared base driver + thin
route subclasses registered in `src/engines/index.js`. Everything else (circuit
breakers, fallback, scheduling, console, warmup, stats) is keyed off
`SUPPORTED_ENGINES` / engine metadata and picks up the new route automatically —
no orchestrator changes.

## Plan Status

**Status: NOT STARTED** — SERP inspected live in a persistent Chromium tab
(2026-08-13); the API + DOM findings below are grounded in that inspection, not
guesswork.

### Checklist

- [ ] 1. `src/engines/swisscows-driver.js` — base driver (`EXTRACT_PAGE`, class fields, `assertNotBlocked`).
- [ ] 2. `src/engines/swisscows-cb.js` — cloakbrowser route (`swisscows_cb`, exposed).
- [ ] 3. `src/engines/swisscows-ch.js` — chromium route (`swisscows_ch`, internal, like `google_ch`).
- [ ] 4. `src/engines/index.js` — register both drivers (registry load-time validation covers them).
- [ ] 5. `src/config.js` — add both to `DEFAULT_SEARCH_ENABLED_ENGINES`.
- [ ] 6. Tests: `tests/engines.test.js` (registry 10→11, fixture extraction, block test), `tests/browser.test.js` (pool + dispatch), `tests/config.test.js` (default enabled arrays).
- [ ] 7. Deploy: restart container; verify route via `/console/api/engines` and a live `web_search` with `engine: "swisscows_cb"`.
- [ ] 8. AGENTS.md — route metadata table + engine count (11 routes) kept in sync.

## Route choice

| Route | Backend | Pool | Exposed |
|-------|---------|------|---------|
| `swisscows_cb` | `cloakbrowser` | `engine` | yes |
| `swisscows_ch` | `chromium` | `engine` | no (internal, like `google_ch`) |

**No API route.** Swisscows' results come from `https://api.swisscows.com/v5/web/search`
which requires a request signature computed by the page's own JS bundle
(live-verified: a bare curl to `/v1/web/search` and `/v5/web/search` returns
`400 {"detail":"The request signature isn't valid."}`). Replicating the signing
scheme is fragile and undocumented — drive a browser instead and read the DOM.

**No lightpanda route.** The SERP is a Next.js App Router SPA: JS boot → RSC
stream → signed `v5/web/search` fetch → client render. That's a heavy, fetch-based
flow lightpanda is unlikely to run reliably; no evidence it works. Adding a
`swisscows_lp` later is cheap if it ever does.

`homeUrl` = `https://swisscows.com/en/web` (the search host, not `swisscows.com`
landing page).

## Verified Swisscows SERP facts (live check 2026-08-13)

- **SERP URL:** `https://swisscows.com/en/web?query=<encoded query>` — canonical
  param is `query` (the user-supplied example used `+` for spaces; `%20` also
  works, the site normalizes).
- **Search input:** `<input name="query" type="search">` in the header form
  (`header form input[name='query']`).
- **Results are client-rendered and slow.** First visit the page was empty for
  ~8–10s (`readyState: interactive`, body = nav + footer only); after a
  re-navigate the 8 results appeared within ~8s. The standard `BrowserSearchDriver.submit()`
  (goto → body wait → 500ms settle → `waitForAnySelector` with the 60s
  `browserOpTimeoutMs`) comfortably covers this — do not override `submit()`.
- **Result rows:** `article.item` — observed classes `item web-page` and
  `item article` (the latter for NASA-science-style pages). The test query
  yielded 8. Initial render (before results land) has only
  `<section class="container">` with the filter bar — no `article.item`, so this
  selector is a clean readiness gate.
- **Widgets are excluded for free:** the News block renders
  `article.news-article` and Video renders `article.video-object` — neither
  matches `article.item`, so the extractor never sees them.
- **Title:** `h1.title` inside the row.
- **URL:** the header anchor containing the title —
  `header a:has(h1.title)`. Note two header layouts exist: rows with a thumbnail
  have a separate first `<a>` (thumb) then a second `a.mainlink` wrapping the h1;
  rows without a thumbnail have a single header `<a>` wrapping the h1. The
  `:has()` selector handles both (jsdom 27 supports `:has`, same as Google).
- **Snippet:** `p.description`.
- **Hrefs observed were direct** (e.g. `https://www.un.org/en/climatechange/...`,
  `https://en.wikipedia.org/wiki/Climate_change`) — no redirect wrapper, no URL
  post-processing needed.
- **Ads live in an iframe**, not the DOM: the page embeds a Google-ads SERP from
  `swisscows-com.s1search.co/serp?…&signature=…`. `querySelectorAll` on the top
  document never matches inside it, so ads are excluded by construction.
- **No standalone answer box observed** for the test query; the "AI summary"
  texts in the output are toggle buttons attached to individual results.
  `directAnswers` stays `[]` in v1 (a future extension could surface the expanded
  AI summary). Empty direct answers are expected, not a bug.
- **Block page:** none triggered during the live check. Defensive Mojeek-style
  `assertNotBlocked` on body text (`captcha|challenge|verify|forbidden|unusual
  traffic`); a JS-less load simply leaves `section.container` empty and the
  result-selector timeout reports it.

## Files to change

### 1. `src/engines/swisscows-driver.js` (new) — base driver

Mirror `bing-driver.js`. Extends `BrowserSearchDriver` (`./browser-driver.js`).

```js
const RESULT_SELECTORS = ["article.item", "article.item.web-page", "article.item.article"];

const EXTRACT_PAGE = () => {
  const rows = Array.from(document.querySelectorAll("article.item"));
  const results = rows.map((row) => {
    const anchor = row.querySelector("header a:has(h1.title)") || row.querySelector("header a.mainlink");
    const titleEl = row.querySelector("h1.title");
    const snippetEl = row.querySelector("p.description");

    return {
      title: titleEl?.textContent || "",
      url: anchor?.href || "",
      snippet: snippetEl?.textContent || ""
    };
  });

  const directAnswers = [];
  return { results, directAnswers };
};
```

Class fields:

```js
export class SwisscowsDriver extends BrowserSearchDriver {
  inputSelectors = ["input[name='query']"];
  resultSelectors = RESULT_SELECTORS;

  searchUrl(query) {
    return `https://swisscows.com/en/web?query=${encodeURIComponent(query)}`;
  }

  async assertNotBlocked(page) {
    const { title, text } = await page.evaluate(() => ({
      title: document.title || "",
      text: document.body?.innerText || document.body?.textContent || ""
    }));
    if (/captcha|challenge|verify|forbidden|unusual traffic|automated/i.test(`${title}\n${text}`)) {
      throw new Error("Swisscows blocked this request as automated traffic (CAPTCHA)");
    }
  }

  async extract(page) {
    return this.extractViaEvaluate(page, EXTRACT_PAGE);
  }
}
```

(Note: `inputSelectors` is metadata only — `submit()` drives `searchUrl()`
directly, same as Bing/Mojeek.)

### 2. `src/engines/swisscows-cb.js` (new) — cloakbrowser route

```js
import { SwisscowsDriver } from "./swisscows-driver.js";

export class SwisscowsCbDriver extends SwisscowsDriver {
  id = "swisscows_cb";
  backend = "cloakbrowser";
  pool = "engine";
  homeUrl = "https://swisscows.com/en/web";
}
```

### 3. `src/engines/swisscows-ch.js` (new) — chromium route (internal)

Same skeleton with `id = "swisscows_ch"`, `backend = "chromium"`, `pool = "engine"`,
`homeUrl = "https://swisscows.com/en/web"`.

### 4. `src/engines/index.js` — register

- Add `import { SwisscowsCbDriver } from "./swisscows-cb.js";` and
  `import { SwisscowsChDriver } from "./swisscows-ch.js";`.
- Append `SwisscowsCbDriver, SwisscowsChDriver` to `DRIVER_CLASSES`. Registry
  load-time validation (unique id, known backend, homeUrl, pool,
  `searchUrl`/`extract`) covers the new routes for free.

### 5. `src/config.js` — default enabled engines

Add `"swisscows_cb"` (and `"swisscows_ch"`) to `DEFAULT_SEARCH_ENABLED_ENGINES`
(the frozen array, lines ~225–236), alongside the other cloakbrowser routes.
`parseEngines` validates against `SEARCH_ENGINE_VALUES` (derived from
`SUPPORTED_ENGINES`), so it starts working the moment the registry has the route.

### 6. Tests

- `tests/engines.test.js`
  - Update the registry assertion (line ~37): `"registers all 10 internal
    routes"` → `11`, expected array gains `"swisscows_cb", "swisscows_ch"`
    (alphabetical, after `mojeek_lp`).
  - Add a `swisscows_cb` extraction case to `cases`: sample HTML with two
    `article.item` rows (one with thumbnail + `a.mainlink`, one without), a
    `p.description` snippet, plus `article.news-article` and `article.video-object`
    widgets that must NOT be extracted. Assert title/url/snippet and that widgets
    are absent.
  - Add a block-detection test: `swisscows_cb` throws on a captcha page text,
    passes on a normal results page.
- `tests/browser.test.js`
  - `_poolEngine`: `expect(manager._poolEngine("swisscows_cb")).toBe("swisscows_cb")`
    (engine pool) alongside the cloakbrowser/chromium pool tests (~lines 277–288).
  - `newPage` dispatch table (~line 304): add `["swisscows_cb", "cloakbrowser"]`
    and `["swisscows_ch", "chromium"]`.
- `tests/config.test.js` — the `DEFAULT_SEARCH_ENABLED_ENGINES` expected arrays
  gain `swisscows_cb`/`swisscows_ch`.

### 7. No changes needed (verify, don't edit)

- `src/mcp-server.js` — the `web_search` `engine` param is a free-form string
  (no hardcoded enum in the schema); dispatch validates against
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

1. Run tests first (entrypoint prunes dev deps on every restart):
   - `npx vitest run tests/engines.test.js tests/browser.test.js tests/config.test.js`
2. `docker compose restart navigator`
3. Verify the route is live:
   - `curl -s http://10.69.1.164:3000/console/config` — the `availableEngines`
     array lists `swisscows_cb` (backend `cloakbrowser`) and `swisscows_ch`
     (backend `chromium`); `engines` lists the enabled subset.
   - Direct route call: `curl -s 'http://localhost:3000/mcp' -H 'Content-Type:
     application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"web_search","arguments":{"query":"climate change","engine":"swisscows_cb"}}}'`
     returns results tagged `engine: swisscows_cb`.
   - `select_best` eventually schedules `swisscows_cb` once enabled (it's in the
     default enabled list).
4. Spot-check extraction against a live SERP via a devtools tab if the DOM has
   changed since 2026-08-13.

## Known risks

- **SPA slowness:** results take ~8–10s to render. The 60s selector wait handles
  it, but repeated circuit trips under heavy concurrency are possible — the
  route's cooldown is per-route, so fallback to `duckduckgo_api`/`google_cb`
  absorbs failures.
- **DOM churn:** Swisscows is a Next.js SPA and re-ships JS frequently. Selectors
  are semantic (`article.item`, `h1.title`, `p.description`) rather than
  CSS-module classes, but a layout rework is the main future-breakage risk.
- **JS-rendered SERP:** works on cloakbrowser/chromium only. No `_lp` route.
- **Signature API:** if Swisscows ever serves results without JS (server-side
  RSC), an `api`-style extraction could replace DOM scraping — not today.
- **No direct answers in v1:** `directAnswers` is empty; acceptable.

## Definition of done

- [ ] `swisscows-driver.js`, `swisscows-cb.js`, `swisscows-ch.js` created and registered
- [ ] `DEFAULT_SEARCH_ENABLED_ENGINES` includes both routes
- [ ] All three test files updated and passing
- [ ] Container restarted; `/console/config` lists `swisscows_cb` in `availableEngines`
- [ ] Live `web_search` with `engine: "swisscows_cb"` returns real results
