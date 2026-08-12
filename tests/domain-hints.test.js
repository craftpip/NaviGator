import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { findDomainHint, getDomainHints, loadDomainHints, loadRawDomainHints, saveDomainHints, validateHintRule } from "../src/domain-hints.js";

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
    repo: "/craftpip/navigator",
    issues: "/microsoft/vscode/issues",
    prs: "/microsoft/vscode/pulls",
    "issue-detail": "/microsoft/vscode/issues/1",
    "pr-detail": "/microsoft/vscode/pull/327518"
  };
  const knownPaths = {
    "en.wikipedia.org": "/wiki/Web_scraping",
    "stackoverflow.com": "/questions/6818875/new-line-on-php-cli",
    "www.hindustantimes.com": "/india-news",
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
      for (const testUrl of hint.testUrls || []) {
        expect(testUrl).toMatch(/^https:\/\//);
        expect(findDomainHint(testUrl, rawHints)).toBe(hint);
      }

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
        if (section.itemLabel !== undefined) {
          expect(section.itemLabel).toEqual(expect.any(String));
        }
        for (const field of section.fields || []) {
          expect(field.label).toEqual(expect.any(String));
          expect(["markdown", "text", "list"]).toContain(field.format);
          expect(() => validateSelector(field.selector)).not.toThrow();
        }
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
      const url = hint.testUrls?.[0] || sampleUrl(hint);
      expect(findDomainHint(url, rawHints)).toBe(hint);
    }
  );

  it("does not contain duplicate domain and path-pattern entries", () => {
    const keys = rawHints.map((hint) => `${hint.domain}|${hint.pathPattern}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("validateHintRule", () => {
  const validHint = {
    domain: "example.com",
    pathPattern: "/**",
    pageType: "page",
    comment: "test",
    testUrls: ["https://example.com"],
    waitForSelector: "main",
    skipSelectors: [".ads"],
    preferReadability: false,
    tableExtraction: "content",
    stabilizeStrategy: "network_idle",
    flags: { authWall: false, requiresChromium: true },
    content: {
      sections: [
        { selector: "main article", label: "Article", priority: "high", itemLabel: "Post", fields: [{ selector: "h1", label: "Title", format: "text" }] }
      ]
    }
  };

  it("accepts a valid full hint", () => {
    expect(validateHintRule(validHint)).toEqual({ errors: [], warnings: [] });
  });

  it("rejects a bad domain and a non-slash pathPattern", () => {
    const { errors } = validateHintRule({ domain: "BAD.DOMAIN!", pathPattern: "nope" });
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("domain");
    expect(fields).toContain("pathPattern");
  });

  it("requires domain and pathPattern in static scope", () => {
    const { errors } = validateHintRule({ pageType: "page", comment: "x" });
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("domain");
    expect(fields).toContain("pathPattern");
  });

  it("allows omitting domain and pathPattern in test scope", () => {
    const { errors } = validateHintRule({ waitForSelector: "main p" }, { scope: "test" });
    expect(errors).toEqual([]);
  });

  it("accepts waitForSelector as an array of selectors", () => {
    const { errors } = validateHintRule(
      { waitForSelector: ["main p", ".react-app", "#content"] },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
  });

  it("rejects an invalid selector inside a waitForSelector array", () => {
    const { errors } = validateHintRule(
      { waitForSelector: ["main p", "a["] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.field)).toContain("waitForSelector[1]");
  });

  it("rejects invalid CSS in waitForSelector, skipSelectors, sections, and fields", () => {
    const bad = {
      ...validHint,
      waitForSelector: "a[",
      skipSelectors: ["div["],
      content: { sections: [{ ...validHint.content.sections[0], selector: "b[", fields: [{ selector: "c[", label: "x", format: "text" }] }] }
    };
    const { errors } = validateHintRule(bad);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("waitForSelector");
    expect(fields).toContain("skipSelectors[0]");
    expect(fields).toContain("content.sections[0].selector");
    expect(fields).toContain("content.sections[0].fields[0].selector");
  });

  it("rejects a bad section priority and bad field format", () => {
    const bad = {
      ...validHint,
      content: { sections: [{ selector: "main", label: "A", priority: "urgent", fields: [{ selector: "h1", label: "T", format: "pdf" }] }] }
    };
    const { errors } = validateHintRule(bad);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("content.sections[0].priority");
    expect(fields).toContain("content.sections[0].fields[0].format");
  });

  it("rejects non-boolean flags and warns on unknown flags", () => {
    const { errors, warnings } = validateHintRule({ ...validHint, flags: { authWall: "yes", mysteryFlag: true } });
    expect(errors.map((e) => e.field)).toContain("flags.authWall");
    expect(warnings.map((w) => w.field)).toContain("flags.mysteryFlag");
  });

  it("warns on unknown top-level keys", () => {
    const { errors, warnings } = validateHintRule({ ...validHint, bogusField: 1 });
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.field)).toContain("bogusField");
  });
});

describe("saveDomainHints and loadRawDomainHints", () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "hints-unit-"));
  const hintsPath = path.join(tmpDir, "domain-hints.json");

  it("writes atomically, backs up the previous file, and clears the cache", async () => {
    await fs.writeFile(hintsPath, JSON.stringify([{ domain: "a.com", pathPattern: "/**", pageType: "p", comment: "one" }], null, 2) + "\n");
    const config = { domainHintsPath: hintsPath };

    const before = await getDomainHints(config);
    expect(before).toHaveLength(1);

    const next = [
      { domain: "a.com", pathPattern: "/**", pageType: "p", comment: "one" },
      { domain: "b.com", pathPattern: "/**", pageType: "p", comment: "two" }
    ];
    const saved = await saveDomainHints(next, hintsPath);
    expect(saved.ok).toBe(true);
    expect(saved.count).toBe(2);

    const backup = JSON.parse(await fs.readFile(`${hintsPath}.bak`, "utf8"));
    expect(backup).toHaveLength(1);

    const after = await getDomainHints(config);
    expect(after).toHaveLength(2);
    expect(after[1].domain).toBe("b.com");
  });

  it("refuses to write to /dev/null", async () => {
    const result = await saveDomainHints([], "/dev/null");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/\/dev\/null/);
  });

  it("returns an error rather than throwing on a bad hints argument", async () => {
    const result = await saveDomainHints({ not: "an array" }, hintsPath);
    expect(result.ok).toBe(false);
  });

  it("loadRawDomainHints returns entries unfiltered, including broken ones", async () => {
    await fs.writeFile(hintsPath, JSON.stringify([{ domain: "good.com", pathPattern: "/**", pageType: "p", comment: "ok" }, { pathPattern: "/**", pageType: "p", comment: "no domain" }]));
    const raw = await loadRawDomainHints(hintsPath);
    expect(raw).toHaveLength(2);
    const filtered = await loadDomainHints(hintsPath);
    expect(filtered).toHaveLength(1);
  });
});
