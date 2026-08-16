import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getPostProcessorModels,
  isPostProcessorConfigured,
  getPostProcessorKind,
  runPostProcessor,
  getInFlightCount,
  _resetConcurrencyForTests,
} from "../src/post-processor.js";

afterEach(() => {
  vi.unstubAllGlobals();
  _resetConcurrencyForTests();
});

function makeConfig(overrides = {}) {
  return {
    postProcessorModels: [
      { id: "reader_lm", label: "reader-lm-0.5b", model: "jinaai/reader-lm-0.5b", baseUrl: "http://chat:8000/v1", kind: "chat" },
      { id: "mineru", label: "MinerU-HTML", model: "mineru", kind: "mineru", baseUrl: "http://mineru:8000" },
      { id: "custom_api", label: "Custom API", kind: "api", baseUrl: "http://api:8000", path: "/extract", method: "POST", body: '{"html":"{{input}}"}', outputField: "result.text" },
      { id: "api_text", label: "API text", kind: "api", baseUrl: "http://api:8000", path: "/process", body: '{"content":"{{input}}"}', outputType: "text" },
    ],
    ...overrides,
  };
}

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body, text: async () => JSON.stringify(body) };
}
function okText(body) {
  return { ok: true, status: 200, statusText: "OK", json: async () => { throw new Error("not json"); }, text: async () => body };
}
function errResponse(status, statusText) {
  return { ok: false, status, statusText, json: async () => ({}), text: async () => statusText };
}

