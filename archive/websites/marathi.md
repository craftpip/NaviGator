# Marathi News

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). Loksatta, Sakal, Pudhari, Divya Marathi, Tarun Bharat tested with `web_fetch` — all work; Tarun Bharat flagged `botProtected: true`.

## 1. Maharashtra Times

- **URL:** `https://maharashtratimes.com`
- **Category:** Marathi News / TOI Group

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich Marathi SEO text: headlines, story summaries, city-wise news across Maharashtra. Dense with text |
| Readability | ❌ | No `<main>` or `<article>` — React SPA with TOI stack (same as timesofindia.com). Deeply nested divs |
| Tables | ❌ | No `<table>` elements |
| Links | ❌ | 1030 links — extremely dense. Nav (city editions, TOI group sites), article cards, ad slots |
| Screenshot | ✅ | Full-page captures the Marathi newspaper layout: hero stories, city sections, entertainment |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div> — Header with logo (महाराष्ट्र टाइम्स), nav (मुख्य बातम्या, औरंगाबाद, नागपूर, मुंबई, पुणे, नाशिक, etc.)
      ├── <h1> — "Maharashtra Times"
      ├── <h2> — Section headings (मुख्य बातम्या, औरंगाबाद, नागपूर, etc.)
      ├── <div> — Main content grid
      │   ├── <div> — Left column (top stories)
      │   ├── <div> — Center column (category feeds)
      │   └── <div> — Right column (trending, ads)
      └── <footer> — Links, TOI group sites
```

**Page Stats:**
- Title: "महाराष्ट्र टाइम्स - News in Marathi, Latest Marathi News, Breaking News in Marathi"
- 1030 links, 202 scripts — extremely heavy
- Has `<h1>`, `<h2>` — no `<main>`, `<article>`, or `<table>`
- React SPA with TOI tech stack
- City editions: औरंगाबाद, नागपूर, मुंबई, पुणे, नाशिक, कोल्हापूर, ठाणे, नवी मुंबई

**Quirks:**
- 202 scripts — one of the heaviest Marathi news sites
- Same tech stack as Times of India (m360-* classes, publishstory.co CDN)
- React SPA — content renders after JS bootstraps
- 1030 links — majority are city edition navigation and ad slots
- Heavy ad network integration (Google DFP)
- City-specific pages likely better for focused extraction

**Extraction Strategy:**
- SEO text is the only reliable text source — captures all Marathi headlines
- Links are extremely dense — filter aggressively for article content
- Screenshot captures the full layout
- Readability doesn't work — React div soup
- Article pages (linked) may have better structure

---

## 2. Lokmat

- **URL:** `https://www.lokmat.com`
- **Category:** Marathi News / Leading Marathi Daily

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Very rich Marathi SEO text with all section headlines, story summaries, and category feeds |
| Readability | ❌ | No `<main>` or `<article>` — custom framework with `lok-*` prefixed class names |
| Tables | ❌ | No `<table>` elements |
| Links | ❌ | 1203 links — the most link-heavy site tested across all categories. Mega menu, city editions, article grid, trending topics |
| Screenshot | ✅ | Full-page captures the newspaper layout with city sections, trending bar, and entertainment |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <header> — Logo (लोकमत), nav (महाराष्ट्र, मुंबई, पुणे, नागपूर, औरंगाबाद, देश-विदेश, मनोरंजन, etc.)
      ├── <div> — Top stories / Hero section
      ├── <div> — City-wise news grid
      │   ├── मुंबई
      │   ├── पुणे
      │   ├── नागपूर
      │   └── औरंगाबाद
      ├── <div> — देश-विदेश (National/International)
      ├── <div> — मनोरंजन (Entertainment)
      ├── <div> — क्रीडा (Sports)
      ├── <div> — बॉलिवूड (Bollywood)
      ├── <div> — Business
      └── <footer> — Links, social, legal
