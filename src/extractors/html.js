/**
 * HtmlExtractor — raw HTML in a fenced code block.
 *
 * Wraps the best container's innerHTML in a ```html code fence.
 */
import { collectCandidateBlocks, safeTruncateText, buildCleanText } from "./helpers.js";

export const FORMAT = "html";

export async function extract(doc, context) {
  const { url, maxChars } = context;

  let bestContainerHtml = "";
  let bestText = "";
  try {
    const candidates = collectCandidateBlocks(doc);
    const best = candidates[0];
    if (best?.element) {
      bestContainerHtml = best.element.innerHTML || "";
    }
    bestText = best?.text || "";
  } catch {
    // fallback
  }

  if (bestContainerHtml) {
    return {
      title: "", // orchestrator fills title
      url,
      text: safeTruncateText(`\`\`\`html\n${bestContainerHtml}\n\`\`\``, maxChars),
      textOriginalLength: bestContainerHtml.length
    };
  }

  const lines = bestText.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  return {
    title: "",
    url,
    text: buildCleanText(lines, maxChars),
    textOriginalLength: bestText.length
  };
}
