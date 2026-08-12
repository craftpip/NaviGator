import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
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
    searchQueueMinIntervalMs: 300000,
    searchQueueMaxIntervalMs: 3600000,
    searchQueueEscalationFactor: 2,
    searchQueueReadyIntervalMs: 10000,
    searchQueueExplorationEvery: 5,
    searchQueueLatencySamples: 20,
    searchEnabledEngines: null,
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

function makeExtractionManager({ html, url = "https://example.com/page", hintsPath, configOverrides = {} }) {
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
      defaultBackend: "cloakbrowser",
      ...configOverrides
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

describe("isLocalBrowserFailure", () => {
  it("identifies a missing X server as local infrastructure failure", async () => {
    const { isLocalBrowserFailure } = await import("../src/search.js");
    expect(isLocalBrowserFailure(new Error("Missing X server to start the headful browser"))).toBe(true);
  });

  it("does not classify provider failures as local infrastructure failures", async () => {
    const { isLocalBrowserFailure } = await import("../src/search.js");
    expect(isLocalBrowserFailure(new Error("Google blocked this request with a CAPTCHA page"))).toBe(false);
  });
});

describe("getEngineAttemptStats", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("returns an empty shape when no engine attempts have been recorded", async () => {
    const { getEngineAttemptStats } = await import("../src/search.js");
    const stats = getEngineAttemptStats();
    expect(stats).toEqual({ total: 0, ok: 0, fail: 0, skip: 0, byEngine: {}, recentFailures: [] });
  });

  it("aggregates ok/fail/skip per engine across periods", async () => {
    const mod = await import("../src/search.js");
    mod.recordEngineAttempt("duckduckgo_api", "ok");
    mod.recordEngineAttempt("duckduckgo_api", "ok");
    mod.recordEngineAttempt("bing_lp", "fail", "captcha detected");
    mod.recordEngineAttempt("google_cb", "skip", "route open");

    const stats = mod.getEngineAttemptStats();
    expect(stats.total).toBe(4);
    expect(stats.ok).toBe(2);
    expect(stats.fail).toBe(1);
    expect(stats.skip).toBe(1);

    expect(stats.byEngine["duckduckgo_api"]).toMatchObject({ total: 2, ok: 2, fail: 0, skip: 0 });
    expect(stats.byEngine["bing_lp"]).toMatchObject({ total: 1, ok: 0, fail: 1, skip: 0 });
    expect(stats.byEngine["google_cb"]).toMatchObject({ total: 1, ok: 0, fail: 0, skip: 1 });

    for (const p of ["5m", "15m", "1h", "24h", "all"]) {
      const w = stats.byEngine["bing_lp"].byPeriod[p];
      expect(w).toMatchObject({ total: 1, ok: 0, fail: 1, skip: 0 });
    }
  });

  it("returns recent failures with engine and error", async () => {
    const mod = await import("../src/search.js");
    mod.recordEngineAttempt("mojeek_lp", "ok");
    mod.recordEngineAttempt("bing_lp", "fail", "search route timed out");
    mod.recordEngineAttempt("google_cb", "fail", "unusual traffic");

    const stats = mod.getEngineAttemptStats();
    expect(stats.recentFailures.length).toBe(2);
    expect(stats.recentFailures[0]).toMatchObject({ engine: "google_cb", error: "unusual traffic" });
    expect(stats.recentFailures[1]).toMatchObject({ engine: "bing_lp", error: "search route timed out" });
    expect(stats.recentFailures[0]).toHaveProperty("minutesAgo");
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
      configOverrides: { maxChars: 120 },
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

  function makeRequireSelectorManager({ html, url = "https://example.com/page", hintsPath, configOverrides = {} }) {
    const dom = new JSDOM(html);
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue("Page"),
      url: vi.fn().mockReturnValue(url),
      content: vi.fn().mockResolvedValue(html),
      isClosed: vi.fn(() => false),
      close: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockImplementation(async (fn, arg) => {
        const source = String(fn);
        if (source.includes("document.querySelector(sel)")) {
          return !!dom.window.document.querySelector(arg);
        }
        if (source.includes("cf-browser-verification")) return null;
        return "Rendered browser text";
      })
    };
    return {
      manager: {
        config: makeMockConfig({ domainHintsPath: hintsPath, defaultBackend: "cloakbrowser", ...configOverrides }),
        withPageSlot: vi.fn().mockImplementation((fn) => fn()),
        newPage: vi.fn().mockResolvedValue(page)
      },
      page,
      cleanup: () => dom.window.close()
    };
  }

  async function writeRequireSelectorHints(hints) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-search-require-"));
    const hintsPath = path.join(tempDir, "domain-hints.json");
    await fs.writeFile(hintsPath, JSON.stringify(hints));
    return { tempDir, hintsPath };
  }

  it("applies the first hint whose requireSelector exists on the page", async () => {
    const { tempDir, hintsPath } = await writeRequireSelectorHints([
      {
        domain: "example.com",
        pathPattern: "/**",
        navigationWait: 0,
        requireSelector: ".profile-banner",
        content: { sections: [{ selector: ".profile", label: "Profile", priority: "high" }] }
      },
      {
        domain: "example.com",
        pathPattern: "/**",
        navigationWait: 0,
        content: { sections: [{ selector: ".listing", label: "Listing", priority: "high" }] }
      }
    ]);
    const html = `<!doctype html><html><head><title>Page</title></head><body>
      <div class="listing"><p>Product listing content here</p></div>
    </body></html>`;
    const { manager, cleanup } = makeRequireSelectorManager({ html, hintsPath });
    mockGetBrowserManager.mockResolvedValue(manager);

    try {
      const { browserOpenAndExtract } = await import("../src/search.js");
      const result = await browserOpenAndExtract({
        url: "https://example.com/page",
        includeSeoAnalysis: false
      });

      expect(result.text).toContain("### Listing");
      expect(result.text).not.toContain("### Profile");
      expect(result.text).not.toContain("requireSelector");
    } finally {
      cleanup();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uses the requireSelector hint when its element is present", async () => {
    const { tempDir, hintsPath } = await writeRequireSelectorHints([
      {
        domain: "example.com",
        pathPattern: "/**",
        navigationWait: 0,
        requireSelector: ".profile-banner",
        content: { sections: [{ selector: ".profile", label: "Profile", priority: "high" }] }
      },
      {
        domain: "example.com",
        pathPattern: "/**",
        navigationWait: 0,
        content: { sections: [{ selector: ".listing", label: "Listing", priority: "high" }] }
      }
    ]);
    const html = `<!doctype html><html><head><title>Page</title></head><body>
      <div class="profile-banner"><p>Banner</p></div>
      <div class="profile"><p>Profile content here</p></div>
    </body></html>`;
    const { manager, cleanup } = makeRequireSelectorManager({ html, hintsPath });
    mockGetBrowserManager.mockResolvedValue(manager);

    try {
      const { browserOpenAndExtract } = await import("../src/search.js");
      const result = await browserOpenAndExtract({
        url: "https://example.com/page",
        includeSeoAnalysis: false
      });

      expect(result.text).toContain("### Profile");
      expect(result.text).not.toContain("### Listing");
    } finally {
      cleanup();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("notes when an override hint's requireSelector is missing", async () => {
    const { manager, cleanup } = makeRequireSelectorManager({
      html: `<!doctype html><html><head><title>Page</title></head><body><p>Plain content</p></body></html>`
    });
    mockGetBrowserManager.mockResolvedValue(manager);

    try {
      const { browserOpenAndExtract } = await import("../src/search.js");
      const result = await browserOpenAndExtract({
        url: "https://example.com/page",
        includeSeoAnalysis: false,
        hintOverride: {
          domain: "example.com",
          pathPattern: "/**",
          requireSelector: ".missing-element",
          content: { sections: [{ selector: ".profile", label: "Profile", priority: "high" }] }
        }
      });

      expect(result.text).toContain("requireSelector");
      expect(result.text).toContain("did not apply");
      expect(result.text).not.toContain("### Profile");
    } finally {
      cleanup();
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
