# Developer

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). Stack Overflow flagged as Cloudflare-blocked — hint has `botProtected: true`.

## 1. GitHub Profile

- **URL:** `https://github.com/<username>`
- **Category:** Profile page

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ▲ | innerText has the content but includes nav/footer noise |
| Readability | ❌ | Completely fails — this is a dashboard, not an article |
| Tables | — | No semantic HTML tables; contribution heatmap is SVG-based |
| Links | ⚠️ | 160+ `<a>` links — mostly header/footer/sidebar nav noise |
| Screenshot | ✅ | Clean full-profile capture |

**DOM Structure:**
```
Layout (2-column, responsive)
├── Layout-sidebar
│   ├── div.h-card (schema.org Person microdata)
│   │   ├── Avatar (img[itemprop="image"])
│   │   ├── User status (☁️ "Life is a big thrown exception.")
│   │   ├── h1.vcard-names
│   │   │   ├── span.p-name.vcard-fullname — Boniface Pereira
│   │   │   └── span.p-nickname.vcard-username — craftpip
│   │   ├── div.p-note.user-profile-bio — "Full stack web developer..."
│   │   ├── Follower/Following: span.text-bold + adjacent text
│   │   └── ul.vcard-details
│   │       ├── li[itemprop="homeLocation"] → India
│   │       └── li[itemprop="url"] → https://boniface.pe/eira
│   ├── Achievements (div.border-top > img.achievement-badge-sidebar)
│   └── Organizations (div.border-top > a)
│
└── Layout-main
    └── turbo-frame#user-profile-frame (loaded dynamically)
        ├── Pinned repos: ol.js-pinned-items-reorder-list
        │   └── li.js-pinned-item-list-item × 6
        │       ├── Repo name (a > span.repo)
        │       ├── Description (p.pinned-item-desc)
        │       ├── Language (span[itemprop="programmingLanguage"])
        │       ├── Stars (a.pinned-item-meta > svg.octicon-star + count)
        │       └── Forks (a.pinned-item-meta > svg.octicon-repo-forked + count)
        ├── Contribution graph (SVG, no semantic table)
        └── Recent activity (heading + list items)
```

**Page-level stats:**
- 160 `<a>` links (nav: ~60, sidebar: ~20, pinned repos: ~30, footer: ~50)
- 13 `<script>` tags
- Uses Turbo Frames — `<turbo-frame id="user-profile-frame">` contains main content
- Schema.org microdata for Person (good for structured extraction)

**How extraction should work:**
- Article mode (Readability): ❌ — not applicable, this is a dashboard
- Full-text mode: Use `innerText` of `<main>` for readable profile dump
- Structured mode: Target DOM selectors for precise data:
  - `.vcard-names` → full name, username
  - `.user-profile-bio` → bio text
  - `.vcard-details` → location, website
  - `.js-pinned-item-list-item` → pinned repos array
  - Achievement/Org sections by `div.border-top`
- Nav/footer links should be excluded from content extraction
- Need `waitForNetworkIdle` for Turbo frame content to fully render
- The contribution graph is SVG — not easily extractable as text; screenshot is better

---

## 2. GitHub Project Page

- **URL:** `https://github.com/<owner>/<repo>`
- **Category:** Repository page

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ▲ | innerText has all content but includes nav/sidebar noise |
| Readability | ⚠️ | Should work — README is rendered to HTML in `article.markdown-body`, but timing matters |
| Tables | ✅ | File listing is an actual `<table>` with name/commit/date rows |
| Links | ⚠️ | 241 `<a>` links — mostly nav, footer, sidebar noise |
| Screenshot | ✅ | Full-page capture (page is ~7874px tall) |

**DOM Structure:**
```
main#js-repo-pjax-container
└── turbo-frame
    └── react-app
        ├── Repo header (tabs: Code, Issues, PRs, etc.)
        │   ├── Owner/name (h1.sr-only for a11y, visible in button/links)
        │   ├── Star/fork/watch counts
        │   └── Tab navigation (UnderlineNav)
        │
        ├── Main content (3-column: file-nav | content | sidebar)
        │   ├── File tree / folder listing
        │   │   └── <table> with rows:
        │   │       ├── File/folder name
        │   │       ├── Last commit message
        │   │       └── Last commit date
        │   │
        │   ├── article.markdown-body.entry-content README (rendered from markdown)
        │   │   ├── h1-h6 headings
        │   │   ├── Code blocks (div.highlight)
        │   │   ├── Lists, tables, images
        │   │   └── Links
        │   │
        │   └── Right sidebar (div.SidebarSection)
        │       ├── About (description, website, topics)
        │       ├── Releases (version, date)
        │       ├── Used by (dependent repos count)
        │       ├── Contributors (avatars + count)
        │       └── Languages (bar chart + percentages)
        │
        └── Repo footer (activity, README footer)
```

