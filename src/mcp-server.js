import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";
import { formatBrowserBackendShort, parseBrowserBackend, DEFAULT_MAX_CHARS } from "./config.js";
import { getBrowserManager } from "./browser.js";
import { browserOpenAndExtract, browserSearch, browserCaptureScreenshot, getSearchBackendHealth } from "./search.js";
import { devtoolsToolDefinitions, formatDevtoolsToolResponse, handleDevtoolsToolCall, captureTargetScreenshot } from "./devtools.js";
import { transform as asciiTransform } from "./ascii.js";
import { SAMPLE_PIXELS_CODE, asciiGridDims } from "./pixel-sampler.js";
import { rememberLink, getUrlForRefId, getLinkRefByUrl, getRememberedLinkRecord } from "./ref-memory.js";
import { MCP_SEARCH_ENGINES } from "./engines/index.js";

const screenshotDownloadById = new Map();
const screenshotStorageDir = path.join(process.cwd(), "screenshots");
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;
const SCREENSHOT_DOWNLOAD_TTL_MS = 60 * 60 * 1000;
const MAX_HTTP_BODY_BYTES = 1024 * 1024;
const MAX_SCREENSHOT_DOWNLOADS = 200;
const MAX_TOOL_CACHE_ENTRIES = 200;
const WEB_SEARCH_ENGINE_ENUM = ["select_best", ...MCP_SEARCH_ENGINES];
const toolResultCache = {
  web_search: new Map(),
  web_fetch: new Map()
};

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function getCacheKey(args) {
  return stableStringify(args || {});
}

function getCacheArgs(args) {
  if (!args || typeof args !== "object") return args;
  const { bypassCache, ...cacheArgs } = args;
  return cacheArgs;
}

function excludeMaxChars(args) {
  if (!args || typeof args !== "object") return args;
  const { maxChars, ...rest } = args;
  return rest;
}

function getCachedToolResult(toolName, args) {
  const bucket = toolResultCache[toolName];
  if (!bucket) return null;
  pruneToolCacheBucket(bucket);
  const key = getCacheKey(args);
  const entry = bucket.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    bucket.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedToolResult(toolName, args, value) {
  const bucket = toolResultCache[toolName];
  if (!bucket) return;
  pruneToolCacheBucket(bucket);
  const key = getCacheKey(args);
  bucket.set(key, {
    value,
    expiresAt: Date.now() + TOOL_CACHE_TTL_MS
  });
  while (bucket.size > MAX_TOOL_CACHE_ENTRIES) {
    const oldestKey = bucket.keys().next().value;
    if (!oldestKey) break;
    bucket.delete(oldestKey);
  }
}

function pruneToolCacheBucket(bucket) {
  const now = Date.now();
  for (const [key, entry] of bucket.entries()) {
    if (!entry || entry.expiresAt <= now) {
      bucket.delete(key);
    }
  }
}

function asMarkdownContent(text) {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

function truncateForDisplay(value, maxChars = 400) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

function assertString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid input: ${field} must be a non-empty string`);
  }
}

function parseEngineList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

function normalizeSearchEngineSelection(engines, engine) {
  const fromList = parseEngineList(engines);
  const fromSingle = typeof engine === "string" ? String(engine).trim().toLowerCase() : "";
  const requested = [...fromList, ...(fromSingle ? [fromSingle] : [])].filter(Boolean);
  if (!requested.length) return [];
  if (requested.includes("select_best")) return [];
  return fromList.length ? fromList : [fromSingle];
}

function parseQueryList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function parseSearchLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(20, Math.floor(parsed));
}

function parseMaxChars(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(200000, Math.floor(parsed));
}

function parseBooleanParam(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid input: ${field} must be a positive number`);
  }
  return Math.floor(parsed);
}

function sendJson(res, status, payload, extraHeaders) {
  const headers = { "content-type": "application/json", ...extraHeaders };
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, accept, mcp-session-id");
  res.setHeader("access-control-expose-headers", "mcp-session-id");
}

function sendMarkdown(res, status, payload) {
  res.writeHead(status, { "content-type": "text/markdown; charset=utf-8" });
  res.end(payload);
}

const LOG_MAP = {
  booting:               ["🚀", "Server starting"],
  "boot.config":         ["⚙️",  (p) => `Search route warmup engines: ${p?.searchRouteWarmupEngines?.join(", ") || "?"}`],
  "boot.ready":          ["🚀",  (p) => p?.transport === "stdio" ? "Ready (stdio)" : `Ready  ${(p?.host || "?").replace(/^https?:\/\//, "")}:${p?.port || "?"}`],
  "prelaunch.ready":     ["✅",  "Browser warmed"],
  "prelaunch.error":     ["❌",  "Browser warmup failed"],
  "boot.start":          ["", ""],
  shutdown:              ["🛑",  "Shutting down"],
  "shutdown.error":      ["❌",  "Shutdown error"],
  "process.uncaught_exception":  ["💥", "Uncaught exception"],
  "process.unhandled_rejection": ["⚠️", "Unhandled rejection"]
};

function logEvent(label, payload) {
  const entry = LOG_MAP[label];
  if (!entry) return;
  const [emoji, msg] = entry;
  const text = typeof msg === "function" ? msg(payload) : msg;
  if (!text && !emoji) return;
  if (!text) { console.error(`${emoji}  ${label}`); return; }
  console.error(`${emoji}  ${text}`);
}

function truncateStr(s, max = 80) {
  if (!s || s.length <= max) return s || "";
  return s.slice(0, max) + "...";
}

function getDomain(u) {
  try { return new URL(u).hostname; } catch { return ""; }
}

function mcpRequestSummary(body) {
  if (!body) return "?";
  const m = body?.method || "";
  if (m !== "tools/call") return m;
  const name = body?.params?.name || "?";
  const args = body?.params?.arguments || {};
  const isPage = name === "web_fetch" || name === "web_page_screenshot";
  const parts = [name];
  if (args.query) parts.push(`"${truncateStr(args.query, 60)}"`);
  if (args.queries) parts.push(truncateStr(args.queries.join(" | "), 60));
  if (args.url) {
    const domain = getDomain(args.url);
    parts.push(isPage && domain ? domain : truncateStr(args.url, 60));
  }
  if (args.urls) {
    const domain = getDomain(args.urls[0]);
    parts.push(`${args.urls.length} urls${domain ? ` · ${domain}` : ""}`);
  }
  if (args.ref_id !== void 0) parts.push(`ref #${args.ref_id}`);
  if (args.ref_ids) parts.push(`${args.ref_ids.length} refs`);
  const pageBackend = formatBrowserBackendShort(parseBrowserBackend(process.env.BROWSER_BACKEND, "cloakbrowser"));
  const eng = isPage
    ? pageBackend
    : normalizeSearchEngineSelection(args.engines, args.engine).join(",");
  if (eng) parts.push(`[${eng}]`);
  if (args.limit && args.limit !== 5) parts.push(`limit=${args.limit}`);
  if (args.maxChars && args.maxChars !== DEFAULT_MAX_CHARS) parts.push(`maxc=${args.maxChars}`);
  if (args.bypassCache === true) parts.push("no-cache");
  if (args.format) parts.push(args.format);
  if (args.fullPage === false) parts.push("no-fullpage");
  return parts.join("  ");
}

function firstResultTitle(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("- **")) {
      const match = lines[i].match(/\*\*(.+?)\*\*/);
      if (match) return truncateStr(match[1], 60);
    }
  }
  return "";
}

function extractDomains(text) {
  const domains = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const m = line.match(/URL:\s*(https?:\/\/([^/\s]+))/);
    if (m && !domains.includes(m[2])) domains.push(m[2]);
  }
  if (!domains.length) {
    const m = text.match(/\[\d+\].*?\]\s+(https?:\/\/([^/\s]+))/);
    if (m && !domains.includes(m[2])) domains.push(m[2]);
  }
  return domains.join(", ");
}

