import { randomBytes } from "node:crypto";
import { getBrowserManager } from "./browser.js";
import { resolveRefIdToUrl } from "./ref-memory.js";

const MAX_TARGETS = 20;
const MAX_CONSOLE_MESSAGES = 200;
const MAX_QUERY_RESULTS = 25;
const DEFAULT_HTML_LIMIT = 20000;
const INACTIVITY_TIMEOUT_MS = 300_000;
const INACTIVITY_CHECK_INTERVAL_MS = 30_000;
const CLOSED_TARGET_RETENTION_MS = 600_000;

const targetsById = new Map();
const closedTargets = new Map();

function cleanWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, maxChars = 300) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function parseMaxChars(value, fallback = DEFAULT_HTML_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(120000, Math.floor(parsed));
}

function assertString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid input: ${field} must be a non-empty string`);
  }
}

function assertEnabled(manager) {
  if (!manager?.config?.enableDevtoolsMcp) {
    throw new Error("Developer browser tools are disabled. Set ENABLE_DEVTOOLS_MCP=1 to enable them.");
  }
}

function normalizeBackend(manager, backend) {
  const normalized = String(backend || "").trim().toLowerCase();
  if (!normalized) return manager.config.devtoolsBackend || manager.config.defaultBackend;
  if (!["chromium", "cloakbrowser", "lightpanda"].includes(normalized)) {
    throw new Error("Invalid input: backend must be one of chromium, cloakbrowser, lightpanda");
  }
  return normalized;
}

function getTargetState(targetId) {
  const tid = String(targetId || "").trim();
  if (closedTargets.has(tid)) {
    throw new Error(`Target ${tid} was closed due to inactivity (no interaction for 5 minutes). Create a new target with Target.createTarget.`);
  }
  const state = targetsById.get(tid);
  if (!state || !state.page || state.page.isClosed()) {
    throw new Error(`Unknown targetId: ${targetId}`);
  }
  state.lastActiveAt = new Date().toISOString();
  return state;
}

function recordConsoleMessage(state, entry) {
  state.consoleMessages.push(entry);
  while (state.consoleMessages.length > MAX_CONSOLE_MESSAGES) {
    state.consoleMessages.shift();
  }
}

function buildTargetSummary(state) {
  return {
    targetId: state.targetId,
    backend: state.backend,
    url: state.page.url(),
    title: state.lastTitle || "",
    createdAt: state.createdAt,
    lastActiveAt: state.lastActiveAt,
    consoleMessageCount: state.consoleMessages.length
  };
}

async function refreshTitle(state) {
  try {
    state.lastTitle = await state.page.title();
  } catch {
    state.lastTitle = state.lastTitle || "";
  }
}

let inactivityInterval = null;

function startInactivityCleanup() {
  if (inactivityInterval) return;
  inactivityInterval = setInterval(() => {
    const now = Date.now();
    for (const [targetId, state] of [...targetsById.entries()]) {
      if (state.page.isClosed()) continue;
      const lastActive = new Date(state.lastActiveAt).getTime();
      if (now - lastActive >= INACTIVITY_TIMEOUT_MS) {
        closedTargets.set(targetId, { closedAt: new Date().toISOString() });
        state.page.close().catch(() => {});
      }
    }
    for (const [targetId, entry] of [...closedTargets.entries()]) {
      if (now - new Date(entry.closedAt).getTime() >= CLOSED_TARGET_RETENTION_MS) {
        closedTargets.delete(targetId);
      }
    }
  }, INACTIVITY_CHECK_INTERVAL_MS);
  inactivityInterval.unref();
}

startInactivityCleanup();

function installPageObservers(state) {
  const { page } = state;

  page.on("console", async (message) => {
    let args = [];
    try {
      const handles = await Promise.all(
        message.args().slice(0, 5).map(async (handle) => {
          try {
            return await handle.jsonValue();
          } catch {
            return handle.toString();
          }
        })
      );
      args = handles;
    } catch {
      args = [];
    }

    recordConsoleMessage(state, {
      type: message.type(),
      text: cleanWhitespace(message.text()),
      args,
      location: message.location(),
      timestamp: new Date().toISOString()
    });
  });

  page.on("pageerror", (error) => {
    recordConsoleMessage(state, {
      type: "pageerror",
      text: truncate(error?.stack || error?.message || String(error), 1000),
      timestamp: new Date().toISOString()
    });
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    recordConsoleMessage(state, {
      type: "requestfailed",
      text: `${request.method()} ${request.url()}${failure?.errorText ? ` - ${failure.errorText}` : ""}`,
      timestamp: new Date().toISOString()
    });
  });

  page.on("framenavigated", async (frame) => {
    if (frame !== page.mainFrame()) return;
    state.lastActiveAt = new Date().toISOString();
    await refreshTitle(state);
  });

  page.on("close", () => {
    targetsById.delete(state.targetId);
  });
}

async function createTarget(args = {}) {
  const manager = await getBrowserManager();
  assertEnabled(manager);

  if (targetsById.size >= MAX_TARGETS) {
    throw new Error(`Too many open targets. Close a target before creating a new one (max ${MAX_TARGETS}).`);
  }

  const backend = normalizeBackend(manager);
  const page = await manager.newPage({ backend });
  const customTargetId = typeof args.targetId === "string" && args.targetId.trim()
    ? args.targetId.trim()
    : null;
  if (customTargetId && targetsById.has(customTargetId)) {
    await page.close();
    throw new Error(`Target ${customTargetId} already exists. Use a different targetId or close the existing one.`);
  }

  let url = typeof args.url === "string" && args.url.trim() ? args.url.trim() : "about:blank";
  if (url === "about:blank" && args.ref_id !== undefined && args.ref_id !== null && Number(args.ref_id) > 0) {
    const ref = Number(args.ref_id);
    if (!Number.isInteger(ref)) {
      throw new Error(`Invalid input: ref_id must be a positive integer, got ${args.ref_id}`);
    }
    url = resolveRefIdToUrl(ref);
  }

  const state = {
    targetId: customTargetId || randomBytes(6).toString("hex"),
    backend,
    page,
    consoleMessages: [],
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    lastTitle: "",
    sourceUrl: url
  };

  installPageObservers(state);
  targetsById.set(state.targetId, state);

  if (url !== "about:blank") {
    await page.goto(url, {
      waitUntil: manager.config.navWaitUntil,
      timeout: manager.config.browserOpTimeoutMs
    });
  }

  await refreshTitle(state);
  return buildTargetSummary(state);
}

async function listTargets() {
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const results = [];
  for (const state of targetsById.values()) {
    if (!state.page || state.page.isClosed()) continue;
    await refreshTitle(state);
    results.push(buildTargetSummary(state));
  }
  return {
    count: results.length,
    targets: results
  };
}

async function closeTarget(args = {}) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  await state.page.close();
  targetsById.delete(state.targetId);
  return {
    targetId: state.targetId,
    closed: true
  };
}

export async function captureTargetScreenshot(args = {}) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);

  const normalizedFormat = args.format === "jpeg" ? "jpeg" : "png";
  const normalizedQuality =
    normalizedFormat === "jpeg"
      ? Math.max(1, Math.min(100, Math.floor(Number.isFinite(args.quality) ? args.quality : 75)))
      : undefined;
  const fullPage = args.fullPage === undefined ? true : Boolean(args.fullPage);
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);

  console.error(`📸  target screenshot: targetId=${args.targetId} format=${normalizedFormat} quality=${normalizedQuality ?? "default"} fullPage=${fullPage} timeout=${timeoutMs}ms`);

  let screenshot;
  try {
    screenshot = await Promise.race([
      state.page.screenshot({
        type: normalizedFormat,
        encoding: "base64",
        fullPage,
        ...(normalizedFormat === "jpeg" && normalizedQuality ? { quality: normalizedQuality } : {})
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Screenshot timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  } catch (error) {
    console.error(`📸  target screenshot failed: targetId=${args.targetId} error=${String(error?.message || error)}`);
    if (error?.stack) console.error(`📸  stack: ${String(error.stack).slice(0, 500)}`);
    throw error;
  }

  const [resolvedUrl, pageTitle] = await Promise.all([
    Promise.resolve(state.page.url()),
    state.page.title()
  ]);

  await refreshTitle(state);

  return {
    targetId: state.targetId,
    url: resolvedUrl,
    title: pageTitle,
    format: normalizedFormat,
    contentType: normalizedFormat === "jpeg" ? "image/jpeg" : "image/png",
    sizeBytes: Buffer.byteLength(screenshot, "base64"),
    captureTimestamp: new Date().toISOString(),
    screenshotBase64: screenshot
  };
}

async function navigatePage(args = {}) {
  assertString(args.targetId, "targetId");
  assertString(args.url, "url");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  let state;
  try {
    state = getTargetState(args.targetId);
  } catch (error) {
    if (String(error?.message || "").includes("Unknown targetId")) {
      state = await createTarget({ targetId: args.targetId.trim(), url: args.url.trim() });
      return state;
    }
    throw error;
  }
  await state.page.goto(args.url.trim(), {
    waitUntil: manager.config.navWaitUntil,
    timeout: manager.config.browserOpTimeoutMs
  });
  await refreshTitle(state);
  return buildTargetSummary(state);
}

async function evaluateRuntime(args = {}) {
  assertString(args.targetId, "targetId");
  assertString(args.expression, "expression");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);
  const result = await Promise.race([
    state.page.evaluate(async (expression) => {
    function cleanWhitespaceInner(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function cssPath(element) {
      if (!(element instanceof Element)) return null;
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
        let segment = node.tagName.toLowerCase();
        if (node.id) {
          segment += `#${node.id}`;
          parts.unshift(segment);
          break;
        }
        const siblings = node.parentElement
          ? Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName)
          : [];
        if (siblings.length > 1) {
          const index = siblings.indexOf(node);
          segment += `:nth-of-type(${index + 1})`;
        }
        parts.unshift(segment);
        node = node.parentElement;
      }
      return parts.join(" > ");
    }

    function xpathFor(element) {
      if (!(element instanceof Element)) return null;
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE) {
        let index = 1;
        let sibling = node.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === node.tagName) index += 1;
          sibling = sibling.previousElementSibling;
        }
        parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
        node = node.parentElement;
      }
      return `/${parts.join("/")}`;
    }

    function describeElement(element) {
      const rect = element.getBoundingClientRect();
      return {
        tagName: element.tagName.toLowerCase(),
        text: cleanWhitespaceInner(element.innerText || element.textContent || "").slice(0, 500),
        value: "value" in element ? String(element.value || "") : "",
        selector: cssPath(element),
        xpath: xpathFor(element),
        attributes: {
          id: element.id || "",
          class: element.className || "",
          role: element.getAttribute("role") || "",
          name: element.getAttribute("name") || "",
          type: element.getAttribute("type") || "",
          href: element.getAttribute("href") || "",
          src: element.getAttribute("src") || "",
          placeholder: element.getAttribute("placeholder") || ""
        },
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    }

    function serialize(value, depth = 0, seen = new WeakSet()) {
      if (value === null || value === undefined) return value;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      if (typeof value === "bigint") return value.toString();
      if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
      if (value instanceof Date) return value.toISOString();
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: String(value.stack || "").slice(0, 2000)
        };
      }
      if (value instanceof Element) return describeElement(value);
      if (value instanceof NodeList || value instanceof HTMLCollection || Array.isArray(value)) {
        return Array.from(value).slice(0, 25).map((item) => serialize(item, depth + 1, seen));
      }
      if (typeof value === "object") {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
        if (depth >= 4) return "[MaxDepth]";
        const out = {};
        for (const key of Object.keys(value).slice(0, 25)) {
          out[key] = serialize(value[key], depth + 1, seen);
        }
        return out;
      }
      return String(value);
    }

    let raw;
    try {
      raw = globalThis.eval(expression);
    } catch (evalError) {
      if (evalError instanceof SyntaxError) {
        raw = await new Function('return (async () => (' + expression + '))()')();
      } else {
        throw evalError;
      }
    }
    const awaited = raw && typeof raw.then === "function" ? await raw : raw;
    return serialize(awaited);
  }, args.expression),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Runtime evaluation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  return {
    targetId: state.targetId,
    result
  };
}