**Page-level stats:**
- 241 `<a>` links
- Uses Turbo + React (`<turbo-frame>` wraps `<react-app>`)
- README rendered server-side? No — rendered by React from markdown within the turbo frame
- Article content IS present: `article.markdown-body` has full rendered HTML

**Key Timing Issue:**
- The README IS rendered into the DOM by React (full HTML, not raw markdown)
- But if Readability runs TOO EARLY (before React hydrates), the article may be empty
- `waitForNetworkIdle` + a small delay should fix this
- The README has semantic HTML: headings, code blocks, lists, paragraphs

**How extraction should work:**
- Article mode (Readability): Should work after waiting for React hydration
- Full-text mode: Use `innerText` of `main#js-repo-pjax-container` or exclude nav/footer
- Structured data: Use sidebar selectors for metadata:
  - `div.SidebarSection` h2 headings to identify sections
  - About: description text, topic links
  - Releases: version, date
  - Languages: percentage bars
- File listing: extract from `<table>` for structured output
- Nav/footer links should be filtered out (they dominate the count)

---

## 3. GitHub Issues Page

- **URL:** `https://github.com/<owner>/<repo>/issues`
- **Category:** Issue list

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ⚠️ | innerText has issue titles + metadata but as flat text |
| Readability | ⚠️ | Flat text of issue titles only — no structure, labels, or metadata |
| Tables | ❌ | No table extracted (issues are cards, not HTML tables) |
| Links | ✅ | All issue links present |
| Screenshot | ✅ | Full page captured |

**DOM Structure:**
```
main#js-repo-pjax-container
└── turbo-frame
    └── turbo-frame
        └── react-app
            └── section (issue listing)
                └── ul[role="list"]
                    └── li.ListItem-module__listItem__wBJcm[role="listitem"] × 25
                        ├── div.Title-module__container__ZzhV_ (title row)
                        │   └── h3 > a.Title-module__anchor__dBbYy
                        │       └── span — "Bug with setContent API"
                        └── div.LeadingContent-module__container__K_QfJ
                            └── div.LeadingVisual (status icon)
                                └── svg.octicon-issue-opened / octicon-issue-closed
```

**Page-level stats:**
- 174 `<a>` links (mostly nav/footer noise)
- 16 `<script>` tags
- Uses Turbo + React: nested `<turbo-frame>` > `<turbo-frame>` > `<react-app>`
- 25 issue rows (matching page size)
- No semantic `<table>` — issues are `<li>` cards
- aria-label on each `li` contains full metadata: "Bug with setContent API: Status: Open. #596 In craftpip/jquery-confirm;· acqueron6464 opened on Jun 25, 2025."

**Observations:**
- Issue titles extracted as a flat text wall by Readability — "Status: Open. #596 In craftpip/jquery-confirm;Status: Open. #595..."
- No distinction between issue number, title, status, author, date, labels
- The `aria-label` on each `<li>` has structured info (title, status, number, repo, author, date)
- The list is like a feed/stream, not an article
- Would benefit from SEO text (richer) + aria-label parsing for structured output

---

## 4. GitHub Pull Requests Page

- **URL:** `https://github.com/<owner>/<repo>/pulls`
- **Category:** PR list

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ⚠️ | innerText has content but Readability didn't run widely |
| Readability | ❌ | Almost empty — only caught "wayheming" |
| Tables | ❌ | No table extracted |
| Links | ✅ | All PR links present |
| Screenshot | ✅ | Full page captured |

**Page-level stats:**
- 156 `<a>` links
- 17 `<script>` tags
- Uses Turbo (`<turbo-frame>`) but NOT React — no `<react-app>` found
- 6 PR items on the page (Draft: rev)

**Observations:**
- Readability basically gives up — returns nearly nothing
- PR list content (titles, status, author, branch) all lost
- Worst case so far for Readability-only
- Screenshot shows the page is rendered correctly in browser (Turbo works)
- SEO text would have the content — need SEO fallback
- PR page structure similar to Issues: `<li>` cards with metadata in aria-labels

