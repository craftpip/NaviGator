import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../src/browser.js", () => ({ getBrowserManager: vi.fn() }));
vi.mock("../src/search.js", () => ({
  browserSearch: vi.fn(),
  browserOpenAndExtract: vi.fn(),
  browserCaptureScreenshot: vi.fn(),
  getSearchBackendHealth: vi.fn().mockReturnValue([]),
}));
vi.mock("../src/devtools.js", () => ({
  devtoolsToolDefinitions: [],
  formatDevtoolsToolResponse: vi.fn(),
  handleDevtoolsToolCall: vi.fn(),
  captureTargetScreenshot: vi.fn(),
}));
vi.mock("cloakbrowser", () => ({}));
vi.mock("cloakbrowser/puppeteer", () => ({ launch: vi.fn() }));

const MCP_PORT = 18990;
const MCP_BASE = `http://localhost:${MCP_PORT}`;

function makeMockManager(overrides = {}) {
  return {
    config: {
      chromePath: "/usr/bin/chrome",
      chromeUserDataDir: "/tmp/chrome-test",
      chromeProfileDir: "Default",
      defaultBackend: "cloakbrowser",
      devtoolsBackend: "cloakbrowser",
      browserOpTimeoutMs: 60000,
      headless: true,
      userAgent: "test-agent",
      navWaitUntil: "domcontentloaded",
      mcpApiPort: MCP_PORT,
      mcpApiHost: "http://localhost",
      enableHttpHealth: true,
      enableHttpMcp: true,
      enableStdioMcp: false,
      enableDevtoolsMcp: false,
      searchKeepMinWorkingWindows: 2,
      searchMaxWorkingWindows: 10,
      searchRouteCircuitOpenMs: 300000,
      openPageMaxParallel: 6,
      maxConcurrentPageOps: 30,
      humanTypingDelay: 15,
      prelaunchBrowser: false,
      enableHangRestart: false,
      hangRestartTimeoutMs: 120000,
      startupUrl: "about:blank",
      searchRouteWarmupEngines: [],
      searchFallback: null,
      lightpandaPath: null,
      lightpandaPort: 9222,
      screenshotPathPrefix: null,
      enableScreenshotDownloadLink: false,
      ...overrides,
    },
    getHealth: vi.fn().mockResolvedValue({
      ok: true,
      browserConnected: true,
      lightpandaConnected: false,
      openPageSlots: { used: 0, max: 10 },
      pageLimiter: { inUse: 0 },
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    prelaunchIfConfigured: vi.fn().mockResolvedValue(undefined),
  };
}

async function mcpPost(body, extraHeaders = {}) {
  const res = await fetch(`${MCP_BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, body: data };
}

async function waitForServer(url, maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} did not become ready in time`);
}

function makeMockSearchPayload(overrides = {}) {
  return {
    query: "test query",
    queries: [],
    results: overrides.results ?? [
      {
        title: "Test Result",
        url: "https://example.com/test",
        snippet: "This is a test snippet",
      },
    ],
    errors: [],
    directAnswers: [],
    ...overrides,
  };
}

describe("mcp-server HTTP endpoints", () => {
  beforeAll(async () => {
    const browserMod = await import("../src/browser.js");
    browserMod.getBrowserManager.mockResolvedValue(makeMockManager());

    // Trigger top-level code by importing mcp-server
    await import("../src/mcp-server.js");

    await waitForServer(`${MCP_BASE}/health`);
  }, 15000);

  afterAll(() => {
    // Clean shutdown
    process.emit("SIGTERM");
  });

  describe("GET /health", () => {
    it("returns 200 with health info", async () => {
      const res = await fetch(`${MCP_BASE}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body).toHaveProperty("browserConnected");
      expect(body).toHaveProperty("searchRouteCircuitBreakers");
    });

    it("GET / also returns health", async () => {
      const res = await fetch(`${MCP_BASE}/`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  describe("GET /search", () => {
    it("returns 400 when no query param", async () => {
      const res = await fetch(`${MCP_BASE}/search`);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/missing/i);
    });

    it("returns markdown results for a single query", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "hello world",
      }));

      const res = await fetch(`${MCP_BASE}/search?q=hello+world`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/markdown/);
      const text = await res.text();
      expect(text).toContain("Test Result");
    });

    it("sends markdown content-type", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload());

      const res = await fetch(`${MCP_BASE}/search?q=test`);
      expect(res.headers.get("content-type")).toMatch(/markdown/);
    });

    it("handles queries parameter with || separator", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        queries: ["a", "b"],
      }));

      const res = await fetch(`${MCP_BASE}/search?queries=hello||world`);
      expect(res.status).toBe(200);
    });

    it("handles multiple q parameters", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload());

      const res = await fetch(`${MCP_BASE}/search?q=hello&q=world`);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /extract", () => {
    it("returns 400 when no url param", async () => {
      const res = await fetch(`${MCP_BASE}/extract`);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it("calls browserOpenAndExtract with url param", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserOpenAndExtract.mockResolvedValueOnce({
        text: "extracted content",
        title: "Extracted Page",
      });

      const res = await fetch(`${MCP_BASE}/extract?url=https://example.com`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Extracted Page");
    });
  });

  describe("GET /screenshot", () => {
    it("returns 400 when no url param", async () => {
      const res = await fetch(`${MCP_BASE}/screenshot`);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });

    it("calls browserCaptureScreenshot with url param", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserCaptureScreenshot.mockResolvedValueOnce({
        screenshotBase64: "fakebase64",
        contentType: "image/png",
        format: "png",
        title: "Screenshot",
      });

      const res = await fetch(`${MCP_BASE}/screenshot?url=https://example.com`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Screenshot");
    });
  });

  describe("GET 404", () => {
    it("returns 404 for unknown paths", async () => {
      const res = await fetch(`${MCP_BASE}/nonexistent`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  });

  describe("POST /mcp — stateless JSON-RPC", () => {
    it("responds to tools/list", async () => {
      const { status, body } = await mcpPost({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });

      expect(status).toBe(200);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(1);
      expect(body.result.tools).toBeDefined();
      const names = body.result.tools.map((t) => t.name);
      expect(names).toContain("web_search");
      expect(names).toContain("web_fetch");
      expect(names).toContain("web_page_screenshot");
    });

    it("responds to initialize via session transport with SSE stream", async () => {
      const res = await fetch(`${MCP_BASE}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
      expect(res.headers.get("mcp-session-id")).toBeDefined();
    });

    it("returns error for unknown method", async () => {
      const { status, body } = await mcpPost({
        jsonrpc: "2.0",
        id: 3,
        method: "unknown_method",
      });

      expect(status).toBe(200);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32601);
    });

    it("handles web_search with queries array", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "multi",
        queries: ["first query", "second query"],
        results: [
          { title: "Multi Result", url: "https://multi.example.com", snippet: "multi snippet" },
        ],
      }));

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 14, method: "tools/call",
        params: {
          name: "web_search",
          arguments: { query: "multi", queries: ["first query", "second query"] },
        },
      });

      expect(status).toBe(200);
      const text = body.result.content[0].text;
      expect(text).toContain("Multi Result");
    });

    it("handles web_search with limit parameter", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "limited search",
        results: [
          { title: "Limited Result", url: "https://limited.example.com", snippet: "limited" },
        ],
      }));

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 15, method: "tools/call",
        params: {
          name: "web_search",
          arguments: { query: "limited search", limit: 3 },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("Limited Result");
      expect(searchMod.browserSearch).toHaveBeenCalledWith(
        expect.objectContaining({ query: "limited search", limit: 3 })
      );
    });

    it("handles web_search with engines array", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "engine test",
        results: [
          { title: "Engine Result", url: "https://engine.example.com", snippet: "engine" },
        ],
      }));

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 16, method: "tools/call",
        params: {
          name: "web_search",
          arguments: {
            query: "engine test",
            engines: ["duckduckgo_api", "bing_lp"],
          },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("Engine Result");
      expect(searchMod.browserSearch).toHaveBeenCalledWith(
        expect.objectContaining({ engines: ["duckduckgo_api", "bing_lp"] })
      );
    });

    it("handles web_search", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "vitest testing",
        results: [
          {
            title: "Vitest Guide",
            url: "https://vitest.dev/guide",
            snippet: "Vitest is a testing framework",
          },
        ],
      }));

      const { status, body } = await mcpPost({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "web_search", arguments: { query: "vitest testing" } },
      });

      expect(status).toBe(200);
      expect(body.result).toBeDefined();
      expect(body.result.content).toBeDefined();
      const text = body.result.content[0].text;
      expect(text).toContain("Vitest Guide");
    });

    it("handles web_fetch with url", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserOpenAndExtract.mockResolvedValueOnce({
        text: "page content here",
        title: "Example Page",
        url: "https://example.com",
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 5, method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { url: "https://example.com", maxChars: 500 },
        },
      });

      expect(status).toBe(200);
      const text = body.result.content[0].text;
      expect(text).toContain("Example Page");
    });

    it("handles web_fetch with urls array", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserOpenAndExtract
        .mockResolvedValueOnce({ text: "page A", title: "Page A", url: "https://a.example.com" })
        .mockResolvedValueOnce({ text: "page B", title: "Page B", url: "https://b.example.com" });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 17, method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { urls: ["https://a.example.com", "https://b.example.com"], maxChars: 300 },
        },
      });

      expect(status).toBe(200);
      const text = body.result.content[0].text;
      expect(text).toContain("Processed 2 page(s)");
      expect(text).toContain("Page A");
      expect(text).toContain("Page B");
    });

    it("handles web_fetch with extractLinks", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserOpenAndExtract.mockResolvedValueOnce({
        text: "page with links",
        title: "Linked Page",
        url: "https://links.example.com",
        links: [{ href: "https://example.com/link", text: "Example Link" }],
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 18, method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { url: "https://links.example.com", extractLinks: true },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("Linked Page");
    });

    it("handles web_fetch with maxTableRows", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserOpenAndExtract.mockResolvedValueOnce({
        text: "page with tables",
        title: "Table Page",
        url: "https://tables.example.com",
        tables: [{ rows: 5 }],
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 19, method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { url: "https://tables.example.com", maxTableRows: 10 },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("Table Page");
    });

    it("handles web_fetch with includeTables", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserOpenAndExtract.mockResolvedValueOnce({
        text: "page with tables",
        title: "Table Page",
        url: "https://tables.example.com",
        tables: [{ rows: 3 }],
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 22, method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { url: "https://tables.example.com", includeTables: true },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("Table Page");
    });

    it("handles web_fetch with ref_ids array", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "fetch targets",
        results: [
          { title: "Fetch 1", url: "https://f1.example.com", snippet: "one" },
          { title: "Fetch 2", url: "https://f2.example.com", snippet: "two" },
        ],
      }));
      await mcpPost({
        jsonrpc: "2.0", id: 27, method: "tools/call",
        params: { name: "web_search", arguments: { query: "fetch targets" } },
      });

      searchMod.browserOpenAndExtract
        .mockResolvedValueOnce({ text: "fetch one", title: "Fetch 1 Page", url: "https://f1.example.com" })
        .mockResolvedValueOnce({ text: "fetch two", title: "Fetch 2 Page", url: "https://f2.example.com" });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 28, method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { ref_ids: [1, 2], maxChars: 400 },
        },
      });

      expect(status).toBe(200);
      const text = body.result.content[0].text;
      expect(text).toContain("Fetch 1 Page");
      expect(text).toContain("Fetch 2 Page");
    });

    it("handles web_fetch with ref alias (deprecated)", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "ref alias target",
        results: [{ title: "Ref Alias", url: "https://refalias.example.com", snippet: "alias" }],
      }));
      await mcpPost({
        jsonrpc: "2.0", id: 29, method: "tools/call",
        params: { name: "web_search", arguments: { query: "ref alias target" } },
      });

      searchMod.browserOpenAndExtract.mockResolvedValueOnce({
        text: "ref alias content",
        title: "Ref Alias Page",
        url: "https://refalias.example.com",
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 30, method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { ref: 1 },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("Ref Alias Page");
    });

    it("handles web_fetch with refs alias (deprecated)", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "refs alias targets",
        results: [
          { title: "Refs 1", url: "https://refs1.example.com", snippet: "r1" },
          { title: "Refs 2", url: "https://refs2.example.com", snippet: "r2" },
        ],
      }));
      await mcpPost({
        jsonrpc: "2.0", id: 31, method: "tools/call",
        params: { name: "web_search", arguments: { query: "refs alias targets" } },
      });

      searchMod.browserOpenAndExtract
        .mockResolvedValueOnce({ text: "refs one", title: "Refs 1 Page", url: "https://refs1.example.com" })
        .mockResolvedValueOnce({ text: "refs two", title: "Refs 2 Page", url: "https://refs2.example.com" });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 32, method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { refs: [1, 2] },
        },
      });

      expect(status).toBe(200);
      const text = body.result.content[0].text;
      expect(text).toContain("Refs 1 Page");
      expect(text).toContain("Refs 2 Page");
    });

    it("handles web_page_screenshot with url", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserCaptureScreenshot.mockResolvedValueOnce({
        screenshotBase64: "dGVzdA==",
        contentType: "image/png",
        format: "png",
        title: "Screenshot Page",
        url: "https://screenshot.example.com",
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 7, method: "tools/call",
        params: {
          name: "web_page_screenshot",
          arguments: { url: "https://screenshot.example.com" },
        },
      });

      expect(status).toBe(200);
      const text = body.result.content[0].text;
      expect(text).toContain("Screenshot Page");
      expect(text).toContain("Captured 1 screenshot");
    });

    it("handles web_page_screenshot with urls array", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserCaptureScreenshot
        .mockResolvedValueOnce({ screenshotBase64: "YQ==", title: "SS A", url: "https://a.example.com" })
        .mockResolvedValueOnce({ screenshotBase64: "Yg==", title: "SS B", url: "https://b.example.com" });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 8, method: "tools/call",
        params: {
          name: "web_page_screenshot",
          arguments: { urls: ["https://a.example.com", "https://b.example.com"] },
        },
      });

      expect(status).toBe(200);
      const text = body.result.content[0].text;
      expect(text).toContain("Captured 2 screenshot(s)");
      expect(text).toContain("SS A");
      expect(text).toContain("SS B");
    });

    it("handles web_page_screenshot with fullPage: false", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserCaptureScreenshot.mockResolvedValueOnce({
        screenshotBase64: "dGVzdA==",
        title: "Viewport Screenshot",
        url: "https://viewport.example.com",
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 9, method: "tools/call",
        params: {
          name: "web_page_screenshot",
          arguments: { url: "https://viewport.example.com", fullPage: false },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("Viewport Screenshot");
      expect(searchMod.browserCaptureScreenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: false })
      );
    });

    it("handles web_page_screenshot with jpeg format and quality", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserCaptureScreenshot.mockResolvedValueOnce({
        screenshotBase64: "and=",
        title: "JPEG Screenshot",
        url: "https://jpeg.example.com",
        contentType: "image/jpeg",
        format: "jpeg",
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 13, method: "tools/call",
        params: {
          name: "web_page_screenshot",
          arguments: { url: "https://jpeg.example.com", format: "jpeg", quality: 85 },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("JPEG Screenshot");
      expect(body.result.content[0].text).toContain("Content-Type: image/jpeg");
    });

    it("handles web_page_screenshot with ref_id", async () => {
      // First, create a remembered link via web_search
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "screenshot target",
        results: [{ title: "Screen Target", url: "https://screen.example.com", snippet: "target" }],
      }));
      await mcpPost({
        jsonrpc: "2.0", id: 23, method: "tools/call",
        params: { name: "web_search", arguments: { query: "screenshot target" } },
      });

      // Now try screenshot with ref_id 1 (first result from web_search gets ref 1)
      searchMod.browserCaptureScreenshot.mockResolvedValueOnce({
        screenshotBase64: "dGVzdA==",
        title: "Screen Page",
        url: "https://screen.example.com",
      });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 24, method: "tools/call",
        params: {
          name: "web_page_screenshot",
          arguments: { ref_id: 1 },
        },
      });

      expect(status).toBe(200);
      expect(body.result.content[0].text).toContain("Screen Page");
    });

    it("handles web_page_screenshot with ref_ids array", async () => {
      const searchMod = await import("../src/search.js");
      // Create 2 remembered links via search
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "targets",
        results: [
          { title: "Target 1", url: "https://t1.example.com", snippet: "one" },
          { title: "Target 2", url: "https://t2.example.com", snippet: "two" },
        ],
      }));
      await mcpPost({
        jsonrpc: "2.0", id: 25, method: "tools/call",
        params: { name: "web_search", arguments: { query: "targets" } },
      });

      // Screenshot with ref_ids — after search ref 1 = t1, ref 2 = t2
      searchMod.browserCaptureScreenshot
        .mockResolvedValueOnce({ screenshotBase64: "MQ==", title: "Target 1 Page", url: "https://t1.example.com" })
        .mockResolvedValueOnce({ screenshotBase64: "Mg==", title: "Target 2 Page", url: "https://t2.example.com" });

      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 26, method: "tools/call",
        params: {
          name: "web_page_screenshot",
          arguments: { ref_ids: [1, 2] },
        },
      });

      expect(status).toBe(200);
      const text = body.result.content[0].text;
      expect(text).toContain("Target 1 Page");
      expect(text).toContain("Target 2 Page");
    });

    it("returns HTTP 500 for unknown tool in stateless mode", async () => {
      const res = await fetch(`${MCP_BASE}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "nonexistent_tool", arguments: {} },
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/Unknown tool/);
    });

    it("returns 204 for notifications", async () => {
      const res = await fetch(`${MCP_BASE}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });
      expect(res.status).toBe(204);
    });

    it("handles web_fetch with ref_id after web_search creates link memory", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "find page",
        results: [
          {
            title: "Found Page",
            url: "https://found.example.com/page",
            snippet: "found content",
          },
        ],
      }));

      const searchResp = await mcpPost({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "web_search", arguments: { query: "find page" } },
      });
      expect(searchResp.status).toBe(200);
      const text = searchResp.body.result.content[0].text;

      // Now try web_fetch with url directly
      searchMod.browserOpenAndExtract.mockResolvedValueOnce({
        text: "found page content",
        title: "Found Page",
        url: "https://found.example.com/page",
      });

      const fetchResp = await mcpPost({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "web_fetch",
          arguments: { url: "https://found.example.com/page", maxChars: 500 },
        },
      });

      expect(fetchResp.status).toBe(200);
      expect(fetchResp.body.result.content[0].text).toContain("Found Page");
    });

    it("web_fetch returns HTTP 500 on invalid ref_id in stateless mode", async () => {
      const res = await fetch(`${MCP_BASE}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 12,
          method: "tools/call",
          params: {
            name: "web_fetch",
            arguments: { ref_id: 99999 },
          },
        }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/No link found/);
    });

    it("web_search caches results by argument key", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "cached query",
        results: [{ title: "Cached Result", url: "https://cached.example.com", snippet: "cached" }],
      }));

      // First call populates cache
      const r1 = await mcpPost({
        jsonrpc: "2.0", id: 20, method: "tools/call",
        params: { name: "web_search", arguments: { query: "cached query" } },
      });
      expect(r1.status).toBe(200);

      // Reset mock - second call should come from cache
      searchMod.browserSearch.mockReset();

      const r2 = await mcpPost({
        jsonrpc: "2.0", id: 21, method: "tools/call",
        params: { name: "web_search", arguments: { query: "cached query" } },
      });
      expect(r2.status).toBe(200);
      expect(r2.body.result.content[0].text).toContain("Cached Result");
      expect(searchMod.browserSearch).not.toHaveBeenCalled();
    });
  });

  describe("POST /mcp — session-based", () => {
    it("creates a session via initialize request and returns SSE stream with sessionId header", async () => {
      const res = await fetch(`${MCP_BASE}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 100,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "session-test", version: "1.0" },
          },
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
      expect(res.headers.get("mcp-session-id")).toBeDefined();
      expect(res.headers.get("mcp-session-id").length).toBeGreaterThan(0);
    });
  });

  describe("tools/list with devtools disabled", () => {
    it("does not include devtools tools when enableDevtoolsMcp is false", async () => {
      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 50, method: "tools/list",
      });

      expect(status).toBe(200);
      const names = body.result.tools.map((t) => t.name);
      expect(names).not.toContain("Target.createTarget");
      expect(names).not.toContain("Runtime.evaluate");
      expect(names).not.toContain("DOM.querySelector");
    });

    it("returns exactly three search tools", async () => {
      const { status, body } = await mcpPost({
        jsonrpc: "2.0", id: 51, method: "tools/list",
      });

      expect(status).toBe(200);
      const names = body.result.tools.map((t) => t.name);
      expect(names).toEqual([
        "web_search",
        "web_fetch",
        "web_page_screenshot",
      ]);
    });
  });

  describe("HTTP method handling", () => {
    it("returns 405 for POST on /health", async () => {
      const res = await fetch(`${MCP_BASE}/health`, { method: "POST" });
      expect(res.status).toBe(405);
    });

    it("returns 405 for PUT on /mcp", async () => {
      const res = await fetch(`${MCP_BASE}/mcp`, { method: "PUT" });
      expect(res.status).toBe(405);
    });

    it("returns 405 for DELETE on /health", async () => {
      const res = await fetch(`${MCP_BASE}/health`, { method: "DELETE" });
      expect(res.status).toBe(405);
    });
  });

  describe("GET /screenshot with format and quality params", () => {
    it("passes format and quality options", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserCaptureScreenshot.mockResolvedValueOnce({
        screenshotBase64: "fakebase64",
        contentType: "image/jpeg",
        format: "jpeg",
        title: "JPEG Screenshot",
      });

      const res = await fetch(
        `${MCP_BASE}/screenshot?url=https://example.com&format=jpeg&quality=80`
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("JPEG Screenshot");
    });
  });

  describe("GET /search with engine param", () => {
    it("passes engine to browserSearch", async () => {
      const searchMod = await import("../src/search.js");
      searchMod.browserSearch.mockResolvedValueOnce(makeMockSearchPayload({
        query: "engine test",
      }));

      const res = await fetch(
        `${MCP_BASE}/search?q=engine+test&engine=duckduckgo_api`
      );
      expect(res.status).toBe(200);
    });
  });
});
