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

## The Default Hint

Every installation has a default hint (`domain: "*"`) at index **0** — the zeroth entry — that runs on every website without a specific rule and provides defaults for all sites. You can edit it at [http://localhost:1994/console/hints/edit/0](http://localhost:1994/console/hints/edit/0) to change the default behavior.

## Two Methods

| Method | What it does |
|--------|--------------|
| **Default extraction** | Single shot: wait for selectors, stabilize, strip `skipSelectors`, run the `format` extractor. Best for most pages. |
| **Interactive Flow** | Script a real browser — clicks, typing, waiting, and multi-page navigation. |

## Default Extraction

Single shot: wait for selectors, stabilize, strip `skipSelectors`, run the `format` extractor. Best for most pages.

## Interactive Flow <Badge type="tip" text="Most Powerful" />

Script a real browser: click buttons, type into inputs, wait for content, navigate across pages, and extract from multiple places in sequence. Chain up to 8 steps (max 4 clicks) to handle SPAs, paginated lists, tabbed UIs, login flows, and multi-page scrapes — you can do anything with the domain.

- Each `extract` step has its own blocks, so you can pull different sections from different states and pages
- Steps run in order: `extract` → `click` → `wait` → `type` → `navigate` → `extract` …
- When a flow is set, it completely replaces the default pipeline

Use flows when a single extraction isn't enough — for example, opening a dropdown and scraping the results, paging through a list, or logging in before extracting.

## Creating Hints

### Using the Web Console

The easiest way to create hints:

1. Open **http://localhost:1994/console/hints**
2. Click **Create New Hint**
3. Enter the domain and path pattern
4. Use the **Test** pane to verify extraction
5. Save when it looks good

The test pane runs your hint against a real page and shows the result.

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

## Path Patterns

| Pattern | Matches |
|---------|---------|
| `/article/*` | `/article/123`, `/article/hello` |
| `/article/**` | `/article/123/comments`, `/article/123/edit` |
| `/*` | Any single path segment |
| `/**` | Any path |
| `/article/*/edit` | `/article/123/edit` — wildcard then keyword `edit` |
| `/*/settings` | `/user/settings`, `/repo/settings` — wildcard segment followed by keyword |

## Stabilization Strategies

| Strategy | What it does | When to use |
|----------|-------------|-------------|
| `network_idle` | Waits for 500ms of no network activity | Most pages (default) |
| `content_idle` | Polls text until stable | Dynamic SPAs |
| `mutation` | MutationObserver-based | Pages with heavy DOM updates |
| `none` | Skip stabilization | Static pages |

## Tips

- **Start with the web console** — test before you save
- **Order matters** — first matching hint wins (most specific first)
- **Use `requireSelector`** to split one domain+path into multiple page types
- **Keep skipSelectors conservative** — don't remove elements that might hold content
- **Test with real pages** — the test pane shows exactly what gets extracted

## Next Steps

- [Link Navigation](/guides/extraction/links) — Follow links from extracted pages
- [Post-processors (AI)](/guides/extraction/ai-extractors) — AI-powered extraction
