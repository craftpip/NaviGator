import { describe, it, expect, vi, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { FORMAT, extract } from "../src/extractors/trafilatura.js";
import { extractTextFromHtml } from "../src/extractors/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeDom(html) {
  return new JSDOM(html).window.document;
}

function makeContext(overrides = {}) {
  return {
    url: "https://example.com/article",
    maxChars: 50000,
    fallbackTitle: "Fallback",
    ...overrides,
  };
}

describe("trafilatura extractor", () => {
  it("exports the trafilatura_to_markdown format id", () => {
    expect(FORMAT).toBe("trafilatura_to_markdown");
  });

  it("extracts article HTML to markdown", async () => {
    const doc = makeDom(`<!DOCTYPE html>
<html>
  <head><title>Test Article</title></head>
  <body>
    <nav><a href="/">Home</a> <a href="/about">About</a></nav>
    <article>
      <h1>Main Title</h1>
      <p>This is the first paragraph of the article content.</p>
      <p>This is the second paragraph with more text to extract.</p>
    </article>
    <footer>Copyright 2024</footer>
  </body>
</html>`);
    const result = await extract(doc, makeContext());
    expect(result).not.toBeNull();
    expect(result.text).toContain("Main Title");
    expect(result.text).toContain("first paragraph of the article content");
    expect(result.text).not.toContain("Copyright 2024");
    expect(result.url).toBe("https://example.com/article");
    expect(result.textOriginalLength).toBeGreaterThan(0);
  });

  it("returns pageType classification and confidence score", async () => {
    const doc = makeDom(`<!DOCTYPE html>
<html>
  <head><title>Product Page</title></head>
  <body>
    <article>
      <h1>Widget 3000</h1>
      <p>The Widget 3000 is the best widget available on the market today. It has many features.</p>
      <p>Buy now for only $99.99 with free shipping and returns. Order today.</p>
    </article>
  </body>
</html>`);
    const result = await extract(doc, makeContext());
    expect(result).not.toBeNull();
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.pageType).toBeTruthy();
  });

  it("captures metadata title when present", async () => {
    const doc = makeDom(`<!DOCTYPE html>
<html>
  <head><title>Metadata Title Here</title></head>
  <body>
    <article>
      <h1>Body Heading</h1>
      <p>Some article content that should be extracted properly.</p>
      <p>More content to ensure a decent extraction size.</p>
    </article>
  </body>
</html>`);
    const result = await extract(doc, makeContext());
    expect(result).not.toBeNull();
    expect(result.metadata).toBeTruthy();
  });

  it("preserves links as markdown when includeLinks is set", async () => {
    const doc = makeDom(`<!DOCTYPE html>
<html>
  <head><title>Links Test</title></head>
  <body>
    <article>
      <h1>Links</h1>
      <p>This article discusses open-source development workflows. Contribute on
      <a href="https://github.com/craftpip">GitHub</a> and check out the
      <a href="https://in.linkedin.com/in/bonifacepereira">LinkedIn</a> profile
      for professional experience and career history spanning many years.</p>
      <p>The second paragraph provides additional context about the ecosystem,
      tooling, and community practices that make modern development productive.</p>
    </article>
  </body>
</html>`);
    const result = await extract(doc, makeContext());
    expect(result).not.toBeNull();
    expect(result.text).toContain("[GitHub](https://github.com/craftpip)");
    expect(result.text).toContain("[LinkedIn](https://in.linkedin.com/in/bonifacepereira)");
  });

  it("returns null for empty HTML", async () => {
    const doc = makeDom("<html><body></body></html>");
    const result = await extract(doc, makeContext());
    expect(result).toBeNull();
  });

  it("returns null when native module is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("trafilatura", () => {
      throw new Error("Cannot find module 'trafilatura'");
    });
    vi.resetModules();
    // Re-import with a fresh registry so _extract cache is empty and the
    // dynamic import("trafilatura") resolves to the throwing mock.
    const fresh = await import("../src/extractors/trafilatura.js");
    const doc = makeDom("<html><body><p>content</p></body></html>");
    const result = await fresh.extract(doc, makeContext());
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("trafilatura format dispatch", () => {
  it("dispatches to trafilatura when hint format is set", async () => {
    const result = await extractTextFromHtml({
      html: `<!DOCTYPE html><html><head><title>T</title></head><body>
        <article><h1>Hello</h1><p>This is a long enough paragraph with real content.</p></article>
      </body></html>`,
      url: "https://example.com",
      maxChars: 50000,
      fallbackTitle: "T",
      hint: { default: { format: "trafilatura_to_markdown" } },
      config: { postProcessorModels: [] },
    });
    // Only trafilatura sets these fields — proves dispatch happened
    // (Readability never returns confidence/pageType).
    expect(result.confidence).toBeTypeOf("number");
    expect(result.pageType).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(0);
  });
});

describe("trafilatura as a block leaf format", () => {
  it("extracts a big HTML leaf block with trafilatura", async () => {
    const result = await extractTextFromHtml({
      html: `<!DOCTYPE html><html><head><title>T</title></head><body>
        <nav><a href="/home">Home</a> <a href="/about">About us</a></nav>
        <main>
          <h1>Deep Dive</h1>
          <article>
            <h2>Section One</h2>
            <p>The first paragraph covers the history of the project, its origins,
            and the people who built it over several years of steady work.</p>
            <p>The second paragraph explains the architecture, the tradeoffs that
            were made, and why the design holds up at scale.</p>
            <h2>Section Two</h2>
            <p>The final paragraph summarizes the roadmap, what shipped already,
            and what remains planned for the next major release.</p>
          </article>
        </main>
        <footer>Copyright 2024 Some Company</footer>
      </body></html>`,
      url: "https://example.com/deep-dive",
      maxChars: 50000,
      fallbackTitle: "Deep Dive",
      hint: {
        content: {
          blocks: [{ selector: "article", format: "trafilatura_to_markdown", priority: "high" }]
        }
      },
      config: { postProcessorModels: [] },
    });
    expect(result.text).toContain("Section One");
    expect(result.text).toContain("history of the project");
    expect(result.text).toContain("architecture");
    expect(result.text).toContain("roadmap");
  });

  it("falls back to html_to_markdown for a fragment trafilatura cannot handle", async () => {
    const result = await extractTextFromHtml({
      html: `<!DOCTYPE html><html><head><title>T</title></head><body>
        <nav><a href="/home">Home</a></nav>
        <main>
          <h1>Title</h1>
          <p>A short paragraph that is long enough to be a medium block but
          still a small fragment for full-page extraction.</p>
        </main>
      </body></html>`,
      url: "https://example.com/short",
      maxChars: 50000,
      fallbackTitle: "Short",
      hint: {
        content: {
          blocks: [{ selector: "main", format: "trafilatura_to_markdown", priority: "high" }]
        }
      },
      config: { postProcessorModels: [] },
    });
    // Whatever trafilatura returns, the leaf must never be silently empty.
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).toContain("Title");
  });
});