function mcpResponseSummary(resp) {
  if (!resp) return "";
  if (resp.error) return `error: ${truncateStr(resp.error.message || "", 80)}`;
  const result = resp.result;
  if (!result) return "";
  if (result.isError) return "error";
  const text = result?.content?.[0]?.text || "";
  if (!text) return "ok";
  const refs = text.match(/^\s*- \*\*.+?\*\* \[\d+\]/gm);
  if (refs) {
    const hint = firstResultTitle(text);
    const domains = extractDomains(text);
    const domainsPart = domains ? ` · ${domains}` : "";
    return `${refs.length} results${hint ? ` · “${hint}”` : ""}${domainsPart}`;
  }
  const okCount = (text.match(/Status: Success/g) || []).length;
  const failCount = (text.match(/Status: Failed/g) || []).length;
  if (okCount || failCount) {
    const domains = extractDomains(text);
    const domainsPart = domains ? ` · ${domains}` : "";
    return `${okCount + failCount} pages (${okCount} ok, ${failCount} err)${domainsPart}`;
  }
  return `${Math.round(text.length / 1000)}k chars`;
}

function createExecutionTimer() {
  const startedAtMs = performance.now();
  return {
    step() { return performance.now(); },
    end() { return Math.max(0, Math.round(performance.now() - startedAtMs)); }
  };
}

function logBootConfig(config) {
  logEvent("boot.config", { searchRouteWarmupEngines: config.searchRouteWarmupEngines });
}

function truncateLink(value, maxChars = 50) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function cleanTitle(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const withoutUrl = text.replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
  return withoutUrl || text;
}

function buildApiBaseUrl(config) {
  let host = String(config?.mcpApiHost || "http://localhost").trim();
  if (!/^https?:\/\//i.test(host)) {
    host = `http://${host}`;
  }
  host = host.replace(/\/+$/, "");
  const hasPort = /:\d+$/.test(host);
  if (!hasPort && config?.mcpApiPort) {
    host = `${host}:${config.mcpApiPort}`;
  }
  return host;
}

function resolveDisplayPath(filePath, prefix) {
  if (!filePath) return null;
  if (!prefix) return filePath;
  const relative = path.relative(screenshotStorageDir, filePath);
  const trimmed = prefix.replace(/[\\/]+$/, "");
  const suffix = path.basename(trimmed);
  if (suffix.toLowerCase() === "screenshots") {
    return path.join(trimmed, relative);
  }
  return path.join(trimmed, "screenshots", relative);
}

async function storeScreenshotDownload(entry, config, { enableDownload }) {
  if (!entry?.screenshotBase64) return null;
  await pruneScreenshotDownloads();
  await pruneStoredScreenshotFiles();
  await fs.mkdir(screenshotStorageDir, { recursive: true });
  const format = entry?.format === "jpeg" ? "jpeg" : "png";
  const extension = format === "jpeg" ? "jpg" : "png";
  const downloadId = randomUUID();
  const filename = `screenshot-${downloadId}.${extension}`;
  const filePath = path.join(screenshotStorageDir, filename);
  const buffer = Buffer.from(entry.screenshotBase64, "base64");
  await fs.writeFile(filePath, buffer);

  let downloadUrl = null;
  if (enableDownload) {
    screenshotDownloadById.set(downloadId, {
      path: filePath,
      filename,
      contentType: entry?.contentType || (format === "jpeg" ? "image/jpeg" : "image/png"),
      createdAt: Date.now()
    });
    const baseUrl = buildApiBaseUrl(config);
    downloadUrl = `${baseUrl}/download/${downloadId}`;
  }

  return {
    downloadId,
    downloadUrl,
    bytes: buffer.length,
    filePath
  };
}

async function deleteScreenshotRecord(downloadId, record) {
  screenshotDownloadById.delete(downloadId);
  if (!record?.path) return;
  try {
    await fs.rm(record.path, { force: true });
  } catch {
    // ignore cleanup errors
  }
}

async function pruneScreenshotDownloads() {
  const now = Date.now();
  for (const [downloadId, record] of screenshotDownloadById.entries()) {
    if (!record?.createdAt || now - record.createdAt > SCREENSHOT_DOWNLOAD_TTL_MS) {
      await deleteScreenshotRecord(downloadId, record);
    }
  }

  while (screenshotDownloadById.size > MAX_SCREENSHOT_DOWNLOADS) {
    const oldestEntry = screenshotDownloadById.entries().next().value;
    if (!oldestEntry) break;
    const [downloadId, record] = oldestEntry;
    await deleteScreenshotRecord(downloadId, record);
  }
}

async function pruneStoredScreenshotFiles() {
  try {
    const entries = await fs.readdir(screenshotStorageDir, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.startsWith("screenshot-")) continue;
      const filePath = path.join(screenshotStorageDir, entry.name);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > SCREENSHOT_DOWNLOAD_TTL_MS) {
          await fs.rm(filePath, { force: true });
        }
      } catch {
        // ignore cleanup errors
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

function decorateResultLinks(results) {
  if (!Array.isArray(results)) return results;

  return results.map((item) => {
    const rawUrl = String(item?.url || "").trim();
    if (!rawUrl) return item;

    const ref = rememberLink(rawUrl);
    const display = `[${ref}] ${truncateLink(rawUrl, 50)}`;
    const domain = getDomain(rawUrl);

    return {
      ...item,
      ref_id: ref,
      domain,
      link: display,
      url: display
    };
  });
}

function decorateSearchPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;

  const output = {
    ...payload,
    results: decorateResultLinks(payload.results)
  };

  if (Array.isArray(payload.queryResults)) {
    output.queryResults = payload.queryResults.map((entry) => ({
      ...entry,
      results: decorateResultLinks(entry.results)
    }));
  }

  return output;
}

function formatSearchMarkdown(payload) {
  const lines = [];

  if (payload?.query) {
    lines.push(`**Query:** ${payload.query}`);
  } else if (Array.isArray(payload?.queries) && payload.queries.length) {
    lines.push(`**Queries:** ${payload.queries.join(", ")}`);
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  if (results.length) {
    lines.push("", `**Results (${results.length}):**`);
    results.forEach((result, index) => {
      const refId = result?.ref_id;
      const refLabel = refId ? `[${refId}]` : `${index + 1}.`;
      const titleText = cleanTitle(result?.title || "");
      const title = titleText ? `**${titleText}**` : "Untitled";
      const snippet = truncateForDisplay(result?.snippet || "", 450);
      const queryVariants = Array.isArray(result?.queryVariants) && result.queryVariants.length
        ? ` _(queries: ${result.queryVariants.join(", ")})_`
        : "";
      const domain = result?.domain ? ` (${result.domain})` : "";

      const bullet = `- ${title} ${refLabel}${domain}${queryVariants}`;
      lines.push(bullet.trim());
      if (snippet) {
        lines.push(`  - ${snippet}`);
      }
    });
    lines.push("", "*Square brackets contain reference IDs.*");
  } else {
    lines.push("", "No results returned.");
  }

  if (Array.isArray(payload?.directAnswers) && payload.directAnswers.length) {
    lines.push("", "**Direct Answers:**");
    payload.directAnswers.forEach((answer) => {
      const source = answer?.source ? answer.source : "answer";
      const snippet = truncateForDisplay(answer?.text || "", 400);
      const link = answer?.url ? ` (${answer.url})` : "";
      lines.push(`- ${source}${link}`);
      if (snippet) {
        lines.push(`  - ${snippet}`);
      }
    });
  }

  if (Array.isArray(payload?.errors) && payload.errors.length) {
    lines.push("", "**Errors:**");
    payload.errors.forEach((entry) => {
      if (!entry?.error) return;
      lines.push(`- ${entry.error}`);
    });
  }

  return lines.filter(Boolean).join("\n");
}

function formatSearchResponse(payload) {
  return asMarkdownContent(formatSearchMarkdown(payload));
}

function normalizeResultEntries(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.results)) return payload.results;
  if (typeof payload === "object" && ("ok" in payload || "text" in payload || "error" in payload)) {
    return [payload];
  }
  return [];
}

