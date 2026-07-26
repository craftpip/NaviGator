import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock("../src/config.js", () => ({
  loadConfig: vi.fn(),
  findLightpandaPath: vi.fn(),
}));

vi.mock("cloakbrowser", () => ({}));
vi.mock("cloakbrowser/puppeteer", () => ({ launch: vi.fn() }));

function makeConfig(overrides = {}) {
  return {
    chromePath: "/usr/bin/chrome",
    chromeUserDataDir: "/data/chrome",
    chromeProfileDir: "Default",
    defaultBackend: "cloakbrowser",
    devtoolsBackend: "cloakbrowser",
    browserOpTimeoutMs: 60000,
    headless: true,
    userAgent: "test-agent",
    navWaitUntil: "domcontentloaded",
    mcpApiPort: 3000,
    mcpApiHost: "http://localhost",
    enableHttpHealth: false,
    enableHttpMcp: false,
    enableStdioMcp: true,
    enableDevtoolsMcp: false,
    searchKeepMinWorkingWindows: 2,
    searchMaxWorkingWindows: 10,
    searchRouteCircuitOpenMs: 300000,
    openPageMaxParallel: 6,
    maxConcurrentPageOps: 30,
    humanTypingDelay: 15,
    prelaunchBrowser: true,
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
  };
}

