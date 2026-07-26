# Weather

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). AccuWeather, BBC Weather tested (homepages work; city-specific URLs may 404).

## 1. The Weather Channel

- **URL:** `https://weather.com/en-IN/weather/today/l/25.59,85.14`
- **Category:** Weather

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text: temp, humidity, forecast summary in readable text |
| Readability | ⚠️ | Readability works on main content but misses sidebar data (AQI, Health). React SPA — text loads after JS |
| Tables | ✅ | Hourly forecast rendered as HTML tables with `table` tag, also 10-day and monthly |
| Links | ⚠️ | 83 links — mostly nav, seasonal sections, and ad-related. Few content links |
| Screenshot | ✅ | Full-page screenshot captures all dynamic weather data, AQI sidebar, hourly/daily cards |

**DOM Structure:**
```
<html>
  ├── <head> — SEO meta, Open Graph, scripts
  └── <body>
      ├── <div> — nav bar (Forecasts, Radar, Allergy Tracker, AQI, More)
      │   ├── <nav> — main nav with <ul>
      │   │   ├── Forecasts
      │   │   ├── Radar
      │   │   ├── Allergy Tracker
      │   │   ├── Air Quality Index
      │   │   └── More (button)
      │   └── utility buttons
      ├── <main id="main-content-wrapper">
      │   ├── <header> — location breadcrumb + sign in
      │   ├── <div> — left column (weather content)
      │   │   ├── <h1>Mithapur Weather
      │   │   ├── <div> — current conditions (temp, feels like, chance of rain)
      │   │   ├── <section> — Today's outlook
      │   │   ├── <section> — Hourly Forecast (has <table>)
      │   │   ├── <section> — 10 Day Forecast (has <table>)
      │   │   ├── <section> — Monthly Forecast
      │   │   └── <section> — Sponsored Content
      │   └── <div> — right sidebar
      │       ├── <div> — Air Quality Index widget
      │       ├── <div> — Allergy Tracker widget
      │       └── <section> — Health & Activities
      └── <footer> — links, privacy, ads
```

**Page Stats:**
- Title: "Weather forecast and conditions for Mithapur, Patna, Bihar"
- 83 links, 154 scripts
- Has `<main>`, `<h1>`, `<table>` — no `<article>`
- React SPA with Tailwind CSS — very JS-heavy

**Quirks:**
- React SPA with 154 scripts — heavy JS bundle, content renders after JS execution
- Tailwind CSS class naming makes element selection fragile
- Sidebar data (AQI, Allergy, Health) is separate from main content div
- Ad slots interspersed throughout (Sponsored Content section)
- Has `table` elements for hourly and 10-day data — good for table extraction
- URL redirected from coordinates to locality path

**Extraction Strategy:**
- Use Readability on `<main>` — it captures current conditions, hourly, and forecast text well
- Explicitly extract `<table>` elements for structured hourly and 10-day data
- Screenshot is ideal — captures the full rich visual layout with weather icons, AQI gauge, etc.
- Sidebar widgets need separate extraction from the right column div
- Links are mostly nav/ad — low value for content extraction

---

## 2. AccuWeather

- **URL:** `https://www.accuweather.com`
- **Category:** Weather

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text: location, current temp, description, forecast content readable |
| Readability | ❌ | No `<main>` or `<article>` — page is pure div-based cards. Readability yields nothing useful |
| Tables | ❌ | No `<table>` elements found — all weather data in div cards/sections |
| Links | ⚠️ | 167 links — mostly nav, location switcher, ad slots. Few content links |
| Screenshot | ✅ | Full-page screenshot captures all weather cards, radar map, air quality gauge visually |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <header> — nav, search, location
      ├── <div> — Today's Weather card (temp, condition, feels-like)
      ├── <div> — Current Weather Details (wind, humidity, UV, pressure, etc.)
      ├── <div> — Weather Radar / Maps
      ├── <div> — Hourly Forecast (horizontal scroll of cards)
      ├── <div> — 10-Day Forecast (vertical list of cards)
      ├── <div> — Sun & Moon (sunrise/set, moon phase)
      ├── <div> — Air Quality (AQI with color gauge)
      ├── <div> — Allergy Outlook
      └── <footer> — links, settings, legal
