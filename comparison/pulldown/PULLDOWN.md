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

### 1. Clean Markdown Conversion (Medium Impact)

**What they do:** Focus on clean, LLM-friendly markdown.

**Relevance:** We output plain text. Could adopt markdown conversion for better structure.

---

## Lessons for Us

**What Pulldown does better:**
1. Clean markdown conversion
2. Fast HTTP fetching

**What we do better:**
1. Browser rendering (SPAs)
2. Domain hints
3. Tables and links extraction
4. MCP integration

**Adoption priority:** Low — Pulldown is a simple conversion library. We need more features.

---

*Last updated: 2026-07-26*
