# Link Navigation

Follow links from extracted pages without copying URLs. Navigator remembers every link and gives you a reference ID for each one.

## How It Works

When you fetch a page, Navigator automatically extracts all links and assigns reference IDs:

```
# Article Title

Check the [official documentation](42) for more details.

See also:
- [Related Guide](43)
- [API Reference](44)
```

The numbers in parentheses are reference IDs.

## Step 1: Fetch a Page

```json
{
  "urls": ["https://example.com/article"]
}
```

The output contains inline links with reference IDs.

## Step 2: Resolve a Link

If you want to know where a link goes:

```json
{
  "ref_ids": [42]
}
```

Returns:

```
- (42): https://example.com/docs/official
```

## Step 3: Fetch the Linked Page

```json
{
  "ref_ids": [42]
}
```

Navigator opens the linked page and returns its content.

## Full Example

```
Agent: "Read the React docs and find the hooks section"

1. web_search: { "queries": ["React documentation"] }
   → Results with ref_ids

2. web_fetch: { "ref_ids": [1] }
   → Article with links: "Hooks overview"(42), "useState"(43), "useEffect"(44)

3. web_page_links: { "ref_ids": [42] }
   → (42): https://react.dev/reference/react/hooks

4. web_fetch: { "ref_ids": [42] }
   → Hooks overview content
```

## Multiple Links

Resolve multiple links at once:

```json
{
  "ref_ids": [42, 43, 44]
}
```

Returns all URLs:

```
- (42): https://example.com/docs
- (43): https://example.com/api
- (44): https://example.com/guide
```

## Link Persistence

Link mappings are stored in SQLite and survive server restarts. If you fetch a page, the link IDs remain valid across restarts.

## Tips

- **Use ref_ids** instead of copying URLs — it's faster and avoids typos
- **Check links first** with `web_page_links` if you're not sure where a link goes
- **Links are deduped** — the same URL won't appear twice
- **Heading context** is preserved — links inherit the heading they appear under

## Next Steps

- [AI Extractors](/guides/extraction/ai-extractors) — AI-powered extraction
- [Screenshot Overview](/guides/screenshots/overview) — Capture pages visually