```

**Page Stats:**
- Title: "Local Weather Forecast, News and Conditions | Weather Underground" (redirects)
- 167 links, 38 scripts — much lighter than Weather.com's 154 scripts
- No `<main>`, no `<article>`, no `<table>` — pure div-based layout
- Has `<h1>` (location breadcrumb) and `<h2>` (section headings)

**Quirks:**
- Classic AccuWeather div-based card layout — no semantic HTML
- React-rendered but only 38 scripts (leaner than Weather.com)
- Content is entirely in `<div>` elements with generic class names
- Sections are vertically stacked cards with no `<section>` wrapper
- Location redirects to regional domain (accuweather.com → specific city page)

**Extraction Strategy:**
- SEO text is the main text source — contains all weather data in readable prose
- Screenshot is ideal for visual layout with weather icons and color-coded AQI
- Readability and table extraction won't work — no semantic containers
- Links are mostly nav/ad — filter out utility links

---

## 3. BBC Weather

- **URL:** `https://www.bbc.com/weather/6280229`
- **Category:** Weather

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅  | Rich SEO text: location name, current condition, temperature, wind, humidity, forecast text |
| Readability | ❌ | No `<main>` or `<article>` — page uses `<div>` containers with BBC's ssrcss-* classes. Readability yields nothing |
| Tables | ❌ | No `<table>` elements — forecast displayed in carousel divs and cards |
| Links | ⚠️ | 123 links — nav (BBC sections, Weather sub-nav), location switcher, social, cookie settings |
| Screenshot | ✅ | Full-page screenshot captures the forecast layout — daily carousel, hourly, observations map |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div> — Cookie consent banner
      ├── <div> — BBC Orb (global nav bar — News, Sport, Weather, etc.)
      ├── <div> — Weather sub-nav (Forecast, Maps, Travel, Closet)
      ├── <div> — Location header (search, current location, settings icon)
      ├── <div> — Main weather display
      │   ├── <div> — Current conditions card (temp, feels like, condition text)
      │   ├── <div> — Detailed conditions (wind, humidity, UV, pressure, visibility)
      │   ├── <div> — Daily forecast carousel (horizontal scroll, next 14 days)
      │   ├── <div> — Hourly forecast (timeline chart)
      │   ├── <div> — Outlook for today/tomorrow (text description)
      │   └── <div> — Observations map
      └── <footer> — BBC links, legal, language/settings
