# Website Compatibility

Tracking how our extraction tools perform across different websites.

## How to test

```bash
docker exec navigator sh -c "curl ... web_fetch ..."
docker exec navigator sh -c "curl ... web_page_screenshot ..."
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

## Competitive Landscape

See [../notes/extraction-patterns.md](../notes/extraction-patterns.md) for a comparison of how other projects (Firecrawl, Crawl4AI, Jina Reader, Spider, weblens-mcp) handle web content extraction — their architectures, extraction strategies, table/link handling, and where we're stronger or weaker.

## Verify a Hint

```bash
docker exec navigator curl -s "http://localhost:3000/extract?url=https://example.com&maxChars=1000"
```