async function applyScreenshotStorage(payload, config, { outputMode } = {}) {
  if (outputMode === "base64") return payload;

  const entries = normalizeResultEntries(payload);
  if (!entries.length) return payload;

  if (outputMode === "file") {
    for (const entry of entries) {
      if (!entry?.ok || !entry?.screenshotBase64) continue;
      const download = await storeScreenshotDownload(entry, config, { enableDownload: false });
      if (!download) continue;
      entry.bytes = download.bytes;
      entry.filePath = resolveDisplayPath(download.filePath, config?.screenshotPathPrefix);
      delete entry.screenshotBase64;
    }
    return payload;
  }

  if (outputMode === "url") {
    for (const entry of entries) {
      if (!entry?.ok || !entry?.screenshotBase64) continue;
      const download = await storeScreenshotDownload(entry, config, { enableDownload: true });
      if (!download) continue;
      entry.downloadId = download.downloadId;
      entry.downloadUrl = download.downloadUrl;
      entry.bytes = download.bytes;
      delete entry.screenshotBase64;
    }
    return payload;
  }

  const wantsDownload = Boolean(config?.enableScreenshotDownloadLink);
  const wantsPath = Boolean(config?.screenshotPathPrefix);
  if (!wantsDownload && !wantsPath) return payload;

  for (const entry of entries) {
    if (!entry?.ok || !entry?.screenshotBase64) continue;
    const download = await storeScreenshotDownload(entry, config, { enableDownload: wantsDownload });
    if (!download) continue;
    if (wantsDownload) {
      entry.downloadId = download.downloadId;
      entry.downloadUrl = download.downloadUrl;
    }
    entry.bytes = download.bytes;
    if (wantsPath) {
      entry.filePath = resolveDisplayPath(download.filePath, config.screenshotPathPrefix);
    }
    delete entry.screenshotBase64;
  }

  return payload;
}

function truncateResultsText(payload, maxChars) {
  if (!payload || !maxChars || !Number.isFinite(maxChars) || maxChars <= 0) return payload;

  const entries = normalizeResultEntries(payload);
  if (!entries.length) return payload;

  const needsTruncation = entries.some((e) => e?.text && e.text.length > maxChars);
  if (!needsTruncation) return payload;

  const truncate = (e) => {
    if (!e || !e.text || e.text.length <= maxChars) return e;
    const size = e.textOriginalLength || e.text.length;
    return { ...e, text: e.text.slice(0, maxChars).trimEnd() + `\n\n*(Response truncated — full page is ${size} chars, increase maxChars to see more)*` };
  };

  if (payload.results) {
    return { ...payload, results: payload.results.map(truncate) };
  }
  return truncate(payload);
}

function formatOpenPageResponse(payload) {
  const entries = normalizeResultEntries(payload);
  if (!entries.length) {
    return asMarkdownContent([]);
  }

  const successCount = entries.filter((entry) => entry?.ok !== false).length;
  const total = payload?.count ?? entries.length;
  const lines = [`Processed ${total} page(s); ${successCount} succeeded.`];

  entries.forEach((entry, index) => {
    const refLabel = entry?.ref_id ? `[${entry.ref_id}]` : `#${index + 1}`;
    const title = entry?.title || entry?.url || `Page ${index + 1}`;
    lines.push("", `### ${refLabel} ${title}`);
    lines.push(`- Status: ${entry?.ok === false ? "Failed" : "Success"}`);
    if (entry?.url) {
      lines.push(`- URL: ${entry.url}`);
    }
    if (entry?.error) {
      lines.push(`- Error: ${entry.error}`);
      return;
    }
    if (entry?.tables?.length) {
      lines.push(`- Tables extracted: ${entry.tables.length}`);
    }
    if (entry?.text) {
      lines.push("", entry.text.trim());
    }
  });

  return asMarkdownContent(lines.join("\n"));
}

function formatScreenshotResponse(payload) {
  const entries = normalizeResultEntries(payload);
  if (!entries.length) {
    return asMarkdownContent("No screenshot data available.");
  }

  const successCount = entries.filter((entry) => entry?.ok !== false).length;
  const total = payload?.count ?? entries.length;
  const lines = [`Captured ${total} screenshot(s); ${successCount} succeeded.`];

  entries.forEach((entry, index) => {
    const refLabel = entry?.ref_id ? `[${entry.ref_id}]` : `#${index + 1}`;
    const title = entry?.title || entry?.url || `Screenshot ${index + 1}`;
    lines.push("", `### ${refLabel} ${title}`);
    lines.push(`- Status: ${entry?.ok === false ? "Failed" : "Success"}`);
    if (entry?.url) {
      lines.push(`- URL: ${entry.url}`);
    }
    if (entry?.error) {
      lines.push(`- Error: ${entry.error}`);
      return;
    }
    if (entry?.contentType) {
      lines.push(`- Content-Type: ${entry.contentType}`);
    }
    if (entry?.bytes) {
      lines.push(`- Size: ${entry.bytes} bytes`);
    }
    if (entry?.filePath) {
      lines.push(`- File: ${entry.filePath}`);
    }
    if (entry?.downloadUrl) {
      lines.push(`- Download: ${entry.downloadUrl}`);
    }
    if (!entry?.downloadUrl && entry?.screenshotBase64) {
      const mime = entry.contentType || (entry.format === "jpeg" ? "image/jpeg" : "image/png");
      const dataUrl = `data:${mime};base64,${entry.screenshotBase64}`;
      lines.push("", `![${title}](${dataUrl})`);
    }
  });

  return asMarkdownContent(lines.join("\n"));
}

function resolveOpenTarget(args) {
  const normalizedRef = args?.ref_id ?? args?.ref;
  const normalizedRefs = args?.ref_ids ?? args?.refs;
  const hasUrl = args && Object.prototype.hasOwnProperty.call(args, "url");
  const hasUrls = args && Object.prototype.hasOwnProperty.call(args, "urls");
  const hasRef = args && (Object.prototype.hasOwnProperty.call(args, "ref_id") || Object.prototype.hasOwnProperty.call(args, "ref"));
  const hasRefs = args && (Object.prototype.hasOwnProperty.call(args, "ref_ids") || Object.prototype.hasOwnProperty.call(args, "refs"));

  if (hasUrls) {
    if (Array.isArray(args.urls) && args.urls.length) {
      const normalizedUrls = args.urls.map((item) => {
        assertString(item, "urls[]");
        return String(item).trim();
      }).filter(Boolean);

      if (normalizedUrls.length) {
        return normalizedUrls;
      }
    }
  }

  if (hasRefs) {
    if (Array.isArray(normalizedRefs) && normalizedRefs.length) {
      return normalizedRefs.map((item) => {
        const ref = parsePositiveInt(item, "ref_ids[]");
        const remembered = getRememberedLinkRecord(ref);
        if (!remembered?.url) {
          throw new Error(`No link found in memory for ref ${ref}`);
        }
        return remembered.url;
      });
    }
  }

  if (hasRef) {
    if (normalizedRef !== undefined && normalizedRef !== null && String(normalizedRef).trim() && Number(normalizedRef) > 0) {
      const ref = parsePositiveInt(normalizedRef, "ref_id");
      const remembered = getRememberedLinkRecord(ref);
      if (!remembered?.url) {
        throw new Error(`No link found in memory for ref ${ref}`);
      }
      return [remembered.url];
    }
  }

  if (hasUrl) {
    if (typeof args.url === "string" && args.url.trim()) {
      return [String(args.url).trim()];
    }
  }

  throw new Error("Invalid input: provide one of url, urls, ref_id/ref, or ref_ids/refs");
}

function buildBatchResultPayload(targetUrls, opened) {
  const payload = {
    count: opened.length,
    successCount: opened.filter((item) => item.ok).length,
    results: opened
  };

  if (targetUrls.length === 1 && opened[0]?.ok) {
    return { ...opened[0], results: undefined };
  }

  return payload;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const values = Array.from(items || []);
  const limit = Math.max(1, Math.min(concurrency, values.length || 1));
  const results = new Array(values.length);
  let cursor = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

async function openTargetsParallel(targetUrls, maxParallel, includeSeoAnalysis = false, debug = false) {
  const opened = await mapWithConcurrency(
    targetUrls,
    maxParallel,
    async (targetUrl, index) => {
      const tUrl = debug ? performance.now() : 0;
      try {
        const page = await browserOpenAndExtract({ url: targetUrl, includeSeoAnalysis });
        if (debug) console.log(`[web_fetch] [${targetUrl}] openTargetsParallel process (post-extract): ${Math.round(performance.now() - tUrl)}ms`);
        const result = {
          index,
          ok: true,
          ref_id: rememberLink(targetUrl),
          ...page
        };

        // Replace markdown links [text](url) with [text][ref_id] inline
        if (page.links?.length && result.text) {
          for (const link of page.links) {
            rememberLink(link.href);
          }
          const enrichedTextByUrl = new Map();
          for (const link of page.links) {
            enrichedTextByUrl.set(link.href, link.text);
          }
          result.text = result.text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            const ref = getLinkRefByUrl(url);
            if (!ref) return match;
            const enriched = enrichedTextByUrl.get(url);
            const isNumeric = /^\d+$/.test(text);
            return `[${isNumeric && enriched ? enriched : text}][${ref}]`;
          });
        }

        return result;
      } catch (error) {
        return {
          index,
          ok: false,
          ref_id: rememberLink(targetUrl),
          url: targetUrl,
          error: String(error?.message || error)
        };
      }
    }
  );

  return buildBatchResultPayload(targetUrls, opened);
}