```

**Page Stats:**
- Title: "Patna (Bihar) weather — BBC Weather"
- 123 links, 114 scripts — very heavy (React + BBC framework)
- No `<main>`, no `<article>`, no `<table>` — all `<div>` containers with `ssrcss-*` class names
- Has `<h1>` (location name) and `<h2>` (section headings like "Today", "Hourly", "14 Days")
- BBC's styling framework generates long hashed class names

**Quirks:**
- Very heavy JS (114 scripts) — BBC's React SPA with Orb global nav
- Cookie consent banner blocks some content visibility
- Daily forecast is a horizontal carousel — data is in divs, not tables
- Observations map is an image — not interactive text
- No `<main>` or `<article>` semantic elements — pure div containers
- All class names are `ssrcss-<hash>` — fragile for CSS-based extraction

**Extraction Strategy:**
- SEO text is the only reliable source — captures condition, temp, wind, humidity, and forecast text
- Screenshot for visual layout with weather icons and carousel state
- Readability and table extraction won't work — no semantic containers or tables
- Links are mostly nav — few content links

---

## 4. Indian Meteorological Department (IMD)

- **URL:** `https://mausam.imd.gov.in`
- **Category:** Weather / Government

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ⚠️ | Bilingual Hindi/English text with some weather content, but not structured. Homepage is a portal, not a weather data page |
| Readability | ❌ | No `<main>` or `<article>` — Bootstrap-based grid layout. Readability yields nothing |
| Tables | ❌ | No `<table>` elements on homepage — weather data is in interactive map (amCharts SVG) and link lists |
| Links | ⚠️ | 193 links — mostly links to sub-divisional warnings, district warnings, marine forecast, tourism, etc. Portal-style navigation |
| Screenshot | ✅ | Captures the full page layout — header, nav, quick links grid, live weather map (amCharts), forecast sections, footer |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <section> — Top bar (social media links: Facebook, YouTube, Twitter, Instagram, WordPress, English Site toggle)
      ├── <section> — Header area (logo, search form, event banners)
      ├── <section> — Navigation (Bootstrap navbar with dropdowns: Home, Departmental Websites, About IMD, Weather, Climate, etc.)
      ├── <section> — Quick Links grid (Bootstrap row with 4 columns)
      │   ├── <div> — Warnings (चेतावनी) — links to sub-division/district warnings
      │   ├── <div> — Immediate Warnings (तत्कालिक चेतावनी) — nowcast links
      │   ├── <div> — Public Observations (सार्वजनिक अवलोकन) — crowd-source, actual weather
      │   └── <div> — Special Forecast (विशिष्ट पूर्वानुमान) — Amarnath, marine, health, tourism, etc.
      ├── <section> — Live Weather Map (amCharts SVG with clickable states/UTs)
      ├── <section> — Important Links
      ├── <section> — Our Services
      ├── <section> — Forecast section (carousel)
      └── <footer> — Address, contact, links
```

**Page Stats:**
- Title: "होम | भारत मौसम विज्ञान विभाग" (Home | India Meteorological Department)
- 193 links, 23 scripts — moderate JS, Bootstrap + amCharts
- No `<main>`, `<article>`, `<h1>`, or `<table>` — uses `<section>` and Bootstrap grid `<div>` layout
- Has `<h2>` for section headings (Hindi: चेतावनी, तत्कालिक चेतावनी, etc.)
- Interactive map rendered with amCharts SVG (clickable state polygons with data)

**Quirks:**
- Government site with bilingual Hindi/English content
- Bootstrap-based layout — no semantic HTML5 elements (`<main>`, `<article>`)
- Main weather data is in the interactive amCharts SVG map — clicking states shows city weather
- No data tables on homepage — weather data is visual (map) or in linked sub-pages
- Portal-style with 193 links — mostly navigation to sub-sections
- CSS/JS served locally + CDN (amCharts, jQuery, FontAwesome)
- The "Current Weather" map has an amCharts disclaimer for technical issues

**Extraction Strategy:**
- Homepage is a portal — extract linked sub-pages for actual weather data
- Screenshot captures the live map and quick links grid
- SEO text contains section headings and link text but not weather data
- The linked sub-pages (city-specific pages) may have `<table>` data
- Not suitable for direct weather data extraction from homepage

---

## 5. OpenWeatherMap

- **URL:** `https://openweathermap.org/city/1260086`
- **Category:** Weather / API

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text on city page: current condition, temp, feels-like, wind, humidity, visibility, pressure, UV, dew point, hourly/daily forecast |
| Readability | ✅ | Has `<main>` with content — Readability extracts current conditions and forecast text cleanly |
| Tables | ❌ | No `<table>` elements — hourly and daily forecast rendered as div-based buttons/cards |
| Links | ✅ | 39 links — mostly nav (API docs, pricing, marketplace), fewer irrelevant links than other weather sites |
| Screenshot | ✅ | Full-page screenshot captures current conditions card, 7-day forecast buttons, hourly forecast section, and marketing footer |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <div> — Cookie consent banner
      ├── <div> — Nav bar (desktop/mobile — Logo, Weather APIs, Guide, Pricing, Marketplace, Maps, News, Search)
      ├── <main>
      │   └── <section>
      │       └── <div> — Weather content container
      │           ├── <div> — Header row (city name, temp unit toggle °C/°F)
      │           ├── <div> — 7-day forecast button row (Today 38°, Mon 38°, Tue 36°, ..., Sat 36°)
      │           ├── <div> — Current conditions (temp, feels like, wind, humidity, visibility, pressure, UV, dew point)
      │           └── <div> — Hourly forecast (time × temp × precipitation %)
      └── <footer> — Marketing: "Build smarter with the world's most flexible weather data platform"