```

**Page Stats:**
- Title: "Lokmat: लोकमत न्यूज | Latest Marathi News, Breaking News in Marathi"
- 1203 links, 38 scripts — most links of any site tested, but only moderate JS
- Has `<h1>`, `<h2>` — no `<main>`, `<article>`, or `<table>`
- Custom framework with `lok-*` class names
- Very link-dense — mega menu + city editions + article grid + ads

**Quirks:**
- 1203 links — highest link count across all 50+ sites tested
- Only 38 scripts — surprisingly light JS for the link volume
- Custom framework with `lok-*` classes — likely in-house PHP
- City edition links for every major Maharashtra city
- Ad slots interspersed throughout

**Extraction Strategy:**
- SEO text is the main source — captures all headlines and summaries
- Links need extremely aggressive filtering (1203 links, mostly nav)
- Screenshot captures the visual layout
- Readability doesn't work — no semantic containers
- Article pages likely cleaner for targeted extraction

---

## 3. Loksatta

- **URL:** `https://www.loksatta.com`
- **Category:** Marathi News / Indian Express Group

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich Marathi SEO text: news headlines, city updates, national/international, business, entertainment. Clean text |
| Readability | ✅ | Has `<main>` and `<article>` with `entry-content` class — WordPress Newpack theme extracts cleanly |
| Tables | ❌ | No `<table>` elements |
| Links | ⚠️ | 577 links — heavy but manageable. Nav (city sections, categories), article cards, sidebar widgets |
| Screenshot | ✅ | Full-page captures the WordPress layout: hero stories, category feeds, sidebar, footer |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <header> — Logo (लोकसत्ता), nav (महाराष्ट्र, मुंबई, पुणे, नागपूर, औरंगाबाद, देश-विदेश, मनोरंजन, etc.)
      ├── <div> — Top stories / Featured hero
      ├── <main id="main">
      │   ├── <article class="entry-content"> — Featured article with full text
      │   └── <article> — More stories grid
      ├── <aside> — Sidebar (trending, ads, social)
      └── <footer> — Links, copyright (Indian Express Group)
```

**Page Stats:**
- Title: "Loksatta | लोकसत्ता | Marathi News | latest Marathi News"
- 577 links, 93 scripts — heavy but reasonable
- Has `<main>`, `<article>` with `entry-content`, `<h1>`, `<h2>` — no `<table>`
- WordPress with NewsPack theme (by WordPress.com)
- Best semantic HTML among Marathi news sites

**Quirks:**
- Only Marathi site with `<main>` AND `<article>` — best for Readability extraction
- WordPress Newpack theme — well-structured PHP-rendered content
- 93 scripts — moderate (WordPress plugins, ads, analytics)
- 577 links — heavy but manageable with filtering
- Indian Express Group publication
- Sidebar with widgets, trending, and ad slots
- Server-rendered (PHP) — content available immediately

**Extraction Strategy:**
- Readability works great — `<main>` + `<article>` with `entry-content`
- SEO text also reliable as fallback
- Links need filtering but manageable
- Screenshot captures full WordPress layout
- Best extraction combo among Marathi sites: Readability + SEO + Screenshot

---

## 4. Sakal (eSakal)

- **URL:** `https://www.esakal.com`
- **Category:** Marathi News / Leading Marathi Daily

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich Marathi SEO text: headlines, city news, sports, entertainment. Good text density |
| Readability | ❌ | No `<main>` or `<article>` — Next.js app with div-based layout |
| Tables | ❌ | No `<table>` elements |
| Links | ⚠️ | 493 links — heavy. Nav (city editions, categories), article cards, ad slots |
| Screenshot | ✅ | Full-page captures the Next.js layout: hero stories, Maharashtra-wide city sections |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div id="__next"> (Next.js app)
      │   ├── <header> — Logo (सकाळ), nav (महाराष्ट्र, मुंबई, पुणे, नागपूर, विदर्भ, मराठवाडा, देश-विदेश, etc.)
      │   ├── <div> — Hero / Top stories
      │   ├── <div> — City-wise news sections
      │   │   ├── मुंबई
      │   │   ├── पुणे
      │   │   ├── नागपूर
      │   │   ├── विदर्भ
      │   │   └── मराठवाडा
      │   ├── <div> — क्रीडा (Sports)
      │   ├── <div> — मनोरंजन (Entertainment)
      │   └── <footer> — Links, subscription, social
