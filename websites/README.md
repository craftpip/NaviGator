# Website Compatibility

Tracking how our extraction tools perform across different websites.

## How to test

```bash
docker exec browser-search-mcp sh -c "curl ... web_fetch ..."
docker exec browser-search-mcp sh -c "curl ... web_page_screenshot ..."
```

## Legend

| Column | Meaning |
|--------|---------|
| SEO | browser innerText — full page text |
| Readability | Mozilla Readability — article text |
| Tables | Structured pipe-separated tables |
| Links | Compact text — [ref_id] |
| Screenshot | Visual capture works |

## Categories

- [Finance / Markets](finance.md)
- [Developer](developer.md)
- [Reference](reference.md)
- [Social / Community](social.md)
- [E-commerce](ecommerce.md)
- [News](news.md)
- [Business / Finance News](business-news.md)
- [Weather](weather.md)
- [Food / Travel](food-travel.md)
- [Sports](sports.md)
- [AI Chat](ai-chat.md)
- [Local Mumbai](local-mumbai.md)
- [Marathi](marathi.md)
- [Video](video.md)

## Domain Hints

All extraction strategies in these files are now encoded as [domain hints](../domain-hints.json) in the main project. When `web_fetch` loads a known domain, it applies the matching hint's wait strategy, content selector, and known limitations automatically.

To verify a hint works on a site:

```bash
docker exec browser-search-mcp curl -s "http://localhost:3000/extract?url=https://example.com&maxChars=1000"
```