```

**Page Stats:**
- Title: "Weather forecast"
- 39 links, 33 scripts — moderate JS (Next.js/React with Tailwind CSS)
- Has `<main>`, `<h1>` (Weather forecast, Build smarter footer), `<h2>` (Hourly forecast)
- No `<article>`, no `<table>` — all div-based layout
- Modern Tailwind CSS styling with utility classes

**Quirks:**
- Next.js/React SPA — content renders after JS execution
- Current conditions are in rich text (temp, feels-like, wind speed, humidity, visibility, pressure, UV, dew point)
- 7-day forecast is a horizontal button row, not a table
- Hourly forecast is a scrollable div-based list
- Cookie consent banner overlays bottom of page
- City URL pattern: `/city/<openweather_city_id>` (e.g., `/city/1260086` for Patna)
- No `<article>` element — content is inside `<main> > <section> > <div>`
- Tailwind CSS with arbitrary values (`text-[32px]`, `tracking-[-1.56px]`)

**Extraction Strategy:**
- SEO text captures all current conditions and forecast in readable format
- Readability works on `<main>` — extracts current conditions and hourly forecast text
- No table extraction possible — but the data is well-structured in text
- Screenshot captures the visual layout with weather icons and color-coded UI
- Links are mostly relevant (API docs, pricing) — fewer nav links than Weather.com or AccuWeather

---

## 6. Time and Date — Weather

- **URL:** `https://www.timeanddate.com/weather/india/patna`
- **Category:** Weather / Utilities

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Clean SEO text with all weather data in readable prose |
| Readability | ✅ | Has `<main>` and `<article>` — Readability extracts clean article text with all forecast content |
| Tables | ✅ | 4 structured HTML tables! Current conditions, 5-hour (wt-5hr), 48-hour (wt-48), 14-day (wt-14d) |
| Links | ⚠️ | 164 links — mostly timeanddate utility sections (calendar, world clock, time zones, etc.), weather location list |
| Screenshot | ✅ | Full-page screenshot captures everything — tables, charts, sun/moon graphics |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <header> — Global nav (Calendar, Weather, World Clock, Time Zones, Timers)
      ├── <div id=content>
      │   └── <main>
      │       └── <article>
      │           ├── <h1> — "Weather in Patna, Bihar, India"
      │           ├── <section> — "Current Weather"
      │           │   ├── <div> — temperature, condition icon
      │           │   └── <table class="table table--left"> — Visibility 3km, Pressure 1000mbar, Humidity 84%, Dew Point 26°C
      │           ├── <section> — "Upcoming 5 hours"
      │           │   └── <table id="wt-5hr"> — time × temp (horizontal layout)
      │           ├── <section> — "Forecast for the next 48 hours"
      │           │   └── <table id="wt-48" class="zebra tb-wt tc sep"> — 7 columns (Night, Morning, Afternoon, Evening for Sun/Mon), Forecast, Feels Like, Wind Speed, etc.
      │           └── <section> — "Forecast for the next 2 weeks"
      │               └── <table id="wt-14d" class="zebra tb-wt fw tc"> — 14+ days × high/low temp
      ├── <aside> — Related links, other locations
      └── <footer> — About, Contact, Privacy, Social