async function captureScreenshotsParallel(targetUrls, maxParallel, captureOptions = {}) {
  const opened = await mapWithConcurrency(
    targetUrls,
    maxParallel,
    async (targetUrl, index) => {
      try {
        const capture = await browserCaptureScreenshot({ url: targetUrl, ...captureOptions });
        return {
          index,
          ok: true,
          ref_id: rememberLink(targetUrl),
          ...capture
        };
      } catch (error) {
        return {
          index,
          ok: false,
          ref_id: rememberLink(targetUrl),
          url: targetUrl,
          error: String(error?.message || error)
        };
      }
    }
  );

  return buildBatchResultPayload(targetUrls, opened);
}

function parseHttpExtractTargets(searchParams) {
  const refsParam = String(searchParams.get("ref_ids") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (refsParam.length) {
    return refsParam.map((item) => {
      const ref = parsePositiveInt(item, "ref_ids[]");
      const remembered = getRememberedLinkRecord(ref);
      if (!remembered?.url) {
        throw new Error(`No link found in memory for ref ${ref}`);
      }
      return remembered.url;
    });
  }

  const urlsParam = String(searchParams.get("urls") || "")
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean);
  if (urlsParam.length) {
    return urlsParam;
  }

  const refParam = searchParams.get("ref_id");
  if (refParam && refParam.trim()) {
    const ref = parsePositiveInt(refParam, "ref_id");
    const remembered = getRememberedLinkRecord(ref);
    if (!remembered?.url) {
      throw new Error(`No link found in memory for ref ${ref}`);
    }
    return [remembered.url];
  }

  const urlParam = String(searchParams.get("url") || "").trim();
  if (urlParam) return [urlParam];

  throw new Error("Missing url, urls, ref_id, or ref_ids query parameter");
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_HTTP_BODY_BYTES) {
      const error = new Error(`Request body too large (max ${MAX_HTTP_BODY_BYTES} bytes)`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function getToolsListResponse() {
  const devtoolsEnabled = Boolean(manager?.config?.enableDevtoolsMcp);
  return {
    tools: [
      {
        name: "web_search",
        description:
          "Search the web for any user request and return ranked results with numeric result ids. By default, send `engine: \"select_best\"` or omit engine/engines entirely unless the user explicitly asks about engines or requests a specific one. `select_best` means the server will choose the best engine automatically using its fallback and circuit-breaker logic. If `select_best` is combined with specific engines, `select_best` takes priority. Use this for general research, fact lookup, docs, tutorials, comparisons, news, and discovery before opening pages.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            queries: {
              type: "array",
              items: { type: "string" },
              description: "Multiple query variations to run"
            },
            limit: { type: "number", default: 5 },
            bypassCache: {
              type: "boolean",
              default: false,
              description: "Skip cached data and refresh the cached response"
            },
            engines: {
              type: "array",
              items: {
                type: "string",
                enum: WEB_SEARCH_ENGINE_ENUM
              },
              description: "Specific search engines to run. Prefer `select_best` by default. Only send concrete engines if the user explicitly requests certain engines or asks about engine behavior. If `select_best` appears anywhere in this list, it takes priority and automatic fallback/circuit-breaker selection is used."
            },
            engine: {
              type: "string",
              default: "select_best",
              enum: WEB_SEARCH_ENGINE_ENUM,
              description: "Preferred default: `select_best`. Only send a concrete engine if the user explicitly requests one engine or asks about engine behavior. `select_best` uses automatic fallback and circuit-breaker logic."
            }
          },
          description: "Provide query (string) or queries (string[]). Use queries for multiple search variations.",
          additionalProperties: false
        }
      },
      {
        name: "web_fetch",
        description:
          "Fetch one or more pages and return clean readable text for analysis. Use this after web_search via ref_id/ref_ids or with direct url/urls for summarization, extraction, QA, and synthesis.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
            urls: {
              type: "array",
              items: { type: "string" },
              description: "Multiple URLs to open in parallel"
            },
            ref_id: {
              type: "number",
              description: "Result id returned by a previous web_search call"
            },
            ref_ids: {
              type: "array",
              items: { type: "number" },
              description: "Multiple result ids returned by a previous web_search call"
            },
            maxChars: { type: "number", default: DEFAULT_MAX_CHARS },
            bypassCache: {
              type: "boolean",
              default: false,
              description: "Skip cached data and refresh the cached response"
            }
          },
          description: "Provide one of: url, urls, ref_id, or ref_ids. Prefer ref_id/ref_ids from web_search when available.",
          additionalProperties: false
        }
      },
      {
        name: "web_page_screenshot",
        description:
          "Open one or more pages and return screenshots (PNG or JPEG). Use this to capture visual snapshots of results discovered via web_search. Alternatively, pass a targetId from Target.createTarget to screenshot an existing persistent tab.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
            urls: {
              type: "array",
              items: { type: "string" },
              description: "Multiple URLs to open in parallel"
            },
            ref_id: {
              type: "number",
              description: "Result id returned by a previous web_search call"
            },
            ref_ids: {
              type: "array",
              items: { type: "number" },
              description: "Multiple result ids returned by a previous web_search call"
            },
            targetId: {
              type: "string",
              description: "Target id from Target.createTarget. Screenshots the existing tab instead of opening a new one."
            },
            format: {
              type: "string",
              enum: ["png", "jpeg"],
              default: "png",
              description: "Image format for the screenshot"
            },
            quality: {
              type: "string",
              enum: ["low", "medium", "high"],
              default: "medium",
              description:
                "JPEG quality preset: low (30, small file), medium (55, balanced), high (75, detailed). Ignored for PNG."
            },
            fullPage: {
              type: "boolean",
              default: true,
              description: "Capture the entire page, not just the viewport"
            },
            output: {
              type: "string",
              enum: (() => {
                const options = ["base64"];
                if (manager?.config?.screenshotPathPrefix) options.push("file");
                if (manager?.config?.enableScreenshotDownloadLink) options.push("url");
                return options;
              })(),
              default: "base64",
              description: "How to return the screenshot: 'base64' (inline data), 'file' (save to disk, returns path), 'url' (returns download URL). Available options depend on server configuration."
            }
          },
          description: "Provide one of: targetId, url, urls, ref_id, or ref_ids. Prefer ref_id/ref_ids from web_search when available.",
          additionalProperties: false
        }
      },
      {
        name: "web_page_links",
        description:
          "Resolve one or more link ref_ids (shown inline in web_fetch output as [ref_id]) to their full URLs. Provide a single ref_id or multiple ref_ids. Returns the URL for each ref_id.",
        inputSchema: {
          type: "object",
          properties: {
            ref_id: {
              type: "number",
              description: "Single link ref_id to resolve (e.g. 4)"
            },
            ref_ids: {
              type: "array",
              items: { type: "number" },
              description: "Multiple link ref_ids to resolve (e.g. [4, 5, 6])"
            }
          },
          additionalProperties: false
        }
      },
      {
        name: "web_page_ascii",
        description:
          "Capture a webpage as a chafa-style half-block render (real screenshot downscaled to block characters with truecolor ANSI codes) plus an element legend. Use this to understand page layout, colors, and where interactive elements sit. Pair with web_fetch for full text.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
            ref_id: { type: "number" },
            width: {
              type: "number",
              default: 100,
              description: "Render width in characters (40-200)"
            },
            fullPage: {
              type: "boolean",
              default: false,
              description: "Capture full scrollable page (default: viewport only)"
            },
            mode: {
              type: "string",
              enum: ["color_ansi", "grayscale_ansi", "ascii"],
              default: "color_ansi",
              description: "Render mode: color_ansi (truecolor half-blocks), grayscale_ansi (gray half-blocks), ascii (plain char ramp, no escape codes)"
            },
            elementLimit: {
              type: "number",
              default: 25,
              description: "Max elements to annotate (1-100)"
            },
            includeSelector: { type: "boolean", default: true },
            includeXpath: { type: "boolean", default: true }
          },
          additionalProperties: false
        }
      },
      ...(devtoolsEnabled ? devtoolsToolDefinitions : [])
    ]
  };
}

