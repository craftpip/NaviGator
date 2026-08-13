import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  SUPPORTED_ENGINES,
  getBrowserWarmupEngines,
  getEngineDriver,
  getEngineMetadata,
} from "../src/engines/index.js";
import { POOL_POLICIES } from "../src/engines/driver.js";
import { DuckDuckGoApiDriver } from "../src/engines/duckduckgo-api.js";
import { normalizeQueryText, normalizeUrl } from "../src/engines/util.js";

const KNOWN_BACKENDS = new Set(["api", "cloakbrowser", "chromium", "lightpanda"]);

function makeFakePage(dom, url = "https://duckduckgo.com/") {
  return {
    async evaluate(fn) {
      return dom.window.eval(`(${fn.toString()})()`);
    },
    url: () => url,
  };
}

function domFromHtml(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: "https://duckduckgo.com/",
    runScripts: "outside-only",
  });
  return dom;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("engine registry", () => {
  it("registers all 10 internal routes", () => {
    expect([...SUPPORTED_ENGINES]).toEqual([
      "bing_cb", "bing_lp",
      "brave_cb",
      "duckduckgo_api", "duckduckgo_cb", "duckduckgo_ch",
      "google_cb", "google_ch", "google_lp",
      "mojeek_lp",
    ]);
  });

  it("returns null metadata for unknown engines", () => {
    expect(getEngineMetadata("unknown_engine")).toBeNull();
    expect(getEngineMetadata("")).toBeNull();
    expect(getEngineMetadata(undefined)).toBeNull();
  });

  it("throws for unknown engine drivers", () => {
    expect(() => getEngineDriver("unknown_engine")).toThrow(/Unknown search engine/);
  });
});

