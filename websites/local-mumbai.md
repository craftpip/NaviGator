# Local Mumbai News

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). All 6 sites tested with `web_fetch` — content matches screenshots.

## 1. Mumbai Mirror

- **URL:** `https://mumbaimirror.indiatimes.com`
- **Category:** Local Mumbai News / English Newspaper

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text with article headlines and summaries. Mumbai-focused crime, sports, and civic stories |
| Readability | ✅ | Uses `<article>` container — Readability extracts article text cleanly |
| Tables | ❌ | No `<table>` elements — all div/card-based layout |
| Links | ⚠️ | 92 links — nav (Mumbai, Cover Story, Opinion, Sports), article cards, ad slots, social |
| Screenshot | ✅ | Full-page captures article grid, hero layout, ad slots |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <header> — Logo (Mumbai Mirror), hamburger menu, search, social links
      │   └── Nav: Home, Mumbai, Cover Story, Opinion, Sports, Entertainment, etc.
      ├── <article> — Main content
      │   ├── <section> — Top ad banner (Google DFP)
      │   ├── <section> — Hero layout (3 stories)
      │   │   ├── <div> — Left side: top stories with images
      │   │   └── <div> — Right side: featured story with image + summary
      │   ├── <section> — Latest stories (paginated grid with 1-100)
      │   ├── <section> — Carousel section (Prev/Next navigation)
      │   ├── <section> — SUNDAY READ section
      │   ├── <section> — SPORTS section (tabbed: 1-7)
      │   └── <section> — Right gutter ads (left + right)
      └── <footer> -- Links, privacy, terms
```

**Page Stats:**
- Title: "Latest Mumbai News Headlines, Mumbai Daily Local News: Mumbai Mirror Newspaper"
- 92 links, 33 scripts — moderate JS
- Has `<article>`, `<h2>` (SUNDAY READ, SPORTS) — no `<main>`, `<h1>`, or `<table>`
- Built on Times of India tech stack (m360-* class names, publishstory.co CDN)
- Article-driven layout with hero section and paginated grid

**Quirks:**
- TOI tech stack — m360- prefixed CSS classes
- Content loaded from staticimg.publishstory.co CDN
- Article content in `<article>` with section-based layout
- Paginated story grid (1-100 pages)
- Google DFP ads interspersed throughout
- Left/right gutter ad slots
- Carousel sections with Prev/Next navigation

**Extraction Strategy:**
- Readability works on `<article>` — extracts story text
- SEO text captures headlines and summaries
- Links are mostly to article pages — useful for crawling
- Screenshot captures article grid layout

---

## 2. Mid-Day

- **URL:** `https://www.mid-day.com`
- **Category:** Local Mumbai News / English Daily

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text with Mumbai-focused headlines, live blog updates, entertainment, sports, and city news |
| Readability | ✅ | Has `<main>` with content — Readability extracts article text cleanly. Next.js rendered |
| Tables | ❌ | No `<table>` elements — div/card-based layout |
| Links | ⚠️ | 154 links — nav (Mumbai, Entertainment, Sports, Lifestyle, etc.), article cards, live blog, social |
| Screenshot | ✅ | Full-page captures live blog, spotlight section, Mumbai news grid, entertainment |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div id="__next"> (Next.js app)
      │   ├── <nav> — Top bar: Mid-Day logo, sections (Mumbai, Entertainment, Sports, etc.)
      │   ├── <main>
      │   │   ├── <div> — Google Sign In button (hidden)
      │   │   ├── <div> — Live blog / Top stories row
      │   │   │   ├── <div> — Left column: lead story (h1), sub stories (h2)
      │   │   │   ├── <div> — Center column: political updates, entertainment (h2)
      │   │   │   ├── <div> — Right column: trending, sports (h2)
      │   │   │   └── <section> — Live Blog (with live timestamp updates)
      │   │   ├── <div> — Spotlight section
      │   │   └── <div> — Mumbai section
      │   │       ├── <h2> — "Mumbai"
      │   │       └── Article cards (cyber fraud, Ghatkopar station, protests)
      │   └── <footer> — Links, social, legal
