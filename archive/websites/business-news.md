# Business / Finance News

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). Livemint, Business Standard, Financial Express tested with `web_fetch` — content matches.

## 1. Livemint

- **URL:** `https://www.livemint.com`
- **Category:** Business / News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich meta: og:title, og:description, og:image, twitter:card, article:published_time, article:section |
| Readability | ✅ | Main content in `<main>` with clear article containers — Readability should parse well |
| Tables | ⚠️ | No `<table>` on homepage; market data tables on `/market/` subpages |
| Links | ✅ | 499 links on homepage — extractable; story links in `<ul>` lists |
| Screenshot | ✅ | Renders cleanly, no bot blocking |

**DOM Structure (homepage):**
```
div#__next              ← Next.js root
├── header              ← Nav bar with sections
├── main                ← Primary content
│   ├── div.containerNew
│   │   ├── div (hero story)
│   │   │   └── ul > li > div
│   │   │       └── h1.imgStory     ← Headline
│   │   ├── div (story cards)
│   │   ├── h2 "News"
│   │   ├── h2 "Trending In News"
│   │   ├── h2 (Premium Stories)
│   │   ├── h2 "Market Snapshot"
│   │   └── h2 "Trending in Markets"
│   └── aside/sidebar sections
└── footer
```

**Page Stats:**
| Metric | Value |
|--------|-------|
| `document.title` | Business News Today: Read Latest Business News... |
| `links` | 499 |
| `scripts` | 72 |
| `hasArticle` | No (list page) |
| `hasMain` | Yes |
| `hasH1` | Yes |
| `hasTable` | No |

**Quirks:**
- Next.js app (`div#__next`) — JS-rendered content
- 72 scripts = heavy framework overhead
- Article pages likely have `<article>` tags — verify on story URL
- Paywall for Premium stories — Readability may get blocked text
- No Cloudflare detected on homepage

---

## 2. Business Standard

- **URL:** `https://www.business-standard.com`
- **Category:** Business / News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | og:title, og:description, og:image, twitter:card, article:published_time |
| Readability | ⚠️ | No `<main>` or `<article>` on homepage — uses `<div>` layout; article pages likely better |
| Tables | ⚠️ | No `<table>` on homepage; market data areas may have tables |
| Links | ✅ | 259 links on homepage — manageable; section headings and story cards |
| Screenshot | ✅ | Renders cleanly, no bot blocking |

**DOM Structure (homepage):**
```
div#__next                  ← Next.js root
├── div
│   ├── div (header/nav)   ← Top nav with sections
│   ├── div (5th child)
│   │   ├── div (10th child)
│   │   │   └── h1.section-title "Top News"
│   │   ├── div (6th child)
│   │   │   └── section
│   │   │       └── div > div > h2  ← Featured story
│   │   ├── div (12th child)
│   │   │   └── div > h2 "Special Coverage"
│   │   │       └── cards with h2 item titles
│   │   └── ... more content sections
│   └── footer
```

**Page Stats:**
| Metric | Value |
|--------|-------|
| `document.title` | Business News, Finance News, India News... |
| `links` | 259 |
| `scripts` | 80 |
| `hasArticle` | No (list page) |
| `hasMain` | No |
| `hasH1` | Yes ("Top News") |
| `hasTable` | No |

**Quirks:**
- Next.js app (`div#__next`) — JS-rendered content
- 80 scripts — very JS-heavy
- No semantic `<main>` or `<article>` on homepage — pure `<div>` layout
- Article pages expected to have `<article>` elements
- Paywall: BS Premium content likely restricted
- No Cloudflare detected

---

## 3. Financial Express

- **URL:** `https://www.financialexpress.com`
- **Category:** Business / News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | og:title, og:description, og:image, og:type, og:site_name, twitter:card, article tags |
| Readability | ✅ | Uses `<article>` elements even on homepage — Readability should work well on story pages |
| Tables | ⚠️ | No `<table>` on homepage; market data widgets may be `<div>`-based |
| Links | ✅ | 478 links — many are story cards, sidebar widgets, trending topics |
| Screenshot | ✅ | Renders cleanly, no bot blocking |

**DOM Structure (homepage):**
```
body
├── div (top bar / ticker — Sensex/Nifty live data)
├── div (header with nav sections)
├── div (3rd)
│   └── div (4th) ← main content area
│       ├── div > div > div > div
│       │   ├── div (left sidebar)
│       │   ├── div (center/main)
│       │   │   ├── article#event-* "Gold Pulse"     ← Featured story card
│       │   │   ├── article#event-* "Stock Insights..."
│       │   │   ├── article#event-* "Business News..."
│       │   │   ├── article#event-* "Economy..."
│       │   │   ├── div (right column)
│       │   │   │   ├── article#event-* "Stock Insights..."
│       │   │   │   ├── article#event-* "Economy..."
│       │   │   │   └── ...
│       │   └── div (more sections)
│       └── div (bottom)
└── footer
```

