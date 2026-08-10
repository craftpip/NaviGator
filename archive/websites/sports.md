# Sports

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json).

## 1. Cricbuzz

- **URL:** `https://www.cricbuzz.com`
- **Category:** Sports / Cricket

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Homepage has live match cards + headlines + schedule. Commentary page has ball-by-ball text |
| Readability | ⚠️ | Has `<main>` but no `<article>`. Commentary page is structured div content — Readability may work on news articles |
| Tables | ❌ | No `<table>` elements anywhere — not even on scorecard pages. All data in styled `<div>` cards |
| Links | ⚠️ | 220 links (homepage), 145 (commentary), 291 (scorecard). Mostly nav + match card links |
| Screenshot | ✅ | Full-page capture works. Responsive mobile-first layout |

**DOM Structure (homepage):**
```
div#__next
└── header (nav with score/match tabs)
├── main.min-h-container
│   ├── div — carousel of match cards (scrollable horizontally)
│   │   └── div — match card × N
│   │       ├── div — match series name + format badge (T20I/Test)
│   │       ├── div — team 1 (flag + name + score)
│   │       ├── div — team 2 (flag + name + score)
│   │       └── span — match status (e.g., "Tomorrow • 11:00 AM", "Day 1: Stumps")
│   ├── div — Taboola ad unit "You May Like" (internal_trc_*)
│   ├── div — Caution banner (h2 "CAUTION")
│   └── div — content sections (tabs: Latest News, Photos, Schedule)
│       ├── div — Top Stories (h2 + article-style cards)
│       ├── div — Featured Videos
│       └── div — Specials
└── footer (app links, careers, about)
```

**DOM Structure (live commentary page /live-cricket-scores/):**
```
main.min-h-container
├── nav#main-nav — tabs: Info, Live, Scorecard, Squads, Overs, Graphs, Highlights, Full Commentary, News
├── div — match header
│   ├── h1 — "WI vs PAK, 1st Test, Pakistan tour of West Indies, 2026 - Commentary"
│   ├── div — mini score (team names, scores, overs, CRR)
│   └── div — match info (series, venue, date/time)
├── div — Taboola ads (internal_trc_* containers)
└── div — commentary text blocks (ball-by-ball divs)
```

**DOM Structure (scorecard tab /live-cricket-scorecard/):**
```
main.min-h-container
├── nav#main-nav — same tabs, with "Scorecard" active
├── div — match header + mini score
│   └── h1 — "WI vs PAK, 1st Test..."
└── div — scorecard content (div-based, NO <table> tags)
    ├── div — innings batting table (div rows: batsman, runs, balls, 4s, 6s, SR)
    ├── div — innings bowling table (div rows: bowler, overs, maidens, runs, wickets)
    ├── div — fall of wickets
    └── div — Taboola ad units (internal_trc_*)
```

**Page-level stats (homepage):**
- 220 `<a>` links (match links, nav, Taboola ads, footer)
- 98 `<script>` tags (very heavy — Next.js, Taboola, analytics)
- Has `<main>` but no `<article>` or `<table>`
- Tailwind CSS with custom `cb-*` utility classes
- Taboola ad units interspersed throughout main content
- Carousels for match listings (scrollable horizontally)

**Page-level stats (live commentary page):**
- 145 `<a>` links
- 91 `<script>` tags
- Title shows live score: "WI 194/3 (67) (Shai Hope 39(91) Kavem Hodge 83(181))"
- Has `<h1>` for match title
- No `<article>` or `<table>` elements

**Page-level stats (scorecard tab):**
- 291 `<a>` links
- 91 `<script>` tags
- Title: "Cricket scorecard | WI vs PAK, 1st Test..."
- Has `<h1>` for match title
- No `<article>` or `<table>` elements — scorecard is entirely div-based
- Taboola ads (12+ ad units visible on page)

**Quirks:**
- React/Next.js SPA with Tailwind CSS — content renders after JS hydration
- 91-98 scripts — very JS-heavy
- Scorecard data is DIV-based, NOT HTML `<table>` — table extraction won't work here
- Commentary page shows ball-by-ball text in divs
- Taboola ads heavily interspersed throughout main content (12+ units on long pages)
- Match scorecard data is only accessible via JS-rendered components (API calls)
- Scorecard ID format: `/live-cricket-scorecard/{matchId}/{slug}`
- Commentary ID format: `/live-cricket-scores/{matchId}/{slug}`
- Some analytics/tracking endpoints fail (ERR_CONNECTION_REFUSED) but doesn't affect rendering
- Premium features behind login (Cricbuzz Plus subscription)
- No Cloudflare block detected

**How extraction should work:**
- **Scorecard extraction:** Cannot use HTML `<table>` extraction — scorecards are div-based. Need to extract structured data from div text or use screenshot.
- **Commentary extraction:** Ball-by-ball text available in main content div — Readability could extract clean commentary text
- **News articles:** Need to test on a `/cricket-news/` URL for Readability performance
- **Links:** Mostly nav + match card links — filtering recommended
- **Best approach:** Screenshot for visual scorecard + innerText of main for commentary
- Tables: The scorecard data looks like a table visually but is not in `<table>` tags
