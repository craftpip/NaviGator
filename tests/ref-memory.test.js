import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDirs = [];

async function loadRegistry(dataDir) {
  const db = await import("../src/db.js");
  db.initDb(dataDir);
  const refs = await import("../src/ref-memory.js");
  return { db, refs };
}

function createDataDir() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "navigator-ref-memory-"));
  tempDirs.push(dataDir);
  return dataDir;
}

afterEach(async () => {
  const { closeDb } = await import("../src/db.js");
  closeDb();
  vi.resetModules();
  for (const dataDir of tempDirs.splice(0)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

describe("persistent ref memory", () => {
  it("returns a stable ID for each URL and allocates increasing IDs", async () => {
    const { refs } = await loadRegistry(createDataDir());

    const first = refs.rememberLink("https://example.com/first");
    expect(refs.rememberLink("https://example.com/first")).toBe(first);

    const second = refs.rememberLink("https://example.com/second");
    expect(second).toBeGreaterThan(first);
  });

  it("resolves existing IDs after database and module restart", async () => {
    const dataDir = createDataDir();
    let { db, refs } = await loadRegistry(dataDir);
    const first = refs.rememberLink("https://example.com/first");
    const second = refs.rememberLink("https://example.com/second");

    db.closeDb();
    vi.resetModules();

    ({ db, refs } = await loadRegistry(dataDir));
    expect(refs.getUrlForRefId(first)).toBe("https://example.com/first");
    expect(refs.getLinkRefByUrl("https://example.com/second")).toBe(second);

    const third = refs.rememberLink("https://example.com/third");
    expect(third).toBeGreaterThan(second);
  });

  it("resolves IDs evicted from the in-memory cache", async () => {
    const { refs } = await loadRegistry(createDataDir());
    const firstUrl = "https://example.com/0";
    const first = refs.rememberLink(firstUrl);

    for (let index = 1; index <= 2000; index += 1) {
      refs.rememberLink(`https://example.com/${index}`);
    }

    expect(refs.getUrlForRefId(first)).toBe(firstUrl);
    expect(refs.getLinkRefByUrl(firstUrl)).toBe(first);
  });

  it("keeps missing-reference behavior unchanged", async () => {
    const { refs } = await loadRegistry(createDataDir());

    expect(refs.getUrlForRefId(999)).toBeNull();
    expect(() => refs.resolveRefIdToUrl(999)).toThrow("No link found in memory for ref 999");
  });
});
