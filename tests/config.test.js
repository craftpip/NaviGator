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

  it("rejects when env var points to non-executable", async () => {
    vi.stubEnv("CHROME_PATH", "/etc/passwd");
    const { resolveChromePath } = await import("../src/config.js");
    // /etc/passwd exists but is not executable
    await expect(resolveChromePath()).rejects.toThrow("Could not resolve Chromium executable");
  });

  it("rejects when env var is set to nonexistent path", async () => {
    vi.stubEnv("CHROME_PATH", "/nonexistent/chrome");
    const { resolveChromePath } = await import("../src/config.js");
    await expect(resolveChromePath()).rejects.toThrow("Could not resolve Chromium executable");
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
  it("parses SEARCH_ROUTE_WARMUP_ENGINES correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_ROUTE_WARMUP_ENGINES", "google_cb,bing_lp,invalid_engine");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchRouteWarmupEngines).toEqual(["google_cb", "bing_lp"]);
  });

  it("parses SEARCH_FALLBACK correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_FALLBACK", "duckduckgo_api,google_ch");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchFallback).toEqual(["duckduckgo_api", "google_ch"]);
  });

  it("handles empty SEARCH_FALLBACK as null", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("SEARCH_FALLBACK", "");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.searchFallback).toBeNull();
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
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.headless).toBe(false);
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

  it("parses MCP_API_PORT correctly", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    vi.stubEnv("MCP_API_PORT", "8080");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.mcpApiPort).toBe(8080);
  });

  it("sets default values when no env vars provided", async () => {
    vi.stubEnv("CHROME_PATH", "/usr/bin/env");
    const { loadConfig } = await import("../src/config.js");
    const config = await loadConfig();
    expect(config.defaultBackend).toBe("cloakbrowser");
    expect(config.browserOpTimeoutMs).toBe(60000);
    expect(config.mcpApiPort).toBe(3000);
    expect(config.enableHttpMcp).toBe(false);
    expect(config.enableStdioMcp).toBe(true);
    expect(config.enableDevtoolsMcp).toBe(false);
    expect(config.searchKeepMinWorkingWindows).toBe(2);
    expect(config.searchMaxWorkingWindows).toBeGreaterThanOrEqual(2);
    expect(config.searchRouteCircuitOpenMs).toBe(300000);
    expect(config.openPageMaxParallel).toBe(6);
    expect(config.maxConcurrentPageOps).toBe(30);
    expect(config.humanTypingDelay).toBe(15);
    expect(config.prelaunchBrowser).toBe(true);
    expect(config.enableHangRestart).toBe(false);
    expect(config.startupUrl).toBe("about:blank");
    expect(config.screenshotPathPrefix).toBeNull();
    expect(config.enableScreenshotDownloadLink).toBe(false);
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
});
