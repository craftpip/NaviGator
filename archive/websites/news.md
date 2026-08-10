# News

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). All 22 sites tested with `web_fetch` — content matches screenshots.


## 1. India Times

- **URL:** `https://www.indiatimes.com`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present in innerText |
| Readability | ✅ | Standard article structure |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 98 links — moderate |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
└── div.article-detail-content (no article/main)
    ├── h1.themeTwoArticalShowHeading — headline
    ├── div — byline, date
    ├── div.artical-detail-cnt — article body
    │   ├── p — paragraphs
    │   ├── figure — images
    │   └── embeds
    └── div — related articles, widgets
```

**Page-level stats:**
- 98 `<a>` links
- 59 `<script>` tags
- No `<article>` or `<main>` — uses `<div>` containers
- `<h1 class="themeTwoArticalShowHeading">` for headline
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): Should work despite missing `<article>` — Readability detects article-like content
- Full-text mode: innerText of `.article-detail-content`

---

## 2. Hindustan Times

- **URL:** `https://www.hindustantimes.com`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Text present |
| Readability | ✅ | Should work — has `<main>` |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 545 links — very heavy nav noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
#__next (Next.js root)
└── main (present)
    └── div.articleDetail
        ├── h1.artTitle — headline
        ├── div.byline
        ├── div.cntTxt — article body
        │   ├── p — paragraphs
        │   ├── figure — images
        │   └── embeds
        └── div — related, ads
```

**Page-level stats:**
- 545 `<a>` links (heaviest so far — nav, sidebar, ads, related)
- 94 `<script>` tags (ads, analytics, Next.js)
- Has `<main>` but no `<article>` — uses `<div>` for article content
- Next.js SPA (`#__next` root)
- `<h1 class="artTitle">` for headline
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): Should work — standard article with `<main>`
- Full-text mode: innerText of `<main>` or `.articleDetail`
- Heavy link filtering needed if extracting all links

---

## 3. Aaj Tak

- **URL:** `https://www.aajtak.in`
- **Category:** News (Hindi)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present |
| Readability | ⚠️ | May work — no `<article>`/`<main>` but structured |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 356 links — heavy noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body
└── div (no article/main)
    ├── h1 — headline (Hindi)
    ├── h2#copy_true — synopsis/summary
    ├── div
    │   ├── p — paragraphs (Hindi)
    │   └── figure — images
    └── div — widgets, ads, related
```

**Page-level stats:**
- 356 `<a>` links (nav, sidebar, videos, ads)
- 131 `<script>` tags (very heavy — ads, analytics)
- No `<article>` or `<main>` — pure `<div>` layout
- Hindi language content throughout
- `<h1>` for headline, `<h2 id="copy_true">` for synopsis
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): May work — text is article-like but missing semantic containers
- Full-text mode: innerText of body (lots of noise from nav/sidebar)

---

## 4. The Hindu

- **URL:** `https://www.thehindu.com`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present |
| Readability | ⚠️ | May work — lightweight but no semantic article |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 319 links — moderate-heavy noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body
└── div (no article/main)
    ├── h1.title — headline
    ├── h2.sub-title — subheadline
    ├── div
    │   ├── p — paragraphs
    │   ├── figure — images
    │   └── aside — related content
    └── div — ads, widgets
```

**Page-level stats:**
- 319 `<a>` links
- 128 `<script>` tags (ads, analytics)
- No `<article>` or `<main>` — pure `<div>` layout
- `<h1 class="title">` for headline, `<h2 class="sub-title">` for subheadline
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): May work — article text is well-structured even without semantic containers
- Full-text mode: innerText of body (needs filtering for nav/sidebar)

---

## 5. Indian Express

- **URL:** `https://indianexpress.com`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present |
| Readability | ✅ | Has `<article>` elements |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 362 links — heavy noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body
├── header/nav
├── main (no <main> tag)
│   └── article (live blog entries)
│       ├── h2 — headline
│       ├── div — timestamp
│       ├── div — article body
│       │   └── p — paragraphs
│       └── figure — images
└── footer
```

**Page-level stats:**
- 362 `<a>` links
- 149 `<script>` tags (heaviest — ads, analytics, embeds)
- Has `<article>` elements (for live blog entries)
- No `<main>` tag
- `<h2>` for headlines (in article cards)
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): Should work — has `<article>` elements
- Full-text mode: innerText of `<article>` elements

---

## 6. News18

- **URL:** `https://www.news18.com`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present |
| Readability | ✅ | Has `<article>` + `<main>` |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 310 links — heavy noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
#__next (Next.js root)
└── main (present)
    └── article#story-* (unique per story)
        ├── h1 — headline
        ├── div — byline, date
        ├── div — article body
        │   ├── p — paragraphs
        │   └── figure — images
        └── div — related articles, ads
