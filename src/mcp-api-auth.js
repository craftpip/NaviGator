import { timingSafeEqual } from "node:crypto";

export function getMcpApiKey(headers = {}) {
  const authorization = headers.authorization;
  if (typeof authorization === "string" && /^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, "").trim();
  }
  const apiKey = headers["x-api-key"];
  return typeof apiKey === "string" ? apiKey.trim() : "";
}

export function isAuthorizedMcpRequest(headers, config = {}) {
  if (config.mcpAllowUnauthenticated !== false) return true;
  const provided = Buffer.from(getMcpApiKey(headers));
  const keys = Array.isArray(config.mcpApiKeys) ? config.mcpApiKeys : [];
  return keys.some((key) => {
    const expected = Buffer.from(key);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

export function getAuthorizedMcpKey(headers, config = {}) {
  const provided = getMcpApiKey(headers);
  if (!provided) return null;
  const keys = Array.isArray(config.mcpApiKeys) ? config.mcpApiKeys : [];
  return keys.find((key) => {
    const actual = Buffer.from(provided);
    const expected = Buffer.from(key);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }) || null;
}
