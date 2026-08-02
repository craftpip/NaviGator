import { BrowserSearchDriver } from "./browser-driver.js";
import { dedupeDirectAnswers } from "./util.js";

const RESULT_SELECTORS = [
  "#results .snippet",
  ".snippet[data-type='web']",
  "#results",
  "#search-page"
];

const EXTRACT_PAGE = () => {
  const rows = Array.from(document.querySelectorAll('#results > div.snippet[data-type="web"]'));
  const results = rows.map((row) => {
    const anchor = row.querySelector('.result-content > a[href^="http"], a[href^="http"]');
    const titleEl = row.querySelector(".title.search-snippet-title");
    const snippetEl = row.querySelector(".generic-snippet .content, .snippet-description, .snippet-description-noclick");
    return {
      title: titleEl?.textContent || "",
      url: anchor?.href || "",
      snippet: snippetEl?.textContent || ""
    };
  });

  const answerNode = document.querySelector(".snippet.standalone .snippet-content");
  const directAnswers = [];
  if (answerNode) {
    const clone = answerNode.cloneNode(true);
    clone.querySelectorAll(".followups-wrapper, .followup, button").forEach((n) => n.remove());
    const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
    if (text) {
      directAnswers.push({ source: "ai_answer", text });
    }
  }

  return { results, directAnswers };
};

export class BraveCbDriver extends BrowserSearchDriver {
  id = "brave_cb";
  backend = "cloakbrowser";
  pool = "engine";
  exposedInMcp = true;
  homeUrl = "https://search.brave.com/";
  inputSelectors = ["input#searchbox", "input[name='q']", "input[type='search']"];
  resultSelectors = RESULT_SELECTORS;

  searchUrl(query) {
    return `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
  }

  async extract(page) {
    const payload = await page.evaluate(EXTRACT_PAGE);

    return {
      results: payload.results.map((item) => ({ ...item, engine: this.id })),
      directAnswers: dedupeDirectAnswers(
        (payload.directAnswers || []).map((item) => ({ ...item, engine: this.id, url: page.url() }))
      )
    };
  }
}