```

**Page-level stats:**
- 310 `<a>` links
- 103 `<script>` tags (ads, analytics, Next.js)
- Has `<main>` and `<article id="story-...">` — good semantic HTML
- Next.js SPA (`#__next` root)
- `<h1>` for headline
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): Should work well — proper semantic structure
- Full-text mode: innerText of `<article>` or `<main>`

---

## 7. ABP Live

- **URL:** `https://www.abplive.com`
- **Category:** News (Hindi/English)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ⚠️ | Video page — no article body text |
| Readability | ❌ | No `<article>`/`<main>`/`<h1>` — video-centric |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 125 links |
| Screenshot | ✅ | Full-page capture |

**Page-level stats:**
- 125 `<a>` links
- 42 `<script>` tags (moderate)
- No `<article>`, no `<main>`, no `<h1>` — short video platform
- Page is video-centric (short-form videos), not article-based
- Need alternative article URL for proper article testing

**How extraction should work:**
- Not suitable for article extraction — primarily video content
- Full-text mode would get minimal text (video titles, descriptions)
- Article mode (Readability): Unlikely to work

---

## 8. Firstpost

- **URL:** `https://www.firstpost.com`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present |
| Readability | ⚠️ | No `<article>`/`<main>` but has `<h1>` |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 184 links — moderate noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body
└── div (no article/main)
    ├── h1.art-sec-ttl.literatafont — headline
    ├── div — byline, date
    ├── div — article body
    │   ├── p — paragraphs
    │   ├── figure — images
    │   └── embeds
    └── div — related articles, ads
```

**Page-level stats:**
- 184 `<a>` links (moderate)
- 54 `<script>` tags (moderate)
- No `<article>` or `<main>` — pure `<div>` layout
- `<h1 class="art-sec-ttl literatafont">` for headline
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): May work — article text is structured
- Full-text mode: innerText of body (needs filtering)

---

## 9. Scroll

- **URL:** `https://scroll.in`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text cleanly present |
| Readability | ✅ | Has `<article>` — clean semantic structure |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 137 links — moderate noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body
└── div
    └── article#article-unique-* (unique per article)
        ├── header
        │   ├── h1 — headline
        │   └── h2 — sub-headline / summary
        ├── div — article body
        │   ├── p — paragraphs
        │   ├── figure — images
        │   └── embeds
        └── div — related articles, widgets
```

**Page-level stats:**
- 137 `<a>` links (moderate)
- 30 `<script>` tags (lightest among Indian news sites)
- Has `<article id="article-unique-...">` — semantic HTML5
- `<h1>` + `<h2>` inside `<header>` — well-structured
- No `<main>` tag
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): Should work well — ideal article structure
- Full-text mode: innerText of `<article>`

---

## 10. Deccan Herald

- **URL:** `https://www.deccanherald.com`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present |
| Readability | ⚠️ | No `<article>`/`<main>` — pure `<div>` layout |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 119 links |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body
└── div (no article/main — classless HTML)
    ├── h1 — headline
    ├── div — byline, date
    ├── div — article body
    │   ├── p — paragraphs
    │   ├── figure — images
    │   └── embeds
    └── div — related, ads
```

**Page-level stats:**
- 119 `<a>` links
- 75 `<script>` tags (heavy for its link count)
- No `<article>` or `<main>` — classless `<div>` containers
- Has `<h1>` for headline
- Hard to identify specific selectors (classless HTML)
- No Cloudflare block

**How extraction should work:**
- Article mode (Readability): May work — text is article-like
- Full-text mode: innerText of body (needs filtering)

---

## 11. The Tribune

- **URL:** `https://www.tribuneindia.com`
- **Category:** News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present |
| Readability | ⚠️ | Has `<article>` tags but all are related/sidebar cards, not main article |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 434 links — very heavy noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body
├── header/nav (heavy)
├── div (no article/main for main content)
│   ├── h1 — headline
│   ├── div — byline, date
│   ├── div — article body
│   │   ├── p — paragraphs
│   │   ├── figure — images
│   │   └── embeds
│   └── div — related articles as <article> cards
│       └── article.card-df — related article entries
└── footer
```

**Page-level stats:**
- 434 `<a>` links (2nd heaviest after HT)
- 114 `<script>` tags (ads, analytics)
- Has `<article>` elements but only for related/sidebar cards, not main content
- No `<main>` tag
- `<h1>` for headline
- No Cloudflare block
- Class-heavy selectors (`.card-df`, `#relArticle`)

**How extraction should work:**
- Article mode (Readability): May work — main article in `<div>` but text is article-like
- Full-text mode: innerText of body (very noisy — 434 links)
- Will need strong noise filtering for links

---

# Global News

---

## 12. BBC

