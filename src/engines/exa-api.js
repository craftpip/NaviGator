import { ApiSearchDriver } from "./api-driver.js";
import { cleanWhitespace, fetchTextWithTimeout, normalizeUrl } from "./util.js";

function resolveExaApiKey(config) {
  const fromConfig = String(config?.exaApiKey || "").trim();
  if (fromConfig) return fromConfig;
  return String(process.env.EXA_API_KEY || "").trim();
}

function buildExaSnippet(item) {
  if (Array.isArray(item.highlights) && item.highlights.length) {
    const joined = item.highlights.map((h) => cleanWhitespace(h)).filter(Boolean).join(" ");
    if (joined) return joined;
  }
  if (typeof item.summary === "string" && cleanWhitespace(item.summary)) {
    return cleanWhitespace(item.summary);
  }
  if (typeof item.text === "string" && cleanWhitespace(item.text)) {
    return cleanWhitespace(item.text).slice(0, 500);
  }
  return "";
}

function parseExaResults(data, engineId) {
  const raw = Array.isArray(data?.results) ? data.results : [];
  const results = raw
    .map((item) => ({
      title: cleanWhitespace(item?.title || ""),
      url: normalizeUrl(item?.url || ""),
      snippet: buildExaSnippet(item),
    }))
    .filter((item) => item.title && item.url)
    .map((item) => ({ ...item, engine: engineId }));

  // Build directAnswers from highlights/summary of top results to fit the
  // existing "links + instant answers" presentation. Keep it cheap: one
  // answer per top highlight, deduplicated downstream via dedupeDirectAnswers.
  const directAnswers = raw
    .slice(0, 2)
    .map((item) => {
      const text = buildExaSnippet(item);
      if (!text) return null;
      // Only emit an instant-answer style entry if the highlight looks
      // answer-like (at least 40 chars). Short snippets stay as snippet only.
      if (text.length < 40) return null;
      return {
        source: "exa_highlight",
        text: cleanWhitespace(text).slice(0, 400),
        url: normalizeUrl(item?.url || ""),
        engine: engineId,
      };
    })
    .filter(Boolean);

  return { results, directAnswers };
}

export class ExaApiDriver extends ApiSearchDriver {
  id = "exa_api";

  async search({ query, limit }) {
    const apiKey = resolveExaApiKey(this.config);
    if (!apiKey) {
      const error = new Error("EXA_API_KEY not configured — set EXA_API_KEY to enable exa_api search");
      error.schedulerSkip = true;
      throw error;
    }

    const timeoutMs = Math.min(this.config?.browserOpTimeoutMs || 15000, 15000);
    const numResults = Math.min(Math.max(1, Number(limit) || 10), 20);

    const body = JSON.stringify({
      query,
      type: "auto",
      numResults,
      contents: {
        highlights: true,
        text: { maxCharacters: 800 },
      },
    });

    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": apiKey,
      authorization: `Bearer ${apiKey}`,
      "user-agent": this.config?.userAgent || "navigator-mcp/1.0",
    };

    let responseText;
    try {
      responseText = await fetchTextWithTimeout(
        "https://api.exa.ai/search",
        {
          method: "POST",
          headers,
          body,
        },
        timeoutMs
      );
    } catch (error) {
      const message = String(error?.message || error);
      if (/HTTP 401/i.test(message)) {
        throw new Error(`Exa API authentication failed (401) — check EXA_API_KEY: ${message.slice(0, 200)}`);
      }
      if (/HTTP 402/i.test(message)) {
        throw new Error(`Exa API payment required (402) — quota/billing: ${message.slice(0, 200)}`);
      }
      if (/HTTP 429/i.test(message)) {
        throw new Error(`Exa API rate limited (429): ${message.slice(0, 200)}`);
      }
      throw error;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Exa API returned non-JSON: ${String(responseText).slice(0, 300)}`);
    }

    const { results, directAnswers } = parseExaResults(data, this.id);
    return { results, directAnswers };
  }
}