describe("BrowserManager", () => {
  let BrowserManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../src/browser.js");
    BrowserManager = mod.BrowserManager;
  });

  describe("constructor", () => {
    it("sets config and initializes properties", () => {
      const config = makeConfig();
      const manager = new BrowserManager(config);
      expect(manager.config).toBe(config);
      expect(manager.browser).toBeNull();
      expect(manager.launching).toBeNull();
      expect(manager.tempProfileDir).toBeNull();
      expect(manager.keepAlivePage).toBeNull();
      expect(manager.prelaunchPromise).toBeNull();
      expect(manager.lightpandaProcess).toBeNull();
      expect(manager.lightpandaBrowser).toBeNull();
      expect(manager.lightpandaLaunching).toBeNull();
      expect(manager.cloakbrowserBrowser).toBeNull();
      expect(manager.cloakbrowserLaunching).toBeNull();
      expect(manager.engineWorkingWindows instanceof Map).toBe(true);
      expect(manager.engineWorkingWindows.size).toBe(0);
      expect(manager.pageSlotsInUse).toBe(0);
      expect(Array.isArray(manager.pageSlotWaiters)).toBe(true);
      expect(manager.pageSlotWaiters.length).toBe(0);
    });
  });

  describe("getEnginePool", () => {
    it("creates a new pool for unknown engine", () => {
      const manager = new BrowserManager(makeConfig());
      const pool = manager.getEnginePool("google_cb");
      expect(pool).toHaveProperty("engine", "google_cb");
      expect(pool).toHaveProperty("windows");
      expect(Array.isArray(pool.windows)).toBe(true);
      expect(pool.windows.length).toBe(0);
      expect(pool).toHaveProperty("waiters");
      expect(Array.isArray(pool.waiters)).toBe(true);
      expect(pool.waiters.length).toBe(0);
    });

    it("returns same pool for same engine", () => {
      const manager = new BrowserManager(makeConfig());
      const pool1 = manager.getEnginePool("google_cb");
      const pool2 = manager.getEnginePool("google_cb");
      expect(pool1).toBe(pool2);
    });

    it("normalizes engine key", () => {
      const manager = new BrowserManager(makeConfig());
      const pool1 = manager.getEnginePool("  GOOGLE_CB  ");
      const pool2 = manager.getEnginePool("google_cb");
      expect(pool1).toBe(pool2);
    });

    it("uses 'default' for empty engine", () => {
      const manager = new BrowserManager(makeConfig());
      const pool = manager.getEnginePool("");
      expect(pool.engine).toBe("default");
    });

    it("tracks separate pools for different engines", () => {
      const manager = new BrowserManager(makeConfig());
      const pool1 = manager.getEnginePool("google_cb");
      const pool2 = manager.getEnginePool("bing_lp");
      expect(pool1).not.toBe(pool2);
      expect(manager.engineWorkingWindows.size).toBe(2);
    });
  });

  describe("buildWindowStats", () => {
    it("returns empty stats when no windows exist", () => {
      const manager = new BrowserManager(makeConfig());
      const stats = manager.buildWindowStats();
      expect(stats).toHaveProperty("totalOpen", 0);
      expect(stats).toHaveProperty("totalInUse", 0);
      expect(stats).toHaveProperty("totalPending", 0);
      expect(stats).toHaveProperty("totalWaiters", 0);
      expect(stats).toHaveProperty("byEngine");
      expect(typeof stats.byEngine).toBe("object");
      expect(stats).toHaveProperty("pageSlots");
      expect(stats.pageSlots).toHaveProperty("inUse", 0);
      expect(stats.pageSlots).toHaveProperty("queued", 0);
      expect(stats.pageSlots).toHaveProperty("max", 30);
    });

    it("includes stats for specific engine when scoped", () => {
      const manager = new BrowserManager(makeConfig());
      // Add a window to the pool
      const pool = manager.getEnginePool("google_cb");
      pool.windows.push({
        page: { isClosed: () => false },
        inUse: true,
        pending: false,
        engine: "google_cb",
      });
      const stats = manager.buildWindowStats("google_cb");
      expect(stats.totalOpen).toBe(1);
      expect(stats.totalInUse).toBe(1);
      expect(stats.byEngine["google_cb"].open).toBe(1);
      expect(stats.byEngine["google_cb"].inUse).toBe(1);
    });

    it("prunes closed windows before counting", () => {
      const manager = new BrowserManager(makeConfig());
      const pool = manager.getEnginePool("test");
      pool.windows.push(
        { page: { isClosed: () => true }, inUse: false, pending: false, engine: "test" },
        { page: { isClosed: () => false }, inUse: false, pending: false, engine: "test" }
      );
      const stats = manager.buildWindowStats("test");
      expect(stats.totalOpen).toBe(1);
      expect(stats.byEngine["test"].open).toBe(1);
    });
  });

  describe("pruneClosedWindows", () => {
    it("removes closed windows from pool", () => {
      const manager = new BrowserManager(makeConfig());
      const pool = manager.getEnginePool("test");
      const closedPage = { isClosed: () => true };
      const openPage = { isClosed: () => false };
      pool.windows.push(
        { page: closedPage, inUse: false, pending: false },
        { page: openPage, inUse: false, pending: false }
      );
      manager.pruneClosedWindows(pool);
      expect(pool.windows.length).toBe(1);
      expect(pool.windows[0].page).toBe(openPage);
    });

    it("keeps pending entries even without page", () => {
      const manager = new BrowserManager(makeConfig());
      const pool = manager.getEnginePool("test");
      pool.windows.push(
        { page: null, inUse: false, pending: true },
        { page: { isClosed: () => false }, inUse: false, pending: false }
      );
      manager.pruneClosedWindows(pool);
      expect(pool.windows.length).toBe(2);
    });

    it("handles empty pool gracefully", () => {
      const manager = new BrowserManager(makeConfig());
      const pool = manager.getEnginePool("test");
      manager.pruneClosedWindows(pool);
      expect(pool.windows.length).toBe(0);
    });
  });

  describe("trimIdleWindows", () => {
    it("removes idle windows above keepCount", async () => {
      const manager = new BrowserManager(makeConfig({ searchKeepMinWorkingWindows: 1 }));
      const pool = manager.getEnginePool("test");
      const closeFn = vi.fn();
      pool.windows.push(
        { page: { isClosed: () => false, close: closeFn }, inUse: false, pending: false },
        { page: { isClosed: () => false, close: closeFn }, inUse: false, pending: false },
        { page: { isClosed: () => false, close: closeFn }, inUse: false, pending: false }
      );
      await manager.trimIdleWindows(pool, 1);
      expect(pool.windows.length).toBe(1);
      expect(closeFn).toHaveBeenCalledTimes(2);
    });

    it("does not remove in-use windows", async () => {
      const manager = new BrowserManager(makeConfig({ searchKeepMinWorkingWindows: 1 }));
      const pool = manager.getEnginePool("test");
      const closeFn = vi.fn();
      pool.windows.push(
        { page: { isClosed: () => false, close: closeFn }, inUse: true, pending: false },
        { page: { isClosed: () => false, close: closeFn }, inUse: false, pending: false }
      );
      await manager.trimIdleWindows(pool, 1);
      expect(pool.windows.length).toBe(1);
      expect(pool.windows[0].inUse).toBe(true);
    });

    it("handles empty pool", async () => {
      const manager = new BrowserManager(makeConfig());
      const pool = manager.getEnginePool("test");
      await manager.trimIdleWindows(pool, 5);
      expect(pool.windows.length).toBe(0);
    });
  });

  describe("buildLaunchArgs", () => {
    it("returns array of Chrome arguments", () => {
      const manager = new BrowserManager(makeConfig());
      const args = manager.buildLaunchArgs("Default");
      expect(Array.isArray(args)).toBe(true);
      expect(args).toContain("--no-sandbox");
      expect(args).toContain("--disable-setuid-sandbox");
      expect(args).toContain("--disable-dev-shm-usage");
      expect(args).toContain("--disable-blink-features=AutomationControlled");
      expect(args).toContain("--disable-gpu");
      expect(args).toContain("--no-first-run");
      expect(args).toContain("--no-default-browser-check");
      expect(args).toContain("--window-size=1920,1080");
    });

    it("includes profile directory argument", () => {
      const manager = new BrowserManager(makeConfig());
      const args = manager.buildLaunchArgs("Profile2");
      expect(args).toContain("--profile-directory=Profile2");
    });
  });

  describe("_poolEngine", () => {
    it("returns exact engine for cloakbrowser routes", () => {
      const manager = new BrowserManager(makeConfig({ defaultBackend: "cloakbrowser" }));
      expect(manager._poolEngine("duckduckgo_cb")).toBe("duckduckgo_cb");
      expect(manager._poolEngine("google_cb")).toBe("google_cb");
      expect(manager._poolEngine("bing_cb")).toBe("bing_cb");
    });

    it("returns exact engine for chromium routes", () => {
      const manager = new BrowserManager(makeConfig({ defaultBackend: "chromium" }));
      expect(manager._poolEngine("duckduckgo_ch")).toBe("duckduckgo_ch");
      expect(manager._poolEngine("google_ch")).toBe("google_ch");
    });

    it("returns _shared for lightpanda routes", () => {
      const manager = new BrowserManager(makeConfig());
      expect(manager._poolEngine("bing_lp")).toBe("_shared");
      expect(manager._poolEngine("google_lp")).toBe("_shared");
      expect(manager._poolEngine("mojeek_lp")).toBe("_shared");
    });

    it("returns engine key for cloakbrowser default and known engines", () => {
      const manager = new BrowserManager(makeConfig({ defaultBackend: "cloakbrowser" }));
      // non-listed engine should use the engine key via the defaultBackend check
      const result = manager._poolEngine("some_engine");
      expect(result).toBe("some_engine");
    });

    it("returns _shared for lightpanda default", () => {
      const manager = new BrowserManager(makeConfig({ defaultBackend: "lightpanda" }));
      expect(manager._poolEngine("some_engine")).toBe("_shared");
    });
  });

  describe("_poolMaxWindows", () => {
    it("returns 1 for shared pool with non-chromium backend", () => {
      const manager = new BrowserManager(makeConfig({ defaultBackend: "cloakbrowser", searchMaxWorkingWindows: 10 }));
      expect(manager._poolMaxWindows("_shared")).toBe(1);
    });

    it("returns searchMaxWorkingWindows for non-shared pool", () => {
      const manager = new BrowserManager(makeConfig({ searchMaxWorkingWindows: 10 }));
      expect(manager._poolMaxWindows("google_cb")).toBe(10);
    });

    it("returns searchMaxWorkingWindows for shared with chromium", () => {
      const manager = new BrowserManager(makeConfig({ defaultBackend: "chromium", searchMaxWorkingWindows: 10 }));
      expect(manager._poolMaxWindows("_shared")).toBe(10);
    });
  });

  describe("page slot management", () => {
    it("acquirePageSlot increments when under max", async () => {
      const manager = new BrowserManager(makeConfig({ maxConcurrentPageOps: 5 }));
      await manager.acquirePageSlot();
      expect(manager.pageSlotsInUse).toBe(1);
    });

    it("releasePageSlot decrements and wakes waiters", () => {
      const manager = new BrowserManager(makeConfig());
      manager.pageSlotsInUse = 3;
      const waiter = vi.fn();
      manager.pageSlotWaiters.push(waiter);
      manager.releasePageSlot();
      expect(manager.pageSlotsInUse).toBe(2);
      expect(waiter).toHaveBeenCalled();
    });

    it("acquirePageSlot queues when at max", async () => {
      const manager = new BrowserManager(makeConfig({ maxConcurrentPageOps: 1 }));
      await manager.acquirePageSlot();
      expect(manager.pageSlotsInUse).toBe(1);

      // Second acquire should wait
      const acquirePromise = manager.acquirePageSlot();
      expect(manager.pageSlotWaiters.length).toBe(1);

      // Release to unblock
      manager.releasePageSlot();
      await acquirePromise;
      expect(manager.pageSlotsInUse).toBe(1);
    });

    it("withPageSlot wraps task with acquire/release", async () => {
      const manager = new BrowserManager(makeConfig());
      const result = await manager.withPageSlot(() => "task-result");
      expect(result).toBe("task-result");
      expect(manager.pageSlotsInUse).toBe(0);
    });

    it("withPageSlot releases slot even on task failure", async () => {
      const manager = new BrowserManager(makeConfig());
      await expect(
        manager.withPageSlot(() => Promise.reject(new Error("task failed")))
      ).rejects.toThrow("task failed");
      expect(manager.pageSlotsInUse).toBe(0);
    });

    it("releasePageSlot does not go negative", () => {
      const manager = new BrowserManager(makeConfig());
      manager.releasePageSlot();
      expect(manager.pageSlotsInUse).toBe(0);
    });
  });

  describe("getHealth", () => {
    it("returns health object with correct structure", async () => {
      const manager = new BrowserManager(makeConfig());
      const health = await manager.getHealth();
      expect(health).toHaveProperty("ok", true);
      expect(health).toHaveProperty("backend", "cloakbrowser");
      expect(health).toHaveProperty("browserConnected", false);
      expect(health).toHaveProperty("lightpandaConnected", false);
      expect(health).toHaveProperty("cloakbrowserConnected", false);
      expect(health).toHaveProperty("headless", true);
      expect(health).toHaveProperty("enableDevtoolsMcp", false);
      expect(health).toHaveProperty("userDataDir", "/data/chrome");
      expect(health).toHaveProperty("profileDir", "Default");
      expect(health).toHaveProperty("searchWindows");
      expect(health.searchWindows).toHaveProperty("total", 0);
      expect(health.searchWindows).toHaveProperty("byEngine");
      expect(typeof health.searchWindows.byEngine).toBe("object");
      expect(health).toHaveProperty("pageLimiter");
      expect(health.pageLimiter).toHaveProperty("inUse", 0);
      expect(health.pageLimiter).toHaveProperty("queued", 0);
      expect(health.pageLimiter).toHaveProperty("maxConcurrentPageOps", 30);
    });

    it("includes pool stats per engine", async () => {
      const manager = new BrowserManager(makeConfig());
      const pool = manager.getEnginePool("google_cb");
      pool.windows.push({
        page: { isClosed: () => false },
        inUse: true,
        pending: false,
        persistent: true,
        engine: "google_cb",
      });
      const health = await manager.getHealth();
      expect(health.searchWindows.total).toBe(1);
      expect(health.searchWindows.byEngine["google_cb"]).toBeDefined();
      expect(health.searchWindows.byEngine["google_cb"].total).toBe(1);
      expect(health.searchWindows.byEngine["google_cb"].inUse).toBe(1);
    });
  });

  describe("getBrowserManager singleton", () => {
    it("returns a BrowserManager instance", async () => {
      const { loadConfig } = await import("../src/config.js");
      loadConfig.mockResolvedValue(makeConfig());

      const { getBrowserManager } = await import("../src/browser.js");
      vi.resetModules();
      const manager = await getBrowserManager();
      expect(manager instanceof BrowserManager).toBe(true);
    });

    it("caches the promise result", async () => {
      const { loadConfig } = await import("../src/config.js");
      loadConfig.mockResolvedValue(makeConfig());

      const { getBrowserManager } = await import("../src/browser.js");
      const m1 = await getBrowserManager();
      const m2 = await getBrowserManager();
      expect(m1).toBe(m2);
    });
  });
});
