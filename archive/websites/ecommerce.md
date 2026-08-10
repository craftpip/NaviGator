# E-commerce

---

> Extraction strategies here are encoded as [domain hints](../domain-hints.json). Flipkart tested with `web_fetch` — content matches screenshot.

## 1. Flipkart

- **URL:** `https://www.flipkart.com`
- **Category:** E-commerce

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Product text in innerText |
| Readability | ❌ | No `<article>`/`<main>` — pure `<div>` SPA layout |
| Tables | ❌ | No HTML `<table>` elements at all |
| Links | ⚠️ | 173 links on product page (moderate, mostly nav/related) |
| Screenshot | ✅ | Full-page capture |

**DOM Structure:**
```
body > div#container
└── div (SPA root)
    ├── header — search bar, nav links, cart/login
    └── div — product content
        ├── h1 — product title (long XPath, dynamic class)
        ├── div — image gallery
        ├── div — price, offers, bank discounts
        ├── div — key highlights (bulleted)
        ├── div — ratings & reviews
        └── div — related products, recommendations
```

**Page-level stats:**
- 173 `<a>` links on product page (440 on homepage)
- 20 `<script>` tags — very light compared to Amazon (352!)
- No `<article>`, `<main>`, or `<table>` elements
- Single `<h1>` for product title
- Custom framework (batman-returns?) with class names like `_1psv1ze30`, `v1zwn25`
- SVG icons inline, minimal external resources
- No Cloudflare block
- Product URL format: `/{product-name}/p/{pid}`

**How extraction should work:**
- **Readability fails** — no semantic HTML structure, all deeply nested `<div>`
- Full-text mode: `innerText` works but includes nav, breadcrumbs, related products
- Best extraction: Target the `<h1>` product title + the main content `<div>` area (breadcrumb-like path selector)
- No tables to extract — all spec data is in `<div>` elements
- Links: mostly navigation, breadcrumbs, related products — noise filtering recommended
- Contrast with Amazon: Flipkart is lighter but less structured for extraction
