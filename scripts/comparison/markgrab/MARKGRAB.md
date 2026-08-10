# Markgrab

> Markgrab is a tool that converts webpage screenshots to markdown using vision-language models.

**GitHub:** https://github.com/nicholasgasior/markgrab
**Language:** Python
**Stars:** 200+
**License:** MIT

---

## Architecture

- **Language:** Python
- **Focus:** Screenshot-to-markdown conversion
- **Approach:** Browser screenshot → VLM → markdown
- **Output:** Markdown from visual content

---

## Key Features

### Screenshot-to-Markdown

Convert screenshots to markdown:
- Take screenshot with browser
- Send to vision-language model
- Get markdown representation

### Visual Content

Handles content that's hard to extract from HTML:
- Canvas-rendered content
- Image-heavy pages
- Complex layouts

---

## What We Can Learn

### 1. Screenshot-to-Markdown (Low Impact)

**What they do:** Convert screenshots to markdown using VLM.

**Relevance:** We have `web_page_screenshot` tool. Could add VLM conversion for visual content.

---

## Lessons for Us

**What Markgrab does better:**
1. Screenshot-to-markdown conversion

**What we do better:**
1. HTML extraction (faster, cheaper)
2. Domain hints
3. MCP integration

**Adoption priority:** Low — Screenshot conversion is slow and expensive. HTML extraction is better for most cases.

---

*Last updated: 2026-07-26*
