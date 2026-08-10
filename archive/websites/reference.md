# Reference / Encyclopedia

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). Wikipedia tested with `web_fetch` — Readability extracts clean article content.

## 1. Wikipedia

- **URL:** `https://en.wikipedia.org/wiki/<article>`
- **Category:** Encyclopedia

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Excellent — full page text |
| Readability | ✅ | Excellent — captures article body cleanly |
| Tables | ⚠️ | Multiple tables (infobox, data, navboxes). Navboxes are noise |
| Links | ❌ | Far too many — language links, navboxes, footnotes, categories dominate |
| Screenshot | ✅ | Clean full-page capture |

**DOM Structure:**
```
body
├── header (site header + sticky navbar)
├── div#vector-main-menu (sidebar — pinned/hidden)
├── main#content.mw-body
│   ├── header
│   │   ├── h1#firstHeading — "JavaScript"
│   │   └── nav#vector-toc (Table of Contents, collapsible)
│   └── div.mw-content-container
│       └── div.mw-parser-output
│           ├── div.infobox (schema.org table — key-value pairs)
│           ├── p — lead paragraph
│           └── section by section (h2 + content)
│               ├── h2#History, h2#Features, etc.
│               ├── p, ul, table.wikitable (data tables)
│               ├── div.navbox (navigation boxes — NOISE)
│               └── ol.references (footnotes)
└── footer
```

**Page-level stats:**
- 2000+ `<a>` links (language selectors ~100, navboxes ~200-400, references ~100, nav ~50, content links ~100)
- ~15 `<script>` tags (mostly analytics, lazy-loaded features)
- Uses semantic HTML5: `<main>`, `<section>`, `<h1>-<h6>`, `<figure>`, `<figcaption>`
- Schema.org microdata on infobox (`table.infobox` with `itemscope`)
- Classic server-rendered HTML (no SPA, no Turbo, no React)

**Page categories (useful links to keep):**
- Internal article links (Wikipedia blue links within text)
- Citation/reference links (superscript notes linking to sources)
- "See also" links
- External links section

**Link categories (needs filtering):**
- Language selector (~100 links) — completely irrelevant to content
- Navboxes (~200-400 links) — Wikipedia navigation templates (e.g. "JavaScript" navbox, "Web browsers" navbox)
- Category links at bottom (~20)
- Sidebar navigation (Main page, Contents, etc.)
- Footer links (Privacy, About, etc.)
- Edit/View history links
- Tool links (What links here, Cite this page, etc.)

**How extraction should work:**
- Article mode (Readability): ✅ Excellent — full body text, preserves structure
- Full-text mode: Use innerText of `main#content` (already scoped to article area)
- Link filtering essential: keep only internal article links + reference links
- Navbox tables should be identified and excluded (they have `class="navbox"` or contain `NavFrame`)
- Infobox tables are useful — extract separately
- TOC (Table of Contents) should be excluded (Readability already strips it)
