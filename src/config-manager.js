import { parseApiKeys, parseBoolean, parseNumber, parseInteger, parseEngines, parseToolList, parseStabilizeStrategy } from "./config.js";

const WAIT_UNTIL_VALUES = new Set(["load", "domcontentloaded", "networkidle0", "networkidle2"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseWithType(type, entry, raw) {
  const values = entry.values;
  switch (type) {
    case "string":
      return { valid: typeof raw === "string", value: String(raw) };
    case "boolean": {
      const value = parseBoolean(raw, undefined);
      return { valid: value !== undefined, value };
    }
    case "number": {
      const value = parseNumber(raw, undefined);
      return { valid: Number.isFinite(value), value };
    }
    case "integer": {
      const value = parseInteger(raw, undefined);
      return { valid: Number.isFinite(value), value };
    }
    case "engines": {
      const value = parseEngines(String(raw), null);
      return { valid: value !== null, value };
    }
    case "toolList":
      return { valid: true, value: parseToolList(String(raw)) };
    case "apiKeys":
      return { valid: true, value: parseApiKeys(String(raw)) };
    case "enum": {
      const normalized = String(raw).trim().toLowerCase();
      return { valid: Array.isArray(values) && values.includes(normalized), value: normalized };
    }
    default:
      return { valid: false, value: undefined };
  }
}

export function validateConfigValue(entry, raw) {
  if (!entry) return { valid: false, error: "unknown variable" };
  return parseWithType(entry.type, entry, raw);
}

const HOT_APPLYERS = {
  SEARCH_ROUTE_WARMUP_ENGINES: (config, value) => { config.searchRouteWarmupEngines = value; },
  SEARCH_FALLBACK: (config, value) => { config.searchFallback = value.length ? value : null; },
  SEARCH_ROUTE_CIRCUIT_OPEN_MS: (config, value) => { config.searchRouteCircuitOpenMs = value; },
  SEARCH_KEEP_MIN_WORKING_WINDOWS: (config, value) => {
    config.searchKeepMinWorkingWindows = clamp(value, 0, 20);
    config.searchMaxWorkingWindows = Math.max(config.searchKeepMinWorkingWindows, config.searchMaxWorkingWindows);
  },
  SEARCH_MAX_WORKING_WINDOWS: (config, value) => {
    config.searchMaxWorkingWindows = Math.max(config.searchKeepMinWorkingWindows, clamp(value, 1, 30));
  },
  OPEN_PAGE_MAX_PARALLEL: (config, value) => { config.openPageMaxParallel = clamp(value, 1, 20); },
  MAX_CONCURRENT_PAGE_OPS: (config, value) => { config.maxConcurrentPageOps = clamp(value, 1, 30); },
  HUMAN_TYPING_DELAY: (config, value) => { config.humanTypingDelay = clamp(value, 0, 500); },
  STABILIZE_STRATEGY: (config, value) => { config.stabilizeStrategy = parseStabilizeStrategy(value, config.stabilizeStrategy); },
  BROWSER_OP_TIMEOUT_MS: (config, value) => { config.browserOpTimeoutMs = value; },
  NAV_WAIT_UNTIL: (config, value) => {
    if (WAIT_UNTIL_VALUES.has(String(value).toLowerCase())) config.navWaitUntil = String(value).toLowerCase();
  },
  WEB_FETCH_MAX_CHARS: (config, value) => { config.maxChars = value; },
  DEBUG: (config, value) => { config.debug = value; },
  LOG_TOOL_ERRORS: (config, value) => { config.logToolErrors = value; },
  DISABLE_TOOLS: (config, value) => { config.disableTools = value; },
  ENABLE_HANG_RESTART: (config, value) => { config.enableHangRestart = value; },
  HANG_RESTART_TIMEOUT_MS: (config, value) => { config.hangRestartTimeoutMs = value; },
  ENABLE_VNC: (config, value) => { config.vncEnabled = value; },
  MCP_API_KEYS: (config, value) => { config.mcpApiKeys = value; },
  MCP_ALLOW_UNAUTHENTICATED: (config, value) => { config.mcpAllowUnauthenticated = value; }
};

export function hotApplyConfig(config, key, value) {
  const applier = HOT_APPLYERS[key];
  if (!applier) return false;
  applier(config, value);
  return true;
}

export function isHotKey(entry) {
  return Boolean(entry && entry.applies === "hot" && HOT_APPLYERS[entry.key]);
}