```

**Page Stats:**
- Title: "Latest Mumbai News | India news | Entertainment News | ... | Mid-Day"
- 154 links, 29 scripts — moderate JS
- Has `<main>`, `<h1>`, `<h2>` — no `<article>` or `<table>`
- Next.js app (div#__next), Tailwind CSS
- Live blog section with real-time updates

**Quirks:**
- Next.js SPA — content renders after JS bootstraps
- Live blog section updates in real-time
- Google Sign In iframe embedded
- Category sections: Mumbai (local), Spotlight (features), Live Blog (breaking)
- Good h1/h2 hierarchy for news headlines
- "Mumbai" tag on local stories

**Extraction Strategy:**
- SEO text captures headlines, live blog entries, and Mumbai-specific stories
- Readability works on `<main>` — extracts article text
- Links are mostly article pages — good for crawling
- Screenshot captures live blog and visual layout

---

## 3. Free Press Journal (FPJ)

- **URL:** `https://www.freepressjournal.in`
- **Category:** Local Mumbai News / English Daily

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text across 11 sections — Top News, City News, Entertainment, Business, India, Videos, Lifestyle, Viral, Sports, World, Photos |
| Readability | ✅ | PHP-rendered with `<section>` tags and good heading hierarchy. Readability extracts article content cleanly |
| Tables | ❌ | No `<table>` elements — classic PHP div-based layout |
| Links | ⚠️ | 288 links — very link-heavy. Nav, city tabs (Mumbai/Pune/Indore/Bhopal/Delhi), article cards, social, ads |
| Screenshot | ⚠️ | Full-page is very long (11 sections). Captures TOP NEWS hero, City News tabs, and section grids |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <header> — FPJ logo, nav (Home, Mumbai, India, World, Business, Sports, Entertainment, etc.)
      ├── <section> — TOP NEWS (h1)
      │   └── Hero story + grid of secondary stories
      ├── <section id="fpj_cityNews"> — CITY NEWS (h2)
      │   ├── City tabs: Mumbai, Pune, Indore, Bhopal, Delhi
      │   ├── Big news card (image + h3 title)
      │   └── List of secondary city stories
      ├── <section> — ENTERTAINMENT (h2)
      ├── <section> — BUSINESS (h2)
      ├── <section> — INDIA (h2)
      ├── <section> — VIDEOS (h2)
      ├── <section> — LIFESTYLE (h2)
      ├── <section> — VIRAL (h2)
      ├── <section> — SPORTS (h2)
      ├── <section> — WORLD (h2)
      ├── <section> — PHOTOS (h2) — inshorts-style horizontal scroll
      └── <footer> — Links, legal, social
```

**Page Stats:**
- Title: "Latest News, Breaking News, Today Headlines, India News, Mumbai News | Free Press Journal"
- 288 links, 29 scripts — very link-heavy, moderate JS
- Has `<h1>` (TOP NEWS), `<h2>` (section headings) — no `<main>`, `<article>`, or `<table>`
- Classic PHP-based news site with section-based layout
- City tabs for Mumbai/Pune/Indore/Bhopal/Delhi

**Quirks:**
- Classic PHP-rendered site — no SPA framework
- 288 links — very heavy navigation
- 11 content sections, very long page
- City tabs use JavaScript tab switching (href="javascript:void(0)")
- Lazy-loaded images (class="lazy gm-observing")
- Assettype.com CDN for images
- "inshorts"-style horizontal photo scroll in PHOTOS section
- Section-based layout makes Readability extraction effective

**Extraction Strategy:**
- SEO text works well — all 11 sections in readable text
- Readability extracts section content
- Links very dense — filter for article links only
- Screenshot best at viewport size (full-page is too long)
- City tabs default to Mumbai — good for local extraction

---

## 4. Mumbai Live

- **URL:** `https://www.mumbailive.com`
- **Category:** Local Mumbai News / Digital-Only

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text dense with Mumbai-specific content: local news headlines, civic updates, infrastructure, transport, real-time coverage |
| Readability | ❌ | No `<main>` or `<article>` — custom Bootstrap-like layout with `ml-*` prefixed classes |
| Tables | ❌ | No `<table>` elements |
| Links | ⚠️ | 186 links — mega menu (Politics, Civic, Society sub-categories), article cards, push notification opt-in |
| Screenshot | ✅ | Captures the full page: news feed, category navigation, push notification popup |

