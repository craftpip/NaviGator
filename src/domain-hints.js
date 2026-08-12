import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";

let loadedHints = null;
let loadedPath = null;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileGlob(pattern) {
  const parts = pattern.split(/(\*\*|\*)/);
  let regexStr = "^";
  for (const part of parts) {
    if (part === "**") {
      regexStr += ".*";
    } else if (part === "*") {
      regexStr += "[^/]*";
    } else if (part) {
      regexStr += escapeRegex(part);
    }
  }
  regexStr += "$";
  const regex = new RegExp(regexStr);
  return (pathname) => regex.test(pathname);
}

function parsePathPattern(raw) {
  if (!raw || raw === "/**") return () => true;
  if (raw === "/*/**") return (p) => p.startsWith("/") && p !== "/";
  return compileGlob(raw);
}

function getPathname(urlStr) {
  try {
    let p = new URL(urlStr).pathname.toLowerCase();
    if (p !== "/" && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  } catch {
    return "/";
  }
}

function getHostname(urlStr) {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isMatch(entry, urlStr) {
  const hostname = getHostname(urlStr);
  const domain = entry.domain.toLowerCase();
  if (hostname !== domain && !hostname.endsWith("." + domain)) return false;
  const pathname = getPathname(urlStr);
  const pathMatcher = entry._pathMatcher || parsePathPattern(entry.pathPattern);
  entry._pathMatcher = entry._pathMatcher || pathMatcher;
  return pathMatcher(pathname);
}

export async function loadDomainHints(hintsPath) {
  const resolvedPath = path.resolve(hintsPath);
  try {
    await fs.access(resolvedPath);
  } catch {
    return [];
  }
  const raw = await fs.readFile(resolvedPath, "utf8");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => e && typeof e.domain === "string");
}

export function findMatchingHints(urlStr, hints) {
  if (!urlStr || !Array.isArray(hints) || !hints.length) return [];
  const matches = [];
  for (const entry of hints) {
    if (isMatch(entry, urlStr)) matches.push(entry);
  }
  return matches;
}

export function findDomainHint(urlStr, hints) {
  return findMatchingHints(urlStr, hints)[0] || null;
}

export async function getDomainHints(config) {
  const hintsPath = config?.domainHintsPath;
  if (!hintsPath) return [];
  if (loadedPath === hintsPath && loadedHints !== null) return loadedHints;
  loadedHints = await loadDomainHints(hintsPath);
  loadedPath = hintsPath;
  return loadedHints;
}

export function clearDomainHintCache() {
  loadedHints = null;
  loadedPath = null;
}

export function validateSelector(selector) {
  const dom = new JSDOM("<body></body>");
  try {
    dom.window.document.querySelectorAll(selector);
    return null;
  } catch (error) {
    return error?.message || String(error);
  } finally {
    dom.window.close();
  }
}

const FLAG_KEYS = ["authWall", "visualOnly", "botProtected", "requiresChromium"];

function validateSection(section, errors, fieldPrefix) {
  if (!section || typeof section !== "object") {
    errors.push({ field: fieldPrefix, message: "must be an object" });
    return;
  }
  const prefix = `${fieldPrefix}.`;
  if (typeof section.selector !== "string" || !section.selector) {
    errors.push({ field: `${prefix}selector`, message: "required" });
  } else {
    const selectorError = validateSelector(section.selector);
    if (selectorError) errors.push({ field: `${prefix}selector`, message: `invalid CSS selector: ${selectorError}` });
  }
  if (typeof section.label !== "string") {
    errors.push({ field: `${prefix}label`, message: "required" });
  }
  if (section.priority !== undefined && !["high", "medium", "low"].includes(section.priority)) {
    errors.push({ field: `${prefix}priority`, message: 'must be one of "high", "medium", "low"' });
  }
  if (section.itemLabel !== undefined && typeof section.itemLabel !== "string") {
    errors.push({ field: `${prefix}itemLabel`, message: "must be a string" });
  }
  for (const [fieldIndex, field] of (section.fields || []).entries()) {
    const fieldPrefix2 = `${prefix}fields[${fieldIndex}]`;
    if (!field || typeof field !== "object") {
      errors.push({ field: fieldPrefix2, message: "must be an object" });
      continue;
    }
    if (typeof field.selector !== "string" || !field.selector) {
      errors.push({ field: `${fieldPrefix2}.selector`, message: "required" });
    } else {
      const selectorError = validateSelector(field.selector);
      if (selectorError) errors.push({ field: `${fieldPrefix2}.selector`, message: `invalid CSS selector: ${selectorError}` });
    }
    if (typeof field.label !== "string") {
      errors.push({ field: `${fieldPrefix2}.label`, message: "required" });
    }
    if (field.format !== undefined && !["markdown", "text", "list"].includes(field.format)) {
      errors.push({ field: `${fieldPrefix2}.format`, message: 'must be one of "markdown", "text", "list"' });
    }
  }
}

export function validateHintRule(hint, { scope = "static" } = {}) {
  const errors = [];
  const warnings = [];
  if (!hint || typeof hint !== "object" || Array.isArray(hint)) {
    return { errors: [{ field: "", message: "hint must be an object" }], warnings: [] };
  }
  const isTest = scope === "test";

  if (!isTest && (typeof hint.domain !== "string" || !hint.domain)) {
    errors.push({ field: "domain", message: "required" });
  } else if (hint.domain !== undefined && !/^[a-z0-9.-]+$/.test(hint.domain)) {
    errors.push({ field: "domain", message: "must match /^[a-z0-9.-]+$/ (lowercase letters, digits, dots, dashes)" });
  }

  if (!isTest && (typeof hint.pathPattern !== "string" || !hint.pathPattern)) {
    errors.push({ field: "pathPattern", message: 'required (default "/**")' });
  } else if (hint.pathPattern !== undefined && !hint.pathPattern.startsWith("/")) {
    errors.push({ field: "pathPattern", message: "must start with \"/\"" });
  }

  if (hint.pageType !== undefined && typeof hint.pageType !== "string") {
    errors.push({ field: "pageType", message: "must be a string" });
  }
  if (hint.comment !== undefined && typeof hint.comment !== "string") {
    errors.push({ field: "comment", message: "must be a string" });
  }

  if (hint.testUrls !== undefined) {
    if (!Array.isArray(hint.testUrls)) {
      errors.push({ field: "testUrls", message: "must be an array of URLs" });
    } else {
      hint.testUrls.forEach((testUrl, index) => {
        if (typeof testUrl !== "string" || !/^https:\/\//.test(testUrl)) {
          errors.push({ field: `testUrls[${index}]`, message: "must be an https:// URL" });
        }
      });
    }
  }

  if (hint.waitForSelector !== undefined) {
    const selectors = Array.isArray(hint.waitForSelector)
      ? hint.waitForSelector
      : [hint.waitForSelector];
    selectors.forEach((selector, index) => {
      const field = Array.isArray(hint.waitForSelector)
        ? `waitForSelector[${index}]`
        : "waitForSelector";
      if (typeof selector !== "string") {
        errors.push({ field, message: "must be a string" });
      } else {
        const selectorError = validateSelector(selector);
        if (selectorError) errors.push({ field, message: `invalid CSS selector: ${selectorError}` });
      }
    });
  }

  if (hint.requireSelector !== undefined) {
    if (typeof hint.requireSelector !== "string" || !hint.requireSelector.trim()) {
      errors.push({ field: "requireSelector", message: "must be a non-empty CSS selector string" });
    } else {
      const selectorError = validateSelector(hint.requireSelector);
      if (selectorError) errors.push({ field: "requireSelector", message: `invalid CSS selector: ${selectorError}` });
    }
  }

  if (hint.skipSelectors !== undefined) {
    if (!Array.isArray(hint.skipSelectors)) {
      errors.push({ field: "skipSelectors", message: "must be an array of CSS selectors" });
    } else {
      hint.skipSelectors.forEach((selector, index) => {
        if (typeof selector !== "string") {
          errors.push({ field: `skipSelectors[${index}]`, message: "must be a string" });
        } else {
          const selectorError = validateSelector(selector);
          if (selectorError) errors.push({ field: `skipSelectors[${index}]`, message: `invalid CSS selector: ${selectorError}` });
        }
      });
    }
  }

  if (hint.preferReadability !== undefined && typeof hint.preferReadability !== "boolean") {
    errors.push({ field: "preferReadability", message: "must be a boolean" });
  }
  if (hint.tableExtraction !== undefined && !["content", "disabled"].includes(hint.tableExtraction)) {
    errors.push({ field: "tableExtraction", message: 'must be one of "content", "disabled"' });
  }
  if (hint.stabilizeStrategy !== undefined && !["network_idle", "content_idle", "mutation"].includes(hint.stabilizeStrategy)) {
    errors.push({ field: "stabilizeStrategy", message: 'must be one of "network_idle", "content_idle", "mutation"' });
  }
  if (hint.contentSelectors !== undefined && !Array.isArray(hint.contentSelectors)) {
    errors.push({ field: "contentSelectors", message: "must be an array of CSS selectors" });
  }

  if (hint.flags !== undefined) {
    if (!hint.flags || typeof hint.flags !== "object" || Array.isArray(hint.flags)) {
      errors.push({ field: "flags", message: "must be an object" });
    } else {
      for (const [flagKey, flagValue] of Object.entries(hint.flags)) {
        if (!FLAG_KEYS.includes(flagKey)) {
          warnings.push({ field: `flags.${flagKey}`, message: "unknown flag" });
          continue;
        }
        if (flagValue !== undefined && typeof flagValue !== "boolean") {
          errors.push({ field: `flags.${flagKey}`, message: "must be a boolean" });
        }
      }
    }
  }

  if (hint.content !== undefined) {
    if (!hint.content || typeof hint.content !== "object" || Array.isArray(hint.content)) {
      errors.push({ field: "content", message: "must be an object with a sections array" });
    } else if (hint.content.sections !== undefined) {
      if (!Array.isArray(hint.content.sections)) {
        errors.push({ field: "content.sections", message: "must be an array" });
      } else {
        hint.content.sections.forEach((section, index) => {
          validateSection(section, errors, `content.sections[${index}]`);
        });
      }
    }
  }

  for (const key of Object.keys(hint)) {
    if (!["domain", "pathPattern", "pageType", "comment", "testUrls", "waitForSelector",
      "requireSelector", "skipSelectors", "preferReadability", "tableExtraction",
      "stabilizeStrategy", "contentSelectors", "flags", "content"].includes(key)) {
      warnings.push({ field: key, message: "unknown field (ignored)" });
    }
  }

  return { errors, warnings };
}

export async function saveDomainHints(hints, hintsPath) {
  const resolvedPath = path.resolve(hintsPath);
  if (resolvedPath === "/dev/null") {
    return { ok: false, error: "hints file is /dev/null — cannot save (hints are disabled via DOMAIN_HINTS_PATH)" };
  }
  if (!Array.isArray(hints)) {
    return { ok: false, error: "hints must be an array" };
  }
  const dir = path.dirname(resolvedPath);
  const tmpPath = path.join(dir, `.${path.basename(resolvedPath)}.tmp-${process.pid}-${Date.now()}`);
  try {
    let previous = "";
    try {
      previous = await fs.readFile(resolvedPath, "utf8");
    } catch {}
    if (previous) {
      await fs.writeFile(`${resolvedPath}.bak`, previous, "utf8");
    }
    await fs.writeFile(tmpPath, JSON.stringify(hints, null, 2) + "\n", "utf8");
    await fs.rename(tmpPath, resolvedPath);
    clearDomainHintCache();
    return { ok: true, count: hints.length, hintsPath: resolvedPath };
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {}
    return { ok: false, error: String(error?.message || error) };
  }
}

export async function loadRawDomainHints(hintsPath) {
  const resolvedPath = path.resolve(hintsPath);
  try {
    await fs.access(resolvedPath);
  } catch {
    return [];
  }
  const raw = await fs.readFile(resolvedPath, "utf8");
  const entries = JSON.parse(raw);
  return Array.isArray(entries) ? entries : [];
}