---

## 5. Stack Overflow

- **URL:** `https://stackoverflow.com/questions/<id>`
- **Category:** Q&A

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | innerText has question + answers with structure |
| Readability | ✅ | Should work — article-like Q&A content |
| Tables | — | No semantic tables in normal Q&A |
| Links | ⚠️ | 760 links — mostly nav, sidebar, ad slots |
| Screenshot | ✅ | Page screenshot succeeded |

**DOM Structure:**
```
div#question (main question)
├── div.post-layout
│   ├── div.votecell (voting arrows, score)
│   │   └── div.js-voting-container
│   ├── div.postcell (question body)
│   │   ├── div.js-post-body (actual question text + code)
│   │   ├── div.post-taglist > a.post-tag × N
│   │   └── div.js-comments-list
│   └── ...

div.answer (×26)
└── div.post-layout (same structure as question)
    ├── div.votecell
    └── div.answercell
        ├── div.js-post-body
        └── div.js-comments-list
```

**Page-level stats:**
- 760 `<a>` links (ads, nav, sidebar, "related" questions)
- 121 `<script>` tags (very heavy — ads, analytics)
- No `<article>` or `<main>` elements — uses `div#question` and `div.answer`
- 26 answers
- 33 tags (`.post-tag`)
- Classic server-rendered HTML (not SPA)

**Observations:**
- Previous Cloudflare block was transient — page loaded fine with `createTarget`
- Question body: `#question .js-post-body`, Answers: `.answer .js-post-body`
- Voting data available in `data-score` attribute on `.question` / `.answer`
- Readability should work well for the article-like Q&A content
- 760 links is mostly noise (nav + sidebar + ads)
- Page is very long with many answers + comments

---

## 6. Hacker News

- **URL:** `https://news.ycombinator.com`
- **Category:** News aggregator

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Clean story listing — minimal noise |
| Readability | ✅ | Excellent — captures each story title + metadata |
| Tables | ⚠️ | Story listing is already an HTML `<table>` — extraction gives structured rank/title/points/author/time/comments |
| Links | ⚠️ | 226 links — mostly story titles, user profiles, nav. Manageable |
| Screenshot | ✅ | Clean full-page capture |

**DOM Structure:**
```
body > center
└── table#hnmain (main layout)
    ├── tr: Header bar (orange bg)
    │   └── table
    │       ├── td: Y logo + "Hacker News" + nav (new | past | comments | ask | show | jobs | submit)
    │       └── td: login link
    ├── tr: spacer (10px)
    └── tr#bigbox
        └── td
            └── table (story listing)
                ├── tr.athing.submission[id="NNNNNN"] — Story row
                │   ├── td.title: rank number (span.rank)
                │   ├── td.votelinks: upvote arrow (a#up_NNNNNN)
                │   └── td.title: title + site (span.titleline)
                │       ├── a[href] — story link
                │       └── span.sitebit.comhead — (site.com)
                ├── tr: metadata row
                │   └── td.subtext > span.subline
                │       ├── span.score — "40 points"
                │       ├── a.hnuser — author
                │       ├── span.age — timestamp
                │       ├── hide link
                │       └── comments link
                ├── tr.spacer (5px)
                └── ... (repeated for each story)
```

**Page-level stats:**
- 226 `<a>` links (mostly story titles + metadata links)
- 1 `<script>` tag! (minimal JS — just for analytics)
- No SPA, no Turbo, no React — pure server-rendered HTML
- Table-based layout (old school, but very clean)
- Each story has a unique `id` on `tr.athing.submission`

**How extraction should work:**
- Article mode (Readability): ✅ Works great — captures story summaries cleanly
- Full-text mode: `innerText` of `table#hnmain` gives clean story listing
- Table extraction: The story `<table>` is structured — rank, title, site, points, author, time, comments
- The table extraction and Readability text are somewhat duplicative
- Links are mostly content (story titles + author profiles) — less need for aggressive filtering
- This is the gold standard for "simple HTML" extraction

---

## 7. Dev.to

- **URL:** `https://dev.to`
- **Category:** Blogging (feed/home page)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Clean innerText with article cards |
| Readability | — | Feed page, not an article |
| Tables | ❌ | No tables |
| Links | ⚠️ | 361 links — sidebar + nav noise |
| Screenshot | ✅ | Clean full-page capture |