async function handleToolCall(name, args = {}) {
  const timer = createExecutionTimer("mcp.tool.timing", {
    tool: name,
    mode: "mcp"
  });
  let mark = performance.now();

  if (name === "web_search") {
    const bypassCache = args.bypassCache === true;
    const cached = bypassCache ? null : await getCachedToolResult(name, args);
    if (cached) {
      timer.step("cache_hit", mark);
      timer.end({ cacheHit: true, status: "ok" });
      return cached;
    }
    mark = timer.step("cache_miss", mark);
    const queries = parseQueryList(args.queries);
    if (!queries.length) {
      assertString(args.query, "query");
    }
    const limit = parseSearchLimit(args.limit, 5);
    const engines = normalizeSearchEngineSelection(args.engines, args.engine);
    mark = timer.step("validate_inputs", mark);

    const results = await runWithHangGuard(`mcp:${name}`, () =>
      browserSearch({
        query: args.query,
        queries,
        limit,
        ...(engines.length ? { engines } : {})
      })
    );
    mark = timer.step("browser_search", mark);
    const response = formatSearchResponse(decorateSearchPayload(results));
    mark = timer.step("format_response", mark);
    await setCachedToolResult(name, getCacheArgs(args), response);
    timer.step("cache_store", mark);
    timer.end({ cacheHit: false, status: "ok" });
    return response;
  }

  if (name === "web_fetch") {
    const bypassCache = args.bypassCache === true;
    const cacheKeyArgs = excludeMaxChars(getCacheArgs(args));
    const cached = bypassCache ? null : await getCachedToolResult(name, cacheKeyArgs);
    if (cached) {
      const maxChars = parseMaxChars(args.maxChars, DEFAULT_MAX_CHARS);
      const truncated = truncateResultsText(cached, maxChars);
      timer.step("cache_hit", mark);
      timer.end({ cacheHit: true, status: "ok" });
      return formatOpenPageResponse(truncated);
    }
    mark = timer.step("cache_miss", mark);
    let targetUrls;
    try {
      targetUrls = resolveOpenTarget(args);
    } catch (error) {
      timer.step("resolve_targets_failed", mark);
      timer.end({ cacheHit: false, status: "error", error: String(error?.message || error) });
      logEvent("mcp.error", {
        tool: name,
        error: String(error?.message || error)
      });
      throw error;
    }
    mark = timer.step("resolve_targets", mark);
    const maxChars = parseMaxChars(args.maxChars, DEFAULT_MAX_CHARS);
    const includeSeoAnalysis = args.includeSeoAnalysis !== false;
    const manager = await getBrowserManager();
    mark = timer.step("prepare_execution", mark);
    const fullResult = await runWithHangGuard(`mcp:${name}`, () =>
      openTargetsParallel(targetUrls, manager.config.openPageMaxParallel, includeSeoAnalysis, manager.config.debug)
    );
    mark = timer.step("open_targets", mark);
    await setCachedToolResult(name, cacheKeyArgs, fullResult);
    timer.step("cache_store", mark);
    const truncated = truncateResultsText(fullResult, maxChars);
    const response = formatOpenPageResponse(truncated);
    mark = timer.step("format_response", mark);
    timer.end({ cacheHit: false, status: "ok" });
    return response;
  }

  if (name === "web_page_screenshot") {
    const hasTargetId = args && typeof args.targetId === "string" && args.targetId.trim();
    const formatRaw = typeof args.format === "string" ? args.format.trim().toLowerCase() : "png";
    const format = formatRaw === "jpeg" ? "jpeg" : "png";
    let quality;
    if (typeof args.quality !== "undefined" && args.quality !== null) {
      const QUALITY_PRESETS = { low: 30, medium: 55, high: 75 };
      const preset = String(args.quality).trim().toLowerCase();
      if (preset in QUALITY_PRESETS) {
        quality = QUALITY_PRESETS[preset];
      } else {
        quality = parsePositiveInt(args.quality, "quality");
        quality = Math.min(100, Math.max(1, quality));
      }
    }
    if (quality === undefined) quality = 55;
    const fullPage = args.fullPage === undefined ? true : Boolean(args.fullPage);

    const allowedOutputModes = ["base64"];
    if (manager?.config?.screenshotPathPrefix) allowedOutputModes.push("file");
    if (manager?.config?.enableScreenshotDownloadLink) allowedOutputModes.push("url");
    const outputMode = allowedOutputModes.includes(args.output) ? args.output : "base64";

    const screenshotCtx = {
      format,
      quality: quality ?? "default",
      fullPage,
      target: hasTargetId ? args.targetId.trim() : (args.url || args.urls || args.ref_id || args.ref_ids || "unknown")
    };
    console.error(`📸  screenshot context: ${JSON.stringify(screenshotCtx)}`);

    let result;
    if (hasTargetId) {
      mark = timer.step("prepare_execution", mark);
      try {
        result = await runWithHangGuard(`mcp:${name}`, () =>
          captureTargetScreenshot({
            targetId: args.targetId.trim(),
            format,
            fullPage,
            ...(quality ? { quality } : {})
          })
        );
      } catch (error) {
        console.error(`📸  screenshot failed [targetId]: ${JSON.stringify(screenshotCtx)}`);
        console.error(`📸  error: ${String(error?.message || error)}`);
        if (error?.stack) console.error(`📸  stack: ${truncateStr(error.stack, 500)}`);
        throw error;
      }
      result = { ...result, ok: true };
    } else {
      let targetUrls;
      try {
        targetUrls = resolveOpenTarget(args);
      } catch (error) {
        console.error(`📸  screenshot failed [resolve_targets]: ${String(error?.message || error)}`);
        timer.step("resolve_targets_failed", mark);
        timer.end({ status: "error", error: String(error?.message || error) });
        logEvent("mcp.error", {
          tool: name,
          error: String(error?.message || error)
        });
        throw error;
      }
      mark = timer.step("resolve_targets", mark);
      const manager = await getBrowserManager();
      mark = timer.step("prepare_execution", mark);

      try {
        result = await runWithHangGuard(`mcp:${name}`, () =>
          captureScreenshotsParallel(targetUrls, manager.config.openPageMaxParallel, {
            format,
            fullPage,
            ...(quality ? { quality } : {})
          })
        );
      } catch (error) {
        console.error(`📸  screenshot failed [url]: ${JSON.stringify(screenshotCtx)}`);
        console.error(`📸  urls: ${JSON.stringify(targetUrls)}`);
        console.error(`📸  error: ${String(error?.message || error)}`);
        if (error?.stack) console.error(`📸  stack: ${truncateStr(error.stack, 500)}`);
        throw error;
      }
    }
    mark = timer.step("capture_screenshots", mark);
    await applyScreenshotStorage(result, manager.config, { outputMode });
    mark = timer.step("store_screenshots", mark);
    const response = formatScreenshotResponse(result);
    timer.step("format_response", mark);
    timer.end({ status: "ok" });
    return response;
  }

  if (name === "web_page_ascii") {
    const targetUrls = (() => {
      try {
        return resolveOpenTarget(args);
      } catch (error) {
        timer.step("resolve_targets_failed", mark);
        timer.end({ status: "error", error: String(error?.message || error) });
        logEvent("mcp.error", { tool: name, error: String(error?.message || error) });
        throw error;
      }
    })();
    mark = timer.step("resolve_targets", mark);

    const width = Math.max(40, Math.min(200, parsePositiveInt(args.width, "width") || 100));
    const elementLimit = Math.max(1, Math.min(100, parsePositiveInt(args.elementLimit, "elementLimit") || 25));
    const fullPage = args.fullPage === true;
    const mode = ["color_ansi", "grayscale_ansi", "ascii"].includes(args.mode)
      ? args.mode
      : "color_ansi";
    const includeSelector = args.includeSelector !== false;
    const includeXpath = args.includeXpath !== false;

    const targetUrl = targetUrls[0];
    const manager = await getBrowserManager();
    mark = timer.step("prepare_execution", mark);

    const ELEMENT_EXTRACT_CODE = `
(function extractElements(limit) {
  function cssPath(element) {
    if (!(element instanceof Element)) return null;
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 10) {
      let segment = node.tagName.toLowerCase();
      if (node.id) {
        segment += '#' + node.id;
        parts.unshift(segment);
        break;
      }
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter(c => c.tagName === node.tagName)
        : [];
      if (siblings.length > 1) {
        const index = siblings.indexOf(node);
        segment += ':nth-of-type(' + (index + 1) + ')';
      }
      parts.unshift(segment);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function xpathFor(element) {
    if (!(element instanceof Element)) return null;
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(node.tagName.toLowerCase() + '[' + index + ']');
      node = node.parentElement;
    }
    return '/' + parts.join('/');
  }

  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  }

  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  const nodes = [];
  const seen = new Set();
  let index = 0;

  function addNode(el, kind, priority) {
    const key = cssPath(el);
    if (!key || seen.has(key)) return;
    seen.add(key);

    const rect = el.getBoundingClientRect();
    if (!visible(el)) return;

    let text = '';
    let link = '';

    if (kind === 'img') {
      link = el.src || el.getAttribute('data-src') || '';
      text = el.alt || link.split('/').pop() || 'image';
    } else {
      text = (el.innerText || el.textContent || '').trim().slice(0, 300);
      if (!text && el.placeholder) text = el.placeholder;
    }

    if (!text && kind === 'interactive') return;

    index++;
    nodes.push({
      index,
      kind,
      priority,
      tagName: el.tagName.toLowerCase(),
      selector: key,
      xpath: xpathFor(el),
      role: el.getAttribute('role') || '',
      text: text || '',
      link: link || '',
      href: el.href || '',
      rect: {
        x: Math.round(rect.x + scrollX),
        y: Math.round(rect.y + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }

  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
    addNode(el, 'heading', 1);
  });

  document.querySelectorAll('p').forEach(el => {
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length > 10) addNode(el, 'paragraph', 2);
  });

  document.querySelectorAll('img').forEach(el => {
    if (el.src && visible(el)) addNode(el, 'img', 3);
  });

  document.querySelectorAll('a[href]').forEach(el => {
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length > 1) addNode(el, 'link', 4);
  });

  document.querySelectorAll('button, input, textarea, select, label, [role="button"]').forEach(el => {
    addNode(el, 'interactive', 5);
  });

  let liCount = 0;
  document.querySelectorAll('li').forEach(el => {
    if (liCount >= 20) return;
    const text = (el.innerText || el.textContent || '').trim();
    if (text.length > 5 && text.length < 200) {
      addNode(el, 'list-item', 6);
      liCount++;
    }
  });

  return {
    title: document.title,
    url: location.href,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    elements: nodes.slice(0, limit),
  };
})
`;

    let asciiResult;
    try {
      asciiResult = await runWithHangGuard(`mcp:${name}`, async () => {
        const page = await manager.newPage({ backend: manager.config.defaultBackend });
        try {
          await page.goto(targetUrl, {
            waitUntil: manager.config.navWaitUntil,
            timeout: manager.config.browserOpTimeoutMs,
          });
          await page.waitForFunction(
            () => document.readyState === "complete" || document.readyState === "interactive",
            { timeout: 10000 }
          ).catch(() => {});
          await new Promise((r) => setTimeout(r, 1000));

          const elementFn = eval(ELEMENT_EXTRACT_CODE);
          const elementData = await Promise.race([
            page.evaluate(elementFn, elementLimit),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Element extraction timed out")), 15000))
          ]);

          const vw = elementData.viewportWidth;
          const vh = elementData.viewportHeight;
          const clipW = fullPage ? elementData.pageWidth : vw;
          const clipH = fullPage ? elementData.pageHeight : vh;
          const margin = 50;
          const visible = elementData.elements.filter((el) => {
            const r = el.rect;
            return r.x + r.width > -margin && r.x < clipW + margin
              && r.y + r.height > -margin && r.y < clipH + margin;
          });

          const { cols, rows } = asciiGridDims(clipW, clipH, width);

          const shot = await page.screenshot({
            type: "png",
            encoding: "base64",
            ...(fullPage ? { fullPage: true } : {}),
          });

          const sampleFn = eval(SAMPLE_PIXELS_CODE);
          const samples = await page.evaluate(sampleFn, shot, cols, rows);

          const filteredElements = visible.map((el) => ({
            ...el,
            ...(includeSelector ? {} : { selector: undefined }),
            ...(includeXpath ? {} : { xpath: undefined }),
          }));

          const result = asciiTransform(samples, cols, rows, filteredElements, clipW, clipH, {
            mode,
            includeSelector,
            includeXpath,
          });

          return {
            title: elementData.title,
            url: elementData.url,
            ansi: result.ansi,
            legend: result.legend,
            stats: {
              asciiCols: cols,
              asciiRows: rows,
              mode: result.stats.mode,
              fullPage,
              viewportWidth: vw,
              viewportHeight: vh,
              pageWidth: elementData.pageWidth,
              pageHeight: elementData.pageHeight,
              elementCount: elementData.elements.length,
              placedCount: result.stats.placedCount,
            },
          };
        } finally {
          if (!page.isClosed()) {
            await page.close();
          }
        }
      });
    } catch (error) {
      console.error(`🖼️  ascii failed: url=${targetUrl} error=${String(error?.message || error)}`);
      if (error?.stack) console.error(`🖼️  stack: ${truncateStr(error.stack, 500)}`);
      throw error;
    }
    mark = timer.step("capture_ascii", mark);

    const isAscii = asciiResult.stats.mode === "ascii";
    const lines = [
      `### ${asciiResult.title || "Page"} — ${asciiResult.stats.mode === "color_ansi" ? "Chafa Render" : asciiResult.stats.mode === "grayscale_ansi" ? "Grayscale Render" : "ASCII Render"}`,
      "",
      `\`\`\`${isAscii ? "text" : "ansi"}`,
      asciiResult.ansi,
      "```",
      "",
      "### Element Legend",
      "",
      asciiResult.legend,
      "",
      `- Page: ${asciiResult.title} (${asciiResult.url})`,
      `- Grid: ${asciiResult.stats.asciiCols}×${asciiResult.stats.asciiRows} cells${
        asciiResult.stats.fullPage ? " (full page)" : " (viewport)"
      } · mode: ${asciiResult.stats.mode}`,
      `- Elements: ${asciiResult.stats.elementCount} found, ${asciiResult.stats.placedCount} annotated`,
    ];

    const response = asMarkdownContent(lines.join("\n"));
    timer.step("format_response", mark);
    timer.end({ status: "ok" });
    return response;
  }

  if (name === "web_page_links") {
    const singleRef = args.ref_id !== undefined ? parsePositiveInt(args.ref_id, "ref_id") : null;
    const multipleRefs = Array.isArray(args.ref_ids) ? args.ref_ids.map((v) => parsePositiveInt(v, "ref_ids")) : null;
    if (singleRef === null && !multipleRefs) throw new Error("Provide ref_id (number) or ref_ids (number[])");

    const ids = singleRef !== null ? [singleRef] : multipleRefs;
    const out = [];
    for (const id of ids) {
      const url = getUrlForRefId(id);
      if (url) {
        out.push(`- [${id}]: ${url}`);
      } else {
        out.push(`- [${id}]: (no link registered for this ref_id)`);
      }
    }
    timer.step("resolve_links", mark);
    timer.end({ status: "ok" });
    return asMarkdownContent(out.join("\n"));
  }

  if (manager.config.enableDevtoolsMcp && devtoolsToolDefinitions.some((tool) => tool.name === name)) {
    const result = await runWithHangGuard(`mcp:${name}`, () => handleDevtoolsToolCall(name, args));
    timer.step("developer_browser_tool", mark);
    timer.end({ status: "ok" });
    return formatDevtoolsToolResponse(name, result);
  }

  timer.step("unknown_tool", mark);
  timer.end({ status: "error", error: `Unknown tool: ${name}` });
  throw new Error(`Unknown tool: ${name}`);
}

