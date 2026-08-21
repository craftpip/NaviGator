import { ApiSearchDriver } from "./api-driver.js";
import { cleanWhitespace, fetchTextWithTimeout, normalizeUrl } from "./util.js";

function resolveLinkupApiKey(config) {
  const fromConfig = String(config?.linkupApiKey || "").trim();
  if (fromConfig) return fromConfig;
  return String(process.env.LINKUP_API_KEY || "").trim();
}

function buildLinkupSnippet(item) {
  const content = cleanWhitespace(item?.content || item?.snippet || "");
  if (content) return content.slice(0, 500);
  return "";
}

function parseLinkupResults(data, engineId) {
  // Linkup searchResults output: { results: [{ name, url, content, type }] }
  // sourcedAnswer output: { answer, sources: [{ name, url, snippet }] } — also handle if we switch modes
  let raw = [];
  let answer = "";
  let sources = [];

  if (Array.isArray(data?.results)) {
    raw = data.results;
  } else if (Array.isArray(data?.sources)) {
    // sourcedAnswer fallback
    raw = data.sources.map((s) => ({
      name: s.name,
      url: s.url,
      content: s.snippet || s.content || "",
      type: "text",
    }));
    answer = cleanWhitespace(data?.answer || "");
    sources = data.sources || [];
  }

  const results = raw
    .map((item) => ({
      title: cleanWhitespace(item?.name || item?.title || ""),
      url: normalizeUrl(item?.url || ""),
      snippet: buildLinkupSnippet(item),
    }))
    .filter((item) => item.title && item.url)
    .map((item) => ({ ...item, engine: engineId }));

  // directAnswers: use sourced answer if available, else top snippet
  const directAnswers = [];
  if (answer && answer.length >= 40) {
    directAnswers.push({
      source: "linkup_answer",
      text: cleanWhitespace(answer).slice(0, 600),
      url: normalizeUrl(sources[0]?.url || results[0]?.url || ""),
      engine: engineId,
    });
  } else if (results.length) {
    // fallback: top result snippet as highlight-style answer
    const topSnippet = results[0]?.snippet || "";
    if (topSnippet.length >= 40) {
      directAnswers.push({
        source: "linkup_highlight",
        text: cleanWhitespace(topSnippet).slice(0, 400),
        url: results[0].url,
        engine: engineId,
      });
    }
  }

  return { results, directAnswers };
}

export class LinkupApiDriver extends ApiSearchDriver {
  id = "linkup_api";

  async search({ query, limit }) {
    const apiKey = resolveLinkupApiKey(this.config);
    if (!apiKey) {
      const error = new Error("LINKUP_API_KEY not configured — set LINKUP_API_KEY to enable linkup_api search");
      error.schedulerSkip = true;
      throw error;
    }

    const timeoutMs = Math.min(this.config?.browserOpTimeoutMs || 15000, 20000);
    // Use searchResults for grounding; standard depth 1-3s, sourcedAnswer would also give answer but searchResults is cheaper
    const body = JSON.stringify({
      q: query,
      depth: "standard",
      outputType: "searchResults",
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
        "https://api.linkup.so/v1/search",
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
        throw new Error(`Linkup API authentication failed (401) — check LINKUP_API_KEY: ${message.slice(0, 200)}`);
      }
      if (/HTTP 402/i.test(message)) {
        throw new Error(`Linkup API payment required (402) — quota/billing: ${message.slice(0, 200)}`);
      }
      if (/HTTP 429/i.test(message)) {
        throw new Error(`Linkup API rate limited (429): ${message.slice(0, 200)}`);
      }
      throw error;
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Linkup API returned non-JSON: ${String(responseText).slice(0, 300)}`);
    }

    const { results, directAnswers } = parseLinkupResults(data, this.id);
    // Honor limit client-side; API doesn't have numResults param for searchResults, but we slice
    const slicedResults = typeof limit === "number" && limit > 0 ? results.slice(0, Math.min(limit, 20)) : results.slice(0, 10);
    const slicedAnswers = directAnswers.slice(0, 2);
    return { results: slicedResults, directAnswers: slicedAnswers };
  }
}