```

**Page Stats:**
- Title: "eSakal - Latest Marathi News, Marathi Newspaper, Breaking News in Marathi"
- 493 links, 55 scripts — moderate-heavy
- Has `<h1>`, `<h2>` — no `<main>`, `<article>`, or `<table>`
- Next.js SPA with `<div id="__next">` root
- Sections covering all Maharashtra regions: विदर्भ, मराठवाडा, मुंबई, पुणे, नागपूर

**Quirks:**
- Next.js SPA — content renders after JS bootstraps
- Regional coverage focused on विदर्भ and मराठवाडा (Vidarbha, Marathwada)
- 55 scripts — moderate Next.js bundle
- 493 links — heavy but less than Maharashtra Times or Lokmat
- No semantic HTML containers — pure div layout

**Extraction Strategy:**
- SEO text captures all headlines and regional news
- Links need filtering — 493 links, mostly nav and city editions
- Screenshot captures Next.js layout
- Readability doesn't work — div-heavy structure

---

## 5. Pudhari

- **URL:** `https://www.pudhari.news`
- **Category:** Marathi News / Goa-Maharashtra-Karnataka

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Clean Marathi SEO text: top news, updates, sports, entertainment. Good text density |
| Readability | ❌ | No `<main>` or `<article>` — Next.js app |
| Tables | ❌ | No `<table>` elements |
| Links | ⚠️ | 190 links — manageable. Nav (sections), article cards, categories |
| Screenshot | ✅ | Full-page captures the Next.js layout: slider hero, category sections, app install popup |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div> — Header with logo (पुढारी), nav (ठळक बातम्या, अपडेट्स, स्पोर्ट्स, मुंबई/कोकण, मनोरंजन, etc.)
      ├── <div> — Hero slider with navigation arrows (slider-arrow-m_*)
      ├── <div> — Category sections
      │   ├── ठळक बातम्या (Top News)
      │   ├── अपडेट्स (Updates)
      │   ├── स्पोर्ट्स (Sports)
      │   ├── मुंबई/कोकण (Mumbai/Kokan)
      │   ├── मनोरंजन (Entertainment)
      │   ├── राष्ट्रीय (National)
      │   ├── आंतरराष्ट्रीय (International)
      │   └── विश्वसंचार (World)
      └── <footer> — Links, social, PWA app install popup
```

**Page Stats:**
- Title: "पुढारी | Pudhari | Marathi News | Latest Marathi News"
- 190 links, 28 scripts — lightest Marathi site
- Has `<h1>`, `<h2>` — no `<main>`, `<article>`, or `<table>`
- Next.js app with `slider-arrow-m_*` class names
- PWA app install popup

**Quirks:**
- Lightest Marathi site — only 28 scripts
- Next.js SPA but lightweight
- 190 links — manageable compared to 1000+ of Lokmat/MT
- PWA app install popup may block content
- Hero slider with left/right navigation arrows
- Coverage includes Goa, Maharashtra, and Karnataka (Konkan region focus)
- `indicator-*` class names for slider indicators

**Extraction Strategy:**
- SEO text is the main source — captures all section headlines
- Links are manageable (190)
- Screenshot captures the layout with slider
- Readability doesn't work

---

## 6. Divya Marathi

- **URL:** `https://www.divyamarathi.com`
- **Category:** Marathi News / Dainik Bhaskar Group

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich Marathi SEO text: news grid, city news, trending topics, weather updates. Clean text |
| Readability | ❌ | No `<main>` or `<article>` — React SPA with `<div id="root">` |
| Tables | ❌ | No `<table>` elements |
| Links | ⚠️ | 185 links — manageable. Nav (sections), city news links, trending, social share |
| Screenshot | ✅ | Full-page captures the React SPA layout: news grid, city news section, trending sidebar |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div id="root"> (React SPA)
      │   ├── <header> — Logo (दिव्य मराठी), nav (महाराष्ट्र, मुंबई, पुणे, नागपूर, औरंगाबाद, देश-विदेश, etc.)
      │   ├── <div> — Main content
      │   │   ├── <div> — News grid / Top stories
      │   │   ├── <div> — शहरांच्या सर्व बातम्या (All City News)
      │   │   ├── <div> — Trending Topic
      │   │   ├── <div> — Local News
      │   │   ├── <div> — Today Weather Update
      │   │   └── <div> — Our Group Site Links (Dainik Bhaskar group)
      │   └── <footer> — Links, social (React-share buttons)
