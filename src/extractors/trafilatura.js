/**
 * TrafilaturaExtractor — rs-trafilatura Rule+ML extraction → markdown.
 *
 * Uses the `trafilatura` npm package (napi-rs bindings to the rs-trafilatura
 * Rust crate). Classifies page type (7 types) with XGBoost ML and applies
 * per-type extraction profiles. Returns markdown directly — no Turndown step.
 * Ranked #1 on the WCXB benchmark (F1 0.859 vs Readability 0.674).
 */
import { safeTruncateText, cleanWhitespace } from "./helpers.js";

export const FORMAT = "trafilatura_to_markdown";

// Lazy-load the native module so a missing binary degrades gracefully
// (returns null → orchestrator falls back to Readability) instead of
// crashing at import time.
let _extract = null;
async function getExtract() {
  if (!_extract) {
    const mod = await import("trafilatura");
    _extract = mod.extract;
  }
  return _extract;
}

export async function extract(doc, context) {
  const { url, maxChars, fallbackTitle } = context;

  let extractFn;
  try {
    extractFn = await getExtract();
  } catch (err) {
    console.warn(`[trafilatura] native module not available: ${err.message}`);
    return null;
  }

  const html = doc.documentElement.outerHTML;
  if (!html?.trim()) return null;

  let result;
  try {
    result = extractFn(html, {
      outputMarkdown: true,
      url,
      favorPrecision: false,
      includeImages: false,
      includeComments: false,
      includeLinks: true
    });
  } catch (err) {
    console.warn(`[trafilatura] extraction failed for ${url}: ${err.message}`);
    return null;
  }

  if (!result?.contentMarkdown?.trim()) return null;

  const text = result.contentMarkdown;
  return {
    title: cleanWhitespace(result.metadata?.title || fallbackTitle || ""),
    url,
    text: safeTruncateText(text, maxChars),
    textOriginalLength: text.length,
    // Extra fields — flow through via ...extracted spread in search.js.
    confidence: result.extractionQuality,
    pageType: result.metadata?.pageType || null,
    metadata: result.metadata || null,
  };
}