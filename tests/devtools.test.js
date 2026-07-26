import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/browser.js", () => ({
  getBrowserManager: vi.fn(),
}));

vi.mock("cloakbrowser", () => ({}));
vi.mock("cloakbrowser/puppeteer", () => ({ launch: vi.fn() }));

describe("devtoolsToolDefinitions", () => {
  it("exports an array of tool definitions", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    expect(Array.isArray(devtoolsToolDefinitions)).toBe(true);
  });

  it("contains all expected devtools tools", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    const names = devtoolsToolDefinitions.map((t) => t.name);
    expect(names).toContain("Target.createTarget");
    expect(names).toContain("Target.getTargets");
    expect(names).toContain("Target.closeTarget");
    expect(names).toContain("Page.navigate");
    expect(names).toContain("Runtime.evaluate");
    expect(names).toContain("Runtime.getConsoleMessages");
    expect(names).toContain("DOM.getDocument");
    expect(names).toContain("DOM.querySelector");
    expect(names).toContain("DOM.querySelectorAll");
    expect(names).toContain("DOM.getOuterHTML");
    expect(names).toContain("DOM.scrollIntoViewIfNeeded");
    expect(names).toContain("Input.dispatchMouseEvent");
    expect(names).toContain("Input.insertText");
  });

  it("each tool has name, description, and inputSchema", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    for (const tool of devtoolsToolDefinitions) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("each tool schema has additionalProperties: false", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    for (const tool of devtoolsToolDefinitions) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("Target.createTarget has url property but no required", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    const tool = devtoolsToolDefinitions.find((t) => t.name === "Target.createTarget");
    expect(tool.inputSchema.properties).toHaveProperty("url");
    expect(tool.inputSchema.required).toBeUndefined();
  });

  it("Target.closeTarget requires targetId", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    const tool = devtoolsToolDefinitions.find((t) => t.name === "Target.closeTarget");
    expect(tool.inputSchema.required).toContain("targetId");
  });

  it("Page.navigate requires targetId and url", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    const tool = devtoolsToolDefinitions.find((t) => t.name === "Page.navigate");
    expect(tool.inputSchema.required).toContain("targetId");
    expect(tool.inputSchema.required).toContain("url");
  });

  it("Runtime.evaluate requires targetId and expression", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    const tool = devtoolsToolDefinitions.find((t) => t.name === "Runtime.evaluate");
    expect(tool.inputSchema.required).toContain("targetId");
    expect(tool.inputSchema.required).toContain("expression");
  });

  it("Runtime.getConsoleMessages requires targetId", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    const tool = devtoolsToolDefinitions.find((t) => t.name === "Runtime.getConsoleMessages");
    expect(tool.inputSchema.required).toContain("targetId");
    expect(tool.inputSchema.properties).toHaveProperty("limit");
  });

  it("Input.insertText requires targetId and text", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    const tool = devtoolsToolDefinitions.find((t) => t.name === "Input.insertText");
    expect(tool.inputSchema.required).toContain("targetId");
    expect(tool.inputSchema.required).toContain("text");
  });

  it("DOM.querySelectorAll has limit property", async () => {
    const { devtoolsToolDefinitions } = await import("../src/devtools.js");
    const tool = devtoolsToolDefinitions.find((t) => t.name === "DOM.querySelectorAll");
    expect(tool.inputSchema.properties).toHaveProperty("limit");
    expect(tool.inputSchema.properties).toHaveProperty("selector");
    expect(tool.inputSchema.properties).toHaveProperty("xpath");
  });
});

describe("formatDevtoolsToolResponse", () => {
  it("returns content array with text type", async () => {
    const { formatDevtoolsToolResponse } = await import("../src/devtools.js");
    const result = formatDevtoolsToolResponse("Runtime.evaluate", { value: 42 });
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe("text");
  });

  it("includes tool name and JSON payload", async () => {
    const { formatDevtoolsToolResponse } = await import("../src/devtools.js");
    const result = formatDevtoolsToolResponse("Target.getTargets", { count: 2, targets: [] });
    const text = result.content[0].text;
    expect(text).toContain("Target.getTargets");
    expect(text).toContain('"count"');
    expect(text).toContain("2");
  });

  it("handles empty payload", async () => {
    const { formatDevtoolsToolResponse } = await import("../src/devtools.js");
    const result = formatDevtoolsToolResponse("Target.getTargets", {});
    expect(result.content[0].text).toContain("Target.getTargets");
    expect(result.content[0].text).toContain("{}");
  });
});

describe("handleDevtoolsToolCall", () => {
  let getBrowserManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    getBrowserManager = (await import("../src/browser.js")).getBrowserManager;
  });

  it("rejects unknown tool names", async () => {
    const { handleDevtoolsToolCall } = await import("../src/devtools.js");
    await expect(handleDevtoolsToolCall("Unknown.tool")).rejects.toThrow("Unknown developer browser tool");
  });

  it("routes Target.createTarget to the correct handler", async () => {
    getBrowserManager.mockResolvedValue({
      config: {
        enableDevtoolsMcp: true,
        devtoolsBackend: "chromium",
        defaultBackend: "cloakbrowser",
        navWaitUntil: "domcontentloaded",
        browserOpTimeoutMs: 60000,
      },
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue("about:blank"),
        title: vi.fn().mockResolvedValue(""),
        isClosed: vi.fn().mockReturnValue(false),
        on: vi.fn(),
      }),
    });

    const { handleDevtoolsToolCall } = await import("../src/devtools.js");
    const result = await handleDevtoolsToolCall("Target.createTarget", {});
    expect(result).toHaveProperty("targetId");
    expect(result).toHaveProperty("backend");
    expect(result).toHaveProperty("url");
  });

  it("routes Target.getTargets to the correct handler", async () => {
    getBrowserManager.mockResolvedValue({
      config: { enableDevtoolsMcp: true },
    });

    const { handleDevtoolsToolCall } = await import("../src/devtools.js");
    const result = await handleDevtoolsToolCall("Target.getTargets", {});
    expect(result).toHaveProperty("count");
    expect(result).toHaveProperty("targets");
  });
});

describe("formatDevtoolsToolResponse edge cases", () => {
  it("handles deeply nested objects", async () => {
    const { formatDevtoolsToolResponse } = await import("../src/devtools.js");
    const payload = { a: { b: { c: [1, 2, 3] } } };
    const result = formatDevtoolsToolResponse("Runtime.evaluate", payload);
    expect(result.content[0].text).toContain('"a"');
    expect(result.content[0].text).toContain('"b"');
  });

  it("handles arrays as payload", async () => {
    const { formatDevtoolsToolResponse } = await import("../src/devtools.js");
    const payload = [1, 2, 3];
    const result = formatDevtoolsToolResponse("DOM.querySelectorAll", payload);
    expect(result.content[0].text).toContain("[");
  });
});
