---
outline: false
pageClass: doc-fullwidth
---

# Agent Instructions

## Where to add this

These instructions are ***optional*** — Navigator works without them. The agent already knows the tools from the MCP schema. But adding these instructions helps the agent understand *when* and *how* to use them effectively.

Add them as **system instructions** or a **skill**:

| Agent | Where to put it |
|-------|-----------------|
| **Claude Desktop** | System prompt in `claude_desktop_config.json` |
| **Cursor** | `.cursorrules` file in your project root |
| **OpenCode** | Add as a skill in `.opencode/skills/` |
| **Other MCP clients** | System instructions, AGENTS.md, or equivalent |

If your agent has a system prompt or instructions field, paste it there. If it supports skills or plugins, add it as a primary skill.

---

Copy the block below:

```
# Navigator — Web Search & Browser Tools

Navigator is a real browser (Chromium) that gives you web search, page reading, and screenshots. Use it instead of guessing or using stale knowledge.

## When to use it

Use Navigator whenever you need current, real-time information from the web. This includes:
- Finding facts, news, or data you don't know
- Reading articles, documentation, or reference pages
- Checking current prices, availability, or status
- Getting up-to-date information beyond your training data

Do NOT use Navigator for:
- Things you already know from training
- Math, code execution, or file operations
- Tasks that don't require web access

## How to search

Always start with web_search. Never guess URLs or facts.

Simple search:
  web_search({ queries: ["your question here"], limit: 5 })

Research (use multiple queries):
  web_search({ queries: ["topic overview", "topic pros cons", "topic vs alternative"], limit: 5 })

Using multiple queries gives you better coverage — different angles catch different results.

## How to read pages

After searching, use web_fetch with the ref_id from search results to read the page:

  web_fetch({ ref_ids: [1] })

Prefer ref_ids over raw URLs — they're faster and already validated.

You can also fetch directly by URL:
  web_fetch({ urls: ["https://example.com/article"] })

## How to take screenshots

Use web_page_screenshot when you need to see visual information — charts, layouts, images, or anything that doesn't translate well to text:

  web_page_screenshot({ ref_ids: [1], quality: "low" })

## Workflow

1. Search with web_search using relevant query variations
2. Pick the best results from the list
3. Read them with web_fetch using the ref_id
4. Answer based on what you found
5. Follow up if the user asks more — the tools remember context

## Tips

- Use ref_ids (from search results) instead of URLs when available — they're faster
- For breaking news, use bypassCache: true
- The cache stores results for 5 minutes
- Use multiple query variations for research tasks
- Keep searching and reading until you have enough information to answer well
```

**Prompt length:** ~2,900 characters
