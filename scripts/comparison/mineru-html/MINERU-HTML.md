# MinerU (mineru-html)

> MinerU is a document extraction tool focused on PDF and document processing. It extracts text, tables, and images from documents and converts them to structured formats.

**GitHub:** https://github.com/opendatalab/MinerU
**Language:** Python
**Stars:** 10K+
**License:** AGPL-3.0

---

## Architecture

- **Language:** Python
- **Focus:** PDF/Document extraction (not web pages)
- **Key Feature:** OCR, table detection, formula recognition
- **Output:** Markdown, JSON, structured data

---

## Key Features

### Document Processing

- PDF text extraction
- Table detection and extraction
- Image extraction and OCR
- Formula recognition (LaTeX)
- Layout analysis

### HTML Conversion

MinerU can convert HTML to structured markdown:
- Parse HTML structure
- Extract text content
- Convert tables to markdown
- Preserve headings and lists

---

## What We Can Learn

### 1. Table Detection (Medium Impact)

**What they do:** Detect and extract tables from documents.

**Relevance:** We already extract tables, but their detection might be more sophisticated. Could improve our table detection.

### 2. Layout Analysis (Low Impact)

**What they do:** Analyze document layout to identify content regions.

**Relevance:** Could help with content region detection (Priority 3 in our roadmap).

---

## Lessons for Us

**What MinerU does better:**
1. Table detection (more sophisticated)
2. Layout analysis
3. OCR integration

**What we do better:**
1. Web page extraction (browser rendering)
2. Domain hints
3. MCP integration

**Adoption priority:** Low — MinerU is focused on documents, not web pages. Different domain.

---

*Last updated: 2026-07-26*