**DOM Structure (mobile-first, 800px viewport shows off-canvas nav):**
```
<html>
  └── <body>
      ├── <div> — Off-canvas side nav (741px wide, slides in)
      │   ├── POLITICS
      │   ├── CIVIC → Civic, Crime, Infrastructure, Transport, Environment, Health, Education
      │   ├── SOCIETY → Society, Business, Share Market, Real Estate, Commodity Market
      │   └── ... more categories
      ├── <div> — Top header bar (hamburger, logo, search, social share)
      ├── <div id="ml-page-content"> — Main content
      │   ├── <section> — Hero/Featured stories carousel (left/right nav buttons)
      │   ├── <section> — Top stories grid
      │   ├── <section> — Category feeds (Politics, Civic, Infrastructure, etc.)
      │   └── <section> — Live updates / Breaking news ticker
      ├── <div> — Push notification prompt (ALLOW / NO THANKS)
      ├── <div> — Newsletter subscribe modal
      └── <footer> — About, contact, social
```

**Page Stats:**
- Title: "Mumbai Local News: Latest News in Mumbai, Headlines, Live Updates and Coverage on Mumbai Live"
- 186 links, 22 scripts — moderately light
- No `<main>`, `<article>`, `<h1>`, `<h2>`, or `<table>` — custom framework with `ml-*` classes
- Mobile-first responsive design
- Push notification prompt and newsletter modal

**Quirks:**
- Deeply Mumbai-focused — very granular categories (Civic, Crime, Infrastructure, Transport, Environment)
- Mobile-first responsive layout — 800px viewport shows off-canvas side nav
- Custom CSS framework with `ml-*` prefixed classes (ml-card-box-shadow, ml-font-size-xl, etc.)
- No semantic HTML elements — all `<div>` with custom classes
- Push notification prompt appears on load
- Newsletter subscribe modal with email form
- "NEW UPDATE(S)" floating button for live updates
- Telegram channel modal
- Social share modal

**Extraction Strategy:**
- SEO text is the most reliable — captures all headlines and story text
- Links well-organized by category (politics, civic, society, etc.)
- Screenshot captures layout with push notification overlay
- Readability doesn't work — no semantic containers
- Site is intentionally mobile-first

---

## 5. Times of India — Mumbai

- **URL:** `https://timesofindia.indiatimes.com/city/mumbai`
- **Category:** Local Mumbai News / English Newspaper

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Very rich SEO text: latest Mumbai news, rain, weather, airport, local train, crime, fire, election. Dense with headlines and summaries |
| Readability | ❌ | No `<main>` or `<article>` — React SPA with deeply nested divs. TOI custom framework |
| Tables | ❌ | No `<table>` elements |
| Links | ❌ | 474 links — extremely dense. Nav (TOI sections, city editions), article cards, photo stories, reviews, entertainment, ads |
| Screenshot | ✅ | Full-page captures the entire Mumbai news page: hero, More From Mumbai, More From Maharashtra, city tabs, Photostories, Reviews |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div id="app"> (React SPA)
      │   ├── <div> — Top nav bar (TOI logo, sections: Mumbai, Pune, Delhi, etc.)
      │   ├── <div> — Sub-nav (City, India, Entertainment, Sports, etc.)
      │   ├── <div> — Breaking news ticker
      │   ├── <div> — Main content
      │   │   ├── <h1> — "Mumbai News"
      │   │   ├── <h2> — "TOI" (section label)
      │   │   ├── <div> — Top stories / Featured
      │   │   ├── <div> — Latest news list
      │   │   ├── <h2> — "More From Mumbai"
      │   │   ├── <h2> — "More From Maharashtra"
      │   │   │   ├── <h2> — "Chhatrapati Sambhajinagar"
      │   │   │   ├── <h2> — "Kolhapur"
      │   │   │   ├── <h2> — "Nagpur"
      │   │   │   ├── <h2> — "Nashik"
      │   │   │   ├── <h2> — "Navi Mumbai"
      │   │   │   ├── <h2> — "Pune"
      │   │   │   └── <h2> — "Thane"
      │   │   ├── <h2> — "More Stories" (paginated)
      │   │   ├── <h2> — "Photostories"
      │   │   ├── <h2> — "Reviews" (slick carousel)
      │   │   └── <h2> — "Entertainment"
      │   └── <footer> — Links, legal, RSS
