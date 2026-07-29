# Domain Hints

Domain hints tell the extraction engine how to handle specific websites. Instead of guessing which parts of a page have real content, you write a hint that says "wait for this selector", "skip this section", or "extract these exact elements".

## How they work

On every `web_fetch` call, `browserOpenAndExtract()` in `src/search.js:2126` loads the hints file and calls `findDomainHint(url, hints)`. The matcher in `src/domain-hints.js:53` checks two things:

1. **Hostname** — exact match or subdomain match (so `github.com` matches `gist.github.com` too)
2. **Path** — glob matching via `compileGlob()`. `/**` matches everything, `/*` matches one segment, `/*/*` matches two segments

First matching hint wins. Order hints from most specific to least specific — the GitHub hints do `/*` (profile), `/*/*` (repo), `/*/*/issues` (issues), `/*/*/pulls` (PRs), `/*/*/issues/*` (issue detail), `/*/*/pull/*` (PR detail).

## Loading

Hints live in `domain-hints.json` at the project root. The path is set via `DOMAIN_HINTS_PATH` env var, defaulting to `project-root/domain-hints.json` (`src/config.js:218-224`). Loaded once and cached in memory — call `clearDomainHintCache()` to reload.

## All hint properties

### `domain` (required)

Hostname of the site. Lowercased before matching.

```json
"domain": "github.com"
```

### `pathPattern` (optional, default `"/**"`)

URL path glob. Supported patterns:

| Pattern | Matches | Example |
|---------|---------|---------|
| `"/**"` | Everything (default) | `/foo/bar/baz` |
| `"/*"` | Single segment | `/foo` not `/foo/bar` |
| `"/*/*"` | Two segments | `/foo/bar` not `/foo/bar/baz` |
| `"/wiki/**"` | Path prefix | `/wiki/Hello_World` |
| `"/watch**"` | Different glob syntax | `/watch?v=abc123` |

Internally `*` is `[^/]*` and `**` is `.*`.

### `pageType` (optional, free text)

Just a label for humans. Not used in code.

```json
"pageType": "option-chain"
```

### `comment` (optional, free text)

Notes for the next person reading the hint. What makes the page tricky, what strategy you picked, etc.

### `testUrls` (optional)

URLs to test this hint against. Not used by code, but useful when iterating.

```json
"testUrls": [
  "https://stackoverflow.com/questions/6818875/new-line-on-php-cli"
]
```

### `waitForSelector` (optional)

CSS selector to wait for before extracting. The browser calls `page.waitForSelector()` with a 20s timeout. Use this for SPAs that render content asynchronously (`src/search.js:2173-2176`).

For GitHub issue/PR list pages you need `turbo-frame#repo-content-turbo-frame`. For NSE option chain it's `table#optionChainTable-indices`.

```json
"waitForSelector": "turbo-frame#repo-content-turbo-frame"
```

**Caveat:** If the selector doesn't exist on the page, it silently times out at 20s. Be specific — use a selector that only exists when the content is ready.

### `navigationWait` (optional, default `2000`)

Extra milliseconds to wait after the page loads (after network idle + waitForSelector). Useful when content loads outside the main navigation lifecycle — Turbo frames, lazy-loaded sections, post-hydration rendering (`src/search.js:2188-2191`).

GitHub repo pages need 3000ms for the README to render inside Turbo. Moneycontrol needs 5000ms because of interstitial ads.

### `preferReadability` (optional, default `true`)

Controls whether Mozilla Readability is tried. When `false`, Readability is skipped entirely and the engine uses sections or the fallback path (`src/search.js:913`).

Set to `false` for:
- Pages where Readability strips important content (tables, sidebars, data)
- Pages that aren't article-like (homepages, profiles, dashboards)
- SPAs where Readability gets no content

Set to `true` (or omit) for:
- Clean article pages (Wikipedia, blogs)
- Pages where Readability produces better output than the fallback

### `preferReadability` with sections

When both `preferReadability: true` and `content.sections` are set, sections take priority. Readability is only used as a fallback when sections produce no output.

### `skipSelectors` (optional)

CSS selectors for elements to remove from the DOM before extraction. Runs after the global `NON_CONTENT_SELECTORS` (nav, aside, cookie banners, etc.) but before table extraction (`src/search.js:853-861`).

```json
"skipSelectors": [".navbox", ".navbox-styles", ".mw-empty-elt"]
```

Useful for stripping known noise that the global list doesn't catch — navigation boxes on Wikipedia, language popups on IRCTC, etc.

### `tableExtraction` (optional, default enabled)

Control how tables are extracted. Currently supports:

