import { KNOWN_BACKENDS, POOL_POLICIES, SearchEngineDriver } from "./driver.js";
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
import { YahooCbDriver } from "./yahoo-cb.js";

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
  MojeekLpDriver,
  YahooCbDriver
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
    if (typeof instance.search !== "function" || instance.search === SearchEngineDriver.prototype.search) {
      throw new Error(`Search engine ${id} is an API route but does not implement search()`);
    }
  } else {
    if (!instance.homeUrl) {
      throw new Error(`Search engine ${id} is a browser route but has no homeUrl`);
    }
    if (!POOL_POLICIES.has(instance.pool)) {
      throw new Error(`Search engine ${id} has invalid pool policy: ${instance.pool}`);
    }
    if (typeof instance.searchUrl !== "function" || instance.searchUrl === SearchEngineDriver.prototype.searchUrl) {
      throw new Error(`Search engine ${id} is a browser route but does not implement searchUrl()`);
    }
    if (typeof instance.extract !== "function" || instance.extract === SearchEngineDriver.prototype.extract) {
      throw new Error(`Search engine ${id} is a browser route but does not implement extract()`);
    }
  }

  REGISTRY.set(id, DriverClass);
  ENGINE_METADATA.set(id, {
    backend: instance.backend,
    pool: instance.pool,
    homeUrl: instance.homeUrl,
    isBrowser: instance.backend !== "api"
  });
}

export const SUPPORTED_ENGINES = Object.freeze([...REGISTRY.keys()]);

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
