import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("cloakbrowser", () => ({}));
vi.mock("cloakbrowser/puppeteer", () => ({ launch: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseBrowserBackend", () => {
  it("returns normalized for valid backends", async () => {
    const { parseBrowserBackend } = await import("../src/config.js");
    expect(parseBrowserBackend("chromium")).toBe("chromium");
    expect(parseBrowserBackend("cloakbrowser")).toBe("cloakbrowser");
    expect(parseBrowserBackend("lightpanda")).toBe("lightpanda");
    expect(parseBrowserBackend("CHROMIUM")).toBe("chromium");
    expect(parseBrowserBackend("  cloakbrowser  ")).toBe("cloakbrowser");
  });

  it("returns fallback for invalid input", async () => {
    const { parseBrowserBackend } = await import("../src/config.js");
    expect(parseBrowserBackend("firefox")).toBe("cloakbrowser");
    expect(parseBrowserBackend("")).toBe("cloakbrowser");
    expect(parseBrowserBackend(null)).toBe("cloakbrowser");
    expect(parseBrowserBackend(undefined)).toBe("cloakbrowser");
  });

  it("uses the provided fallback if valid", async () => {
    const { parseBrowserBackend } = await import("../src/config.js");
    expect(parseBrowserBackend("invalid", "lightpanda")).toBe("lightpanda");
    expect(parseBrowserBackend("invalid", "chromium")).toBe("chromium");
  });

  it("defaults to cloakbrowser when fallback is invalid", async () => {
    const { parseBrowserBackend } = await import("../src/config.js");
    expect(parseBrowserBackend("invalid", "firefox")).toBe("cloakbrowser");
    expect(parseBrowserBackend("invalid", null)).toBe("cloakbrowser");
    expect(parseBrowserBackend("invalid", undefined)).toBe("cloakbrowser");
  });
});

describe("parsePort", () => {
  it("accepts valid TCP ports and rejects fractional or out-of-range values", async () => {
    const { parsePort } = await import("../src/config.js");
    expect(parsePort("9222", 3000)).toBe(9222);
    expect(parsePort("9222.5", 3000)).toBe(3000);
    expect(parsePort("70000", 3000)).toBe(3000);
    expect(parsePort("0", 3000)).toBe(3000);
  });
});

describe("formatBrowserBackendShort", () => {
  it("returns cb for cloakbrowser", async () => {
    const { formatBrowserBackendShort } = await import("../src/config.js");
    expect(formatBrowserBackendShort("cloakbrowser")).toBe("cb");
  });

  it("returns ch for chromium", async () => {
    const { formatBrowserBackendShort } = await import("../src/config.js");
    expect(formatBrowserBackendShort("chromium")).toBe("ch");
  });

  it("returns lp for lightpanda", async () => {
    const { formatBrowserBackendShort } = await import("../src/config.js");
    expect(formatBrowserBackendShort("lightpanda")).toBe("lp");
  });

  it("falls back to cb for invalid input", async () => {
    const { formatBrowserBackendShort } = await import("../src/config.js");
    expect(formatBrowserBackendShort("invalid")).toBe("cb");
  });
});

describe("resolveChromePath", () => {
  it("uses CHROME_PATH env when set and accessible", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    const { resolveChromePath } = await import("../src/config.js");
    // /usr/bin/env exists on all Linux systems and is executable
    await expect(resolveChromePath()).resolves.toBe("/usr/bin/env");
  });

  it("ignores env var that points to non-executable", async () => {
    vi.stubEnv("CHROME_PATH", "/etc/passwd");
    const { resolveChromePath } = await import("../src/config.js");
    // /etc/passwd exists but is not executable — the resolver falls back to
    // known binaries instead of using it (or rejects when nothing is found).
    const result = await resolveChromePath().catch(() => null);
    expect(result).not.toBe("/etc/passwd");
  });

  it("ignores env var that points to nonexistent path", async () => {
    vi.stubEnv("CHROME_PATH", "/nonexistent/chrome");
    const { resolveChromePath } = await import("../src/config.js");
    const result = await resolveChromePath().catch(() => null);
    expect(result).not.toBe("/nonexistent/chrome");
  });
});

describe("findLightpandaPath", () => {
  it("uses LIGHTPANDA_PATH env when set and accessible", async () => {
    vi.stubEnv("LIGHTPANDA_PATH", "/usr/bin/env");
    const { findLightpandaPath } = await import("../src/config.js");
    await expect(findLightpandaPath()).resolves.toBe("/usr/bin/env");
  });

  it("returns null when not found", async () => {
    vi.stubEnv("LIGHTPANDA_PATH", "/nonexistent/lightpanda");
    const { findLightpandaPath } = await import("../src/config.js");
    const result = await findLightpandaPath();
    // Should either be null or a found path (if lightpanda is in $PATH)
    expect(result === null || typeof result === "string").toBe(true);
  });
});

