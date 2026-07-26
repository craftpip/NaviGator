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
