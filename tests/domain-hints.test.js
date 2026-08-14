import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { findDomainHint, findMatchingHints, getDomainHints, loadDomainHints, loadRawDomainHints, saveDomainHints, validateHintRule } from "../src/domain-hints.js";

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
      if (hint.pageType !== undefined) expect(hint.pageType).toEqual(expect.any(String));
      expect(hint.comment).toEqual(expect.any(String));
      for (const testUrl of hint.testUrls || []) {
        expect(testUrl).toMatch(/^https?:\/\//);
        expect(findDomainHint(testUrl, rawHints)).toBe(hint);
      }

      if (hint.waitForSelector && (!Array.isArray(hint.waitForSelector) || hint.waitForSelector.length)) {
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
    }
  );

  it.each(rawHints.map((hint, index) => [index + 1, hint]))(
    "matches its intended URL first: hint %i: %s",
    (_, hint) => {
      const url = hint.testUrls?.[0] || sampleUrl(hint);
      expect(findDomainHint(url, rawHints)).toBe(hint);
    }
  );

  it("does not contain duplicate domain, path-pattern, and requireSelector entries", () => {
    const keys = rawHints.map((hint) => `${hint.domain}|${hint.pathPattern}|${hint.requireSelector || ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns all matching hints in order via findMatchingHints", () => {
    const hints = [
      { domain: "example.com", pathPattern: "/**", pageType: "a" },
      { domain: "example.com", pathPattern: "/**", requireSelector: ".special", pageType: "b" },
      { domain: "other.com", pathPattern: "/**", pageType: "c" }
    ];
    const matches = findMatchingHints("https://example.com/x", hints);
    expect(matches).toEqual([hints[0], hints[1]]);
    expect(findMatchingHints("https://other.com/x", hints)).toEqual([hints[2]]);
    expect(findMatchingHints("https://unknown.com/x", hints)).toEqual([]);
  });
});

describe("validateHintRule", () => {
  const validHint = {
    domain: "example.com",
    pathPattern: "/**",
    pageType: "page",
    comment: "test",
    testUrls: ["https://example.com"],
    default: {
      waitForSelector: ["main", "#content"],
      waitForContent: [".article"],
      skipSelectors: [".ads"],
      format: "readability_to_markdown",
      tables: "content",
      stabilizeStrategy: "network_idle"
    },
    flowOptions: {}
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
    const { errors } = validateHintRule({ default: { waitForSelector: "main p" } }, { scope: "test" });
    expect(errors).toEqual([]);
  });

  it("accepts waitForSelector as an array of selectors", () => {
    const { errors } = validateHintRule(
      { default: { waitForSelector: ["main p", ".react-app", "#content"] } },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
  });

  it("accepts a valid requireSelector", () => {
    const { errors, warnings } = validateHintRule(
      { requireSelector: "div.js-profile-editable-area" },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("rejects an invalid requireSelector selector", () => {
    const { errors } = validateHintRule({ requireSelector: "a[" }, { scope: "test" });
    expect(errors.map((e) => e.field)).toContain("requireSelector");
  });

  it("rejects a non-string requireSelector", () => {
    for (const bad of [123, [], {}]) {
      const { errors } = validateHintRule({ requireSelector: bad }, { scope: "test" });
      expect(errors.map((e) => e.field)).toContain("requireSelector");
    }
  });

  it("treats an empty optional requireSelector as unset (not an error)", () => {
    for (const empty of ["", "   "]) {
      const { errors } = validateHintRule({ requireSelector: empty }, { scope: "test" });
      expect(errors.map((e) => e.field)).not.toContain("requireSelector");
    }
  });

  it("treats empty default.tables and default.stabilizeStrategy as unset but rejects bogus values", () => {
    for (const hint of [{ default: { tables: "" } }, { default: { stabilizeStrategy: "" } }, { default: { tables: "", stabilizeStrategy: "" } }]) {
      const { errors } = validateHintRule(hint, { scope: "test" });
      expect(errors.map((e) => e.field)).not.toContain("default.tables");
      expect(errors.map((e) => e.field)).not.toContain("default.stabilizeStrategy");
    }
    const bogus = validateHintRule({ default: { tables: "bogus", stabilizeStrategy: "x" } }, { scope: "test" });
    expect(bogus.errors.map((e) => e.field)).toEqual(expect.arrayContaining(["default.tables", "default.stabilizeStrategy"]));
  });

  it("accepts a bare skeleton hint (console emptyHint shape) with no errors beyond domain", () => {
    const skeleton = {
      domain: "example.com",
      pathPattern: "/**",
      comment: "",
      testUrls: [],
      default: {
        waitForSelector: [],
        stabilizeStrategy: "",
        waitForContent: [],
        skipSelectors: [],
        format: "readability_to_markdown",
        tables: "all"
      },
      flowOptions: {}
    };
    const { errors, warnings } = validateHintRule(skeleton, { scope: "test" });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("rejects an invalid selector inside a waitForSelector array", () => {
    const { errors } = validateHintRule(
      { default: { waitForSelector: ["main p", "a["] } },
      { scope: "test" }
    );
    expect(errors.map((e) => e.field)).toContain("default.waitForSelector[1]");
  });

  it("rejects invalid CSS in waitForSelector, skipSelectors, blocks, and fields", () => {
    const bad = {
      default: { waitForSelector: "a[", skipSelectors: ["div["] },
      flow: [
        {
          action: "extract",
          label: "Stage",
          content: {
            blocks: [{ selector: "b[", label: "x", priority: "high", fields: [{ selector: "c[", label: "x", format: "text" }] }]
          }
        }
      ]
    };
    const { errors } = validateHintRule(bad);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("default.waitForSelector");
    expect(fields).toContain("default.skipSelectors[0]");
    expect(fields).toContain("flow[0].content.blocks[0].selector");
    expect(fields).toContain("flow[0].content.blocks[0].fields[0].selector");
  });

  it("rejects a bad block priority and bad field format", () => {
    const bad = {
      flow: [
        {
          action: "extract",
          label: "Stage",
          content: { blocks: [{ selector: "main", label: "A", priority: "urgent", fields: [{ selector: "h1", label: "T", format: "pdf" }] }] }
        }
      ]
    };
    const { errors } = validateHintRule(bad);
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("flow[0].content.blocks[0].priority");
    expect(fields).toContain("flow[0].content.blocks[0].fields[0].format");
  });

  it("warns on a leftover flags field (removed from hints — detected per page instead)", () => {
    const { errors, warnings } = validateHintRule({ ...validHint, flags: { authWall: true } });
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.field)).toContain("flags");
  });

  it("warns on unknown top-level keys", () => {
    const { errors, warnings } = validateHintRule({ ...validHint, bogusField: 1 });
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.field)).toContain("bogusField");
  });
});

describe("validateHintRule flow and blocks", () => {
  const flowExtract = { action: "extract", label: "Stage", content: { blocks: [{ selector: "main", label: "Main", priority: "high", format: "text" }] } };
  const flowClick = { action: "click", selector: "#show", waitForSelector: ".revealed" };

  it("accepts a valid extract -> click -> extract flow", () => {
    const { errors, warnings } = validateHintRule(
      { flow: [flowExtract, flowClick, { ...flowExtract, label: "Second" }] },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("accepts wait, type, and navigate steps", () => {
    const { errors } = validateHintRule(
      {
        flow: [
          flowExtract,
          { action: "type", selector: "input[name=q]", text: "wireless", submit: true, waitForSelector: "ol.results" },
          { action: "wait", selector: "li.review", state: "visible", timeoutMs: 5000 },
          { action: "navigate", url: "/detail", waitForSelector: "main.detail" },
          flowExtract
        ]
      },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
  });

  it("accepts a selectorless wait step (stabilize-only wait)", () => {
    const { errors, warnings } = validateHintRule(
      {
        flow: [
          flowExtract,
          { action: "wait", timeoutMs: 10000, stabilizeStrategy: "network_idle" },
          flowExtract
        ]
      },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("rejects flow that is not a non-empty array", () => {
    for (const bad of [null, [], "flow", {}]) {
      const { errors } = validateHintRule({ flow: bad }, { scope: "test" });
      expect(errors.map((e) => e.field)).toContain("flow");
    }
  });

  it("rejects more than 8 steps", () => {
    const steps = [];
    for (let i = 0; i < 9; i += 1) steps.push(flowExtract);
    const { errors } = validateHintRule({ flow: steps }, { scope: "test" });
    expect(errors.map((e) => e.message).join(" ")).toMatch(/at most 8 steps/);
  });

  it("bounds clicks: 8 steps with 4 clicks is valid (the step cap governs)", () => {
    const flow = [
      flowClick,
      { ...flowExtract, label: "A" },
      flowClick,
      { ...flowExtract, label: "B" },
      flowClick,
      { ...flowExtract, label: "C" },
      flowClick,
      { ...flowExtract, label: "D" }
    ];
    const { errors } = validateHintRule({ flow }, { scope: "test" });
    expect(errors).toEqual([]);
  });

  it("rejects an unknown action", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "hover", selector: "a" }, flowExtract] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.field)).toContain("flow[0].action");
  });

  it("rejects unknown per-action properties with a warning", () => {
    const { warnings } = validateHintRule(
      { flow: [{ action: "click", selector: "#show", waitForSelector: ".x", delay: 100 }, flowExtract] },
      { scope: "test" }
    );
    expect(warnings.map((w) => w.field)).toContain("flow[0].delay");
  });

  it("requires a valid click selector and waitForSelector", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "click", selector: "a[", waitForSelector: "b[" }, flowExtract] },
      { scope: "test" }
    );
    const fields = errors.map((e) => e.field);
    expect(fields).toContain("flow[0].selector");
    expect(fields).toContain("flow[0].waitForSelector");
  });

  it("accepts a click step without waitForSelector (blank = click and move on)", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "click", selector: "#show" }, flowExtract] },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
  });

  it("extract label is optional; content stays required", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "extract" }, flowClick] },
      { scope: "test" }
    );
    const fields = errors.map((e) => e.field);
    expect(fields).not.toContain("flow[0].label");
    expect(fields).toContain("flow[0].content");
  });

  it("extract with a non-string label is rejected", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "extract", label: 42, content: { blocks: [{ selector: "main", label: "Main", priority: "high", format: "text" }] } }, flowClick] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.field)).toContain("flow[0].label");
  });

  it("accepts omitted labels on blocks and record fields", () => {
    const { errors } = validateHintRule(
      {
        domain: "example.com",
        pathPattern: "/**",
        flow: [
          {
            action: "extract",
            content: {
              blocks: [
                { selector: "div.summary", priority: "high", format: "text" },
                {
                  selector: "ol.items",
                  priority: "high",
                  fields: [{ selector: "li", format: "text" }]
                }
              ]
            }
          }
        ]
      },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
  });

  it("enforces timeoutMs range", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "wait", selector: "li", timeoutMs: 100 }, flowExtract] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.field)).toContain("flow[0].timeoutMs");
  });

  it("rejects two adjacent interaction steps", () => {
    const { errors } = validateHintRule(
      { flow: [flowClick, { action: "navigate", url: "/next", waitForSelector: "main" }, flowExtract] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.message).join(" ")).toMatch(/must separate them/);
  });

  it("requires at least one extract step", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "wait", selector: "li", timeoutMs: 500 }, flowClick] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.message).join(" ")).toMatch(/at least one extract/);
  });

  it("requires the flow to end with an extract", () => {
    const { errors } = validateHintRule(
      { flow: [flowExtract, flowClick] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.message).join(" ")).toMatch(/end with an extract/);
  });

  it("requires waitForSelector on a submitting type step", () => {
    const { errors } = validateHintRule(
      { flow: [flowExtract, { action: "type", selector: "input", text: "hi", submit: true }, flowExtract] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.field)).toContain("flow[1].waitForSelector");
  });

  it("rejects a bad navigate url", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "navigate", url: "http://", waitForSelector: "main" }, flowExtract] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.field)).toContain("flow[0].url");
  });

  it("validates flowOptions.totalTimeoutMs cap and continueOnEmptyExtract type", () => {
    const over = validateHintRule(
      { flow: [flowExtract, flowExtract], flowOptions: { totalTimeoutMs: 999999 } },
      { scope: "test" }
    );
    expect(over.errors.map((e) => e.field)).toContain("flowOptions.totalTimeoutMs");

    const badType = validateHintRule(
      { flow: [flowExtract, flowExtract], flowOptions: { continueOnEmptyExtract: "yes" } },
      { scope: "test" }
    );
    expect(badType.errors.map((e) => e.field)).toContain("flowOptions.continueOnEmptyExtract");

    const ok = validateHintRule(
      { flow: [flowExtract, flowExtract], flowOptions: { totalTimeoutMs: 45000, continueOnEmptyExtract: true } },
      { scope: "test" }
    );
    expect(ok.errors).toEqual([]);
  });

  it("validates per-step stabilizeStrategy on wait and interaction steps", () => {
    const bad = validateHintRule(
      { flow: [{ action: "wait", selector: "#x", stabilizeStrategy: "wobble" }, flowExtract] },
      { scope: "test" }
    );
    expect(bad.errors.map((e) => e.field)).toContain("flow[0].stabilizeStrategy");
    expect(bad.errors.map((e) => e.field)).not.toContain("flowOptions.stabilizeStrategy");

    const unknownKey = validateHintRule(
      { flow: [{ action: "wait", selector: "#x", wiggle: "yes" }, flowExtract] },
      { scope: "test" }
    );
    expect(unknownKey.warnings.map((w) => w.field)).toContain("flow[0].wiggle");

    for (const strategy of ["network_idle", "content_idle", "mutation", "", "none"]) {
      const ok = validateHintRule(
        {
          flow: [
            { action: "wait", selector: "#x", stabilizeStrategy: strategy },
            flowExtract,
            { action: "click", selector: "button.next", waitForSelector: "#y", stabilizeStrategy: strategy },
            flowExtract,
            { action: "type", selector: "input.q", text: "hi", stabilizeStrategy: strategy },
            flowExtract,
            { action: "navigate", url: "/two", waitForSelector: "#z", stabilizeStrategy: strategy },
            flowExtract
          ]
        },
        { scope: "test" }
      );
      expect(ok.errors).toEqual([]);
    }
  });

  it("rejects legacy top-level content (static blocks live inside a flow extract step)", () => {
    const { errors } = validateHintRule(
      { content: { blocks: [{ selector: "main", label: "Main", priority: "high", format: "text" }] }, flow: [flowExtract] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.field)).toContain("content");
  });

  it("accepts leaf and record blocks", () => {
    const { errors } = validateHintRule(
      {
        flow: [
          {
            action: "extract",
            label: "Stage",
            content: {
              blocks: [
                { selector: ".summary", label: "Summary", priority: "high", format: "readability_to_markdown" },
                {
                  selector: ".answer",
                  label: "Answers",
                  itemLabel: "Answer",
                  priority: "high",
                  fields: [
                    { selector: ".vote", label: "Votes", format: "text" },
                    { selector: ".body", label: "Content", format: "markdown" }
                  ]
                }
              ]
            }
          }
        ]
      },
      { scope: "test" }
    );
    expect(errors).toEqual([]);
  });

  it("rejects a block that has both format and fields", () => {
    const { errors } = validateHintRule(
      {
        flow: [
          {
            action: "extract",
            label: "Stage",
            content: {
              blocks: [
                { selector: "main", label: "Main", priority: "high", format: "text", fields: [{ selector: "h1", label: "Title", format: "text" }] }
              ]
            }
          }
        ]
      },
      { scope: "test" }
    );
    expect(errors.map((e) => e.message).join(" ")).toMatch(/leaf block \(with "format"\) or a record block/);
  });

  it("rejects a block with neither format nor fields", () => {
    const { errors } = validateHintRule(
      { flow: [{ action: "extract", label: "Stage", content: { blocks: [{ selector: "main", label: "Main", priority: "high" }] } }] },
      { scope: "test" }
    );
    expect(errors.map((e) => e.message).join(" ")).toMatch(/leaf block \(with "format"\) or a record block/);
  });

  it("rejects an invalid block format and invalid nested field format", () => {
    const badFormat = validateHintRule(
      { flow: [{ action: "extract", label: "Stage", content: { blocks: [{ selector: "main", label: "Main", priority: "high", format: "pictures" }] } }] },
      { scope: "test" }
    );
    expect(badFormat.errors.map((e) => e.field)).toContain("flow[0].content.blocks[0].format");

    const badFieldFormat = validateHintRule(
      {
        flow: [
          {
            action: "extract",
            label: "Stage",
            content: {
              blocks: [
                { selector: ".answer", label: "Answers", priority: "high", fields: [{ selector: ".vote", label: "Votes", format: "table" }] }
              ]
            }
          }
        ]
      },
      { scope: "test" }
    );
    expect(badFieldFormat.errors.map((e) => e.field)).toContain("flow[0].content.blocks[0].fields[0].format");
  });

  it("warns when both blocks and legacy sections are present", () => {
    const { warnings } = validateHintRule(
      {
        flow: [
          {
            action: "extract",
            label: "Stage",
            content: {
              blocks: [{ selector: "main", label: "Main", priority: "high", format: "text" }],
              sections: [{ selector: "main", label: "Legacy", priority: "high" }]
            }
          }
        ]
      },
      { scope: "test" }
    );
    expect(warnings.map((w) => w.message).join(" ")).toMatch(/blocks take priority/);
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
