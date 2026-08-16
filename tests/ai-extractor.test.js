import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getAiExtractorModels,
  isAiExtractorConfigured,
  getAiExtractorKind,
  extractHtmlWithAiModel,
} from "../src/ai-extractor.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeConfig(overrides = {}) {
  return {
    aiExtractorModels: [
      { id: "reader_lm", label: "reader-lm-0.5b", model: "jinaai/reader-lm-0.5b", baseUrl: "http://chat:8000/v1", kind: "chat" },
      { id: "mineru", label: "MinerU-HTML", model: "mineru", kind: "mineru", baseUrl: "http://mineru:8000" },
    ],
    aiExtractorTimeoutMs: 5000,
    aiExtractorMaxInputChars: 60000,
    aiExtractorMaxTokens: 8192,
    ...overrides,
  };
}

function okResponse(body) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

describe("getAiExtractorModels / getAiExtractorKind / isAiExtractorConfigured", () => {
  it("filters entries to those with id + model + baseUrl", () => {
    const config = {
      aiExtractorModels: [
        { id: "a", model: "m", baseUrl: "u" },
        { id: "b", model: "m" },
        { id: "c", baseUrl: "u" },
        "not-an-entry",
        null,
      ],
    };
    const models = getAiExtractorModels(config);
    expect(models.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("handles missing/empty config", () => {
    expect(getAiExtractorModels({})).toEqual([]);
    expect(getAiExtractorModels(null)).toEqual([]);
    expect(getAiExtractorModels({ aiExtractorModels: [] })).toEqual([]);
  });

  it("isAiExtractorConfigured matches by id", () => {
    const config = makeConfig();
    expect(isAiExtractorConfigured(config, "mineru")).toBe(true);
    expect(isAiExtractorConfigured(config, "reader_lm")).toBe(true);
    expect(isAiExtractorConfigured(config, "nope")).toBe(false);
    expect(isAiExtractorConfigured(config, "")).toBe(false);
  });

  it("getAiExtractorKind distinguishes chat vs mineru", () => {
    const config = makeConfig();
    expect(getAiExtractorKind(config, "mineru")).toBe("mineru");
    expect(getAiExtractorKind(config, "reader_lm")).toBe("chat");
    expect(getAiExtractorKind(config, "unknown")).toBe("chat");
  });
});

describe("extractHtmlWithAiModel — dispatch", () => {
  it("routes chat-kind entries to /chat/completions", async () => {
    const fetchMock = vi.fn(async () =>
      okResponse({ choices: [{ message: { content: "# Clean markdown" } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractHtmlWithAiModel({
      html: "<html><body><h1>Hi</h1></body></html>",
      model: "reader_lm",
      config: makeConfig(),
    });

    expect(result).toBe("# Clean markdown");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://chat:8000/v1/chat/completions");
    expect(JSON.parse(options.body)).toMatchObject({
      model: "jinaai/reader-lm-0.5b",
      messages: [{ role: "user", content: "<html><body><h1>Hi</h1></body></html>" }],
    });
  });

  it("routes mineru-kind entries to /extract and returns data.text", async () => {
    const fetchMock = vi.fn(async () => okResponse({ text: "**Clean** markdown from mineru" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractHtmlWithAiModel({
      html: "<html><body><h1>Hi</h1></body></html>",
      model: "mineru",
      config: makeConfig(),
    });

    expect(result).toBe("**Clean** markdown from mineru");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://mineru:8000/extract");
    expect(JSON.parse(options.body)).toEqual({ html: "<html><body><h1>Hi</h1></body></html>" });
  });

  it("throws when the model id is not configured", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      extractHtmlWithAiModel({ html: "<p>x</p>", model: "missing", config: makeConfig() })
    ).rejects.toThrow(/not configured/);
  });
});

describe("extractHtmlWithAiModel — failure paths", () => {
  it("throws on non-ok mineru response (caller falls back to html_to_markdown)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, statusText: "Internal Server Error" }))
    );
    await expect(
      extractHtmlWithAiModel({ html: "<p>x</p>", model: "mineru", config: makeConfig() })
    ).rejects.toThrow(/MinerU extractor HTTP 500/);
  });

  it("throws when mineru returns empty content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ text: "   " })));
    await expect(
      extractHtmlWithAiModel({ html: "<p>x</p>", model: "mineru", config: makeConfig() })
    ).rejects.toThrow(/empty content/);
  });

  it("tail-cuts pathological HTML over the mineru safety cap", async () => {
    const fetchMock = vi.fn(async () => okResponse({ text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const bigHtml = "a".repeat(500000);
    await extractHtmlWithAiModel({ html: bigHtml, model: "mineru", config: makeConfig() });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body).html;
    expect(sent.length).toBeLessThanOrEqual(400000);
    expect(sent.endsWith("a")).toBe(true);
  });
});