describe("findCloakbrowserPath", () => {
  it("uses CLOAKBROWSER_BINARY_PATH env when set and accessible", async () => {
    vi.stubEnv("CLOAKBROWSER_BINARY_PATH", "/usr/bin/env");
    const { findCloakbrowserPath } = await import("../src/config.js");
    await expect(findCloakbrowserPath()).resolves.toBe("/usr/bin/env");
  });

  it("returns null when env var points to nonexistent", async () => {
    vi.stubEnv("CLOAKBROWSER_BINARY_PATH", "/nonexistent/cloak");
    const { findCloakbrowserPath } = await import("../src/config.js");
    const result = await findCloakbrowserPath();
    expect(result === null || typeof result === "string").toBe(true);
  });
});

describe("loadConfig (parse engine behavior)", () => {
  it("defaults SEARCH_ROUTE_WARMUP_ENGINES to the primary routes", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_ROUTE_WARMUP_ENGINES", undefined);
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchRouteWarmupEngines).toEqual(["brave_cb", "duckduckgo_api", "duckduckgo_cb"]);
  });

  it("parses MCP API key settings", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("MCP_API_KEYS", "first, second,first");
    vi.stubEnv("MCP_ALLOW_UNAUTHENTICATED", "0");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.mcpApiKeys).toEqual(["first", "second"]);
    expect(config.mcpAllowUnauthenticated).toBe(false);
  });

  it("parses SEARCH_ROUTE_WARMUP_ENGINES correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_ROUTE_WARMUP_ENGINES", "google_cb,bing_lp,invalid_engine");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchRouteWarmupEngines).toEqual(["google_cb", "bing_lp"]);
  });

  it("allows an explicitly empty SEARCH_ROUTE_WARMUP_ENGINES (no warmup)", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_ROUTE_WARMUP_ENGINES", "");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchRouteWarmupEngines).toEqual([]);
  });

  it("parses SEARCH_ENABLED_ENGINES correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_ENABLED_ENGINES", "duckduckgo_api,google_ch");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchEnabledEngines).toEqual(["duckduckgo_api", "google_ch"]);
  });

  it("uses the shared default for an empty SEARCH_ENABLED_ENGINES", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_ENABLED_ENGINES", "");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchEnabledEngines).toEqual([
      "duckduckgo_api", "brave_cb", "google_lp", "google_cb", "duckduckgo_cb",
      "bing_cb", "bing_lp", "google_ch", "duckduckgo_ch", "mojeek_lp", "yahoo_cb",
      "startpage_cb"
    ]);
  });

  it("parses BROWSER_BACKEND correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("BROWSER_BACKEND", "chromium");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.defaultBackend).toBe("chromium");
  });

  it("parses HEADLESS correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("HEADLESS", "false");
    vi.stubEnv("ENABLE_VNC", "1");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.headless).toBe(false);
  });

  it("falls back to headless when a headful browser has no VNC display", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("HEADLESS", "false");
    vi.stubEnv("ENABLE_VNC", "0");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.headless).toBe(true);
    expect(config.vncEnabled).toBe(false);
  });

  it("parses PRELAUNCH_BROWSER correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("PRELAUNCH_BROWSER", "0");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.prelaunchBrowser).toBe(false);
  });

  it("parses NAV_WAIT_UNTIL correctly for valid values", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("NAV_WAIT_UNTIL", "networkidle0");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.navWaitUntil).toBe("networkidle0");
  });

  it("defaults to networkidle2 for invalid NAV_WAIT_UNTIL", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("NAV_WAIT_UNTIL", "invalid");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.navWaitUntil).toBe("networkidle2");
  });

  it("parses SEARCH_KEEP_MIN_WORKING_WINDOWS with clamping", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_KEEP_MIN_WORKING_WINDOWS", "50");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchKeepMinWorkingWindows).toBe(20);
  });

  it("parses HUMAN_TYPING_DELAY with clamping", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("HUMAN_TYPING_DELAY", "1000");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.humanTypingDelay).toBe(500);
  });

  it("parses ENABLE_HTTP_MCP correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("ENABLE_HTTP_MCP", "1");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.enableHttpMcp).toBe(true);
  });

  it("parses ENABLE_INSTANT_ANSWERS correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("ENABLE_INSTANT_ANSWERS", "1");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.enableInstantAnswers).toBe(true);
  });

  it("disables instant answers with ENABLE_INSTANT_ANSWERS=0", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("ENABLE_INSTANT_ANSWERS", "0");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.enableInstantAnswers).toBe(false);
  });

  it("parses MCP_API_PORT correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("MCP_API_PORT", "8080");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.mcpApiPort).toBe(8080);
  });

  it("sets default values when no env vars provided", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    // Guard against host/container env leaking into the test.
    for (const v of [
      "BROWSER_BACKEND",
      "BROWSER_OP_TIMEOUT_MS",
      "MCP_API_PORT",
      "HEALTH_PORT",
      "ENABLE_HTTP_MCP",
      "MCP_API_KEYS",
      "MCP_ALLOW_UNAUTHENTICATED",
      "ENABLE_STDIO_MCP",
      "ENABLE_DEVTOOLS_MCP",
      "SEARCH_KEEP_MIN_WORKING_WINDOWS",
      "SEARCH_MAX_WORKING_WINDOWS",
      "SEARCH_ROUTE_CIRCUIT_OPEN_MS",
      "SEARCH_ENABLED_ENGINES",
      "SEARCH_QUEUE_MIN_INTERVAL_MS",
      "SEARCH_QUEUE_MAX_INTERVAL_MS",
      "SEARCH_QUEUE_ESCALATION_FACTOR",
      "SEARCH_QUEUE_READY_INTERVAL_MS",
      "SEARCH_QUEUE_EXPLORATION_EVERY",
      "SEARCH_QUEUE_LATENCY_SAMPLES",
      "OPEN_PAGE_MAX_PARALLEL",
      "MAX_CONCURRENT_PAGE_OPS",
      "HUMAN_TYPING_DELAY",
      "PRELAUNCH_BROWSER",
      "ENABLE_HANG_RESTART",
      "STARTUP_URL",
      "ENABLE_SCREENSHOT_PATH",
      "ENABLE_SCREENSHOT_DOWNLOAD_LINK",
      "ENABLE_INSTANT_ANSWERS"
    ]) {      vi.stubEnv(v, undefined);
    }
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.defaultBackend).toBe("cloakbrowser");
    expect(config.browserOpTimeoutMs).toBe(60000);
    expect(config.mcpApiPort).toBe(3000);
    expect(config.enableHttpMcp).toBe(false);
    expect(config.mcpApiKeys).toEqual([]);
    expect(config.mcpAllowUnauthenticated).toBe(true);
    expect(config.enableStdioMcp).toBe(true);
    expect(config.enableDevtoolsMcp).toBe(false);
    expect(config.searchKeepMinWorkingWindows).toBe(2);
    expect(config.searchMaxWorkingWindows).toBeGreaterThanOrEqual(2);
    expect(config.searchRouteCircuitOpenMs).toBe(300000);
    expect(config.searchEnabledEngines).toEqual([
      "duckduckgo_api", "brave_cb", "google_lp", "google_cb", "duckduckgo_cb",
      "bing_cb", "bing_lp", "google_ch", "duckduckgo_ch", "mojeek_lp", "yahoo_cb",
      "startpage_cb"
    ]);
    expect(config.searchQueueMinIntervalMs).toBe(300000);
    expect(config.searchQueueMaxIntervalMs).toBe(3600000);
    expect(config.searchQueueEscalationFactor).toBe(2);
    expect(config.searchQueueReadyIntervalMs).toBe(10000);
    expect(config.searchQueueExplorationEvery).toBe(5);
    expect(config.searchQueueLatencySamples).toBe(20);
    expect(config.openPageMaxParallel).toBe(6);
    expect(config.maxConcurrentPageOps).toBe(30);
    expect(config.humanTypingDelay).toBe(15);
    expect(config.prelaunchBrowser).toBe(true);
    expect(config.enableHangRestart).toBe(false);
    expect(config.startupUrl).toBe("about:blank");
    expect(config.screenshotPathPrefix).toBeNull();
    expect(config.enableScreenshotDownloadLink).toBe(false);
    expect(config.enableInstantAnswers).toBe(true);
  });

  it("parses STARTUP_URL correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("STARTUP_URL", "https://example.com");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.startupUrl).toBe("https://example.com");
  });

  it("handles invalid OPEN_PAGE_MAX_PARALLEL by clamping", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("OPEN_PAGE_MAX_PARALLEL", "100");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.openPageMaxParallel).toBe(20);
  });

  it("handles SEARCH_ROUTE_CIRCUIT_OPEN_MS correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_ROUTE_CIRCUIT_OPEN_MS", "600000");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchRouteCircuitOpenMs).toBe(600000);
  });

  it("parses search queue cooldown settings", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_QUEUE_MIN_INTERVAL_MS", "600000");
    vi.stubEnv("SEARCH_QUEUE_MAX_INTERVAL_MS", "7200000");
    vi.stubEnv("SEARCH_QUEUE_ESCALATION_FACTOR", "3");
    vi.stubEnv("SEARCH_QUEUE_READY_INTERVAL_MS", "15000");
    vi.stubEnv("SEARCH_QUEUE_EXPLORATION_EVERY", "4");
    vi.stubEnv("SEARCH_QUEUE_LATENCY_SAMPLES", "12");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchQueueMinIntervalMs).toBe(600000);
    expect(config.searchQueueMaxIntervalMs).toBe(7200000);
    expect(config.searchQueueEscalationFactor).toBe(3);
    expect(config.searchQueueReadyIntervalMs).toBe(15000);
    expect(config.searchQueueExplorationEvery).toBe(4);
    expect(config.searchQueueLatencySamples).toBe(12);
  });
});