```

**Page Stats:**
- Title: "Weather in Patna, Bihar, India"
- 164 links, 16 scripts — very lean! Classic server-rendered HTML
- Has `<main>`, `<article>`, `<h1>`, `<h2>`, and 4 `<table>` elements
- Tables have useful IDs: `wt-5hr`, `wt-48`, `wt-14d`
- Server-rendered — no JS dependency for content
- Clean, semantic HTML with proper heading hierarchy

**Quirks:**
- Classic server-rendered HTML — loads instantly, no JS needed for content
- 4 structured tables with useful IDs — ideal for table extraction
- Only 16 scripts — mostly ads and analytics, not framework bundles
- Has `<main>`, `<article>`, `<section>` — excellent semantic structure
- `<aside>` with related links and other locations
- URL pattern: `/weather/<country>/<city>` — predictable

**Extraction Strategy:**
- Readability works great — extracts clean article with all forecast text
- Table extraction is the killer feature — 4 tables (current conditions, 5hr, 48hr, 14day) with real weather data
- SEO text also works well as fallback
- Screenshot captures the full layout including graphics
- Best extraction combo: Readability + table extraction + screenshot

---

## 7. Skymet Weather

- **URL:** `https://www.skymetweather.com`
- **Category:** Weather / Indian Weather

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Rich SEO text: current temp (33°C), location-based data, hourly forecast, SkySense data, trending news articles |
| Readability | ❌ | No `<main>` or `<article>` — Angular app with custom components (`app-root`, `app-home`, `app-current-data`, `app-hourly-data`) |
| Tables | ❌ | No `<table>` elements — Angular component-based layout |
| Links | ⚠️ | 76 links — nav (Forecast Map, News, Satellite, Live Map), trending news articles, weather news grid, social/footer links |
| Screenshot | ⚠️ | Timed out at 25s — page is very long (news articles + weather data + footer) |

**DOM Structure:**
```
<html>
  └── <body>
      ├── <app-root> (Angular root component)
      │   ├── <app-header> — Nav bar (logo, menu with Forecast Map, News, Satellite, Live Map, Advertise, Contact Us)
      │   ├── <app-home>
      │   │   ├── <app-current-data> — Hero section
      │   │   │   ├── <h1> — "33°C" (current temperature)
      │   │   │   └── <div> — current condition details
      │   │   ├── <app-hourly-data> — Hourly/daily forecast with "View 7 days forecast" button
      │   │   ├── <app-skysense> — SkySense section with temperature/condition data
      │   │   ├── <app-satellite-image> — Satellite imagery with "View detailed patterns" button
      │   │   ├── <app-trending-news> — Trending news carousel (El Nino, monsoon updates)
      │   │   └── <app-weather-news> — Weather news grid (4 article cards)
      │   ├── <app-footer> — Contact info, social media, links
      │   └── <div> — Popup/overlay with close button
```

**Page Stats:**
- Title: "Weather Forecast | Weather in India and World | Skymet Weather"
- 76 links, 13 scripts — moderately light
- No `<main>`, `<article>`, or `<table>` — Angular component-based architecture
- Has `<h1>` (current temperature "33°C") and `<h2>`
- `readyState: interactive` — page still loading when inspected
- Angular app with custom elements (`app-root`, `app-home`, `app-current-data`, etc.)

**Quirks:**
- Angular SPA — content renders after JS bootstraps
- Page is very long (hero → hourly → SkySense → satellite → trending news → weather news → footer)
- Trending news section with 3 articles (El Nino, Hindi forecast, monsoon update)
- Weather news grid with 4 article cards (read more links)
- Satement "readyState: interactive" suggests page takes time to fully load
- Popup/overlay with close button that may block content
- No `<main>` or `<article>` — Angular components instead
- Indian weather focus with Hindi/English bilingual content

**Extraction Strategy:**
- SEO text captures current conditions and news article titles
- Readability won't work — Angular custom elements are invisible to Readability
- Screenshot is useful but may timeout for full page (needs viewport-only capture)
- Links are a mix of nav (Forecast Map, News, etc.) and news article links
- News articles on linked pages likely have better structure for extraction
