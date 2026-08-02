import { KNOWN_BACKENDS, POOL_POLICIES } from "./driver.js";
import { DuckDuckGoApiDriver } from "./duckduckgo-api.js";
import { DuckDuckGoCbDriver } from "./duckduckgo-cb.js";
import { DuckDuckGoChDriver } from "./duckduckgo-ch.js";
import { GoogleCbDriver } from "./google-cb.js";
import { GoogleChDriver } from "./google-ch.js";
import { GoogleLpDriver } from "./google-lp.js";
import { BingCbDriver } from "./bing-cb.js";
import { BingLpDriver } from "./bing-lp.js";
import { BraveCbDriver } from "./brave-cb.js";
import { MojeekLpDriver } from "./mojeek-lp.js";

const DRIVER_CLASSES = [
  BingCbDriver,
  BingLpDriver,
  BraveCbDriver,
  DuckDuckGoApiDriver,
  DuckDuckGoCbDriver,
  DuckDuckGoChDriver,
  GoogleCbDriver,
  GoogleChDriver,
  GoogleLpDriver,
  MojeekLpDriver
];

const REGISTRY = new Map();
const ENGINE_METADATA = new Map();

for (const DriverClass of DRIVER_CLASSES) {
  const instance = new DriverClass();
  const id = String(instance.id || "").toLowerCase();
  if (!id) {
    throw new Error(`Search engine driver ${DriverClass.name} has no id`);
  }
  if (REGISTRY.has(id)) {
    throw new Error(`Duplicate search engine id registered: ${id}`);
  }
  if (!KNOWN_BACKENDS.has(instance.backend)) {
    throw new Error(`Search engine ${id} has unknown backend: ${instance.backend}`);
  }
  if (instance.backend === "api") {
    if (instance.pool != null) {
      throw new Error(`Search engine ${id} is an API route but declares a pool: ${instance.pool}`);
    }
    if (instance.homeUrl) {
      throw new Error(`Search engine ${id} is an API route but declares a homeUrl`);
    }
  } else {
    if (!instance.homeUrl) {
      throw new Error(`Search engine ${id} is a browser route but has no homeUrl`);
    }
    if (!POOL_POLICIES.has(instance.pool)) {
      throw new Error(`Search engine ${id} has invalid pool policy: ${instance.pool}`);
    }
  }

  REGISTRY.set(id, DriverClass);
  ENGINE_METADATA.set(id, {
    backend: instance.backend,
    pool: instance.pool,
    homeUrl: instance.homeUrl,
    exposedInMcp: instance.exposedInMcp === true,
    inputSelectors: instance.inputSelectors,
    resultSelectors: instance.resultSelectors,
    isBrowser: instance.backend !== "api"
  });
}

export const SUPPORTED_ENGINES = Object.freeze([...REGISTRY.keys()]);

export const MCP_SEARCH_ENGINES = Object.freeze(
  ["duckduckgo_api", "brave_cb", "bing_lp", "mojeek_lp", "google_cb", "bing_cb", "duckduckgo_cb"]
    .filter((id) => ENGINE_METADATA.get(id)?.exposedInMcp)
);

export function getEngineDriver(engine, config) {
  const DriverClass = REGISTRY.get(String(engine || "").toLowerCase());
  if (!DriverClass) {
    throw new Error(`Unknown search engine: ${engine}`);
  }
  return new DriverClass(config);
}

export function getEngineMetadata(engine) {
  return ENGINE_METADATA.get(String(engine || "").toLowerCase()) || null;
}

export function getBrowserWarmupEngines(engines) {
  const input = Array.isArray(engines) ? engines : [];
  const seen = new Set();
  const result = [];
  for (const item of input) {
    const id = String(item || "").trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (ENGINE_METADATA.get(id)?.isBrowser) {
      result.push(id);
    }
  }
  return result;
}
