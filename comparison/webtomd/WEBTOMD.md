# WebToMD

> WebToMD is a Python tool that converts web pages to markdown using browser rendering.

**GitHub:** https://github.com/nicholasgasior/webtomd
**Language:** Python
**Stars:** 100+
**License:** MIT

---

## Architecture

- **Language:** Python
- **Focus:** Web page to markdown conversion
- **Approach:** Browser render → HTML to markdown
- **Output:** Clean markdown

---

## Key Features

### Browser Rendering

- Playwright for JavaScript rendering
- Wait for content stabilization
- Extract rendered HTML

### Markdown Conversion

- HTML to markdown conversion
- Preserve headings, code, lists
- Remove noise

---

## What We Can Learn

### 1. Simple Markdown Conversion (Low Impact)

**What they do:** Simple browser → markdown pipeline.

**Relevance:** We could add markdown output option to `web_fetch`.

---

## Lessons for Us

**What WebToMD does better:**
1. Simple, focused tool

**What we do better:**
1. Domain hints
2. Tables and links extraction
3. MCP integration

**Adoption priority:** Low — WebToMD is too simple for our needs.

---

*Last updated: 2026-07-26*