describe("driver contract", () => {
  for (const id of SUPPORTED_ENGINES) {
    it(`validates ${id}`, () => {
      const metadata = getEngineMetadata(id);
      expect(metadata).not.toBeNull();
      expect(KNOWN_BACKENDS.has(metadata.backend)).toBe(true);
      expect(metadata.isBrowser).toBe(metadata.backend !== "api");

      const driver = getEngineDriver(id, {});
      expect(driver.id).toBe(id);
      expect(driver.backend).toBe(metadata.backend);

      if (metadata.backend === "api") {
        expect(metadata.pool).toBeNull();
        expect(metadata.homeUrl).toBeNull();
        expect(driver.pool).toBeNull();
        expect(driver.homeUrl).toBeNull();
        expect(typeof driver.search).toBe("function");
      } else {
        expect(POOL_POLICIES.has(metadata.pool)).toBe(true);
        expect(metadata.homeUrl).toMatch(/^https:\/\//);
        expect(driver.homeUrl).toMatch(/^https:\/\//);
        expect(typeof driver.submit).toBe("function");
        expect(typeof driver.extract).toBe("function");
        expect(() => new URL(driver.searchUrl("query"))).not.toThrow();
      }
    });
  }
});

describe("browser driver extraction", () => {
  const cases = {
    duckduckgo_cb: {
      html: `
        <article data-testid="result">
          <a data-testid="result-title-a" href="https://example.com/one">Duck Example One</a>
          <div data-result="snippet">Duck snippet one.</div>
        </article>
        <div data-testid="instant-answer">The instant answer text.</div>
      `,
      title: "Duck Example One",
      url: "https://example.com/one",
      snippet: "Duck snippet one.",
      answer: "The instant answer text.",
    },
    google_cb: {
      html: `
        <div id="search">
          <div class="MjjYud">
            <a href="https://example.com/two"><h3>Google Example Two</h3></a>
            <div class="VwiC3b">Google snippet two.</div>
          </div>
          <div class="kno-rdesc"><span>Google direct answer.</span></div>
        </div>
      `,
      title: "Google Example Two",
      url: "https://example.com/two",
      snippet: "Google snippet two.",
      answer: "Google direct answer.",
    },
    bing_cb: {
      html: `
        <ol id="b_results">
          <li class="b_algo">
            <h2><a href="https://example.com/three">Bing Example Three</a></h2>
            <div class="b_caption"><p>Bing snippet three.</p></div>
          </li>
        </ol>
        <div class="b_ans"><div class="b_snippet">Bing answer text.</div></div>
      `,
      title: "Bing Example Three",
      url: "https://example.com/three",
      snippet: "Bing snippet three.",
      answer: "Bing answer text.",
    },
    brave_cb: {
      html: `
        <div id="results">
          <div class="snippet" data-type="web">
            <div class="result-content"><a href="https://example.com/four">Brave Example Four</a></div>
            <div class="title search-snippet-title">Brave Example Four</div>
            <div class="snippet-description">Brave snippet four.</div>
          </div>
          <div class="snippet standalone">
            <div class="snippet-content">
              Brave AI answer.
              <div class="followups-wrapper">followup noise</div>
            </div>
          </div>
        </div>
      `,
      title: "Brave Example Four",
      url: "https://example.com/four",
      snippet: "Brave snippet four.",
      answer: "Brave AI answer.",
    },
    mojeek_lp: {
      html: `
        <ul class="results-standard">
          <li>
            <h2><a class="title" href="https://example.com/five">Mojeek Example Five</a></h2>
            <p class="s">Mojeek snippet five.</p>
          </li>
        </ul>
        <div class="infobox"><p>Mojeek infobox answer.</p></div>
      `,
      title: "Mojeek Example Five",
      url: "https://example.com/five",
      snippet: "Mojeek snippet five.",
      answer: "Mojeek infobox answer.",
    },
  };

  for (const [engine, sample] of Object.entries(cases)) {
    it(`extracts ${engine} results and direct answers`, async () => {
      const dom = domFromHtml(sample.html);
      try {
        const driver = getEngineDriver(engine, {});
        const page = makeFakePage(dom, `https://${engine}.example/search`);
        const { results, directAnswers } = await driver.extract(page);

        expect(results.length).toBe(1);
        expect(results[0].title).toBe(sample.title);
        expect(results[0].url).toBe(sample.url);
        expect(results[0].snippet).toBe(sample.snippet);
        expect(results[0].engine).toBe(engine);

        const answer = directAnswers.find((item) => item.text === sample.answer);
        expect(answer).toBeDefined();
        expect(answer.url).toBe(`https://${engine}.example/search`);
      } finally {
        dom.window.close();
      }
    });
  }

  it("extracts google_lp with the Lightpanda selector variant", async () => {
    const dom = domFromHtml(`
      <div id="search">
        <div class="g">
          <a jsname="x" href="https://example.com/x"><h3>LP Google Example</h3></a>
          <div class="VwiC3b">LP snippet.</div>
        </div>
      </div>
    `);
    try {
      const driver = getEngineDriver("google_lp", {});
      const page = makeFakePage(dom, "https://www.google.com/search");
      const { results } = await driver.extract(page);

      expect(results.length).toBe(1);
      expect(results[0].title).toBe("LP Google Example");
      expect(results[0].url).toBe("https://example.com/x");
    } finally {
      dom.window.close();
    }
  });

  it("handles pages with no results", async () => {
    const dom = domFromHtml("<div>nothing here</div>");
    try {
      const driver = getEngineDriver("bing_cb", {});
      const page = makeFakePage(dom);
      const { results, directAnswers } = await driver.extract(page);
      expect(results).toEqual([]);
      expect(directAnswers).toEqual([]);
    } finally {
      dom.window.close();
    }
  });
});

describe("api drivers", () => {
  it("runs DuckDuckGo API search and parses HTML + instant answers", async () => {
    const html = `
      <div class="result results_links">
        <a class="result__a" href="https://example.com/api-a">API Result A</a>
        <div class="result__snippet">API snippet A.</div>
      </div>
    `;
    const answersJson = JSON.stringify({
      Answer: "42 is the answer",
      AbstractText: "The abstract text.",
      AbstractURL: "https://example.org/abstract",
    });

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
      .mockResolvedValueOnce(new Response(answersJson, { status: 200 })));

    const driver = new DuckDuckGoApiDriver({ browserOpTimeoutMs: 60000, userAgent: "test-agent" });
    const { results, directAnswers } = await driver.search({ query: "answer to everything" });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("API Result A");
    expect(results[0].url).toBe("https://example.com/api-a");
    expect(results[0].snippet).toBe("API snippet A.");
    expect(results[0].engine).toBe("duckduckgo_api");

    const answer = directAnswers.find((item) => item.text === "42 is the answer");
    expect(answer).toBeDefined();
    expect(answer.source).toBe("instant_answer");
    expect(answer.engine).toBe("duckduckgo_api");
  });
});

describe("browser driver block detection", () => {
  it("duckduckgo_cb throws on an anomaly/bot page", async () => {
    const dom = domFromHtml('<div id="anomaly-modal"><h1>unusual traffic</h1></div>');
    try {
      const driver = getEngineDriver("duckduckgo_cb", {});
      const page = makeFakePage(dom, "https://duckduckgo.com/?q=test");
      await expect(driver.assertNotBlocked(page)).rejects.toThrow(/blocked/);
    } finally {
      dom.window.close();
    }
  });

  it("duckduckgo_cb passes on a normal results page", async () => {
    const dom = domFromHtml('<article data-testid="result"><a href="https://x.example">x</a></article>');
    try {
      const driver = getEngineDriver("duckduckgo_cb", {});
      const page = makeFakePage(dom, "https://duckduckgo.com/?q=test");
      await expect(driver.assertNotBlocked(page)).resolves.toBeUndefined();
    } finally {
      dom.window.close();
    }
  });

  it("bing_cb throws on a CAPTCHA/verification page", async () => {
    const dom = domFromHtml('<div>Please verify you are a human — captcha required.</div>');
    try {
      const driver = getEngineDriver("bing_cb", {});
      const page = makeFakePage(dom, "https://www.bing.com/search");
      await expect(driver.assertNotBlocked(page)).rejects.toThrow(/blocked/);
    } finally {
      dom.window.close();
    }
  });

  it("bing_cb passes on a normal results page", async () => {
    const dom = domFromHtml('<ol id="b_results"><li class="b_algo"><h2><a href="https://y.example">y</a></h2></li></ol>');
    try {
      const driver = getEngineDriver("bing_cb", {});
      const page = makeFakePage(dom, "https://www.bing.com/search");
      await expect(driver.assertNotBlocked(page)).resolves.toBeUndefined();
    } finally {
      dom.window.close();
    }
  });

  it("mojeek_lp throws on a CAPTCHA challenge page", async () => {
    const dom = domFromHtml('<title>Captcha</title><p>JavaScript is required to complete this challenge. Please enable it and reload the page.</p>');
    try {
      const driver = getEngineDriver("mojeek_lp", {});
      const page = makeFakePage(dom, "https://www.mojeek.com/search?q=test");
      await expect(driver.assertNotBlocked(page)).rejects.toThrow(/blocked/);
    } finally {
      dom.window.close();
    }
  });

  it("mojeek_lp passes on a normal results page", async () => {
    const dom = domFromHtml('<ul class="results-standard"><li><h2><a class="title" href="https://z.example">z</a></h2><p class="s">Mojeek snippet.</p></li></ul>');
    try {
      const driver = getEngineDriver("mojeek_lp", {});
      const page = makeFakePage(dom, "https://www.mojeek.com/search?q=test");
      await expect(driver.assertNotBlocked(page)).resolves.toBeUndefined();
    } finally {
      dom.window.close();
    }
  });
});

describe("browser warmup filtering", () => {
  it("keeps only browser routes, in order, deduplicated", () => {
    expect(getBrowserWarmupEngines([
      "duckduckgo_api", "bing_cb", "bing_cb",
      "google_ch", "duckduckgo_cb", "unknown_engine", "",
    ])).toEqual(["bing_cb", "google_ch", "duckduckgo_cb"]);
  });

  it("returns an empty array for no browser routes", () => {
    expect(getBrowserWarmupEngines(["duckduckgo_api"])).toEqual([]);
    expect(getBrowserWarmupEngines(undefined)).toEqual([]);
  });
});

describe("normalizeUrl", () => {
  it("leaves plain URLs untouched", () => {
    expect(normalizeUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });

  it("unwraps Google /url redirects", () => {
    expect(
      normalizeUrl("https://www.google.com/url?q=https://example.com/a&sa=U")
    ).toBe("https://example.com/a");
  });

  it("unwraps DuckDuckGo /l/ redirects", () => {
    expect(
      normalizeUrl("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fb&rut=1")
    ).toBe("https://example.com/b");
  });

  it("decodes Bing ck/a redirects with an a1-prefixed base64 target", () => {
    expect(
      normalizeUrl("https://www.bing.com/ck/a?!&&u=a1aHR0cHM6Ly92aXRlc3QuZGV2Lw&ntb=1")
    ).toBe("https://vitest.dev/");
  });

  it("decodes Bing ck/a redirects without a prefix marker", () => {
    expect(
      normalizeUrl("https://www.bing.com/ck/a?!&&u=aHR0cHM6Ly9naXRodWIuY29tL3ZpdGVzdC1kZXYvdml0ZXN0&ntb=1")
    ).toBe("https://github.com/vitest-dev/vitest");
  });

  it("leaves Bing ck/a redirects intact when the u param is missing", () => {
    const url = "https://www.bing.com/ck/a?!&&ptn=3&ntb=1";
    expect(normalizeUrl(url)).toBe(url);
  });

  it("returns empty string for invalid URLs", () => {
    expect(normalizeUrl("not a url")).toBe("");
  });
});

describe("normalizeQueryText", () => {
  it("humanizes LLM-style queries: lowercase and strips punctuation", () => {
    expect(normalizeQueryText("What Are The Latest AI News?")).toBe("what are the latest ai news");
  });

  it("removes forward slashes and backslashes", () => {
    expect(normalizeQueryText("frontend/backend C:\\temp")).toBe("frontend backend c temp");
  });

  it("removes quotes and apostrophes", () => {
    expect(normalizeQueryText("don't \"best\" pizza")).toBe("dont best pizza");
  });

  it("keeps meaning-bearing symbols intact", () => {
    expect(normalizeQueryText("C++ vs C# node.js")).toBe("c++ vs c# node.js");
  });

  it("collapses whitespace", () => {
    expect(normalizeQueryText("   latest    ai   news   ")).toBe("latest ai news");
  });

  it("returns empty for empty input", () => {
    expect(normalizeQueryText("")).toBe("");
    expect(normalizeQueryText("   ")).toBe("");
  });
});
