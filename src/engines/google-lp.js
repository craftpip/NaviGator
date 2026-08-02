import { GoogleDriver } from "./google-driver.js";
import { dedupeDirectAnswers } from "./util.js";

const LP_RESULT_SELECTORS = ["#search", "#rso", ".g", "#rcnt"];

const LP_EXTRACT_PAGE = () => {
  const rows = Array.from(
    document.querySelectorAll("#search .g, #rso .g, .MjjYud")
  );
  const results = rows.map((row) => {
    const anchor = row.querySelector("a[jsname] h3")?.closest("a") ||
                   row.querySelector("h3 a, a h3") ||
                   row.querySelector("a");
    const heading = row.querySelector("h3");
    const snippetEl = row.querySelector(
      ".VwiC3b, .st, span.aCOpRe, [data-sncf]"
    );
    return {
      title: heading?.textContent || "",
      url: anchor?.href || "",
      snippet: snippetEl?.textContent || ""
    };
  });

  const answerNodes = document.querySelectorAll(
    ".kno-rdesc span, [data-attrid='wa:/description'], .hgKElc"
  );
  const directAnswers = Array.from(answerNodes).map((node) => ({
    source: "direct_answer",
    text: node?.textContent || ""
  }));

  return { results, directAnswers };
};

export class GoogleLpDriver extends GoogleDriver {
  id = "google_lp";
  backend = "lightpanda";
  pool = "shared";
  exposedInMcp = true;
  homeUrl = "https://www.google.com/";
  resultSelectors = LP_RESULT_SELECTORS;

  async extract(page) {
    const payload = await page.evaluate(LP_EXTRACT_PAGE);

    return {
      results: payload.results.map((item) => ({ ...item, engine: this.id })),
      directAnswers: dedupeDirectAnswers(
        (payload.directAnswers || []).map((item) => ({ ...item, engine: this.id, url: page.url() }))
      )
    };
  }
}