```

**Page Stats:**
- Title: "Mumbai News Live: Check the latest Mumbai news, Also find the breaking Mumbai news related to Mumbai rain, weather, airport, local train, crime, fire, election."
- 474 links, 29 scripts — extremely link-heavy
- Has `<h1>` (Mumbai News), `<h2>` (sections) — no `<main>`, `<article>`, or `<table>`
- React SPA with custom CSS classes (izYUt, Jksrs, etc.)
- City hub page: Mumbai + Maharashtra cities (Chhatrapati Sambhajinagar, Kolhapur, Nagpur, Nashik, Navi Mumbai, Pune, Thane)

**Quirks:**
- 474 links — one of the most link-heavy sites tested
- React SPA — deeply nested div structure
- Custom class names (izYUt, Jksrs) — likely CSS-modules or minified
- Slick carousel for Reviews section
- Pagination dots for More Stories
- City editions for 7 Maharashtra cities on one page
- Photo stories and entertainment sections mixed in
- Very dense page with many content types

**Extraction Strategy:**
- SEO text is the best bet — captures all Mumbai headlines
- Links are very dense — need aggressive filtering for article links
- Screenshot captures the full city page layout
- Readability doesn't work — React div soup
- Article pages (linked) likely have better structure

---

## 6. Afternoon Voice

- **URL:** `https://www.afternoonvoice.com`
- **Category:** Local Mumbai News / English Digital

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text with news headlines across categories: Top News, City News, Nation, World, Business, Entertainment, Sports. Mumbai-focused |
| Readability | ✅ | TagDiv (tagDiv Composer) theme with `<div>`-based layout but good heading structure. Readability extracts article text |
| Tables | ❌ | No `<table>` elements |
| Links | ⚠️ | 377 links — heavy. Mega menu, article cards (6 columns), category feeds, social media, sidebar widgets |
| Screenshot | ✅ | Full-page captures the newspaper-style layout: header with breaking news ticker, 3-column article grid, category feeds |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div> — Mobile menu overlay (Facebook, Instagram, Koo, LinkedIn, X, YouTube)
      │   └── Nav: Home, Top News, City News, Nation, World, Business, Entertainment (sub: Bollywood, Hollywood), Sports (sub: Cricket, Hockey, Tennis, Football, Badminton)
      ├── <div id="tdi_3"> — Top bar (date, social icons, search)
      ├── <div> — Header (logo, breaking news ticker, search form)
      ├── <div> — Main content area
      │   ├── <div> — Featured posts (6-column grid with h1)
      │   ├── <div> — Category blocks (td_block)
      │   │   ├── City News
      │   │   ├── Nation
      │   │   ├── World
      │   │   └── Business
      │   └── <div> — Sidebar widgets
      └── <footer> — Links, copyright, social
```

**Page Stats:**
- Title: "Latest News And Opinion From India, World, Politics, Mumbai News, Economy, Ground Reports"
- 377 links, 70 scripts — very heavy (TagDiv theme + multiple plugins)
- Has `<h1>` (article titles in grid), no `<h2>`, no `<main>`, `<article>`, or `<table>`
- TagDiv WordPress theme (tdi-* prefixed IDs, td-* classes)
- Newspaper-style layout with 6-column article grid

**Quirks:**
- TagDiv WordPress theme — very heavy (70 scripts)
- 377 links — mega menu + 6-column article grid
- `readyState: interactive` — slow to fully load
- Mobile menu with social media icons (Facebook, Instagram, Koo, LinkedIn, X, YouTube)
- Breaking news ticker in header
- Search form with submit button
- Category-based blocks (td_block)
- Sidebar widgets with additional links
- Bollywood/Hollywood sub-categories under Entertainment

**Extraction Strategy:**
- SEO text captures all category headlines
- Readability works despite div-heavy layout — TagDiv has good heading hierarchy
- Screenshot captures newspaper-style grid layout
- Links very dense — filter for article content links
- Article pages (linked) likely have cleaner structure for extraction

---

## Extraction Summary

| Site | URL | SEO | Readability | Tables | Links | Screenshot |
|------|-----|-----|-------------|--------|-------|------------|
| Mumbai Mirror | mumbaimirror.indiatimes.com | ✅ | ✅ | ❌ | ⚠️ 92 | ✅ |
| Mid-Day | mid-day.com | ✅ | ✅ | ❌ | ⚠️ 154 | ✅ |
| Free Press Journal | freepressjournal.in | ✅ | ✅ | ❌ | ⚠️ 288 | ⚠️ |
| Mumbai Live | mumbailive.com | ✅ | ❌ | ❌ | ⚠️ 186 | ✅ |
| TOI Mumbai | timesofindia.indiatimes.com/city/mumbai | ✅ | ❌ | ❌ | ❌ 474 | ✅ |
| Afternoon Voice | afternoonvoice.com | ✅ | ✅ | ❌ | ⚠️ 377 | ✅ |
