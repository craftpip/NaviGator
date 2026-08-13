import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";

let loadedHints = null;
let loadedPath = null;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileGlob(pattern) {
  if (pattern.endsWith("/**")) {
    const prefix = escapeRegex(pattern.slice(0, -3));
    const regex = new RegExp(`^${prefix}(?:/.*)?$`);
    return (pathname) => regex.test(pathname);
  }
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

export const BLOCK_FORMATS = [
  "text",
  "list",
  "html",
  "html_to_markdown",
  "readability_to_markdown",
  "table",
  "table_json",
  "table_csv"
];

const LEGACY_MARKDOWN_FORMAT = "markdown";

export const FIELD_FORMATS = [
  "text",
  "list",
  "markdown",
  "html",
  "html_to_markdown",
  "readability_to_markdown"
];

export const FLOW_ACTIONS = ["extract", "click", "wait", "type", "navigate"];
export const FLOW_MAX_STEPS = 8;
export const FLOW_MAX_CLICKS = 4;
export const FLOW_TIMEOUT_MIN = 250;
export const FLOW_TIMEOUT_MAX = 20000;
export const FLOW_TOTAL_TIMEOUT_MAX = 45000;
export const FLOW_STATES = ["visible", "attached", "hidden"];

const FLOW_ACTION_KEYS = {
  extract: ["action", "label", "content"],
  click: ["action", "selector", "waitForSelector", "timeoutMs"],
  wait: ["action", "selector", "state", "timeoutMs"],
  type: ["action", "selector", "text", "clear", "submit", "waitForSelector", "timeoutMs"],
  navigate: ["action", "url", "waitForSelector", "timeoutMs"]
};

const FLOW_INTERACTION_ACTIONS = new Set(["click", "type", "navigate"]);

function validateSelectorField(step, key, errors, prefix) {
  if (step[key] === undefined) {
    errors.push({ field: `${prefix}.${key}`, message: "required" });
    return;
  }
  if (typeof step[key] !== "string" || !step[key].trim()) {
    errors.push({ field: `${prefix}.${key}`, message: "must be a non-empty CSS selector string" });
    return;
  }
  const selectorError = validateSelector(step[key]);
  if (selectorError) errors.push({ field: `${prefix}.${key}`, message: `invalid CSS selector: ${selectorError}` });
}

function validateField(field, errors, fieldPrefix) {
  if (!field || typeof field !== "object" || Array.isArray(field)) {
    errors.push({ field: fieldPrefix, message: "must be an object" });
    return;
  }
  const prefix = `${fieldPrefix}.`;
  if (typeof field.selector !== "string" || !field.selector) {
    errors.push({ field: `${prefix}selector`, message: "required" });
  } else {
    const selectorError = validateSelector(field.selector);
    if (selectorError) errors.push({ field: `${prefix}selector`, message: `invalid CSS selector: ${selectorError}` });
  }
  if (typeof field.label !== "string" || !field.label.trim()) {
    errors.push({ field: `${prefix}label`, message: "required" });
  }
  if (field.format !== undefined && !FIELD_FORMATS.includes(field.format)) {
    errors.push({ field: `${prefix}format`, message: `must be one of ${FIELD_FORMATS.map((f) => `"${f}"`).join(", ")}` });
  }
}

function validateBlock(block, errors, fieldPrefix) {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    errors.push({ field: fieldPrefix, message: "must be an object" });
    return;
  }
  const prefix = `${fieldPrefix}.`;
  if (typeof block.selector !== "string" || !block.selector) {
    errors.push({ field: `${prefix}selector`, message: "required" });
  } else {
    const selectorError = validateSelector(block.selector);
    if (selectorError) errors.push({ field: `${prefix}selector`, message: `invalid CSS selector: ${selectorError}` });
  }
  if (typeof block.label !== "string" || !block.label.trim()) {
    errors.push({ field: `${prefix}label`, message: "required" });
  }
  if (block.priority !== undefined && !["high", "medium", "low"].includes(block.priority)) {
    errors.push({ field: `${prefix}priority`, message: 'must be one of "high", "medium", "low"' });
  }

  const hasFormat = block.format !== undefined;
  const hasFields = block.fields !== undefined;
  if (hasFormat === hasFields) {
    errors.push({
      field: fieldPrefix,
      message: 'must be a leaf block (with "format") or a record block (with "fields"), not both or neither'
    });
    return;
  }

  if (hasFormat) {
    if (!BLOCK_FORMATS.includes(block.format) && block.format !== LEGACY_MARKDOWN_FORMAT) {
      errors.push({ field: `${prefix}format`, message: `must be one of ${BLOCK_FORMATS.map((f) => `"${f}"`).join(", ")}` });
    }
    return;
  }

  if (block.itemLabel !== undefined && typeof block.itemLabel !== "string") {
    errors.push({ field: `${prefix}itemLabel`, message: "must be a string" });
  }
  if (!Array.isArray(block.fields) || !block.fields.length) {
    errors.push({ field: `${prefix}fields`, message: "must be a non-empty array of leaf blocks" });
  } else {
    block.fields.forEach((field, index) => {
      validateField(field, errors, `${prefix}fields[${index}]`);
    });
  }
}

