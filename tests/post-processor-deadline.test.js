import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetConcurrencyForTests,
  getInFlightCount,
  runPostProcessor
} from "../src/post-processor.js";

function makeConfig(timeoutMs = 60000) {
  return {
    postProcessorModels: [{
      id: "reader_lm",
      model: "reader-lm",
      baseUrl: "http://reader.test/v1",
      kind: "chat",
      timeoutMs
    }]
  };
}

function response(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] })
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  _resetConcurrencyForTests();
});

describe("post-processor deadlines", () => {
  it("times out while reading a response body and releases its gate slot", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => {})
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = runPostProcessor({
      html: "<main>content</main>",
      model: "reader_lm",
      config: makeConfig(100)
    });
    const assertion = expect(pending).rejects.toThrow(
      "Post-processor request timed out after 100ms"
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(getInFlightCount()).toBe(0);
  });

  it("removes an aborted queue waiter without starting another request", async () => {
    const resolvers = [];
    const fetchMock = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)));
    vi.stubGlobal("fetch", fetchMock);

    const first = runPostProcessor({ html: "first", model: "reader_lm", config: makeConfig() });
    const second = runPostProcessor({ html: "second", model: "reader_lm", config: makeConfig() });
    const controller = new AbortController();
    const queued = runPostProcessor({
      html: "queued",
      model: "reader_lm",
      config: makeConfig(),
      signal: controller.signal
    });
    const queuedAssertion = expect(queued).rejects.toThrow("queue deadline");

    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getInFlightCount()).toBe(2);

    controller.abort(new Error("queue deadline"));
    await queuedAssertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers[0](response("first result"));
    resolvers[1](response("second result"));
    await Promise.all([first, second]);
    expect(getInFlightCount()).toBe(0);
  });
});
