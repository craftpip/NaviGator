import { BrowserSearchDriver } from "./browser-driver.js";

const INPUT_SELECTOR = "input[name='q'], input#searchbox_input, input[data-testid='searchbox-input']";
const RESULT_SELECTORS = [
  "article[data-testid='result']",
  "#links .result",
  ".results .result",
  ".result",
  "#search_results"
];

const EXTRACT_PAGE = () => {
  const rows = Array.from(document.querySelectorAll("article[data-testid='result'], .result"));
  const results = rows.map((row) => {
    const anchor = row.querySelector("a[data-testid='result-title-a'], h2 a, a.result__a");
    const snippetEl = row.querySelector(
      "[data-result='snippet'], .result__snippet, .result-snippet"
    );
    return {
      title: anchor?.textContent || "",
      url: anchor?.href || "",
      snippet: snippetEl?.textContent || ""
    };
  });

  const answerNodes = [
    ...document.querySelectorAll("[data-testid='instant-answer']"),
    ...document.querySelectorAll(".zci__answer, .zci__result, .module__body")
  ];
  const directAnswers = answerNodes.map((node) => ({
    source: "instant_answer",
    text: node?.textContent || ""
  }));

  return { results, directAnswers };
};

export class DuckDuckGoBrowserDriver extends BrowserSearchDriver {
  inputSelectors = [INPUT_SELECTOR];
  resultSelectors = RESULT_SELECTORS;

  searchUrl(_query) {
    return "https://duckduckgo.com/";
  }

  async assertNotBlocked(page) {
    const text = await page.evaluate(() => document.body?.innerText || document.body?.textContent || "");
    const pageUrl = page.url();

    if (/anomaly-modal|puzzl|unusual traffic|isn't quite right/i.test(text) || /\/sorry\//.test(pageUrl)) {
      throw new Error("DuckDuckGo blocked this request with a bot/anomaly page");
    }
  }

  async submit(page, query) {
    const { config } = this;
    await page.goto(this.searchUrl(query), {
      waitUntil: "domcontentloaded",
      timeout: config.browserOpTimeoutMs
    });

    // DuckDuckGo shows homepage skeleton with ?q=, not results — need to submit the form
    await page.waitForSelector(this.inputSelectors.join(","), {
      timeout: config.browserOpTimeoutMs
    });
    await page.evaluate((q) => {
      const input = document.querySelector("input[name='q'], input#searchbox_input, input[data-testid='searchbox-input']");
      if (input) {
        input.value = q;
        const form = input.closest("form");
        if (form) form.submit();
      }
    }, query);
    // Wait for navigation to complete after form submit
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: config.browserOpTimeoutMs }).catch(() => {});
    await this.waitForAnySelector(page, this.resultSelectors, config.browserOpTimeoutMs);
  }

  async extract(page) {
    return this.extractViaEvaluate(page, EXTRACT_PAGE);
  }
}
