# Food / Travel

**Status:** ✅ IRCTC explored.

## 1. IRCTC

- **URL:** `https://www.irctc.co.in`
- **Category:** Railway booking / Government

| Extraction | Works? | Notes |
|------------|--------|-------|
| SEO | ✅ | Title and meta load in SSR. Angular SPA so SEO meta is present in initial HTML. |
| Readability | ⚠️ | Language popup blocks content. After dismissing, the main content is readable. Angular renders train search form but it's a complex input form, not article content. |
| Tables | ❌ | No `<table>` elements. Train results are dynamically loaded after search — likely use div-based layouts. |
| Links | ✅ | 128 links found. Mostly navigation (footer links, service links, social media). Search form is button-based, not links. |
| Screenshot | ✅ | Page renders visually. Language selection popup appears first. Train search form with input fields visible after dismissing popup. |

**Quirks:**
- Login required for actual booking flow
- Angular SPA (`app-root`, `app-header`, `app-home`, `app-main-page`, `app-jp-input`, `app-footer` custom elements)
- Language selection popup blocks main content on first load
- Ready state `interactive` not `complete` — scripts still loading
- 24 scripts — heavy JS framework
- Train search form uses button-based submission, not `<a>` links
- Footer has a tab-based UI (`IRCTC Trains`, `Hotels`, `Flight` buttons)
- Beta version banner suggesting a newer version exists
- DOM depth is deep with many nested divs