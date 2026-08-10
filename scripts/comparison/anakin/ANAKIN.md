# Anakin

> Anakin is an AI-powered web extraction tool that uses LLMs to extract structured data from web pages.

**GitHub:** https://github.com/anakin-ai/anakin
**Language:** Python
**Stars:** 500+
**License:** MIT

---

## Architecture

- **Language:** Python
- **Focus:** LLM-powered extraction
- **Approach:** Browser render → LLM extract
- **Output:** Structured JSON

---

## Key Features

### LLM Extraction

Use LLMs to extract structured data:
- Define schema (JSON)
- LLM extracts matching data
- Supports multiple LLM providers

### Browser Rendering

- Playwright for JavaScript rendering
- Wait for content stabilization
- Extract rendered HTML

---

## What We Can Learn

### 1. LLM Extraction (Medium Impact)

**What they do:** Use LLMs to extract structured data.

**Relevance:** We could add optional LLM extraction to `web_fetch`. Similar to Firecrawl's extract endpoint.

---

## Lessons for Us

**What Anakin does better:**
1. LLM-powered extraction

**What we do better:**
1. Domain hints (no LLM cost)
2. Tables and links extraction
3. MCP integration

**Adoption priority:** Low — LLM extraction is expensive. Domain hints are faster and cheaper for known sites.

---

*Last updated: 2026-07-26*
