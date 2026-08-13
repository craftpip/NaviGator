import { BrowserSearchDriver } from "./browser-driver.js";

const RESULT_SELECTORS = [".results-standard", ".results-standard li", ".serp-results", ".results"];

const EXTRACT_PAGE = () => {
  const rows = Array.from(document.querySelectorAll(".results-standard li"));
  const results = rows.map((row) => {
    const anchor = row.querySelector("h2 a.title") || row.querySelector("h2 a") || row.querySelector("a.title");
    const snippetEl = row.querySelector("p.s");

    return {
      title: anchor?.textContent || "",
      url: anchor?.href || "",
      snippet: snippetEl?.textContent || ""
    };
  });

  const directAnswers = Array.from(document.querySelectorAll(".infobox p"))
    .map((node) => ({
      source: "infobox",
      text: node?.textContent || ""
    }));

  return { results, directAnswers };
};

export class MojeekLpDriver extends BrowserSearchDriver {
  id = "mojeek_lp";
  backend = "lightpanda";
  pool = "shared";
  homeUrl = "https://www.mojeek.com/";
  inputSelectors = ["input[name='q']", "input.js-search-input"];
  resultSelectors = RESULT_SELECTORS;

  searchUrl(query) {
    return `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
  }

  async assertNotBlocked(page) {
    const text = await page.evaluate(() => document.body?.innerText || document.body?.textContent || "");
    if (/403\s*-?\s*forbidden|automated queries/i.test(text)) {
      throw new Error("Mojeek blocked this request as automated traffic");
    }
  }

  async extract(page) {
    return this.extractViaEvaluate(page, EXTRACT_PAGE);
  }
}