async function handleStatelessMcpPost(body) {
  const id = body?.id ?? null;
  const method = String(body?.method || "");

  // JSON-RPC notifications (no id) must not receive a response
  if (id === null && !Object.hasOwn(body, "id")) {
    return null;
  }

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "search-tools", version: "1.0.0" }
      }
    };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: getToolsListResponse() };
  }

  if (method === "tools/call") {
    const name = body?.params?.name;
    const args = body?.params?.arguments || {};
    const result = await handleToolCall(name, args);
    return { jsonrpc: "2.0", id, result };
  }

  if (method === "notifications/initialized" || method.startsWith("notifications/")) {
    return null;
  }

  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`
    }
  };
}

function createMcpServer() {
  const server = new Server(
    {
      name: "search-tools",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const response = getToolsListResponse();
    logEvent("mcp.request", { method: "tools/list" });
    logEvent("mcp.response", { method: "tools/list", result: response });
    return response;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const reqSum = mcpRequestSummary({
      method: "tools/call",
      params: { name, arguments: args }
    });

    console.error(`📡  ${reqSum}`);

    try {
      const t0 = Date.now();
      const response = await handleToolCall(name, args);
      const ms = Date.now() - t0;
      const ok = response?.content?.[0]?.text || "";
      const okLabel = ok.length ? `${Math.round(ok.length / 1000)}k chars` : "";
      console.error(`📨  ${ms}ms${okLabel ? " · " + okLabel : ""}`);
      return response;
    } catch (error) {
      console.error(`❌  tool ${name} failed: ${truncateStr(String(error?.message || error), 200)}`);
      if (error?.stack) console.error(`❌  stack: ${truncateStr(error.stack, 600)}`);
      const errorResponse = {
        isError: true,
        ...asMarkdownContent(`Error calling ${name}: ${String(error?.message || error)}`)
      };
      return errorResponse;
    }
  });

  return server;
}

async function maybeStartHttpServer(managerOverride) {
  const manager = managerOverride || (await getBrowserManager());
  if (!manager.config.enableHttpHealth && !manager.config.enableHttpMcp) return;

  const mcpTransports = new Map();
  const mcpServers = new Map();
  let defaultMcpSessionId = null;

  const SSE_KEEPALIVE_MS = 30_000;
  const SSE_RETRY_INTERVAL_MS = 30_000;

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || "GET";
      const url = new URL(req.url || "/", "http://localhost");

      if (manager.config.enableHttpMcp && url.pathname === "/mcp") {
        setCorsHeaders(res);

        if (method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        const sessionId = typeof req.headers["mcp-session-id"] === "string"
          ? req.headers["mcp-session-id"]
          : undefined;
        const resolveTransport = () => {
          if (sessionId) {
            const bySessionId = mcpTransports.get(sessionId);
            if (bySessionId) return bySessionId;
          }

          if (defaultMcpSessionId && mcpTransports.has(defaultMcpSessionId)) {
            return mcpTransports.get(defaultMcpSessionId) || null;
          }

          if (mcpTransports.size >= 1) {
            return mcpTransports.values().next().value || null;
          }

          return null;
        };

        if (method === "POST") {
          const body = await readJsonBody(req);
          const reqSum = mcpRequestSummary(body);

          const isToolCall = body?.method === "tools/call";
          const t0 = Date.now();
          if (reqSum && isToolCall) {
            console.error(`📡  ${reqSum}`);
          }

          if (isInitializeRequest(body)) {
            // If client sends initialize with an existing session ID, the old
            // transport is already initialized and will reject. Clean it up
            // and create a fresh one.
            if (sessionId && mcpTransports.has(sessionId)) {
              const oldTransport = mcpTransports.get(sessionId);
              mcpTransports.delete(sessionId);
              mcpServers.delete(sessionId);
              if (defaultMcpSessionId === sessionId) {
                defaultMcpSessionId = mcpTransports.keys().next().value || null;
              }
              try { await oldTransport.close(); } catch (_) {}
            }

            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sid) => {
                defaultMcpSessionId = sid;
                mcpTransports.set(sid, transport);
              },
              retryInterval: SSE_RETRY_INTERVAL_MS
            });

            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid) {
                mcpTransports.delete(sid);
                mcpServers.delete(sid);
                if (defaultMcpSessionId === sid) {
                  defaultMcpSessionId = mcpTransports.keys().next().value || null;
                }
              }
            };

            const mcpServer = createMcpServer();
            await mcpServer.connect(transport);
            await transport.handleRequest(req, res, body);
            if (transport.sessionId) {
              defaultMcpSessionId = transport.sessionId;
              mcpTransports.set(transport.sessionId, transport);
              mcpServers.set(transport.sessionId, mcpServer);
            }
            console.error(`🤝  MCP initialized`);
            return;
          }

          // Route non-initialize requests to the existing session transport.
          // Use exact-match lookup only — never fall back to a different session.
          {
            const existingTransport = sessionId ? (mcpTransports.get(sessionId) || null) : null;
            if (existingTransport) {
              await existingTransport.handleRequest(req, res, body);
              return;
            }
          }

          const response = await handleStatelessMcpPost(body);
          const ms = Date.now() - t0;

          if (response === null) {
            res.writeHead(204);
            res.end();
            return;
          }

          const resSum = mcpResponseSummary(response);
          if (isToolCall && reqSum) {
            console.error(`📨  ${ms}ms${resSum ? " · " + resSum : ""}`);
          }
          sendJson(res, 200, response);
          return;
        }

        if (method === "GET" || method === "DELETE") {
          const transport = resolveTransport();
          if (!transport) {
            const message = sessionId
              ? "Bad Request: No valid session ID provided"
              : "Bad Request: Missing initialize request";
            sendJson(res, 400, {
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message
              },
              id: null
            });
            return;
          }

          if (!sessionId && transport.sessionId) {
            req.headers["mcp-session-id"] = transport.sessionId;
          }
          await transport.handleRequest(req, res);
          return;
        }

        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      if (method !== "GET") {
        sendJson(res, 405, { ok: false, error: "Method not allowed" });
        return;
      }

      if (url.pathname === "/" || url.pathname === "/health") {
        const health = {
          ...(await manager.getHealth()),
          searchRouteCircuitBreakers: getSearchBackendHealth()
        };
        logEvent("http.request", { method, path: url.pathname });
        logEvent("http.response", { method, path: url.pathname, result: health });
        sendJson(res, 200, health);
        return;
      }

      if (url.pathname === "/search") {
        const timer = createExecutionTimer("http.timing", {
          mode: "http",
          method,
          path: url.pathname
        });
        let mark = performance.now();
        logEvent("http.request", {
          method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams.entries())
        });
        const query = url.searchParams.get("q") || "";
        const multiQ = url.searchParams
          .getAll("q")
          .map((item) => item.trim())
          .filter(Boolean);
        const queriesParam = (url.searchParams.get("queries") || "")
          .split("||")
          .map((item) => item.trim())
          .filter(Boolean);
        const queries = [...new Set([...multiQ, ...queriesParam])];

        if (!query.trim() && !queries.length) {
          sendJson(res, 400, { ok: false, error: "Missing q or queries parameter" });
          return;
        }

        const limit = parseSearchLimit(url.searchParams.get("limit"), 5);
        const enginesParam = url.searchParams.get("engines");
        const engines = normalizeSearchEngineSelection(
          enginesParam
            ? enginesParam
                .split(",")
                .map((item) => item.trim().toLowerCase())
                .filter(Boolean)
            : [],
          url.searchParams.get("engine")
        );
        mark = timer.step("parse_inputs", mark);

        const payload = decorateSearchPayload(
          await runWithHangGuard("http:/search", () => browserSearch({ query, queries, limit, ...(engines.length ? { engines } : {}) }))
        );
        mark = timer.step("browser_search", mark);
        const markdown = formatSearchMarkdown(payload);
        timer.step("format_response", mark);
        timer.end({ status: "ok" });
        logEvent("http.response", { method, path: url.pathname, result: payload });
        sendMarkdown(res, 200, markdown);
        return;
      }

      if (url.pathname === "/extract") {
        const timer = createExecutionTimer("http.timing", {
          mode: "http",
          method,
          path: url.pathname
        });
        let mark = performance.now();
        logEvent("http.request", {
          method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams.entries())
        });
        let targetUrls;
        try {
          targetUrls = parseHttpExtractTargets(url.searchParams);
        } catch (error) {
          logEvent("http.error", {
            method,
            path: url.pathname,
            error: String(error?.message || error)
          });
          timer.step("resolve_targets_failed", mark);
          timer.end({ status: "error", error: String(error?.message || error) });
          sendJson(res, 400, { ok: false, error: String(error?.message || error) });
          return;
        }
        mark = timer.step("resolve_targets", mark);

        const maxChars = parseMaxChars(url.searchParams.get("maxChars"), DEFAULT_MAX_CHARS);
        const payload = await runWithHangGuard("http:/extract", () =>
          openTargetsParallel(targetUrls, manager.config.openPageMaxParallel, false, manager.config.debug)
        );
        mark = timer.step("open_targets", mark);
        const truncated = truncateResultsText(payload, maxChars);
        const markdown = formatOpenPageResponse(truncated).content[0].text;
        timer.step("format_response", mark);
        timer.end({ status: "ok" });
        logEvent("http.response", { method, path: url.pathname, result: payload });
        sendMarkdown(res, 200, markdown);
        return;
      }

      if (url.pathname === "/screenshot") {
        const timer = createExecutionTimer("http.timing", {
          mode: "http",
          method,
          path: url.pathname
        });
        let mark = performance.now();
        logEvent("http.request", {
          method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams.entries())
        });
        let targetUrls;
        try {
          targetUrls = parseHttpExtractTargets(url.searchParams);
        } catch (error) {
          logEvent("http.error", {
            method,
            path: url.pathname,
            error: String(error?.message || error)
          });
          timer.step("resolve_targets_failed", mark);
          timer.end({ status: "error", error: String(error?.message || error) });
          sendJson(res, 400, { ok: false, error: String(error?.message || error) });
          return;
        }
        mark = timer.step("resolve_targets", mark);

        const formatParam = String(url.searchParams.get("format") || "png").trim().toLowerCase();
        const format = formatParam === "jpeg" ? "jpeg" : "png";
        const fullPage = parseBooleanParam(url.searchParams.get("fullPage"), true);
        const qualityParam = url.searchParams.get("quality");
        let quality = null;
        if (qualityParam) {
          const QUALITY_PRESETS = { low: 30, medium: 55, high: 75 };
          const preset = String(qualityParam).trim().toLowerCase();
          if (preset in QUALITY_PRESETS) {
            quality = QUALITY_PRESETS[preset];
          } else {
            quality = parsePositiveInt(qualityParam, "quality");
            quality = Math.min(100, Math.max(1, quality));
          }
        }
        if (quality === null) quality = 55;
        const options = {
          format,
          fullPage,
          ...(quality ? { quality } : {})
        };
        mark = timer.step("parse_options", mark);

        const payload = await runWithHangGuard("http:/screenshot", () =>
          captureScreenshotsParallel(
            targetUrls,
            manager.config.openPageMaxParallel,
            options
          )
        );
        mark = timer.step("capture_screenshots", mark);
        await applyScreenshotStorage(payload, manager.config);
        mark = timer.step("store_screenshots", mark);
        const markdown = formatScreenshotResponse(payload).content[0].text;
        timer.step("format_response", mark);
        timer.end({ status: "ok" });
        logEvent("http.response", { method, path: url.pathname, result: payload });
        sendMarkdown(res, 200, markdown);
        return;
      }

      if (url.pathname.startsWith("/download/")) {
        if (!manager.config.enableScreenshotDownloadLink) {
          sendJson(res, 404, { ok: false, error: "Not found" });
          return;
        }

        const downloadId = decodeURIComponent(url.pathname.split("/").pop() || "").trim();
        await pruneScreenshotDownloads();
        const record = screenshotDownloadById.get(downloadId);
        if (!record) {
          sendJson(res, 404, { ok: false, error: "Unknown download id" });
          return;
        }

        try {
          const data = await fs.readFile(record.path);
          res.writeHead(200, {
            "content-type": record.contentType || "application/octet-stream",
            "content-disposition": `attachment; filename="${record.filename}"`
          });
          res.end(data);
          return;
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message || error) });
          return;
        }
      }

      sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (error) {
      logEvent("http.error", {
        method: req.method || "GET",
        path: req.url || "",
        error: String(error?.message || error)
      });
      sendJson(res, Number(error?.statusCode) || 500, { ok: false, error: String(error?.message || error) });
    }
  });

  server.keepAliveTimeout = 300_000;
  server.headersTimeout = 300_000;
  server.timeout = 0;

  const keepaliveEncoder = new TextEncoder();
  const keepaliveFrame = keepaliveEncoder.encode(": keepalive\n\n");

  const keepaliveInterval = setInterval(() => {
    const entries = [...mcpTransports.entries()];
    for (const [, transport] of entries) {
      try {
        const ws = transport._webStandardTransport;
        if (!ws?._streamMapping) continue;
        const streams = [...ws._streamMapping.entries()];
        for (const [key, stream] of streams) {
          try {
            stream.controller?.enqueue(keepaliveFrame);
          } catch {
            ws._streamMapping.delete(key);
          }
        }
      } catch {
        // Do NOT delete from mcpTransports here — _webStandardTransport
        // may be temporarily unavailable during a close sequence but the
        // transport is still valid. The SDK's own onclose handler will
        // clean up when the session is truly dead.
      }
    }
  }, SSE_KEEPALIVE_MS);
  keepaliveInterval.unref();

  server.listen(manager.config.mcpApiPort, "0.0.0.0", () => {
    logEvent("boot.ready", {
      transport: "http",
      host: manager.config.mcpApiHost,
      port: manager.config.mcpApiPort,
      sseKeepaliveMs: SSE_KEEPALIVE_MS,
      sseRetryIntervalMs: SSE_RETRY_INTERVAL_MS
    });
  });
}


logEvent("booting", { pid: process.pid });
const manager = await getBrowserManager();
logEvent("boot.start", { pid: process.pid });
logBootConfig(manager.config);

const HANG_TIMEOUT_CODE = "HANG_TIMEOUT";
let shutdownInProgress = false;

function createHangTimeoutError(label, timeoutMs) {
  const error = new Error(`Operation '${label}' timed out after ${timeoutMs}ms`);
  error.code = HANG_TIMEOUT_CODE;
  return error;
}

async function shutdownWithExit(exitCode, context = {}) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  if (Object.keys(context).length) {
    logEvent("shutdown", context);
  }

  try {
    await manager.shutdown();
  } catch (error) {
    logEvent("shutdown.error", {
      error: String(error?.message || error)
    });
  }

  process.exit(exitCode);
}

async function runWithHangGuard(label, task) {
  if (!manager.config.enableHangRestart) {
    return task();
  }

  const timeoutMs = manager.config.hangRestartTimeoutMs;
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createHangTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(), timeoutPromise]);
  } catch (error) {
    if (error?.code === HANG_TIMEOUT_CODE) {
      await shutdownWithExit(1, {
        reason: "hang_timeout",
        label,
        timeoutMs,
        error: String(error?.message || error)
      });
      return new Promise(() => {});
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

process.on("uncaughtException", async (error) => {
  logEvent("process.uncaught_exception", {
    error: String(error?.stack || error?.message || error)
  });
  if (manager.config.enableHangRestart) {
    await shutdownWithExit(1, { reason: "uncaught_exception" });
  }
});

process.on("unhandledRejection", async (reason) => {
  logEvent("process.unhandled_rejection", {
    error: String(reason?.stack || reason?.message || reason)
  });
  if (manager.config.enableHangRestart) {
    await shutdownWithExit(1, { reason: "unhandled_rejection" });
  }
});

manager.prelaunchIfConfigured().then(
  () => {
    if (manager.config.prelaunchBrowser) {
      logEvent("prelaunch.ready", { enabled: true });
    }
  },
  (error) => {
    logEvent("prelaunch.error", {
      error: String(error?.message || error)
    });
  }
);

await maybeStartHttpServer(manager);

if (manager.config.enableStdioMcp) {
  const stdioServer = createMcpServer();
  const transport = new StdioServerTransport();
  await stdioServer.connect(transport);
  logEvent("boot.ready", { transport: "stdio" });
}

if (!manager.config.enableStdioMcp && !manager.config.enableHttpMcp) {
  throw new Error("No MCP transport enabled. Set ENABLE_STDIO_MCP=1 and/or ENABLE_HTTP_MCP=1");
}

async function shutdown() {
  await shutdownWithExit(0, { reason: "signal" });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
