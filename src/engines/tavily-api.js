import { ApiSearchDriver } from "./api-driver.js";
import { cleanWhitespace, fetchTextWithTimeout, normalizeUrl } from "./util.js";

function resolveTavilyApiKey(config) {
  const fromConfig = String(config?.tavilyApiKey || "").trim();
  if (fromConfig) return fromConfig;
  return String(process.env.TAVILY_API_KEY || "").trim();
}

function buildTavilySnippet(item) {
  const content = cleanWhitespace(item?.content || "");
  if (content) return content.slice(0, 500);
  return "";
}

function parseTavilyResults(data, engineId) {
  const raw = Array.isArray(data?.results) ? data.results : [];
  const answer = cleanWhitespace(data?.answer || "");

  const results = raw
    .map((item) => ({
      title: cleanWhitespace(item?.title || ""),
      url: normalizeUrl(item?.url || ""),
      snippet: buildTavilySnippet(item),
    }))
    .filter((item) => item.title && item.url)
    .map((item) => ({ ...item, engine: engineId }));

  const directAnswers = [];
  if (answer && answer.length >= 40) {
    directAnswers.push({
      source: "tavily_answer",
      text: cleanWhitespace(answer).slice(0, 600),
      url: normalizeUrl(results[0]?.url || ""),
      engine: engineId,
    });
  } else if (results.length) {
    const topSnippet = results[0]?.snippet || "";
    if (topSnippet.length >= 40) {
      directAnswers.push({
        source: "tavily_highlight",
        text: cleanWhitespace(topSnippet).slice(0, 400),
        url: results[0].url,
        engine: engineId,
      });
    }
  }

  return { results, directAnswers };
}

export class TavilyApiDriver extends ApiSearchDriver {
  id = "tavily_api";

  async search({ query, limit }) {
    const apiKey = resolveTavilyApiKey(this.config);
    if (!apiKey) {
      const error = new Error("TAVILY_API_KEY not configured — set TAVILY_API_KEY to enable tavily_api search");
      error.schedulerSkip = true;
      throw error;
    }

    const timeoutMs = Math.min(this.config?.browserOpTimeoutMs || 15000, 15000);
    const maxResults = Math.min(Math.max(1, Number(limit) || 10), 20);

    const body = JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: "advanced",
      include_raw_content: false,
      topic: "general",
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
        "https://api.tavily.com/search",
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
        throw new Error(`Tavily API authentication failed (401) — check TAVILY_API_KEY: ${message.slice(0, 200)}`);
      }
      if (/HTTP 429/i.test(message)) {
        throw new Error(`Tavily API rate limited (429): ${message.slice(0, 200)}`);
      }
      if (/HTTP 403/i.test(message)) {
        throw new Error(`Tavily API forbidden (403): ${message.slice(0, 200)}`);
      }
      throw error;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Tavily API returned non-JSON: ${String(responseText).slice(0, 300)}`);
    }

    const { results, directAnswers } = parseTavilyResults(data, this.id);
    return { results, directAnswers };
  }
}
