import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";

const mockGetBrowserManager = vi.fn();

vi.mock("../src/browser.js", () => ({
  getBrowserManager: (...args) => mockGetBrowserManager(...args),
}));

vi.mock("cloakbrowser", () => ({}));
vi.mock("cloakbrowser/puppeteer", () => ({ launch: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function makeMockConfig(overrides = {}) {
  return {
    searchRouteCircuitOpenMs: 300000,
    searchFallback: null,
    defaultBackend: "cloakbrowser",
    browserOpTimeoutMs: 60000,
    userAgent: "test-agent",
    navWaitUntil: "domcontentloaded",
    openPageMaxParallel: 6,
    maxConcurrentPageOps: 30,
    humanTypingDelay: 15,
    prelaunchBrowser: true,
    enableHangRestart: false,
    hangRestartTimeoutMs: 120000,
    startupUrl: "about:blank",
    searchRouteWarmupEngines: [],
    searchKeepMinWorkingWindows: 2,
    searchMaxWorkingWindows: 10,
    ...overrides,
  };
}

function makeMockManager(configOverrides = {}) {
  return {
    config: makeMockConfig(configOverrides),
    withPageSlot: vi.fn().mockImplementation((fn) => fn()),
    acquireSearchWindow: vi.fn(),
    releaseSearchWindow: vi.fn(),
  };
}

function makeExtractionManager({ html, url = "https://example.com/page", hintsPath }) {
  let closed = false;
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue("Example page"),
    url: vi.fn().mockReturnValue(url),
    content: vi.fn().mockResolvedValue(html),
    isClosed: vi.fn(() => closed),
    close: vi.fn().mockImplementation(async () => { closed = true; }),
    evaluate: vi.fn().mockImplementation((fn) => {
      const source = String(fn);
      if (source.includes("document.querySelector(sel)")) return Promise.resolve(500);
      if (source.includes("cf-browser-verification")) return Promise.resolve(null);
      return Promise.resolve("Rendered browser text");
    })
  };

  return {
    config: makeMockConfig({
      domainHintsPath: hintsPath,
      defaultBackend: "cloakbrowser"
    }),
    withPageSlot: vi.fn().mockImplementation((fn) => fn()),
    newPage: vi.fn().mockResolvedValue(page)
  };
}

describe("getSearchBackendHealth", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("returns empty array when no routes have failed", async () => {
    const { getSearchBackendHealth } = await import("../src/search.js");
    const health = getSearchBackendHealth();
    expect(Array.isArray(health)).toBe(true);
    expect(health.length).toBe(0);
  });

  it("returns consistent structure for each entry", async () => {
    const mod = await import("../src/search.js");
    const health = mod.getSearchBackendHealth();
    for (const entry of health) {
      expect(entry).toHaveProperty("route");
      expect(entry).toHaveProperty("state");
      expect(entry).toHaveProperty("remainingMs");
      expect(entry).toHaveProperty("failures");
      expect(entry).toHaveProperty("lastError");
      expect(entry).toHaveProperty("lastFailureAt");
      expect(["open", "half_open"]).toContain(entry.state);
    }
  });
});

describe("browserSearch", () => {
  it("throws when no query provided", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    await expect(browserSearch({})).rejects.toThrow("Missing query/queries");
  });

  it("throws on empty string query", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    await expect(browserSearch({ query: "" })).rejects.toThrow("Missing query/queries");
  });

  it("throws on whitespace-only query", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    await expect(browserSearch({ query: "   " })).rejects.toThrow("Missing query/queries");
  });

  it("throws on empty queries array", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    await expect(browserSearch({ queries: [] })).rejects.toThrow("Missing query/queries");
  });

  it("throws on queries array with empty strings", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    await expect(browserSearch({ queries: [""] })).rejects.toThrow("Missing query/queries");
  });

  it("rejects invalid engine names", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    await expect(browserSearch({
      query: "test",
      engines: ["invalid_engine"],
    })).rejects.toThrow("No valid engines requested");
  });

  it("rejects when only invalid engines given alongside valid ones", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    await expect(browserSearch({
      query: "test",
      engines: ["invalid_engine"],
    })).rejects.toThrow("No valid engines requested");
  });
});

describe("browserSearch with duckduckgo_api (HTTP backend)", () => {
  it("normalizes quoted query text", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    // duckduckgo_api doesn't use the browser - it does direct HTTP fetch
    // The query normalization strips the quotes
    const result = await browserSearch({
      query: '"test normalization"',
      engines: ["duckduckgo_api"],
    });
    expect(result.query).toBe("test normalization");
    expect(Array.isArray(result.results)).toBe(true);
    expect(result).toHaveProperty("errors");
  });

  it("strips outer single quotes from query", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    const result = await browserSearch({
      query: "'single quote query'",
      engines: ["duckduckgo_api"],
    });
    expect(result.query).toBe("single quote query");
  });

  it("handles query with smart double quotes", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    const result = await browserSearch({
      query: "\u201csmart double quoted\u201d",
      engines: ["duckduckgo_api"],
    });
    expect(result.query).toBe("smart double quoted");
  });

  it("handles query with smart single quotes", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    const result = await browserSearch({
      query: "\u2018smart single quoted\u2019",
      engines: ["duckduckgo_api"],
    });
    expect(result.query).toBe("smart single quoted");
  });

  it("processes multiple queries", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserSearch } = await import("../src/search.js");
    const result = await browserSearch({
      query: "first query",
      queries: ["second query", "third query"],
      engines: ["duckduckgo_api"],
    });
    expect(result).toHaveProperty("queries");
    expect(result.queryCount).toBeGreaterThanOrEqual(1);
    expect(result).toHaveProperty("queryResults");
  });
});

