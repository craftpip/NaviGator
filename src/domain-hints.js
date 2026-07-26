import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    return new URL(urlStr).pathname;
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

export function findDomainHint(urlStr, hints) {
  if (!urlStr || !Array.isArray(hints) || !hints.length) return null;
  for (const entry of hints) {
    if (isMatch(entry, urlStr)) return entry;
  }
  return null;
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