async function getConsoleMessages(args = {}) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const limit = Math.max(1, Math.min(100, Number(args.limit) || 30));
  return {
    targetId: state.targetId,
    count: state.consoleMessages.length,
    messages: state.consoleMessages.slice(-limit)
  };
}

async function getDocument(args = {}) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const limit = Math.max(1, Math.min(MAX_QUERY_RESULTS, Number(args.limit) || 15));
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);
  const result = await Promise.race([
    state.page.evaluate((limitValue) => {
    function cleanWhitespaceInner(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function cssPath(element) {
      if (!(element instanceof Element)) return null;
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
        let segment = node.tagName.toLowerCase();
        if (node.id) {
          segment += `#${node.id}`;
          parts.unshift(segment);
          break;
        }
        const siblings = node.parentElement
          ? Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName)
          : [];
        if (siblings.length > 1) {
          const index = siblings.indexOf(node);
          segment += `:nth-of-type(${index + 1})`;
        }
        parts.unshift(segment);
        node = node.parentElement;
      }
      return parts.join(" > ");
    }

    function xpathFor(element) {
      if (!(element instanceof Element)) return null;
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE) {
        let index = 1;
        let sibling = node.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === node.tagName) index += 1;
          sibling = sibling.previousElementSibling;
        }
        parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
        node = node.parentElement;
      }
      return `/${parts.join("/")}`;
    }

    function visible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }

    function describe(element) {
      const rect = element.getBoundingClientRect();
      return {
        tagName: element.tagName.toLowerCase(),
        role: element.getAttribute("role") || "",
        text: cleanWhitespaceInner(element.innerText || element.textContent || "").slice(0, 300),
        selector: cssPath(element),
        xpath: xpathFor(element),
        attributes: {
          id: element.id || "",
          class: element.className || "",
          name: element.getAttribute("name") || "",
          type: element.getAttribute("type") || "",
          href: element.getAttribute("href") || "",
          placeholder: element.getAttribute("placeholder") || ""
        },
        visible: visible(element),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    }

    const selectors = [
      "main",
      "article",
      "h1",
      "h2",
      "button",
      "a[href]",
      "input",
      "textarea",
      "select",
      "[role='button']",
      "[role='link']",
      "[data-testid]"
    ];

    const nodes = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const key = cssPath(element);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        nodes.push(describe(element));
        if (nodes.length >= limitValue) break;
      }
      if (nodes.length >= limitValue) break;
    }

    return {
      title: document.title || "",
      url: location.href,
      readyState: document.readyState,
      elements: nodes
    };
  }, limit),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`getDocument timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  return {
    targetId: state.targetId,
    ...result
  };
}

async function querySelector(args = {}, multiple = false) {
  assertString(args.targetId, "targetId");
  if (!args.selector && !args.xpath) {
    throw new Error("Invalid input: provide selector or xpath");
  }

  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const limit = Math.max(1, Math.min(MAX_QUERY_RESULTS, Number(args.limit) || 10));
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);
  const result = await Promise.race([
    state.page.evaluate(({ selector, xpath, multiple: wantsMany, limit: limitValue }) => {
    function cleanWhitespaceInner(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function cssPath(element) {
      if (!(element instanceof Element)) return null;
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
        let segment = node.tagName.toLowerCase();
        if (node.id) {
          segment += `#${node.id}`;
          parts.unshift(segment);
          break;
        }
        const siblings = node.parentElement
          ? Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName)
          : [];
        if (siblings.length > 1) {
          const index = siblings.indexOf(node);
          segment += `:nth-of-type(${index + 1})`;
        }
        parts.unshift(segment);
        node = node.parentElement;
      }
      return parts.join(" > ");
    }

    function xpathFor(element) {
      if (!(element instanceof Element)) return null;
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE) {
        let index = 1;
        let sibling = node.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === node.tagName) index += 1;
          sibling = sibling.previousElementSibling;
        }
        parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
        node = node.parentElement;
      }
      return `/${parts.join("/")}`;
    }

    function visible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }

    function describe(element) {
      const rect = element.getBoundingClientRect();
      return {
        tagName: element.tagName.toLowerCase(),
        text: cleanWhitespaceInner(element.innerText || element.textContent || "").slice(0, 300),
        selector: cssPath(element),
        xpath: xpathFor(element),
        visible: visible(element),
        attributes: {
          id: element.id || "",
          class: element.className || "",
          role: element.getAttribute("role") || "",
          name: element.getAttribute("name") || "",
          type: element.getAttribute("type") || "",
          href: element.getAttribute("href") || "",
          placeholder: element.getAttribute("placeholder") || ""
        },
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    }

    function nodesFromXpath(expression) {
      const results = [];
      const snapshot = document.evaluate(expression, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let index = 0; index < snapshot.snapshotLength; index += 1) {
        const node = snapshot.snapshotItem(index);
        if (node instanceof Element) results.push(node);
      }
      return results;
    }

    const cleanedSelector = selector
      ? selector
          .replace(/:has-text\([^)]*\)/gi, "")
          .replace(/:text\([^)]*\)/gi, "")
          .replace(/,\s*,/g, ",")
          .replace(/^[\s,]+|[\s,]+$/g, "")
      : "";
    const nodes = cleanedSelector
      ? Array.from(document.querySelectorAll(cleanedSelector))
      : selector
        ? []
        : nodesFromXpath(xpath);
    const described = nodes.slice(0, limitValue).map((node) => describe(node));
    return wantsMany ? described : described[0] || null;
  }, {
    selector: args.selector || "",
    xpath: args.xpath || "",
    multiple,
    limit
  }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`querySelector timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  return {
    targetId: state.targetId,
    ...(multiple ? { count: result.length, elements: result } : { element: result })
  };
}

async function getOuterHtml(args = {}) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const maxChars = parseMaxChars(args.maxChars, DEFAULT_HTML_LIMIT);
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);
  const result = await Promise.race([
    state.page.evaluate(({ selector, xpath, maxChars: limit }) => {
    function cssPath(element) {
      if (!(element instanceof Element)) return null;
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
        let segment = node.tagName.toLowerCase();
        if (node.id) {
          segment += `#${node.id}`;
          parts.unshift(segment);
          break;
        }
        const siblings = node.parentElement
          ? Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName)
          : [];
        if (siblings.length > 1) {
          const index = siblings.indexOf(node);
          segment += `:nth-of-type(${index + 1})`;
        }
        parts.unshift(segment);
        node = node.parentElement;
      }
      return parts.join(" > ");
    }

    function xpathFor(element) {
      if (!(element instanceof Element)) return null;
      const parts = [];
      let node = element;
      while (node && node.nodeType === Node.ELEMENT_NODE) {
        let index = 1;
        let sibling = node.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === node.tagName) index += 1;
          sibling = sibling.previousElementSibling;
        }
        parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
        node = node.parentElement;
      }
      return `/${parts.join("/")}`;
    }

    function firstXpath(expression) {
      const node = document.evaluate(expression, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      return node instanceof Element ? node : null;
    }

    const smartRoot = document.querySelector("main, article, [role='main'], #content, .content") || document.documentElement;
    const element = selector
      ? document.querySelector(selector)
      : xpath
        ? firstXpath(xpath)
        : smartRoot;

    if (!(element instanceof Element)) {
      return null;
    }

    const html = element.outerHTML || "";
    return {
      selector: cssPath(element),
      xpath: xpathFor(element),
      tagName: element.tagName.toLowerCase(),
      html: html.length > limit ? `${html.slice(0, Math.max(0, limit - 3))}...` : html
    };
  }, {
    selector: args.selector || "",
    xpath: args.xpath || "",
    maxChars
  }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`getOuterHTML timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  if (!result) {
    throw new Error("Could not resolve element for DOM.getOuterHTML");
  }

  return {
    targetId: state.targetId,
    ...result
  };
}

async function getCompactHtml(args = {}) {
  assertString(args.targetId, "targetId");
  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const maxChars = parseMaxChars(args.maxChars, DEFAULT_HTML_LIMIT);
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);
  const result = await Promise.race([
    state.page.evaluate(({ selector, xpath, maxChars: limit }) => {
      const KEEP_ATTRS = new Set([
        "href", "src", "alt", "title", "name", "type", "value", "role", "placeholder",
        "for", "target", "rel", "checked", "selected", "disabled", "readonly",
        "contenteditable", "width", "height", "colspan", "rowspan", "headers", "scope"
      ]);
      const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
      const NOISE_TAGS = new Set(["script", "style", "noscript", "template", "link", "meta", "iframe", "object", "embed", "canvas", "svg", "video", "audio"]);
      const PRESERVE_WS = new Set(["pre", "code", "textarea"]);

      function cssPath(element) {
        if (!(element instanceof Element)) return null;
        const parts = [];
        let node = element;
        while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
          let segment = node.tagName.toLowerCase();
          if (node.id) {
            segment += `#${node.id}`;
            parts.unshift(segment);
            break;
          }
          const siblings = node.parentElement
            ? Array.from(node.parentElement.children).filter((child) => child.tagName === node.tagName)
            : [];
          if (siblings.length > 1) {
            const index = siblings.indexOf(node);
            segment += `:nth-of-type(${index + 1})`;
          }
          parts.unshift(segment);
          node = node.parentElement;
        }
        return parts.join(" > ");
      }

      function xpathFor(element) {
        if (!(element instanceof Element)) return null;
        const parts = [];
        let node = element;
        while (node && node.nodeType === Node.ELEMENT_NODE) {
          let index = 1;
          let sibling = node.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === node.tagName) index += 1;
            sibling = sibling.previousElementSibling;
          }
          parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
          node = node.parentElement;
        }
        return `/${parts.join("/")}`;
      }

      function firstXpath(expression) {
        const node = document.evaluate(expression, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        return node instanceof Element ? node : null;
      }

      function isNoiseAttr(name) {
        const low = name.toLowerCase();
        if (low === "id" || low === "class") return false;
        if (low === "style" || low.startsWith("on")) return true;
        if (low.startsWith("data-") || low.startsWith("aria-")) return false;
        return !KEEP_ATTRS.has(low);
      }

      function compact(node) {
        const root = node.cloneNode(true);
        const doomed = Array.from(root.querySelectorAll(Array.from(NOISE_TAGS).join(",")));
        const head = root.querySelector("head");
        if (head) doomed.push(head);
        doomed.forEach((el) => el.remove());

        const comments = [];
        const commentWalker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
        while (commentWalker.nextNode()) comments.push(commentWalker.currentNode);
        comments.forEach((c) => c.remove());

        const textNodes = [];
        const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (textWalker.nextNode()) textNodes.push(textWalker.currentNode);
        for (const textNode of textNodes) {
          const parentTag = textNode.parentElement ? textNode.parentElement.tagName.toLowerCase() : "";
          if (PRESERVE_WS.has(parentTag)) continue;
          if (!textNode.nodeValue.trim()) {
            textNode.remove();
            continue;
          }
          textNode.nodeValue = textNode.nodeValue.replace(/\s+/g, " ").trim();
        }

        let pass = 0;
        while (pass++ < 10) {
          let removed = false;
          for (const el of Array.from(root.querySelectorAll("*"))) {
            if (VOID_TAGS.has(el.tagName.toLowerCase())) continue;
            if (el.id) continue;
            if (el.children.length === 0 && !el.textContent.trim()) {
              el.remove();
              removed = true;
            }
          }
          if (!removed) break;
        }

        const all = [root, ...root.querySelectorAll("*")];
        for (const el of all) {
          for (const attr of Array.from(el.attributes)) {
            if (isNoiseAttr(attr.name)) el.removeAttribute(attr.name);
          }
          const cls = el.getAttribute("class");
          if (cls && cls.length > 120) el.setAttribute("class", cls.slice(0, 120));
        }

        return root;
      }

      const smartRoot = document.querySelector("main, article, [role='main'], #content, .content") || document.documentElement;
      const element = selector
        ? document.querySelector(selector)
        : xpath
          ? firstXpath(xpath)
          : smartRoot;

      if (!(element instanceof Element)) {
        return null;
      }

      const charsBefore = element.outerHTML.length;
      const clean = compact(element);
      const html = clean.outerHTML || "";
      return {
        title: document.title || "",
        selector: cssPath(element),
        xpath: xpathFor(element),
        tagName: element.tagName.toLowerCase(),
        charsBefore,
        charsAfter: html.length,
        html: html.length > limit ? `${html.slice(0, Math.max(0, limit - 3))}...` : html
      };
    }, {
      selector: args.selector || "",
      xpath: args.xpath || "",
      maxChars
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`getCompactHTML timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  if (!result) {
    throw new Error("Could not resolve element for DOM.getCompactHTML");
  }

  return {
    targetId: state.targetId,
    ...result
  };
}

async function scrollIntoViewIfNeeded(args = {}) {
  assertString(args.targetId, "targetId");
  if (!args.selector && !args.xpath) {
    throw new Error("Invalid input: provide selector or xpath");
  }

  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);
  const result = await Promise.race([
    state.page.evaluate(({ selector, xpath }) => {
    function firstXpath(expression) {
      const node = document.evaluate(expression, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      return node instanceof Element ? node : null;
    }

    const element = selector
      ? document.querySelector(selector)
      : firstXpath(xpath);
    if (!(element instanceof Element)) return null;
    element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    const rect = element.getBoundingClientRect();
    return {
      tagName: element.tagName.toLowerCase(),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }, {
    selector: args.selector || "",
    xpath: args.xpath || ""
  }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`scrollIntoViewIfNeeded timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  if (!result) {
    throw new Error("Could not resolve element for DOM.scrollIntoViewIfNeeded");
  }

  return {
    targetId: state.targetId,
    ...result
  };
}