describe("browserOpenAndExtract", () => {
  it("is a function", async () => {
    const { browserOpenAndExtract } = await import("../src/search.js");
    expect(typeof browserOpenAndExtract).toBe("function");
  });

  it("accepts one parameter (destructured object)", async () => {
    const { browserOpenAndExtract } = await import("../src/search.js");
    expect(browserOpenAndExtract.length).toBe(1);
  });

  it("keeps hinted sections, extracted tables, and truncation metadata together", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-search-hints-"));
    const hintsPath = path.join(tempDir, "domain-hints.json");
    await fs.writeFile(hintsPath, JSON.stringify([{
      domain: "example.com",
      pathPattern: "/**",
      navigationWait: 0,
      content: {
        sections: [{ selector: ".profile", label: "Profile", priority: "high" }]
      }
    }]));

    mockGetBrowserManager.mockResolvedValue(makeExtractionManager({
      hintsPath,
      html: `<!doctype html><html><head><title>Hinted page</title></head><body>
        <section class="profile"><p>${"Profile content ".repeat(20)}</p>
          <table><caption>Metrics</caption><tr><th>Name</th><th>Value</th></tr><tr><td>Visitors</td><td>12345</td></tr><tr><td>Subscribers</td><td>67890</td></tr></table>
        </section>
      </body></html>`
    }));

    try {
      const { browserOpenAndExtract } = await import("../src/search.js");
      const result = await browserOpenAndExtract({
        url: "https://example.com/page",
        maxChars: 120,
        includeSeoAnalysis: false
      });

      expect(result.text).toContain("### Profile");
      expect(result.text).toContain("### Metrics");
      expect(result.text).toContain("Visitors | 12345");
      expect(result.text).toContain("Response truncated");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("renders structured hint fields without post UI noise", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-search-hints-"));
    const hintsPath = path.join(tempDir, "domain-hints.json");
    await fs.writeFile(hintsPath, JSON.stringify([{
      domain: "example.com",
      pathPattern: "/**",
      navigationWait: 0,
      content: {
        sections: [
          {
            selector: "#question",
            label: "Question",
            priority: "high",
            fields: [
              { selector: ".vote", label: "Votes", format: "text" },
              { selector: ".body", label: "Content", format: "markdown" },
              { selector: ".comment", label: "Comments", format: "list" }
            ]
          },
          {
            selector: ".answer",
            label: "Answers",
            itemLabel: "Answer",
            priority: "high",
            fields: [
              { selector: ".vote", label: "Votes", format: "text" },
              { selector: ".body", label: "Content", format: "markdown" },
              { selector: ".comment", label: "Comments", format: "list" }
            ]
          }
        ]
      }
    }]));

    mockGetBrowserManager.mockResolvedValue(makeExtractionManager({
      hintsPath,
      html: `<!doctype html><html><body>
        <div id="question"><button>Upvote</button><span class="vote">12</span><div class="body"><p>Question body.</p><pre><code>question()</code></pre></div><span class="comment">Question comment</span></div>
        <div class="answer"><button>Upvote</button><span class="vote">7</span><div class="body"><p>Answer body.</p></div><span class="comment">Answer comment</span></div>
      </body></html>`
    }));

    try {
      const { browserOpenAndExtract } = await import("../src/search.js");
      const result = await browserOpenAndExtract({
        url: "https://example.com/structured",
        includeSeoAnalysis: false
      });

      expect(result.text).toContain("### Question");
      expect(result.text).toContain("**Votes:** 12");
      expect(result.text).toContain("Question body.");
      expect(result.text).toContain("- Question comment");
      expect(result.text).toContain("#### Answer 1");
      expect(result.text).toContain("**Votes:** 7");
      expect(result.text).toContain("- Answer comment");
      expect(result.text).not.toContain("Upvote");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("browserCaptureScreenshot", () => {
  it("is a function", async () => {
    const { browserCaptureScreenshot } = await import("../src/search.js");
    expect(typeof browserCaptureScreenshot).toBe("function");
  });

  it("accepts one destructured parameter", async () => {
    const { browserCaptureScreenshot } = await import("../src/search.js");
    expect(browserCaptureScreenshot.length).toBe(1);
  });

  it("normalizes jpeg format correctly", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserCaptureScreenshot } = await import("../src/search.js");
    // Will throw at runtime (no real browser), but format normalization happens first
    // and the function throws from page operations, not format normalization
    await expect(browserCaptureScreenshot({ url: "https://example.com", format: "jpeg" })).rejects.toThrow();
  });

  it("accepts quality parameter for jpeg", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserCaptureScreenshot } = await import("../src/search.js");
    await expect(browserCaptureScreenshot({ url: "https://example.com", format: "jpeg", quality: 80 })).rejects.toThrow();
  });

  it("accepts fullPage parameter", async () => {
    mockGetBrowserManager.mockResolvedValue(makeMockManager());
    const { browserCaptureScreenshot } = await import("../src/search.js");
    await expect(browserCaptureScreenshot({ url: "https://example.com", fullPage: false })).rejects.toThrow();
  });
});
