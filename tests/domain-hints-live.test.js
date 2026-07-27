import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getBrowserManager } from "../src/browser.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hints = JSON.parse(await fs.readFile(path.join(projectRoot, "domain-hints.json"), "utf8"));
const liveHints = hints.filter((hint) =>
  !hint.flags?.botProtected && (hint.waitForSelector || hint.content?.sections?.length)
);

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
    "stackoverflow.com": "/questions/6818875/new-line-on-php-cli",
    "www.hindustantimes.com": "/india-news",
    "www.youtube.com": "/watch?v=dQw4w9WgXcQ",
    "www.freecodecamp.org": "/news/javascript-map-method/"
  };
  const pathname = hint.domain === "github.com" ? githubPaths[hint.pageType] : knownPaths[hint.domain] || "/";
  return `https://${hint.domain}${pathname}`;
}

const runLiveHints = process.env.LIVE_DOMAIN_HINTS === "1";
const liveChecks = liveHints.flatMap((hint) =>
  (hint.testUrls?.length ? hint.testUrls : [sampleUrl(hint)]).map((url) => ({ hint, url }))
);

describe.runIf(runLiveHints)("live domain hints", () => {
  it.each(liveChecks)("finds configured selectors on $hint.domain ($hint.pageType): $url", async ({ hint, url }) => {
    const manager = await getBrowserManager();
    await manager.withPageSlot(async () => {
      const page = await manager.newPage({ backend: manager.config.defaultBackend });
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: manager.config.browserOpTimeoutMs });
        if (hint.waitForSelector) {
          await page.waitForSelector(hint.waitForSelector, { timeout: 20000 });
        }
        for (const section of hint.content?.sections || []) {
          await page.waitForSelector(section.selector, { timeout: 20000 });
          const count = await page.$$eval(section.selector, (elements) => elements.length);
          expect(count, `${url} no longer matches ${section.selector}`).toBeGreaterThan(0);
          for (const field of section.fields || []) {
            const fieldCount = await page.$$eval(
              section.selector,
              (elements, selector) => elements.reduce((total, element) => total + element.querySelectorAll(selector).length, 0),
              field.selector
            );
            expect(fieldCount, `${url} no longer matches ${section.selector} ${field.selector}`).toBeGreaterThan(0);
          }
        }
      } finally {
        if (!page.isClosed()) await page.close();
      }
    });
  }, 30000);
});
