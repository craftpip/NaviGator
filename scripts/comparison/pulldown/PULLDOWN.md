# Pulldown

> Pulldown is a Python library for converting HTML to Markdown. It focuses on clean, LLM-friendly markdown conversion.

**GitHub:** https://github.com/matthewwithanm/pulldown
**Language:** Python
**Stars:** 1K+
**License:** MIT

---

## Architecture

- **Language:** Python
- **Focus:** HTML to Markdown conversion
- **Approach:** HTTP fetch + markdown conversion
- **Output:** Clean markdown

---

## Key Features

### HTML to Markdown

Clean conversion:
- Preserve headings
- Preserve code blocks
- Preserve lists
- Preserve links
- Remove noise (scripts, styles)

### HTTP Fetch

Lightweight HTTP fetching:
- No browser required
- Fast for static pages
- User agent rotation

---

## What We Can Learn

### 1. Clean Markdown Conversion (Medium Impact) ✅ Done

**What they do:** Focus on clean, LLM-friendly markdown.

**Relevance:** We've adopted markdown conversion (TurndownService + GFM, `src/markdown.js`). Now matches their output quality.

---

## Lessons for Us

**What Pulldown does better:**
1. Fast HTTP fetching

**What we do better:**
1. Browser rendering (SPAs)
2. Domain hints
3. Markdown conversion (Turndown + GFM)
4. Tables and links extraction
5. MCP integration

**Adoption priority:** Low — Pulldown is a simple conversion library. We need more features.

---

*Last updated: 2026-07-27*