- **`"disabled"`** — Skip table extraction entirely. Useful when the page has decorative/layout tables that produce noise (Cricbuzz uses this).
- **omitted** (default) — Extract tables normally.

Tables are extracted before sections run (`src/search.js:863-870`). After extraction, all `<table>` elements are removed from the DOM so sections don't pick up table content a second time.

### `content.sections` (optional)

Structured extraction via CSS selectors. When sections are defined and produce output, they take priority over Readability and the fallback path (`src/search.js:872-911`).

Each section has:

```json
{
  "selector": "h1.vcard-names",
  "label": "Name",
  "priority": "high"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `selector` | yes | CSS selector for one or more elements |
| `label` | yes | Section heading in the output |
| `priority` | yes | `"high"`, `"medium"`, or `"low"`. High sections always included. Medium sections are dropped if they have <50 chars of content. Low is reserved (unused). |
| `itemLabel` | no | When set, each matched element gets a numbered heading (e.g. `#### Answer 1`, `#### Answer 2`) |
| `fields` | no | Sub-selectors within each matched element for granular control (see below) |

**Without `fields`:** Each matched element's inner HTML is converted to markdown via `htmlToMarkdown()` and concatenated.

**With `fields`:** Each matched element is rendered using the field definitions instead of the full HTML.

#### Field formats

```json
{
  "selector": ".js-vote-count",
  "label": "Votes",
  "format": "text"
}
```

| Format | Output |
|--------|--------|
| `"text"` | `**Votes:** 42` — single line, textContent, whitespace-cleaned |
| `"list"` | `**Comments:**` then `- item 1` `- item 2` — bullet list |
| `"markdown"` (default) | `**Content:**` then multi-line markdown — innerHTML converted via `htmlToMarkdown` |

#### Section selection rules

- Selectors must NOT overlap — one element should not be inside another selected element. Content would appear in multiple sections.
- Use specific containers. Instead of `div.h-card` (may include block/report buttons), use `div.js-profile-editable-area` (bio, stats, details).
- For lists (`<ol>`/`<ul>`), select the container directly. The extraction renders each `<li>` as a separate block with blank line separation.
- For single text items, pick the most specific container (`h1.vcard-names`, `div.p-note`).
- Sections that produce no output are silently skipped.

#### Section extraction flow

```
HTML → remove NON_CONTENT_SELECTORS → remove skipSelectors → extract tables → remove <table> → run sections → if output found, return it
                                                                                                                                  ↓ otherwise
                                                                                                              try Readability → if content, return it
                                                                                                                                  ↓ otherwise
                                                                                                              collectCandidateBlocks fallback
```

### `contentSelectors` (optional)

Additional CSS selectors for the "wait for content" polling step and the SEO snapshot. These are appended to the default content selectors (`main, article, [role='main'], .content, #content`, etc.) when checking if the page has rendered meaningful text (`src/search.js:2179-2182`, `2201`).

### `flags` (optional)

An object for boolean flags that change extraction behavior.

```json
"flags": { "botProtected": true }
```

Known flags:

| Flag | Effect |
|------|--------|
| `authWall` | Returns immediately with "Auth wall — page requires login" error |
| `visualOnly` | Returns immediately with "Visual-only page" error |
| `requiresChromium` | Informational — suggests the chromium backend |

## Extraction pipeline

Here's the full pseudocode of `browserOpenAndExtract()` — the function behind every `web_fetch` call. Every path, every branch, every decision point is documented below.

### Entry — `browserOpenAndExtract({ url, maxChars, ... })`

