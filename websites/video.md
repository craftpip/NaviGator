# Video

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). YouTube tested with `web_fetch` — SEO text captures title + description.

## 1. YouTube

- **URL:** `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- **Category:** Video platform

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ⚠️ | Video page title is present ("Rick Astley - Never Gonna Give You Up..."). Homepage shows "Try searching to get started" for logged-out users |
| Readability | ❌ | No `<article>` or `<main>` elements — all custom web components (`ytd-*`) |
| Tables | ⚠️ | Has `<table>` elements (ticket/merch/attribution data) but not video comments or related videos |
| Links | ⚠️ | Video page: 141 links (related videos, nav, comments metadata). Homepage: 24 links (logged-out minimal view) |
| Screenshot | ✅ | Full-page capture works. Shows video player, title, description, comments section |

**DOM Structure (video page — logged out):**
```
ytd-app (custom web component — Polymer/Lit based)
├── div#content
│   ├── div#masthead-container
│   │   └── ytd-masthead — header with search, logo, user menu
│   ├── ytd-mini-guide-renderer — collapsed sidebar
│   └── ytd-page-manager
│       └── ytd-watch-flexy — main video page
│           ├── div — player column
│           │   ├── ytd-player — video player
│           │   │   └── div#movie_player (html5 video + controls)
│           │   └── ytd-watch-metadata
│           │       └── div#title > h1 — video title "Rick Astley - Never Gonna Give You Up..."
│           ├── ytd-comments
│           │   ├── h2#count — "Comments 2.4M"
│           │   └── ytd-item-section-renderer — comment thread entries (lazy-loaded)
│           └── ytd-watch-next-secondary-results-renderer — related videos sidebar
│               └── ytd-item-section-renderer — related video cards
└── ytd-miniplayer — bottom mini player
```

**Page-level stats (homepage logged-out):**
- 24 `<a>` links (very minimal — just header nav and sign-in)
- 49 `<script>` scripts
- Single `<h2>` "Try searching to get started"
- No `<main>`, no `<article>` — pure web component SPA
- Logged-out homepage is essentially empty (no video feed)

**Page-level stats (video page):**
- 141 `<a>` links (related videos, channel links, nav, comments metadata)
- 62 `<script>` tags (heavy SPA)
- Has `<h1>` — video title visible in DOM (2 instances: watch-metadata + primary-info)
- Has `<h2>` — Comments section header "Comments 2.4M"
- Has `<table>` elements (for ticket/merch/attribution data)
- No `<main>` or `<article>` elements — all custom web components

**Quirks:**
- Heavy SPA built with Polymer web components (`ytd-*` custom elements)
- 49-62 `<script>` tags (very JS-heavy)
- Video page content only loads when navigating to a specific `/watch?v=` URL
- Homepage for logged-out users is nearly empty (24 links, just search + sign-in)
- Comments are lazy-loaded — may not be in DOM until scrolled
- Comment threads are rendered as web components (`ytd-comment-thread-renderer`)
- Video description rendered inside `ytd-watch-metadata` — text content accessible but deeply nested
- Related videos rendered in `ytd-watch-next-secondary-results-renderer`
- Some features gated behind login (subscriptions, history, likes)
- No Cloudflare block
- Title tag has full video title with channel name

**How extraction should work:**
- **Readability fails** — no article/main elements, all web components
- **Full-text mode:** innerText of `ytd-watch-flexy` gives video title, description, comments (if loaded)
- **Link extraction:** 141 links — mostly related videos + channel links
- **Title extraction:** `h1` inside `div#title > h1` or `div#container > h1` — both present
- **Comment extraction:** Comments section is present with h2#count header, but actual comments are rendered via JS and may not be present in initial extraction
- **Table extraction:** Has `<table>` elements but not for primary content (likely merch/tickets)
- **Best approach:** Targeted DOM queries for video title + description + related video links
- Screenshot is useful for seeing the video player and comment preview
