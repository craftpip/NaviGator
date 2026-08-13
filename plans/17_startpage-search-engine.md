# Startpage Search Engine Route — `startpage_cb`

## Plan Status

**Status: NOT STARTED** — verified 2026-08-13. No `startpage` reference exists anywhere in the codebase (`src/`, `tests/`, `web-console/`, `docker-compose.yml`, `.env`). SERP DOM was inspected live in a persistent Chromium tab (see [Research Findings](#research-findings)); the driver design below is grounded in that inspection, not guesswork.

### Checklist

- [ ] 1. Create `src/engines/startpage-cb.js` implementing the `StartpageCbDriver` (backend `cloakbrowser`, pool `engine`, id `startpage_cb`).
- [ ] 2. Register in `src/engines/index.js` (import + append to `DRIVER_CLASSES`).
- [ ] 3. Add `startpage_cb` to `DEFAULT_SEARCH_ENABLED_ENGINES` in `src/config.js` and to `.env` `SEARCH_ENABLED_ENGINES` (so it participates in `select_best`).
- [ ] 4. Unit tests in `tests/search.test.js` (or the engine-extraction test harness) — extract function, block detection, organic-vs-knowledge-panel filtering.
- [ ] 5. Live validation against the running server: real search via `engine: "startpage_cb"`, compare output with the browser-inspected SERP.
- [ ] 6. Verify block/circuit behavior (what does a Startpage challenge look like? tune `assertNotBlocked`).
- [ ] 7. Docs: route table in `AGENTS.md`, engine count deltas in the same file, `.env.example.full` if we add it to defaults.

## Goal

Add Startpage (https://www.startpage.com — "private search engine, no tracking") as a new browser search route so `web_search` can use it directly (`engine: "startpage_cb"`) and it becomes eligible for automatic `select_best` scheduling. Startpage delivers Google-grade results through its own privacy proxy, so it is a strong additional fallback alongside `google_cb` / `google_lp`, with different blocking posture than Google itself.

Route choice: **`startpage_cb`** — one driver, `cloakbrowser` backend, `engine` pool, matching the `*_cb` naming/backend pattern (`duckduckgo_cb`, `google_cb`, `bing_cb`, `brave_cb`). The SERP is server-rendered React with Emotion CSS-in-JS, so the initial HTML contains the results; a `lightpanda` variant is plausible but is explicitly NOT v1 — verify rendering under Lightpanda before adding it.

## Research Findings

Inspected live (cloakbrowser tab, 2026-08-13).

### URL structure

- `https://www.startpage.com/sp/search?query=<encodeURIComponent(query)>` — **GET works**, results are server-rendered (no form submission needed). Verified `query` returns 10 organic results.
- `?q=` also works but `query` is canonical — it's the field the SERP's own pagination forms and the home search form use (`input#q[name="query"]`, form POSTs to `/sp/search`).
- No engine-specific GET pagination: page navigation is `<form method="post" action="/sp/search">` with a hidden `page` input. v1 needs page 1 only (matches every other driver — the contract is one SERP page per search).

### SERP DOM (stable selectors; Emotion hashed classes are noise)

- **Organic result rows:** `main .result` — stable class `result`, hashed suffix (`css-o7i03b`) ignored. 10 per page.
  - **Title:** `a.result-link h2.wgl-title` (the anchor also carries `data-testid="gl-title-link"`).
  - **URL:** the `a.result-link` `href` is the **real destination URL** (verified: `https://stackoverflow.com/...`), NOT a Startpage redirect. Prefer this over the site-title link.
  - **Snippet:** `p.description`.
  - Site title / display URL: `a.wgl-site-title span.link-text`, `a.wgl-display-url span.link-text` (extra, not part of the `{title,url,snippet}` contract — optional).
- **"Visit in Anonymous View" link** — `a.anonymous-view-link` with a long `/av/proxy?...` href. Must be excluded (it is not inside `a.result-link`, so the extract naturally ignores it).
- **Knowledge panel (direct answer):** `[data-testid="wiki qi see more container"]` — Wikipedia quick-info box. **Gotcha: it is itself a `.result` div** (`class="result css-1ptgk98"`), so a naive `main .result` selector picks it up as a fake organic row. Its title lives in `.headline a`, not `h2.wgl-title`. Render it as a `directAnswers` entry (source `wiki_quick_info`), not a result.
- **Ads:** `[data-testid="gcsa-top"]` / `[data-testid="gcsa-bottom"]` (`.gcsa-container`, Google Custom Search Ads). No `a.result-link` rows observed inside, but keep the filter defensive (below).

### Extract algorithm

```js
const rows = Array.from(document.querySelectorAll("main .result"))
  .filter((row) => row.querySelector("a.result-link"));
```

Filtering on `a.result-link` (rather than `main .result` alone) excludes the knowledge panel and ad containers in one rule: organic rows are exactly the rows that carry a result link.

### Block detection (needs live verification)

Not observed during inspection (no CAPTCHA hit). Heuristic to start with, tuned in step 6:

```js
/captcha|verify you are human|unusual traffic|access denied|blocked|robot challenge/i.test(`${title}\n${text}`)
```

## Driver Design

New file `src/engines/startpage-cb.js`, following the `mojeek-lp.js` self-contained pattern (no shared base needed — Startpage has no engine-specific shared logic like DDG's form submit or Google's `/sorry/` check).

```js
import { BrowserSearchDriver } from "./browser-driver.js";

const RESULT_SELECTORS = ["main .result", ".result", ".w-gl"];

const EXTRACT_PAGE = () => {
  const rows = Array.from(document.querySelectorAll("main .result"))
    .filter((row) => row.querySelector("a.result-link"));

  const results = rows.map((row) => {
    const anchor = row.querySelector("a.result-link");
    const heading = row.querySelector("h2.wgl-title");
    const snippetEl = row.querySelector("p.description");
    return {
      title: heading?.textContent || "",
      url: anchor?.href || "",
      snippet: snippetEl?.textContent || ""
    };
  });

  const directAnswers = Array.from(
    document.querySelectorAll('[data-testid="wiki qi see more container"]')
  ).map((node) => {
    const titleEl = node.querySelector(".headline a");
    const extractEl = node.querySelector(".extract");
    const text = [titleEl?.textContent, extractEl?.textContent]
      .filter(Boolean)
      .join("\n");
    return { source: "wiki_quick_info", text };
  });

  return { results, directAnswers };
};

export class StartpageCbDriver extends BrowserSearchDriver {
  id = "startpage_cb";
  backend = "cloakbrowser";
  pool = "engine";
  homeUrl = "https://www.startpage.com/";
  inputSelectors = ["input#q", "input[name='query']"];
  resultSelectors = RESULT_SELECTORS;

  searchUrl(query) {
    return `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}`;
  }

  async assertNotBlocked(page) {
    const { title, text } = await page.evaluate(() => ({
      title: document.title || "",
      text: document.body?.innerText || document.body?.textContent || ""
    }));
    if (/captcha|verify you are human|unusual traffic|access denied|blocked|robot challenge/i.test(`${title}\n${text}`)) {
      throw new Error("Startpage blocked this request as automated traffic (CAPTCHA)");
    }
  }

  async extract(page) {
    return this.extractViaEvaluate(page, EXTRACT_PAGE);
  }
}
```

Notes:

- Default `BrowserSearchDriver.submit()` (goto `searchUrl` → body wait → 500ms settle → `waitForAnySelector` on `RESULT_SELECTORS`) is sufficient — no `submit()` override needed since GET renders results server-side.
- `resultSelectors` must not include a selector that matches pre-result chrome. `main .result` is only present once results render; `.w-gl` (results wrapper) is the fallback gate.
- `directAnswers` dedup + `engine`/`url` tagging come free from `extractViaEvaluate` (`src/engines/browser-driver.js`).

## Registration & Wiring

1. `src/engines/index.js`: `import { StartpageCbDriver } from "./startpage-cb.js";` and append `StartpageCbDriver` to `DRIVER_CLASSES`. Load-time validation (unique id, known backend, browser route has `homeUrl` + valid pool + `searchUrl`/`extract`) passes as-is.
2. `SUPPORTED_ENGINES` grows 10 → 11 automatically; `SEARCH_ENGINE_VALUES` in `src/config.js`, `CONSOLE_ENGINE_REGISTRY` in `src/mcp-server.js`, warmup filtering, and the console engines view all read the registry, so no further code changes there.
3. `src/config.js` `DEFAULT_SEARCH_ENABLED_ENGINES`: append `"startpage_cb"` (default `select_best` eligibility when no env override).
4. `.env`: append `startpage_cb` to `SEARCH_ENABLED_ENGINES` so the deployed server actually uses it.
5. Warmup: do NOT add to the `SEARCH_ROUTE_WARMUP_ENGINES` default in v1 — keep warmup as-is; adding a warm slot is a tuning decision after live validation shows it's reliable. (Deploy `.env` has its own value anyway.)

> Doc drift note: `AGENTS.md` describes `exposedInMcp` / `MCP_SEARCH_ENGINES` as the "MCP-advertised subset", but the current code has no `exposedInMcp` flag and `web_search.engine` is a free-form string with no enum (`src/mcp-server.js:1673`). Registration alone makes the route usable; when we touch `AGENTS.md` for this plan, tighten that section to match reality (registry → `SUPPORTED_ENGINES` is the one source of truth).

## Tests

Add to `tests/search.test.js` (or the existing engine-extraction test harness that evals extract functions via jsdom):

1. `searchUrl()` returns `https://www.startpage.com/sp/search?query=<encoded>` (spaces → `+` or `%20`, special chars encoded).
2. Extract maps organic rows to `{title, url, snippet}` correctly and tags `engine: "startpage_cb"`.
3. A `.result` row without `a.result-link` (knowledge panel, ad container) is excluded from `results`.
4. `[data-testid="wiki qi see more container"]` becomes a single `directAnswers` entry with headline + extract text.
5. `assertNotBlocked` throws on captcha/blocked marker text, passes on a normal SERP.
6. `resultSelectors` / `RESULT_SELECTORS` are asserted present in the registry metadata test if one exists.

## Live Validation

```bash
docker exec navigator npm install --include=dev   # after container restart
docker exec navigator npx vitest run              # unit tests
docker exec navigator npm run lint
```

Then against the running server (after `docker compose build && docker compose up -d`):

```bash
curl -s "http://localhost:3000/mcp" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"web_search","arguments":{"query":"test query","engine":"startpage_cb"}}}'
```

Verify:

- 10 organic results, real destination URLs (not `/av/proxy` anonymous-view links).
- An entity query (`who is the current prime minister of india`) surfaces the Wikipedia quick-info as the `**Instant Answer:**`/direct answer, and does NOT appear as a fake organic row.
- `./navigator.js statistics` shows `startpage_cb` in engine attempts with ok/fail counts; no circuit trip.
- Repeat 5+ searches to confirm stability; if blocked, capture the block page's title/text and tune `assertNotBlocked`.

## Documentation

- `AGENTS.md` route metadata table: add `cloakbrowser | engine | startpage_cb` row and update engine counts (`SUPPORTED_ENGINES` 10 → 11, `MCP_SEARCH_ENGINES` 8 → 9 if that section is revived during the doc-drift cleanup).
- `.env.example.full`: add `startpage_cb` to the `SEARCH_ENABLED_ENGINES` example if it lands in defaults.

## Rollout

1. Driver file + registry registration + unit tests (steps 1–4).
2. Live validation + block tuning (steps 5–6).
3. Only after a stable run: flip on in `.env` `SEARCH_ENABLED_ENGINES` and consider warmup.
4. Optional follow-up (separate plan): `startpage_lp` lightpanda variant if the SERP renders under Lightpanda.

## Non-Goals

- Pagination beyond page 1 (Startpage paginates via POST forms; every existing driver is single-page).
- An `api` backend route (Startpage has no public search API).
- The `startpage_lp` lightpanda variant in v1 (verify rendering first).
- Privacy/anonymous-view mode, custom region/language settings, `cat=` category tabs (web-only).