describe("getPostProcessorModels", () => {
  it("filters entries to those with id", () => {
    const models = getPostProcessorModels({
      postProcessorModels: [
        { id: "a", model: "m", baseUrl: "u" },
        { id: "b" },
        { noId: true },
        "not-an-entry",
        null,
      ],
    });
    expect(models.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("handles missing/empty config", () => {
    expect(getPostProcessorModels({})).toEqual([]);
    expect(getPostProcessorModels(null)).toEqual([]);
    expect(getPostProcessorModels({ postProcessorModels: [] })).toEqual([]);
  });
});

describe("isPostProcessorConfigured", () => {
  it("matches by id", () => {
    const config = makeConfig();
    expect(isPostProcessorConfigured(config, "reader_lm")).toBe(true);
    expect(isPostProcessorConfigured(config, "mineru")).toBe(true);
    expect(isPostProcessorConfigured(config, "nope")).toBe(false);
    expect(isPostProcessorConfigured(config, "")).toBe(false);
  });
});

describe("getPostProcessorKind", () => {
  it("distinguishes chat, mineru, api", () => {
    const config = makeConfig();
    expect(getPostProcessorKind(config, "reader_lm")).toBe("chat");
    expect(getPostProcessorKind(config, "mineru")).toBe("mineru");
    expect(getPostProcessorKind(config, "custom_api")).toBe("api");
    expect(getPostProcessorKind(config, "unknown")).toBe("chat");
  });
});

describe("runPostProcessor — chat kind", () => {
  it("routes chat-kind to /chat/completions", async () => {
    const fetchMock = vi.fn(async () => okJson({ choices: [{ message: { content: "# Clean markdown" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPostProcessor({
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
      temperature: 0,
    });
  });

  it("truncates long html by maxInputChars (tail cut)", async () => {
    const fetchMock = vi.fn(async () => okJson({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const bigHtml = "a".repeat(100000);
    await runPostProcessor({ html: bigHtml, model: "reader_lm", config: makeConfig() });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(sent.length).toBeLessThanOrEqual(60000);
    expect(sent.endsWith("a")).toBe(true);
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errResponse(500, "Internal Server Error")));
    await expect(
      runPostProcessor({ html: "<p>x</p>", model: "reader_lm", config: makeConfig() })
    ).rejects.toThrow(/chat request failed: 500/);
  });

  it("throws on empty content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson({ choices: [{ message: { content: "" } }] })));
    await expect(
      runPostProcessor({ html: "<p>x</p>", model: "reader_lm", config: makeConfig() })
    ).rejects.toThrow(/empty chat completion/);
  });

  it("throws when model id is not configured", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      runPostProcessor({ html: "<p>x</p>", model: "missing", config: makeConfig() })
    ).rejects.toThrow(/not configured/);
  });

  it("sends text input when html is absent", async () => {
    const fetchMock = vi.fn(async () => okJson({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await runPostProcessor({ text: "plain text input", model: "reader_lm", config: makeConfig() });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content;
    expect(sent).toBe("plain text input");
  });
});

describe("runPostProcessor — mineru kind", () => {
  it("routes mineru-kind to /extract and returns data.text", async () => {
    const fetchMock = vi.fn(async () => okJson({ text: "**Clean** from mineru" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPostProcessor({
      html: "<html><body><h1>Hi</h1></body></html>",
      model: "mineru",
      config: makeConfig(),
    });

    expect(result).toBe("**Clean** from mineru");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://mineru:8000/extract");
    expect(JSON.parse(options.body)).toMatchObject({
      html: "<html><body><h1>Hi</h1></body></html>",
      mode: "auto",
    });
  });

  it("falls back to result.documents[0].text", async () => {
    const fetchMock = vi.fn(async () => okJson({ result: { documents: [{ text: "doc content" }] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPostProcessor({ html: "<p>x</p>", model: "mineru", config: makeConfig() });
    expect(result).toBe("doc content");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errResponse(500, "Internal Server Error")));
    await expect(
      runPostProcessor({ html: "<p>x</p>", model: "mineru", config: makeConfig() })
    ).rejects.toThrow(/mineru request failed: 500/);
  });

  it("throws on truly empty text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson({ text: "" })));
    await expect(
      runPostProcessor({ html: "<p>x</p>", model: "mineru", config: makeConfig() })
    ).rejects.toThrow(/empty mineru response/);
  });

  it("passes whitespace-only text through (no trim)", async () => {
    const fetchMock = vi.fn(async () => okJson({ text: "   " }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runPostProcessor({ html: "<p>x</p>", model: "mineru", config: makeConfig() });
    expect(result).toBe("   ");
  });

  it("tail-caps html over MINERU_MAX_INPUT_CHARS (400k)", async () => {
    const fetchMock = vi.fn(async () => okJson({ text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const bigHtml = "a".repeat(500000);
    await runPostProcessor({ html: bigHtml, model: "mineru", config: makeConfig() });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body).html;
    expect(sent.length).toBeLessThanOrEqual(400000);
    expect(sent.endsWith("a")).toBe(true);
  });
});

describe("runPostProcessor — api kind", () => {
  it("routes api-kind to the configured path and returns outputField", async () => {
    const fetchMock = vi.fn(async () => okJson({ result: { text: "api result" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPostProcessor({
      html: "<p>input html</p>",
      model: "custom_api",
      config: makeConfig(),
    });

    expect(result).toBe("api result");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8000/extract");
    const body = JSON.parse(options.body);
    expect(body.html).toBe("<p>input html</p>");
  });

  it("interpolates bare {{input}} in body template", async () => {
    const fetchMock = vi.fn(async () => okJson({ result: { text: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);

    await runPostProcessor({ text: "hello world", model: "custom_api", config: makeConfig() });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.html).toBe("hello world");
  });

  it("interpolates quoted \"{{input}}\" in body template", async () => {
    const config = makeConfig({
      postProcessorModels: [
        { id: "qp", kind: "api", baseUrl: "http://api:8000", path: "/r", body: '{"content":"{{input}}"}', outputField: "text" },
      ],
    });
    const fetchMock = vi.fn(async () => okJson({ text: "result" }));
    vi.stubGlobal("fetch", fetchMock);

    await runPostProcessor({ text: "test input", model: "qp", config });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.content).toBe("test input");
  });

  it("returns raw text when outputType is text", async () => {
    const fetchMock = vi.fn(async () => okText("raw output string"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPostProcessor({ text: "input", model: "api_text", config: makeConfig() });
    expect(result).toBe("raw output string");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errResponse(502, "Bad Gateway")));
    await expect(
      runPostProcessor({ html: "<p>x</p>", model: "custom_api", config: makeConfig() })
    ).rejects.toThrow(/api request failed: 502/);
  });

  it("throws when outputField is missing from response", async () => {
    const fetchMock = vi.fn(async () => okJson({ wrong: "field" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      runPostProcessor({ html: "<p>x</p>", model: "custom_api", config: makeConfig() })
    ).rejects.toThrow(/outputField "result\.text" not found/);
  });

  it("throws on empty raw text response (outputType text)", async () => {
    const fetchMock = vi.fn(async () => okText("   "));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      runPostProcessor({ text: "input", model: "api_text", config: makeConfig() })
    ).rejects.toThrow(/empty api response/);
  });

  it("uses default body {input:{{input}}} when entry.body is missing", async () => {
    const config = makeConfig({
      postProcessorModels: [
        { id: "nob", kind: "api", baseUrl: "http://api:8000", path: "/p", outputField: "text" },
      ],
    });
    const fetchMock = vi.fn(async () => okJson({ text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await runPostProcessor({ text: "payload", model: "nob", config });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toBe("payload");
  });
});

describe("runPostProcessor — screenshot (chat image)", () => {
  it("routes screenshot to extractWithChatImage (multimodal content array)", async () => {
    const fetchMock = vi.fn(async () => okJson({ choices: [{ message: { content: "page description" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPostProcessor({
      screenshot: "data:image/jpeg;base64,/9j/4AAQ",
      model: "reader_lm",
      config: makeConfig(),
    });

    expect(result).toBe("page description");
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: expect.stringContaining("Extract all readable content") },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/4AAQ" } },
    ]);
  });

  it("uses custom prompt when entry.prompt is set", async () => {
    const config = makeConfig({
      postProcessorModels: [
        { id: "custom_pp", label: "Custom", model: "m", baseUrl: "http://chat:8000/v1", kind: "chat", prompt: "Describe layout" },
      ],
    });
    const fetchMock = vi.fn(async () => okJson({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await runPostProcessor({ screenshot: "data:image/jpeg;base64,abc", model: "custom_pp", config });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content[0].text).toBe("Describe layout");
  });
});

describe("runPostProcessor — concurrency", () => {
  it("limits to 2 concurrent fetches (3rd waits until one finishes)", async () => {
    const order = [];
    let resolve1, resolve2;

    const fetchMock = vi.fn(async () => {
      return new Promise((resolve) => {
        if (!resolve1) {
          order.push("fetch1-start");
          resolve1 = () => { order.push("fetch1-resolve"); resolve(okJson({ choices: [{ message: { content: "1" } }] })); };
        } else if (!resolve2) {
          order.push("fetch2-start");
          resolve2 = () => { order.push("fetch2-resolve"); resolve(okJson({ choices: [{ message: { content: "2" } }] })); };
        } else {
          order.push("fetch3-start");
          resolve(okJson({ choices: [{ message: { content: "3" } }] }));
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const p1 = runPostProcessor({ html: "a", model: "reader_lm", config: makeConfig() });
    const p2 = runPostProcessor({ html: "b", model: "reader_lm", config: makeConfig() });
    const p3 = runPostProcessor({ html: "c", model: "reader_lm", config: makeConfig() });

    // Yield so .then() callbacks run and p1/p2 call fetch (p3 blocks on acquireSlot)
    await new Promise((r) => setImmediate(r));

    // Only 2 fetches started — p3 is waiting
    expect(order).toEqual(["fetch1-start", "fetch2-start"]);

    // Release p1 → p3 unblocks and calls fetch
    resolve1();
    await p1;
    expect(order).toEqual(["fetch1-start", "fetch2-start", "fetch1-resolve", "fetch3-start"]);

    // Release p2 → p3 finishes
    resolve2();
    await p2;
    await p3;

    // All3 completed successfully
    expect(order).toEqual([
      "fetch1-start", "fetch2-start",
      "fetch1-resolve", "fetch3-start",
      "fetch2-resolve",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("runPostProcessor — input validation", () => {
  it("throws when no input is provided", async () => {
    await expect(
      runPostProcessor({ model: "reader_lm", config: makeConfig() })
    ).rejects.toThrow(/exactly one of/);
  });

  it("throws when multiple inputs are provided", async () => {
    await expect(
      runPostProcessor({ html: "<p>a</p>", text: "b", model: "reader_lm", config: makeConfig() })
    ).rejects.toThrow(/exactly one of/);
  });
});
