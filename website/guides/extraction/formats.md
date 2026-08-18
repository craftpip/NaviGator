# Extractor Formats

Choose how Navigator extracts and formats page content. The right format depends on what you need.

## Format Options

| Format | Output | Best for |
|--------|--------|----------|
| `readability_to_markdown` | Clean article text as markdown | Most pages (default) |
| `html_to_markdown` | Full page converted to markdown | Pages where Readability strips too much |
| `text` | Flat text dump | Quick content grab |
| `html` | Raw HTML in a code block | When you need the original markup |
| `table` | Tables only, pipe-separated | Table-heavy pages |
| `table_json` | Tables as JSON | Programmatic table processing |
| `table_csv` | Tables as CSV | Spreadsheet import |
| `list` | Content blocks only | Structured block extraction |

## How to Choose

### Default: `readability_to_markdown`

This is the best starting point. Readability:

- Strips navigation, footers, sidebars, ads
- Keeps article content, headings, and structure
- Converts to clean markdown

```json
{
  "urls": ["https://example.com/article"],
  "format": "readability_to_markdown"
}
```

### When Readability Strips Too Much

Some pages lose important content with Readability. Use `html_to_markdown`:

```json
{
  "urls": ["https://example.com/page"],
  "format": "html_to_markdown"
}
```

This converts the entire page to markdown, keeping more structure.

### Quick Content Grab

For a fast text dump without formatting:

```json
{
  "urls": ["https://example.com/page"],
  "format": "text"
}
```

### Raw HTML

When you need the original markup:

```json
{
  "urls": ["https://example.com/page"],
  "format": "html"
}
```

### Tables Only

Extract just the tables:

```json
{
  "urls": ["https://example.com/data"],
  "format": "table"
}
```

For structured data processing:

```json
{
  "urls": ["https://example.com/data"],
  "format": "table_json"
}
```

For spreadsheet import:

```json
{
  "urls": ["https://example.com/data"],
  "format": "table_csv"
}
```

## AI Model Extractors

If configured with `POST_PROCESSOR_MODELS`, you can use AI models to extract content. The page HTML is sent to an AI model, which returns clean markdown.

Available models appear in the format dropdown in the web console. They fall back to `html_to_markdown` if the model fails.

See [AI Extractors](/guides/extraction/ai-extractors) for setup details.

## Tips

- **Start with the default** — `readability_to_markdown` works for most pages
- **Try `html_to_markdown`** if the default strips too much content
- **Use `table` formats** for data-heavy pages
- **Use `text`** when you just need a quick content grab
- **Check the web console** — the Domain Hints editor lets you test different formats

## Next Steps

- [Domain Hints](/guides/extraction/domain-hints) — Per-site extraction rules
- [AI Extractors](/guides/extraction/ai-extractors) — AI-powered extraction