function validateContent(content, errors, fieldPrefix, warnings) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    errors.push({ field: fieldPrefix, message: "must be an object with a blocks array" });
    return;
  }
  if (content.blocks !== undefined) {
    if (!Array.isArray(content.blocks) || !content.blocks.length) {
      errors.push({ field: `${fieldPrefix}.blocks`, message: "must be a non-empty array" });
    } else {
      content.blocks.forEach((block, index) => {
        validateBlock(block, errors, `${fieldPrefix}.blocks[${index}]`);
      });
    }
  }
  if (content.sections !== undefined) {
    if (!Array.isArray(content.sections)) {
      errors.push({ field: `${fieldPrefix}.sections`, message: "must be an array" });
    } else {
      content.sections.forEach((section, index) => {
        validateSection(section, errors, `${fieldPrefix}.sections[${index}]`);
      });
    }
  }
  if (content.blocks?.length && content.sections?.length) {
    warnings.push({ field: fieldPrefix, message: 'contains both "blocks" and legacy "sections" — blocks take priority' });
  }
}

function validateFlow(flow, errors, warnings, fieldPrefix = "flow") {
  if (!Array.isArray(flow) || !flow.length) {
    errors.push({ field: fieldPrefix, message: "must be a non-empty array of steps" });
    return;
  }
  if (flow.length > FLOW_MAX_STEPS) {
    errors.push({ field: fieldPrefix, message: `must have at most ${FLOW_MAX_STEPS} steps (got ${flow.length})` });
    return;
  }

  let clickCount = 0;
  let extractCount = 0;
  let prevAction = null;
  flow.forEach((step, index) => {
    const stepField = `${fieldPrefix}[${index}]`;
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      errors.push({ field: stepField, message: "must be an object" });
      return;
    }
    const action = step.action;
    if (!FLOW_ACTIONS.includes(action)) {
      errors.push({ field: `${stepField}.action`, message: `must be one of ${FLOW_ACTIONS.map((a) => `"${a}"`).join(", ")}` });
      return;
    }

    const allowed = FLOW_ACTION_KEYS[action];
    for (const key of Object.keys(step)) {
      if (!allowed.includes(key)) {
        warnings.push({ field: `${stepField}.${key}`, message: `unknown property for "${action}" step (ignored)` });
      }
    }

    if (step.timeoutMs !== undefined) {
      if (!Number.isInteger(step.timeoutMs) || step.timeoutMs < FLOW_TIMEOUT_MIN || step.timeoutMs > FLOW_TIMEOUT_MAX) {
        errors.push({ field: `${stepField}.timeoutMs`, message: `must be an integer between ${FLOW_TIMEOUT_MIN} and ${FLOW_TIMEOUT_MAX}` });
      }
    }

    if (action === "extract") {
      extractCount += 1;
      if (typeof step.label !== "string" || !step.label.trim() || step.label.length > 80) {
        errors.push({ field: `${stepField}.label`, message: "required, 1-80 characters" });
      }
      if (step.content === undefined) {
        errors.push({ field: `${stepField}.content`, message: "required" });
      } else {
        validateContent(step.content, errors, `${stepField}.content`, warnings);
      }
    } else if (action === "click") {
      clickCount += 1;
      validateSelectorField(step, "selector", errors, stepField);
      validateSelectorField(step, "waitForSelector", errors, stepField);
    } else if (action === "wait") {
      validateSelectorField(step, "selector", errors, stepField);
      if (step.state !== undefined && !FLOW_STATES.includes(step.state)) {
        errors.push({ field: `${stepField}.state`, message: `must be one of ${FLOW_STATES.map((s) => `"${s}"`).join(", ")}` });
      }
    } else if (action === "type") {
      validateSelectorField(step, "selector", errors, stepField);
      if (typeof step.text !== "string" || !step.text) {
        errors.push({ field: `${stepField}.text`, message: "required" });
      }
      if (step.clear !== undefined && typeof step.clear !== "boolean") {
        errors.push({ field: `${stepField}.clear`, message: "must be a boolean" });
      }
      if (step.submit !== undefined && typeof step.submit !== "boolean") {
        errors.push({ field: `${stepField}.submit`, message: "must be a boolean" });
      }
      if (step.submit === true && step.waitForSelector === undefined) {
        errors.push({ field: `${stepField}.waitForSelector`, message: 'required when "submit" is true' });
      }
      if (step.waitForSelector !== undefined) {
        validateSelectorField(step, "waitForSelector", errors, stepField);
      }
    } else if (action === "navigate") {
      if (typeof step.url !== "string" || !step.url.trim()) {
        errors.push({ field: `${stepField}.url`, message: "required" });
      } else {
        try {
          new URL(step.url, "https://example.com");
        } catch {
          errors.push({ field: `${stepField}.url`, message: "must be an absolute or relative URL" });
        }
      }
      validateSelectorField(step, "waitForSelector", errors, stepField);
    }

    if (prevAction && FLOW_INTERACTION_ACTIONS.has(action) && FLOW_INTERACTION_ACTIONS.has(prevAction)) {
      errors.push({
        field: stepField,
        message: `a "${prevAction}" step cannot be followed by a "${action}" step — an extract or wait must separate them`
      });
    }
    prevAction = action;
  });

  if (extractCount === 0) {
    errors.push({ field: fieldPrefix, message: "must contain at least one extract step" });
  }
  const last = flow[flow.length - 1];
  if (last?.action !== "extract") {
    errors.push({ field: fieldPrefix, message: "must end with an extract step" });
  }
  if (clickCount > FLOW_MAX_CLICKS) {
    errors.push({ field: fieldPrefix, message: `must contain at most ${FLOW_MAX_CLICKS} click steps (got ${clickCount})` });
  }
}

