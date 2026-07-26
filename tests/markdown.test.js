import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "../src/markdown.js";

describe("htmlToMarkdown", () => {
  it("converts headings", () => {
    const html = "<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("# Title");
    expect(md).toContain("## Subtitle");
    expect(md).toContain("### Section");
  });

  it("converts paragraphs", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("First paragraph.");
    expect(md).toContain("Second paragraph.");
  });

  it("converts bold and italic", () => {
    const html = "<p><strong>bold</strong> and <em>italic</em></p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("**bold**");
    expect(md).toContain("_italic_");
  });

  it("converts inline links", () => {
    const html = '<p>Visit <a href="https://example.com">Example</a></p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("[Example](https://example.com)");
  });

  it("resolves relative links with baseUrl", () => {
    const html = '<p><a href="/about">About</a></p>';
    const md = htmlToMarkdown(html, { baseUrl: "https://example.com" });
    expect(md).toContain("[About](https://example.com/about)");
  });

  it("resolves relative image src with baseUrl", () => {
    const html = '<p><img src="/logo.png" alt="Logo"></p>';
    const md = htmlToMarkdown(html, { baseUrl: "https://example.com" });
    expect(md).toContain("![Logo](https://example.com/logo.png)");
  });

  it("converts tables with GFM", () => {
    const html = "<table><thead><tr><th>Name</th><th>Age</th></tr></thead><tbody><tr><td>Alice</td><td>30</td></tr></tbody></table>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("| Name");
    expect(md).toContain("| Alice");
    expect(md).toContain("| ---");
  });

  it("converts fenced code blocks", () => {
    const html = "<pre><code class=\"language-js\">const x = 1;</code></pre>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("```js");
    expect(md).toContain("const x = 1;");
    expect(md).toContain("```");
  });

  it("converts inline code", () => {
    const html = "<p>Use <code>foo()</code> function</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("`foo()`");
  });

  it("converts ordered lists", () => {
    const html = "<ol><li>First</li><li>Second</li><li>Third</li></ol>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("First");
    expect(md).toContain("Second");
    expect(md).toContain("Third");
  });

  it("converts unordered lists", () => {
    const html = "<ul><li>Red</li><li>Green</li><li>Blue</li></ul>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("Red");
    expect(md).toContain("Green");
    expect(md).toContain("Blue");
  });

  it("strips nav, aside, form, button", () => {
    const html = "<p>Content</p><nav><p>Nav links</p></nav><aside><p>Sidebar</p></aside><form><input></form><button>Click</button>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("Content");
    expect(md).not.toContain("Nav links");
    expect(md).not.toContain("Sidebar");
    expect(md).not.toContain("Click");
  });

  it("strips script, style, svg, iframe", () => {
    const html = "<p>Text</p><script>alert(1)</script><style>.x{}</style><svg></svg>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("Text");
    expect(md).not.toContain("alert");
    expect(md).not.toContain(".x{}");
  });

  it("converts blockquotes", () => {
    const html = "<blockquote><p>Quoted text</p></blockquote>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("> Quoted text");
  });

  it("converts images", () => {
    const html = '<img src="https://example.com/pic.png" alt="Photo">';
    const md = htmlToMarkdown(html);
    expect(md).toContain("![Photo](https://example.com/pic.png)");
  });

  it("converts strikethrough", () => {
    const html = "<p><del>removed</del> <s>gone</s></p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("~removed~");
    expect(md).toContain("~gone~");
  });

  it("handles empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown(null)).toBe("");
    expect(htmlToMarkdown(undefined)).toBe("");
  });

  it("converts definition lists", () => {
    const html = "<dl><dt>Term</dt><dd>Description</dd></dl>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("**Term**");
    expect(md).toContain(": Description");
  });

  it("converts horizontal rules", () => {
    const html = "<hr>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("---");
  });

  it("handles nested lists", () => {
    const html = "<ul><li>Fruit<ul><li>Apple</li><li>Banana</li></ul></li></ul>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("Fruit");
    expect(md).toContain("Apple");
    expect(md).toContain("Banana");
  });
});
