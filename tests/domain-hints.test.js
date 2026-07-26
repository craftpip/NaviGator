import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { findDomainHint, loadDomainHints } from "../src/domain-hints.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hintsPath = path.join(projectRoot, "domain-hints.json");
const rawHints = JSON.parse(await fs.readFile(hintsPath, "utf8"));

function samplePath(pathPattern) {
  return String(pathPattern || "/**")
    .replace(/\*\*/g, "nested/path")
    .replace(/\*/g, "segment");
}

function sampleUrl(hint) {
  const githubPaths = {
    profile: "/craftpip",
    repo: "/craftpip/browser-search-mcp",
    issues: "/microsoft/vscode/issues",
    prs: "/microsoft/vscode/pulls",
    "issue-detail": "/microsoft/vscode/issues/1",
    "pr-detail": "/microsoft/vscode/pull/327518"
  };
  const knownPaths = {
    "en.wikipedia.org": "/wiki/Web_scraping",
    "stackoverflow.com": "/questions/1/example",
    "www.youtube.com": "/watch?v=dQw4w9WgXcQ",
    "www.freecodecamp.org": "/news/javascript-map-method/"
  };
  const pathname = hint.domain === "github.com"
    ? githubPaths[hint.pageType]
    : knownPaths[hint.domain] || samplePath(hint.pathPattern);
  return `https://${hint.domain}${pathname}`;
}

function validateSelector(selector) {
  const dom = new JSDOM("<body></body>");
  try {
    dom.window.document.querySelectorAll(selector);
  } finally {
    dom.window.close();
  }
}

describe("domain hints", () => {
  it("loads every configured hint", async () => {
    const loaded = await loadDomainHints(hintsPath);
    expect(loaded).toHaveLength(rawHints.length);
    expect(loaded).toEqual(rawHints);
  });

  it.each(rawHints.map((hint, index) => [index + 1, hint]))(
    "validates hint %i: %s",
    (_, hint) => {
      expect(hint.domain).toMatch(/^[a-z0-9.-]+$/);
      expect(hint.pathPattern).toMatch(/^\//);
      expect(hint.pageType).toEqual(expect.any(String));
      expect(hint.comment).toEqual(expect.any(String));

      if (hint.waitForSelector) {
        expect(() => validateSelector(hint.waitForSelector)).not.toThrow();
      }
      for (const selector of hint.skipSelectors || []) {
        expect(() => validateSelector(selector)).not.toThrow();
      }
      for (const section of hint.content?.sections || []) {
        expect(section.label).toEqual(expect.any(String));
        expect(["high", "medium", "low"]).toContain(section.priority);
        expect(() => validateSelector(section.selector)).not.toThrow();
      }
      expect([undefined, "content", "disabled"]).toContain(hint.tableExtraction);
      expect([undefined, true, false]).toContain(hint.preferReadability);
      expect([undefined, true, false]).toContain(hint.flags?.authWall);
      expect([undefined, true, false]).toContain(hint.flags?.visualOnly);
      expect([undefined, true, false]).toContain(hint.flags?.botProtected);
      expect([undefined, true, false]).toContain(hint.flags?.requiresChromium);
    }
  );

  it.each(rawHints.map((hint, index) => [index + 1, hint]))(
    "matches its intended URL first: hint %i: %s",
    (_, hint) => {
      const url = sampleUrl(hint);
      expect(findDomainHint(url, rawHints)).toBe(hint);
    }
  );

  it("does not contain duplicate domain and path-pattern entries", () => {
    const keys = rawHints.map((hint) => `${hint.domain}|${hint.pathPattern}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