- **URL:** `https://www.bbc.com/news`
- **Category:** News (Global)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text cleanly present |
| Readability | ✅ | Has `<article>` inside `<main>` — ideal semantic structure |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 115 links — moderate noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
header#bbc-header
└── main#bbc-main
    └── article
        ├── h1 — headline
        ├── div — byline, date, share buttons
        ├── div — article body
        │   ├── p — paragraphs
        │   ├── figure — images
        │   └── embedded content
        ├── aside — related topics
        └── aside/section — more on this story
```

**Page-level stats:**
- 115 `<a>` links (moderate — nav, related, social)
- 96 `<script>` tags (heavy — ads, analytics, CSS-in-JS)
- Has `<main id="bbc-main">` and `<article>` — excellent semantic HTML5
- Styled-components (CSS-in-JS, class names are auto-generated hashes)
- `<h1>` for headline inside article
- No Cloudflare block
- Article URLs follow `/news/articles/{slug}` pattern

**How extraction should work:**
- Article mode (Readability): Should work perfectly — ideal article structure
- Full-text mode: innerText of `<article>` or `<main>`

---

## 13. CNN

- **URL:** `https://www.cnn.com`
- **Category:** News (Global)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text cleanly present |
| Readability | ✅ | Has `<article>` with `<main class="article__main">` — semantic |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 358 links — heavy noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body
└── header
    └── h1#maincontent — headline
└── article.article
    └── section
        └── main.article__main
            ├── div — byline, date
            ├── p — paragraphs
            ├── figure — images
            ├── h2.subheader — section headings
            └── div — related/inline content
```

**Page-level stats:**
- 358 `<a>` links (heavy — nav, sidebar, related, ads)
- 80 `<script>` tags
- Has `<article class="article">` and `<main class="article__main">` inside article
- `<h1 id="maincontent">` for headline
- `<h2>` subheaders with id attributes (e.g. `#rallying-cry-for-a-generation`)
- Redirects to `edition.cnn.com`
- No Cloudflare block
- Article URLs follow `/{year}/{month}/{day}/{category}/{slug}`

**How extraction should work:**
- Article mode (Readability): Should work well — semantic article structure
- Full-text mode: innerText of `<article>` or `<main>`

---

## 14. Reuters

- **URL:** `https://www.reuters.com`
- **Category:** News (Global)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ⚠️ | DOM inaccessible to JS eval — heavy JS/bot protection |
| Readability | ⚠️ | JS-dependent rendering — Readability may fail |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | Not measurable — DOM not accessible |
| Screenshot | ✅ | Article visible in screenshot |

**Quirks:**
- Page title shows only "reuters.com" despite article loading visually
- Heavy JavaScript/bot protection prevents DOM inspection
- Article URL format: `/world/{category}/{slug}-2026-07-25/`
- Screenshot confirms content is rendered, but JS evaluation returns empty DOM
- May need different backend (chromium instead of cloakbrowser)

---

## 15. The Guardian

- **URL:** `https://www.theguardian.com`
- **Category:** News (Global)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text cleanly present |
| Readability | ✅ | Has `<article>` inside `<main>` — excellent semantic structure |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 171 links — moderate noise |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
main
└── div#article
    └── article.dcr-g2kw0g
        ├── h1.dcr-l0wuod — headline
        ├── div — byline, date
        ├── div — article body
        │   ├── p — paragraphs
        │   ├── figure — images
        │   └── embedded content
        └── section — related stories
```

**Page-level stats:**
- 171 `<a>` links (moderate)
- 22 `<script>` tags (low — leanest among global news)
- Has `<main>` and `<article>` — excellent semantic HTML5
- CSS-in-JS (`dcr-*` class names)
- Uses `gu-island` web components (islands architecture)
- `<h1>` for headline
- No Cloudflare block
- Article URLs follow `/{category}/{year}/{month}/{day}/{slug}`

**How extraction should work:**
- Article mode (Readability): Should work perfectly
- Full-text mode: innerText of `<article>` or `<main>`

---

## 16. Al Jazeera

- **URL:** `https://www.aljazeera.com`
- **Category:** News (Global)

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Article text present |
| Readability | ✅ | Has `<article>` inside `<main>` — semantic HTML5 |
| Tables | ❌ | No semantic tables |
| Links | ⚠️ | 91 links — moderate |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
main
└── article
    ├── h1 — headline
    ├── div — byline, date
    ├── div — article body
    │   ├── p — paragraphs
    │   ├── figure — images
    │   └── embedded content
    └── aside — related stories
```

**Page-level stats:**
- 91 `<a>` links (moderate)
- 47 `<script>` tags
- Has `<article>` and `<main>` — semantic HTML5
- `<h1>` for headline
- No Cloudflare block
- Article URLs follow `/{category}/{year}/{month}/{day}/{slug}`

**How extraction should work:**
- Article mode (Readability): Should work well
- Full-text mode: innerText of `<article>` or `<main>`

---


