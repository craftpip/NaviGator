# Finance / Markets

## 1. Moneycontrol

- **URL:** `https://www.moneycontrol.com`
- **Category:** Finance / Markets

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ⚠️ | Homepage: very noisy (market data + 1737 links); article URL likely better |
| Readability | ❌ | Homepage is not article content — dense portal layout |
| Tables | ✅ | Market data tables present (Sensex, stock picks, commodities) |
| Links | ⚠️ | 1,737 links — heaviest tested; needs extreme filtering |
| Screenshot | ✅ | Full-page capture works |

**DOM Structure:**
```
div#mc_mainWrapper
└── main (present)
    ├── div — market overview, indices
    │   ├── table — Sensex/Nifty stats
    │   ├── div — market movers
    │   └── div — quick view
    ├── section — news feed
    │   ├── div — top stories
    │   ├── div — videos, web stories
    │   └── div — trending news
    ├── aside — sidebar
    │   ├── div — market action
    │   ├── div — stock action (table)
    │   └── widget — commodities
    └── div — PRO stock lists (tables)
        ├── table — stock picks with %
        └── table — market data
```

**Page-level stats:**
- 1,737 `<a>` links (heaviest site tested — mega nav, footer, ads, PRO widgets)
- 204 `<script>` tags (also heaviest — ads, analytics, JS widgets, market data)
- Has `<main>` but no `<article>` — classic portal layout
- No `<h1>` on homepage (uses logo/title in meta)
- Has `<table>` elements — market data tables
- Interstitial ad page on first load (redirects to `mc_interstitial_dfp.php`)
- No Cloudflare block
- Extremely dense homepage — market data, news, PRO picks, videos, commodities

**How extraction should work:**
- SEO: ✅ innerText has market data + news headlines, but extremely noisy (1737 links)
- Readability: ❌ Unlikely to work on homepage — not article content; needs article URL
- Tables: ✅ Market data tables present (Sensex, stock picks, commodities)
- Links: 1,737 links — needs aggressive filtering (nav, PRO widgets, footer, ads)
- Screenshot: ✅ Full-page capture works
- Article mode: Need to test on an article URL (e.g., `https://www.moneycontrol.com/news/...`)
