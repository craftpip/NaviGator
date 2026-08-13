import { JSDOM } from "jsdom";
import { ApiSearchDriver } from "./api-driver.js";
import { parseDuckDuckGoInstantAnswers } from "./instant-answers.js";
import { cleanWhitespace, fetchTextWithTimeout, normalizeUrl } from "./util.js";

function parseDuckDuckGoHtmlResults(html) {
  const safeHtml = String(html || "");
  const dom = new JSDOM(safeHtml, { url: "https://html.duckduckgo.com/html/" });
  try {
    const rows = Array.from(dom.window.document.querySelectorAll(".result.results_links, .result"));
    const results = rows
      .map((row) => {
        const anchor = row.querySelector("a.result__a") || row.querySelector(".result__title a") || row.querySelector("h2 a");
        const snippetEl = row.querySelector(".result__snippet");
        return {
          title: cleanWhitespace(anchor?.textContent || ""),
          url: normalizeUrl(anchor?.href || ""),
          snippet: cleanWhitespace(snippetEl?.textContent || "")
        };
      })
      .filter((item) => item.title && item.url);

    if (results.length) return results;

    if (/anomaly-modal|anomaly|captcha|unusual traffic|bot/i.test(safeHtml)) {
      throw new Error("DuckDuckGo HTTP returned a bot/anomaly page without usable results");
    }

    return results;
  } finally {
    dom.window.close();
  }
}

export class DuckDuckGoApiDriver extends ApiSearchDriver {
  id = "duckduckgo_api";

  async search({ query }) {
    const timeoutMs = Math.min(this.config.browserOpTimeoutMs, 15000);
    const headers = {
      "user-agent": this.config.userAgent,
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "content-type": "application/x-www-form-urlencoded"
    };

    const htmlPromise = fetchTextWithTimeout(
      "https://html.duckduckgo.com/html/",
      {
        method: "POST",
        headers,
        body: new URLSearchParams({ q: query }).toString()
      },
      timeoutMs
    );
    const answerPromise = fetchTextWithTimeout(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "user-agent": this.config.userAgent, "accept": "application/json" } },
      timeoutMs
    ).catch(() => "");

    const [html, answerText] = await Promise.all([htmlPromise, answerPromise]);
    const results = parseDuckDuckGoHtmlResults(html).map((item) => ({ ...item, engine: this.id }));
    let directAnswers = [];
    if (answerText) {
      try {
        directAnswers = parseDuckDuckGoInstantAnswers(JSON.parse(answerText)).map((item) => ({ ...item, engine: this.id }));
      } catch {
        directAnswers = [];
      }
    }

    return { results, directAnswers };
  }
}