async function dispatchMouseEvent(args = {}) {
  assertString(args.targetId, "targetId");
  if (!args.selector && !args.xpath) {
    throw new Error("Invalid input: provide selector or xpath");
  }

  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const button = ["left", "right", "middle"].includes(String(args.button || "").toLowerCase())
    ? String(args.button).toLowerCase()
    : "left";
  const clickCount = Math.max(1, Math.min(3, Number(args.clickCount) || 1));
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);

  const point = await Promise.race([
    state.page.evaluate(({ selector, xpath }) => {
      function firstXpath(expression) {
        const node = document.evaluate(expression, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        return node instanceof Element ? node : null;
      }

      const element = selector
        ? document.querySelector(selector)
        : firstXpath(xpath);
      if (!(element instanceof Element)) return null;
      element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + Math.max(1, rect.width / 2),
        y: rect.top + Math.max(1, rect.height / 2),
        tagName: element.tagName.toLowerCase()
      };
    }, {
      selector: args.selector || "",
      xpath: args.xpath || ""
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Element resolution timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  if (!point) {
    throw new Error("Could not resolve element for Input.dispatchMouseEvent");
  }

  await Promise.race([
    state.page.mouse.click(point.x, point.y, { button, clickCount }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Mouse click timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
  return {
    targetId: state.targetId,
    clicked: true,
    button,
    clickCount,
    point
  };
}

async function insertText(args = {}) {
  assertString(args.targetId, "targetId");
  assertString(args.text, "text");
  if (!args.selector && !args.xpath) {
    throw new Error("Invalid input: provide selector or xpath");
  }

  const manager = await getBrowserManager();
  assertEnabled(manager);
  const state = getTargetState(args.targetId);
  const timeoutMs = Math.max(1000, Number(manager.config.browserOpTimeoutMs) || 60000);
  const point = await Promise.race([
    state.page.evaluate(({ selector, xpath }) => {
    function firstXpath(expression) {
      const node = document.evaluate(expression, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      return node instanceof Element ? node : null;
    }

    const element = selector
      ? document.querySelector(selector)
      : firstXpath(xpath);
    if (!(element instanceof HTMLElement)) return null;
    element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    const rect = element.getBoundingClientRect();
    element.focus();
    if ("value" in element) {
      element.value = "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return {
      x: rect.left + Math.max(1, rect.width / 2),
      y: rect.top + Math.max(1, rect.height / 2),
      tagName: element.tagName.toLowerCase()
    };
  }, {
    selector: args.selector || "",
    xpath: args.xpath || ""
  }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Element resolution timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);

  if (!point) {
    throw new Error("Could not resolve element for Input.insertText");
  }

  await Promise.race([
    state.page.mouse.click(point.x, point.y, { button: "left", clickCount: 1 }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Mouse click timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
  await Promise.race([
    state.page.keyboard.type(args.text, { delay: manager.config.humanTypingDelay }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Keyboard type timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
  return {
    targetId: state.targetId,
    insertedText: true,
    length: args.text.length,
    point
  };
}

export const devtoolsToolDefinitions = [
  {
    name: "Target.createTarget",
    description: "Create a persistent browser tab for interactive testing. Provide a url, or a ref_id from a prior web_search / web_fetch to open that page.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string", description: "Optional custom target id. If omitted, a random id is generated." },
        url: { type: "string", description: "Optional starting URL. Defaults to about:blank." },
        ref_id: { type: "number", description: "Optional numeric reference from a prior web_search or web_fetch to open. Overridden by url when both are given." }
      },
      additionalProperties: false
    }
  },
  {
    name: "Target.getTargets",
    description: "List open persistent testing tabs created through Target.createTarget.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "Target.closeTarget",
    description: "Close a persistent testing tab.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "Page.navigate",
    description: "Navigate an existing testing tab to a new URL.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        url: { type: "string" }
      },
      required: ["targetId", "url"],
      additionalProperties: false
    }
  },
  {
    name: "Runtime.evaluate",
    description: "Evaluate JavaScript in the page context and return a JSON-safe result.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        expression: { type: "string" }
      },
      required: ["targetId", "expression"],
      additionalProperties: false
    }
  },
  {
    name: "Runtime.getConsoleMessages",
    description: "Read captured console, page error, and request failure messages for a testing tab.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        limit: { type: "number", default: 30 }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "DOM.getDocument",
    description: "Return an LLM-friendly page snapshot with important elements, selectors, and xpaths.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        limit: { type: "number", default: 15 }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "DOM.querySelector",
    description: "Query a single element and return its selector, xpath, text, and attributes.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        xpath: { type: "string" }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "DOM.querySelectorAll",
    description: "Query multiple elements and return LLM-friendly descriptors.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        xpath: { type: "string" },
        limit: { type: "number", default: 10 }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "DOM.getOuterHTML",
    description: "Get outerHTML for a selector/xpath, or smart main content HTML when no locator is provided.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        xpath: { type: "string" },
        maxChars: { type: "number", default: DEFAULT_HTML_LIMIT }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "DOM.getCompactHTML",
    description: "Get minimized HTML for a selector/xpath, or smart main content HTML when no locator is provided. Strips scripts, styles, comments, svg, iframes, head, and non-essential attributes; collapses whitespace; drops empty elements. Returns a single-line minified string — use for fast DOM debugging without raw-page noise.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        xpath: { type: "string" },
        maxChars: { type: "number", default: DEFAULT_HTML_LIMIT }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "DOM.scrollIntoViewIfNeeded",
    description: "Scroll an element into view using selector or xpath.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        xpath: { type: "string" }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "Input.dispatchMouseEvent",
    description: "Click an element by selector or xpath using the page mouse.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        xpath: { type: "string" },
        button: {
          type: "string",
          enum: ["left", "right", "middle"],
          default: "left"
        },
        clickCount: { type: "number", default: 1 }
      },
      required: ["targetId"],
      additionalProperties: false
    }
  },
  {
    name: "Input.insertText",
    description: "Focus an input-like element and type text into it.",
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        selector: { type: "string" },
        xpath: { type: "string" },
        text: { type: "string" }
      },
      required: ["targetId", "text"],
      additionalProperties: false
    }
  }
];

export async function handleDevtoolsToolCall(name, args = {}) {
  if (name === "Target.createTarget") return createTarget(args);
  if (name === "Target.getTargets") return listTargets(args);
  if (name === "Target.closeTarget") return closeTarget(args);
  if (name === "Page.navigate") return navigatePage(args);
  if (name === "Runtime.evaluate") return evaluateRuntime(args);
  if (name === "Runtime.getConsoleMessages") return getConsoleMessages(args);
  if (name === "DOM.getDocument") return getDocument(args);
  if (name === "DOM.querySelector") return querySelector(args, false);
  if (name === "DOM.querySelectorAll") return querySelector(args, true);
  if (name === "DOM.getOuterHTML") return getOuterHtml(args);
  if (name === "DOM.getCompactHTML") return getCompactHtml(args);
  if (name === "DOM.scrollIntoViewIfNeeded") return scrollIntoViewIfNeeded(args);
  if (name === "Input.dispatchMouseEvent") return dispatchMouseEvent(args);
  if (name === "Input.insertText") return insertText(args);
  throw new Error(`Unknown developer browser tool: ${name}`);
}

export function formatDevtoolsToolResponse(name, payload) {
  const lines = [name];
  lines.push("", "```json", JSON.stringify(payload, null, 2), "```");
  return {
    content: [
      {
        type: "text",
        text: lines.join("\n")
      }
    ]
  };
}