**DOM Structure:**
```
main#main-content.articles-list
├── header > h1.screen-reader-only — "Posts"
├── div (featured/education track)
│   └── div.crayons-story (article card) × N
└── div#substories
    └── div.crayons-story × N
        ├── div.crayons-story__body
        │   ├── a > h2.crayons-story__title — article title
        │   ├── div.crayons-story__tags — tag list
        │   └── div.crayons-story__meta — author, date, reading time
        └── div.crayons-story__image
```

**Page-level stats:**
- 361 `<a>` links (sidebar categories, nav, article titles)
- 20 `<script>` tags
- Has `<main>` with `#main-content`
- 19 article cards (`.crayons-story`) on home page
- No Turbo/React — server-rendered HTML
- Article cards have clean structure: title, tags, author, date, reading time
- Sidebar has community info, trending tags, navigation

**How extraction should work:**
- Article page: Should work well with Readability (standard blog format)
- Feed page: Full-text mode using `main#main-content` innerText

---

## 8. daily.dev

- **URL:** `https://daily.dev`
- **Category:** News aggregator (landing page)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Clean marketing page text |
| Readability | — | Landing page, not article content |
| Tables | ❌ | No tables |
| Links | ⚠️ | 77 links |
| Screenshot | ✅ | Full-page capture |

**Page-level stats:**
- 77 `<a>` links (marketing sections)
- 33 `<script>` tags
- Has `<main id="main-content">` with marketing sections
- No `<article>` element
- Cookie consent popup visible

**Observations:**
- This is a marketing landing page, not the actual feed
- Feed requires login/signup
- Not an SPA (Next.js but server-rendered)
- Minimal extraction value for the actual tool — feed is behind auth

---

## 9. npm

- **URL:** `https://www.npmjs.com/package/<package>`
- **Category:** Package registry

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Clean package info + README text |
| Readability | ✅ | README is article-like with headings |
| Tables | — | Not applicable |
| Links | ✅ | 70 links — mostly README content + sidebar |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
main#main
├── div#top
│   ├── h1 — package name
│   ├── p — package description
│   └── aside[aria-label="Package sidebar"]
│       ├── h3 — Install
│       ├── h3 — Weekly Downloads
│       ├── h3 — Version
│       ├── h3 — License
│       ├── h3 — Maintainers
│       └── ... (8 sidebar sections)
└── div (tabs)
    └── section#tabpanel-readme
        └── article
            └── div#readme (rendered from markdown)
                ├── h2 — section headings
                ├── code blocks
                ├── tables
                └── lists
```

**Page-level stats:**
- 70 `<a>` links (mostly README links + sidebar)
- 5 `<script>` tags — very lean!
- Has `<main id="main">` and `<article>` — clean semantic HTML
- README rendered from markdown into `div#readme` inside `article`
- Sidebar metadata under `<aside>` with `<h3>` section headings
- Cookie consent popup

**How extraction should work:**
- Article mode (Readability): ✅ Should work — README is rich article content
- Full-text mode: innerText of `main#main` gives package summary + README
- Metadata: Parse `<aside>` sections by `<h3>` headings

---

## 10. freeCodeCamp

- **URL:** `https://www.freecodecamp.org/news/how-to-build-a-chrome-extension/`
- **Category:** Learning / Article

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Clean article text |
| Readability | ✅ | Perfect — classic blog post format |
| Tables | — | Not applicable |
| Links | ✅ | 63 links — mostly content navigation |
| Screenshot | ✅ | Full-page capture (48K+ px tall) |

**DOM Structure:**
```
main#site-main.post-template
└── div
    └── article.post-full.post
        ├── header
        │   ├── h1.post-full-title — article title
        │   ├── div.post-full-meta — date, author
        │   └── div.post-full-author — author name + bio
        └── section.post-full-content
            ├── p, h2, h3, pre, code — article body
            └── button#tweet-btn — "share it" CTA
```

**Page-level stats:**
- 63 `<a>` links
- 31 `<script>` tags
- Has `<main id="site-main">` and `<article class="post-full post">`
- 54K+ characters of article body
- Very long page (48,547px)
- Perfect semantic HTML: proper headings, code blocks, lists

**How extraction should work:**
- Article mode (Readability): ✅ gold standard for Readability
- Content selector: `article.post-full`

---
