# Domain Hints

Domain hints are per-site extraction rules. They tell Navigator exactly how to read specific websites — which selectors to use, what to skip, and how to wait for dynamic content.

## Why Domain Hints?

Different websites have different layouts. A news article needs different extraction than a GitHub issue. Domain hints let you teach Navigator how to read each site properly.

Without hints, Navigator uses generic extraction (Readability). With hints, it knows exactly where the content lives.

## How They Work

1. Navigator matches the URL against your hints
2. The first matching hint is applied
3. The hint specifies selectors, wait strategies, and formats
4. Content is extracted using the hint's rules

## Basic Hint Structure

```json
{
  "domain": "news.example.com",
  "pathPattern": "/article/*",
  "pageType": "article",
  "comment": "News articles with main content in article body",
  "default": {
    "waitForSelector": "article.body",
    "stabilizeStrategy": "network_idle",
    "skipSelectors": ["aside.sidebar", "nav", "footer"],
    "format": "readability_to_markdown"
  }
}
```

## Hint Properties

| Property | Description |
|----------|-------------|
| `domain` | Hostname to match (exact + subdomain) |
| `pathPattern` | URL path glob (`*` = one segment, `**` = multi-segment) |
| `pageType` | Category name for organization |
| `comment` | Human-readable description |
| `requireSelector` | Optional CSS selector gate — hint only applies if this exists on the page |
| `default` | Extraction settings for this hint |

## Default Settings

| Setting | Description |
|---------|-------------|
| `waitForSelector` | CSS selector to wait for before extraction |
| `stabilizeStrategy` | How to wait: `network_idle`, `content_idle`, `mutation`, `none` |
| `skipSelectors` | CSS selectors to remove before extraction |
| `format` | Extractor format to use |

## Creating Hints

### Using the Web Console

The easiest way to create hints:

1. Open **http://localhost:1994/console/hints**
2. Click **Create New Hint**
3. Enter the domain and path pattern
4. Use the **Test** pane to verify extraction
5. Save when it looks good

The test pane runs your hint against a real page and shows the result.

### Manual Creation

Add entries to `domain-hints.json`:

```json
[
  {
    "domain": "docs.example.com",
    "pathPattern": "/guide/*",
    "pageType": "documentation",
    "comment": "Documentation pages with sidebar navigation",
    "default": {
      "waitForSelector": "article.content",
      "stabilizeStrategy": "network_idle",
      "skipSelectors": ["nav.sidebar", ".breadcrumbs"],
      "format": "readability_to_markdown"
    }
  }
]
```

## Path Patterns

| Pattern | Matches |
|---------|---------|
| `/article/*` | `/article/123`, `/article/hello` |
| `/article/**` | `/article/123/comments`, `/article/123/edit` |
| `/*` | Any single path segment |
| `/**` | Any path |

## Stabilization Strategies

| Strategy | What it does | When to use |
|----------|-------------|-------------|
| `network_idle` | Waits for 500ms of no network activity | Most pages (default) |
| `content_idle` | Polls text until stable | Dynamic SPAs |
| `mutation` | MutationObserver-based | Pages with heavy DOM updates |
| `none` | Skip stabilization | Static pages |

## The Wildcard Hint

Every installation has a wildcard hint (`domain: "*"`) that provides defaults for all sites without specific rules. You can edit this in the web console to change the default behavior.

## Tips

- **Start with the web console** — test before you save
- **Order matters** — first matching hint wins (most specific first)
- **Use `requireSelector`** to split one domain+path into multiple page types
- **Keep skipSelectors conservative** — don't remove elements that might hold content
- **Test with real pages** — the test pane shows exactly what gets extracted

## Next Steps

- [Link Navigation](/guides/extraction/links) — Follow links from extracted pages
- [Post-processors (AI)](/guides/extraction/ai-extractors) — AI-powered extraction