```

**Page Stats:**
- Title: "Divya Marathi | Latest Marathi News, Marathi News Paper"
- 185 links, 22 scripts — second lightest Marathi site
- Has `<h1>`, `<h2>` — no `<main>`, `<article>`, or `<table>`
- React SPA with `hashed` class names (css-modules)
- Dainik Bhaskar Group (sister: Divya Bhaskar for Gujarat)

**Quirks:**
- Only 22 scripts — leanest React SPA among Marathi sites
- 185 links — manageable
- React-share buttons (Facebook, Twitter, etc.)
- City news section: शहरांच्या सर्व बातम्या
- Today Weather Update widget on homepage
- Dainik Bhaskar group links in footer
- Hashed CSS class names (e.g., `_xyz123`) — fragile for CSS-based extraction

**Extraction Strategy:**
- SEO text captures all section headlines and city news
- Links are manageable (185)
- Screenshot captures the React SPA layout
- Readability doesn't work — React div root

---

## 7. Tarun Bharat

- **URL:** `https://www.tarunbharat.com`
- **Category:** Marathi News / Nagpur-based

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Marathi SEO text with headlines and story content. Nagpur-focused news |
| Readability | ❌ | No `<main>` or `<article>` — older HTML patterns with inline styles |
| Tables | ❌ | No `<table>` elements |
| Links | ❌ | 1108 links — very dense. Breaking news ticker, article grid, category feeds, social, ads |
| Screenshot | ✅ | Full-page captures the older-style layout with marquee ticker, story grid, and category sections |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <header> — Logo (तरुण भारत), nav, search
      ├── <marquee> — Breaking news ticker
      ├── <div> — Main stories (with <h1> headlines)
      ├── <div> — Category sections (inline styled divs)
      ├── <div> — Sidebar (trending, ads)
      └── <footer> — Links, social, legal
```

**Page Stats:**
- Title: "Tarun Bharat | Marathi News | तरुण भारत | Latest Marathi News"
- 1108 links, 90 scripts — very heavy (second highest link count)
- Has `<h1>` — no `<main>`, `<article>`, or `<table>`
- Older HTML patterns with `<marquee>`, inline styles, and random ID attributes
- Nagpur-based publication

**Quirks:**
- 1108 links — extremely link-heavy (only Lokmat's 1203 is higher)
- 90 scripts — heavy (multiple ad networks, analytics, tracking)
- Uses `<marquee>` tag for breaking news — rare in modern web
- Older HTML patterns with inline styles and random numeric IDs
- Nagpur-focused coverage (Vidarbha region)
- `readyState: interactive` — slow to fully load
- Ad-heavy layout

**Extraction Strategy:**
- SEO text captures headlines and Nagpur-focused stories
- Links need very aggressive filtering (1108 links)
- Screenshot captures the older-style layout
- Readability doesn't work — no semantic containers

---

## Extraction Summary

| Site | URL | SEO | Readability | Tables | Links | Screenshot |
|------|-----|-----|-------------|--------|-------|------------|
| Maharashtra Times | maharashtratimes.com | ✅ | ❌ | ❌ | ❌ 1030 | ✅ |
| Lokmat | lokmat.com | ✅ | ❌ | ❌ | ❌ 1203 | ✅ |
| Loksatta | loksatta.com | ✅ | ✅ | ❌ | ⚠️ 577 | ✅ |
| Sakal (eSakal) | esakal.com | ✅ | ❌ | ❌ | ⚠️ 493 | ✅ |
| Pudhari | pudhari.news | ✅ | ❌ | ❌ | ⚠️ 190 | ✅ |
| Divya Marathi | divyamarathi.com | ✅ | ❌ | ❌ | ⚠️ 185 | ✅ |
| Tarun Bharat | tarunbharat.com | ✅ | ❌ | ❌ | ❌ 1108 | ✅ |

## Key Takeaways

- **Loksatta** is the only Marathi site with `<main>` and `<article>` — best for Readability extraction (WordPress Newpack theme)
- **Lokmat** (1203 links) and **Maharashtra Times** (1030 links) are the most link-heavy — need aggressive filtering
- **Pudhari** (190 links, 28 scripts) and **Divya Marathi** (185 links, 22 scripts) are the lightest — most manageable for extraction
- **Tarun Bharat** uses older HTML patterns (`<marquee>`, inline styles, random IDs) — unique among the group
- SEO text works for all Marathi sites — none have meaningful table data on homepage
- Readability only works on Loksatta — other sites are SPAs (React, Next.js) or custom frameworks
- All sites are link-heavy compared to non-news categories (500-1200 links typical)
- Tech stack diversity: TOI (React), Lokmat (custom PHP), Loksatta (WordPress), Sakal (Next.js), Pudhari (Next.js), Divya Marathi (React), Tarun Bharat (classic PHP)