```
FUNCTION browserOpenAndExtract(url, maxChars = DEFAULT_MAX_CHARS)

  ── Phase 0: Hint loading ────────────────────────────────────────────
  hints = getDomainHints(config)
    → loadDomainHints(config.domainHintsPath)
      → fs.readFile → JSON.parse → filter entries with domain
      → CACHED: loaded once per path, stored in module-level (loadedHints, loadedPath)
      → return [] if file missing, invalid JSON, or not an array
  hint = findDomainHint(url, hints)
    → iterate hints in array order (first match wins)
    → isMatch(entry, url):
      → hostname = getHostname(url).lowercase
      → domain  = entry.domain.toLowerCase
      → hostname === domain OR hostname endsWith("." + domain) ? continue
      → pathname = getPathname(url) — strip trailing slash unless "/"
      → pathMatcher = entry._pathMatcher (cached) or parsePathPattern(entry.pathPattern)
        → compileGlob(raw): converts * → [^/]*, ** → .*, wraps in ^...$
        → special cases:
          → undefined / null / "/**" → () => true (matches everything)
          → "/*/**"  → (p) => p.startsWith("/") && p !== "/"
          → anything else → compileGlob(raw) regex test
      → return entry if pathMatcher(pathname)
    → return null if no match

  ── Phase 1: Page lifecycle ──────────────────────────────────────────
  ACQUIRE page slot (manager.withPageSlot)
  CREATE page via manager.newPage({ backend: config.defaultBackend })
    → page lifecycle is wrapped in WITH_PAGE_TIMEOUT(label, task)
    → each step races against operationTimeoutMs (default 60000)
    → if timeout fires, page.close() is called and Error thrown

  STEP 1: page.goto(url, { waitUntil: "domcontentloaded" })
    → navigates the browser to the URL
    → timed out by withPageTimeout

  STEP 2: Check flag shortcuts
    IF hint.flags.authWall === true:
      → close page → return { text: "", error: "Auth wall..." }
    IF hint.flags.visualOnly === true:
      → close page → return { text: "", error: "Visual-only page..." }

  STEP 3: waitForSelector (if hint.waitForSelector exists)
    → page.waitForSelector(hint.waitForSelector, { timeout: min(operationTimeoutMs, 20000) })
    → silently catches timeout (selector may not exist on some pages)
    → PURPOSE: wait for async-rendered content (SPAs, Turbo frames, etc.)

  STEP 4: waitForContent(page, { maxWait: 5000, extraSelectors: hint.contentSelectors })
    → polls every 300ms up to maxWait
    → evaluates: (document.querySelector(selectors) || document.body).innerText.length
    → uses DEFAULT_CONTENT_SELECTORS + hint.contentSelectors (if provided)
    → returns early when text length >= 500 chars
    → returns early when length stabilizes (same value for 500ms)
    → silently catches all errors
    → PURPOSE: wait for JS-rendered text content to appear in the DOM

  STEP 5: waitForNetworkIdle({ idleTime: 500, timeout: 10000 })
    → waits until no network requests for 500ms
    → silently catches timeout
    → PURPOSE: let async resources (images, XHR) finish loading

  STEP 6: navigationWait (hint.navigationWait ?? 2000)
    → static setTimeout delay in milliseconds
    → PURPOSE: post-hydration / post-Turbo rendering time
    → common values: 0 (skip), 2000 (default), 3000 (GitHub README), 5000 (Moneycontrol ads)

  STEP 7: captureSeoSnapshot(page, ...) — (skipped if includeSeoAnalysis === false)
    → evaluates JS in page to extract:
      → textContent from main content selectors + hint.contentSelectors
      → HTML from main content candidates (up to MAX_MAIN_HTML_CHARS)
      → headings, meta description, OG tags, canonical URL, etc.
    → timed out by withPageTimeout

  STEP 8: Serialize page state
    → Promise.all([
        page.content()          → full serialized HTML (string)
        page.url()              → resolved URL (after redirects)
        page.title()            → document.title
        page.evaluate(innerText) → raw browser innerText (for Readability comparison)
      ])
    → timed out by withPageTimeout

  STEP 9: Bot challenge detection
    → page.evaluate checks:
      → HTML contains "cf-browser-verification" / "__cf_challenge"?
      → title or bodyText matches /just a moment|performing security verification/?
      → HTML contains "data-dome" or body says "Please enable JS"?
      → title looks like a bare domain? (regression check)
    → if detected: return { text: "", error: "Cloudflare challenge" / "Bot block..." }

  ── Phase 2: Extraction (extractTextFromHtml) ────────────────────────
  extracted = extractTextFromHtml({
    html,           → full serialized HTML from page.content()
    url,            → resolved URL
    maxChars,       → max text length (default 90000)
    fallbackTitle,  → page title
    maxTableRows,   → optional row limit per table
    hint,           → matched domain hint (or null)
    browserText     → raw innerText from browser (for Readability fallback check)
  })

  ──── 2a. DOM setup ──────────────────────────────────────────────
  rawHtml = html.replace(/<style>...</style>/gi, "")     // strip inline styles
  dom = new JSDOM(rawHtml, { url })                      // parse into JSDOM document
  doc = dom.window.document

  ──── 2b. Remove global noise ───────────────────────────────────
  doc.querySelectorAll(NON_CONTENT_SELECTORS.join(","))
    → elements removed: script, style, noscript, template, svg, canvas, iframe,
      nav, aside, select, option,
      .cookie, .cookies, [class*='cookie'], [id*='cookie'],
      [class*='consent'], [id*='consent'],
      [class*='subscribe'], [id*='subscribe'],
      [class*='banner'], [id*='banner'],
      [role='dialog']
    → This runs for EVERY page, regardless of hints

  ──── 2c. Remove hint-specific noise ─────────────────────────────
  IF hint.skipSelectors has entries:
    FOR each selector in hint.skipSelectors:
      doc.querySelectorAll(sel).forEach(node => node.remove())
      → silently catches invalid selectors
    → PURPOSE: strip site-specific junk global NON_CONTENT_SELECTORS misses
      (Wikipedia navboxes, IRCTC language popups, Moneycontrol overlays)

  ──── 2d. Table extraction ───────────────────────────────────────
  tables = []
  UNLESS hint.tableExtraction === "disabled":
    tables = extractTablesFromDocument(doc, { maxRowsPerTable: maxTableRows })
      → iterates doc.querySelectorAll("table") up to max 8 tables
      → SKIP tables inside header/footer/nav/aside
      → SKIP role="presentation" or hidden tables
      → SKIP tables with < 2 rows
      → PARSE header rows (<th> only rows first) using expandTableRows (colspan/rowspan support)
      → PARSE body rows, capped by maxTableRows
      → MERGE multi-row headers into single header per column
      → TRIM empty leading/trailing columns (chart icons, spacers)
      → SKIP tables with no meaningful data (all body cells past col 1 empty or < 2 chars)
      → DEDUP tables by header + first row fingerprint
      → ATTACH nearest heading context to each table
    → After extraction, ALL <table> elements are removed from DOM
      (prevents sections/Readability from double-including table content)

  ──── 2e. SECTIONS path ──────────────────────────────────────────
  IF hint.content.sections is an array with length > 0:
    sectionOutput = []
    SORT sections by priority order: high(0) < medium(1) < low(2)

    FOR each section in sorted list:
      elements = doc.querySelectorAll(section.selector)
      IF no elements match → SKIP (continue to next section)

      BUILD markdown content:
        IF section has fields:
          FOR each element (with optional index for itemLabel):
            content = renderHintFields(element, section.fields, url)
              → for each field:
                nodes = element.querySelectorAll(field.selector)
                FORMAT by field.format:
                  "text"      → cleanWhitespace(node.textContent) — single line
                  "list"      → "**Label:**" then "- value" per node — bullet list
                  "markdown"  → htmlToMarkdown(node.innerHTML) — multi-line (default)
                → join all field outputs
            IF content is empty → skip this element
            PREPEND section.itemLabel as "#### Label N" if itemLabel is set
          → concat all element outputs separated by "\n\n"
        ELSE (no fields):
          FOR each element:
            markdown += htmlToMarkdown(element.innerHTML) + "\n"
            → full innerHTML of each matched element converted to markdown

      markdown = markdown.trim()
      IF markdown is empty → SKIP (continue to next section)
      IF section.priority === "medium" AND markdown.length < 50 → SKIP (too short)
      APPEND "### SectionLabel" + "\n\n" + markdown to sectionOutput

    IF sectionOutput has entries (length > 0):
      → text = sectionOutput.join("\n")
      → text = safeTruncateText(text, maxChars)
        IF text.length > maxChars: slice at maxChars-3 + "..."
      → RETURN { title, url, text, textOriginalLength, tables }
      → SECTIONS PATH WINS — Readability and fallback are NEVER reached

  ──── 2f. READABILITY path ───────────────────────────────────────
  UNLESS hint.preferReadability === false (i.e., default is true):
    reader = new Readability(dom.window.document)
    article = reader.parse()

    IF article?.textContent?.trim() is truthy:
      → Readability succeeded in extracting article content

      COMPARE with browserText:
        articleLen = article.textContent.trim().length
        browserLen = browserText.trim().length (raw innerText from step 8)
        IF browserLen > articleLen * 1.5 AND browserLen - articleLen > 200:
          → Readability stripped too much content
          → Use htmlToMarkdown(doc.body.innerHTML) as full-page markdown
          → RETURN { title, url, text: safeTruncate(fullMarkdown, maxChars), tables }

      IF article.content exists (Readability returned HTML content):
        → raw = htmlToMarkdown(article.content, { baseUrl: url })
        → RETURN { title, url, text: safeTruncate(raw, maxChars), tables }

      ELSE (Readability returned only textContent, no HTML):
        → articleLines = toLines(article.textContent)
        → text = buildCleanText(articleLines, maxChars)
          → filter out likely junk lines (Read more, Privacy policy, etc.)
          → deduplicate via uniqueLines (case-insensitive, min 3 chars)
          → cleanWhitespace + truncate via cleanAndTruncateText
        → RETURN { title, url, text, tables }

  ──── 2g. FALLBACK path (candidate blocks) ───────────────────────
  → Only reached when:
    - No sections defined OR sections produced empty output
    - Readability skipped (preferReadability: false) OR Readability returned null/empty

  candidates = collectCandidateBlocks(doc)
    → iterate SEMANTIC_CONTENT_SELECTORS (main, article, [role='main'],
      section, .content, #content, .main, #main, ...)
    → for each matching node, score via scoreTextBlock:
      score = wordCount + (punctuationCount * 2) - (linkCount * 5)
    → sort descending by score
    → fallback to doc.body.textContent if no candidates found

  bestText = candidates[0]?.text || doc.body?.textContent || ""
  lines = toLines(bestText)
  text = buildCleanText(lines, maxChars)
    → same junk filter + dedup + truncation as Readability text path
  → RETURN { title, url, text, textOriginalLength, tables }

  ── Phase 3: Post-processing (back in browserOpenAndExtract) ──────
  seoAnalysis = (includeSeoAnalysis !== false)
    ? buildSeoAnalysis({ snapshot, extracted, maxChars }) : null

  selectedText = extracted.text || seoAnalysis?.mainContentText || ""

  finalText = selectedText

  Links extraction (ALWAYS runs, no flag):
    links = extractLinksFromHtml({ html, url })
      → parse HTML in JSDOM
      → collect all <a> tags with href
      → deduplicate by normalized href
      → FOR <a> with numeric text:
          IF href matches GitHub, NPM, or similar known pattern:
            enrich text with "stars" / "forks" / "followers" suffix
            (solves "Python [5][88]" numeric ambiguity)
      → return [{ text, href, rel, type, context }]
    → links are stored in pageLinksByPageRef for web_page_links tool
    → links are NOT inserted into output text — only accessible via web_page_links(ref_id)

  Table insertion:
    IF extracted.tables has entries:
      finalText = insertTablesInline(finalText, extracted.tables)
        → build markdown table strings: "### Table N: caption" + header row + data rows
        → scan text for heading lines that match table.context
        → insert each table after its nearest matching heading
        → append uninserted tables at the end

  Truncation note:
    IF text was truncated (ends with "...") OR finalText.length > maxChars:
      fullSize = extracted.textOriginalLength || finalText.length
      IF truncated: remove trailing "..."
      APPEND "\n\n*(Response truncated — full page is {fullSize} chars, increase maxChars to see more)*"
    → This is awareness-only — does NOT re-truncate (tables can still push past maxChars)

  ── Phase 4: Return ──────────────────────────────────────────────
  RETURN {
    title: extracted.title,
    url: extracted.url,
    text: finalText,
    textOriginalLength: extracted.textOriginalLength,
    tables: extracted.tables (if any),
    links: extracted.links (if any),
    seo: seoAnalysis (if not null)
  }

  ── Cleanup ──────────────────────────────────────────────────────
  FINALLY:
    IF page is not closed → page.close()
    RELEASE page slot (manager.withPageSlot manages this)
```