**Page Stats:**
| Metric | Value |
|--------|-------|
| `document.title` | Business News Today: Latest Stock Market Updates... |
| `links` | 478 |
| `scripts` | 112 |
| `hasArticle` | **Yes** — many `<article>` elements with unique IDs |
| `hasMain` | No |
| `hasH1` | Yes |
| `hasTable` | No |

**Quirks:**
- Very JS-heavy (112 scripts) — slow to fully render
- ReadyState was "interactive" not "complete" — content may take time
- Uses `<article>` tags with `id="event-*"` on story cards — great for Readability
- Has live stock ticker at top (Sensex/Nifty values)
- No `<main>` element — content wrapped in `<div>` containers
- No Cloudflare detected
- Article classes encode category tags (`tag-*`, `category-*`) — useful for content classification

---

## 4. Economic Times (ET)

- **URL:** `https://economictimes.indiatimes.com`
- **Category:** Business / News

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Full homepage text with market ticker, headlines, news, ETPrime teasers |
| Readability | ⚠️ | Homepage is a dense portal (861 links) — not article content. Article pages likely work if you have a valid URL |
| Tables | ❌ | No `<table>` elements on homepage or article pages — all div-based layout |
| Links | ❌ | **861 links** — heaviest site tested. Mega nav, market data, language editions, footer, ads, recommendations |
| Screenshot | ✅ | Full-page capture works but extremely long (15K+ px) |

**DOM Structure (homepage):**
```
section#netspidersosh
├── div (top ad container — DFP)
├── header
│   ├── div (market ticker band — Sensex, Nifty values rotating)
│   ├── div (search bar)
│   └── div (logo, language editions: हिन्दी ગુજરાતી मराठी বাংলা ಕನ್ನಡ മലയാളം தமிழ் తెలుగు)
│       ├── a — Today's ePaper
│       ├── a — My Watchlist
│       ├── a — Subscribe
│       └── a — Sign In
├── nav#topnav (horizontal nav: Home, ETPrime, Markets, Market Data, News, etc.)
├── main.pageHolder
│   ├── div#topStories — hero carousel with h1 headlines
│   ├── section#homeLeftSection — main 3/4 width content area
│   │   ├── section — featured stories + ETPrime section
│   │   │   ├── h2 "ETPrime : Invest Smarter. Lead Stronger."
│   │   │   ├── div — Prime Exclusives (premium content teasers)
│   │   │   ├── div — Investment Ideas
│   │   │   ├── div — Harvard Business Review Exclusives New
│   │   │   ├── div — Intelligent Investing New
│   │   │   ├── div — Alpha Trades
│   │   │   └── div — ET ePaper
│   │   ├── section — newsletter signup
│   │   ├── div — Top Stocks of the Day (h2)
│   │   ├── section#top-news — Top News
│   │   ├── section#News by Industry — by-industry section
│   │   ├── section#Market News — market headlines
│   │   ├── section#content-widget-heading-usMarkets — US markets
│   │   ├── div — Mutual Funds section
│   │   ├── div — Find Your First Bond widget
│   │   ├── div — Cryptocurrency News
│   │   ├── section — Careers
│   │   ├── section — NRI
│   │   ├── section — Top Mutual Funds
│   │   └── section#content-widget-heading-tech — Tech
│   └── aside#homeRightSection — sidebar 1/4 width
│       └── section — Opinion (3 article cards with jsx-be6c8ab889e0efe0 class)
│           ├── article — "Why India's uncles and aunties..."
│           ├── article — "Nightingale of South India"
│           └── article — "Look at them look at you"
└── footer
```

**Page-level stats:**
- 861 `<a>` links (heaviest tested — mega nav, language editions, market data feeds, footer)
- 87 `<script>` tags (moderate for a news portal)
- Has `<main class="pageHolder">` and `<article>` (opinion items only)
- No `<table>` elements — all data in `<div>` layout
- Multiple `<h1>` elements (one per top story in hero carousel)
- Market band at top rotates Nifty/Sensex values with CSS transitions
- Next.js-ish class names (`jsx-*` hashed classes)
- ETPrime content is paywalled — teasers visible, full content requires subscription
- Search bar with SVG icon
- DFP ad slots throughout (top ad, inline ads)
- Language edition links in header (8 Indian languages)
- No Cloudflare block
- Page is extremely tall (~15,586px) for homepage

**How extraction should work:**
- Article mode (Readability): May work on article pages (`/news/...`, `/markets/stocks/...`) but article URL format needs verification. The page I tested (`/markets/stocks/news/...`) returned a "Most Viewed" listing page, not an article.
- Full-text mode: innerText of `<main>` gives good overview but extremely noisy with 861 links
- Links: Extreme filtering needed — most links are nav navigation, language editions, market data links, footer, ads
- Tables: No HTML `<table>` — all data is div-based
- Best extraction: `<main>` content with market ticker + story headlines + opinion items
- Paywalled content (ETPrime) will be visible as teasers only
