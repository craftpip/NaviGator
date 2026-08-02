import { BrowserSearchDriver } from "./browser-driver.js";
import { dedupeDirectAnswers } from "./util.js";

const RESULT_SELECTORS = ["#b_results", "#b_results li.b_algo"];

const EXTRACT_PAGE = () => {
  const rows = Array.from(document.querySelectorAll("#b_results li.b_algo"));
  const results = rows.map((row) => {
    const anchor = row.querySelector("h2 a") || row.querySelector("a");
    const snippetEl =
      row.querySelector(".b_caption p") || row.querySelector(".b_snippet") || row.querySelector("p");

    return {
      title: anchor?.textContent || "",
      url: anchor?.href || "",
      snippet: snippetEl?.textContent || ""
    };
  });

  const answerNodes = [
    ...document.querySelectorAll(".b_ans .b_focusTextLarge, .b_ans .b_paractl, .b_ans .b_snippet"),
    ...document.querySelectorAll("#b_results .b_entityTP .b_snippet")
  ];
  const directAnswers = answerNodes.map((node) => ({
    source: "direct_answer",
    text: node?.textContent || ""
  }));

  return { results, directAnswers };
};

export class BingDriver extends BrowserSearchDriver {
  inputSelectors = ["textarea[name='q']", "input[name='q']", "input#sb_form_q"];
  resultSelectors = RESULT_SELECTORS;

  searchUrl(query) {
    return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
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