## Authoring hints

1. **Check if you even need one** — Test the page with `web_fetch` first. If the output is clean, no hint needed.

2. **Open the page** in a persistent browser tab and inspect the DOM with the devtools tools.

3. **Start simple** — `waitForSelector` + `preferReadability: false` is often enough. Add sections only when the default output misses or misformats content.

4. **Selectors must be stable** — Avoid CSS-module class names that change per build. Prefer data attributes, semantic elements (`main`, `article`), well-known classes (`markdown-body`, `js-*`).

5. **Test incrementally** — Use `curl "http://localhost:3000/extract?url=..."` to test without going through MCP.

6. **Order matters** — The first matching hint wins. Put more specific patterns before less specific ones.

### Path pattern gotchas

`/*` means one segment (`/boniface`), not anything (`/boniface/repo`). Use `/**` for everything. Hints are matched in order — list specific patterns first.

### Common patterns by page type

**News homepages:** Most need `preferReadability: false` (article extraction fails on listing pages). Often no `waitForSelector` needed unless the site is a heavy SPA (HT, Livemint, News18).

**Article pages:** `preferReadability: true` (default) usually works. Add sections only when Readability misses bylines, dates, or metadata.

**Data pages (tables):** `preferReadability: false` + `waitForSelector` for the table. Tables are always extracted automatically. No sections needed unless you want context text.

**Profile pages:** `preferReadability: false` + sections for each profile element (name, bio, stats, lists).

**SPAs:** `waitForSelector` for the root component or a content-specific selector. May need `navigationWait` for post-hydration rendering.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `DOMAIN_HINTS_PATH` | `project-root/domain-hints.json` | Path to hints file |