function validateFlowOptions(hint, errors, warnings) {
  if (hint.flowOptions === undefined) return;
  const flowOptions = hint.flowOptions;
  if (!flowOptions || typeof flowOptions !== "object" || Array.isArray(flowOptions)) {
    errors.push({ field: "flowOptions", message: "must be an object" });
    return;
  }
  if (flowOptions.totalTimeoutMs !== undefined) {
    if (!Number.isInteger(flowOptions.totalTimeoutMs) || flowOptions.totalTimeoutMs <= 0 || flowOptions.totalTimeoutMs > FLOW_TOTAL_TIMEOUT_MAX) {
      errors.push({ field: "flowOptions.totalTimeoutMs", message: `must be an integer between 1 and ${FLOW_TOTAL_TIMEOUT_MAX}` });
    }
  }
  if (flowOptions.continueOnEmptyExtract !== undefined && typeof flowOptions.continueOnEmptyExtract !== "boolean") {
    errors.push({ field: "flowOptions.continueOnEmptyExtract", message: "must be a boolean" });
  }
  for (const key of Object.keys(flowOptions)) {
    if (!["totalTimeoutMs", "continueOnEmptyExtract"].includes(key)) {
      warnings.push({ field: `flowOptions.${key}`, message: "unknown field (ignored)" });
    }
  }
}

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
        if (typeof testUrl !== "string" || !/^https?:\/\//.test(testUrl)) {
          errors.push({ field: `testUrls[${index}]`, message: "must be an http:// or https:// URL" });
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
    if (typeof hint.requireSelector !== "string") {
      errors.push({ field: "requireSelector", message: "must be a string" });
    } else if (hint.requireSelector.trim()) {
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
  if (hint.tableExtraction !== undefined && hint.tableExtraction !== "" && !["content", "disabled"].includes(hint.tableExtraction)) {
    errors.push({ field: "tableExtraction", message: 'must be one of "content", "disabled"' });
  }
  if (hint.stabilizeStrategy !== undefined && hint.stabilizeStrategy !== "" && !["network_idle", "content_idle", "mutation"].includes(hint.stabilizeStrategy)) {
    errors.push({ field: "stabilizeStrategy", message: 'must be one of "network_idle", "content_idle", "mutation"' });
  }
  if (hint.contentSelectors !== undefined && !Array.isArray(hint.contentSelectors)) {
    errors.push({ field: "contentSelectors", message: "must be an array of CSS selectors" });
  }

  const flowPresent = Array.isArray(hint.flow) && hint.flow.length > 0;

  if (hint.content !== undefined) {
    if (flowPresent) {
      warnings.push({ field: "content", message: "ignored when a flow is present — flow extract steps own all content" });
    } else {
      validateContent(hint.content, errors, "content", warnings);
    }
  }

  if (hint.flow !== undefined) {
    validateFlow(hint.flow, errors, warnings);
  }
  validateFlowOptions(hint, errors, warnings);

  for (const key of Object.keys(hint)) {
    if (!["domain", "pathPattern", "pageType", "comment", "testUrls", "waitForSelector",
      "requireSelector", "skipSelectors", "preferReadability", "tableExtraction",
      "stabilizeStrategy", "contentSelectors", "content", "flow", "flowOptions"].includes(key)) {
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
