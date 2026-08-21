import { ApiSearchDriver } from "./api-driver.js";
import { cleanWhitespace, fetchTextWithTimeout, normalizeUrl } from "./util.js";

function resolveFirecrawlApiKey(config) {
  const fromConfig = String(config?.firecrawlApiKey || "").trim();
  if (fromConfig) return fromConfig;
  return String(process.env.FIRECRAWL_API_KEY || "").trim();
}

function buildFirecrawlSnippet(item) {
  const description = cleanWhitespace(item?.description || item?.snippet || "");
  if (description) return description.slice(0, 500);
  const markdown = cleanWhitespace(item?.markdown || "");
  if (markdown) return markdown.slice(0, 500);
  return "";
}

function extractWebResults(data) {
  // Firecrawl v2 success shape: { success: true, data: { web: [...] } }
  // Defensive fallbacks for possible version drift: data.web, data.results
  if (Array.isArray(data?.data?.web)) return data.data.web;
  if (Array.isArray(data?.web)) return data.web;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data?.results)) return data.data.results;
  return [];
}

function parseFirecrawlResults(data, engineId) {
  const raw = extractWebResults(data);

  const results = raw
    .map((item) => ({
      title: cleanWhitespace(item?.title || item?.name || ""),
      url: normalizeUrl(item?.url || ""),
      snippet: buildFirecrawlSnippet(item),
    }))
    .filter((item) => item.title && item.url)
    .map((item) => ({ ...item, engine: engineId }));

  const directAnswers = [];
  if (results.length) {
    const topSnippet = results[0]?.snippet || "";
    if (topSnippet.length >= 40) {
      directAnswers.push({
        source: "firecrawl_highlight",
        text: cleanWhitespace(topSnippet).slice(0, 400),
        url: results[0].url,
        engine: engineId,
      });
    }
  }

  return { results, directAnswers };
}

export class FirecrawlApiDriver extends ApiSearchDriver {
  id = "firecrawl_api";

  async search({ query, limit }) {
    const apiKey = resolveFirecrawlApiKey(this.config);
    if (!apiKey) {
      const error = new Error("FIRECRAWL_API_KEY not configured — set FIRECRAWL_API_KEY to enable firecrawl_api search");
      error.schedulerSkip = true;
      throw error;
    }

    const timeoutMs = Math.min(this.config?.browserOpTimeoutMs || 15000, 15000);
    const maxLimit = Math.min(Math.max(1, Number(limit) || 10), 20);

    const body = JSON.stringify({
      query,
      limit: maxLimit,
      sources: [{ type: "web" }],
    });

    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "user-agent": this.config?.userAgent || "navigator-mcp/1.0",
    };

    let responseText;
    try {
      responseText = await fetchTextWithTimeout(
        "https://api.firecrawl.dev/v2/search",
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
        throw new Error(`Firecrawl API authentication failed (401) — check FIRECRAWL_API_KEY: ${message.slice(0, 200)}`);
      }
      if (/HTTP 402/i.test(message)) {
        throw new Error(`Firecrawl API payment required (402) — quota/billing: ${message.slice(0, 200)}`);
      }
      if (/HTTP 429/i.test(message)) {
        throw new Error(`Firecrawl API rate limited (429): ${message.slice(0, 200)}`);
      }
      if (/HTTP 400/i.test(message)) {
        throw new Error(`Firecrawl API bad request (400): ${message.slice(0, 200)}`);
      }
      throw error;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Firecrawl API returned non-JSON: ${String(responseText).slice(0, 300)}`);
    }

    if (data?.success === false) {
      const errMsg = cleanWhitespace(data?.error || data?.message || "Unknown Firecrawl API error").slice(0, 300);
      throw new Error(`Firecrawl API error: ${errMsg}`);
    }

    const { results, directAnswers } = parseFirecrawlResults(data, this.id);
    return { results, directAnswers };
  }
}
