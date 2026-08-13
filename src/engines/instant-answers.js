import { cleanWhitespace, dedupeDirectAnswers, fetchTextWithTimeout } from "./util.js";

export const DUCKDUCKGO_INSTANT_ANSWER_URL = "https://api.duckduckgo.com/";

export function parseDuckDuckGoInstantAnswers(payload) {
  const text = cleanWhitespace(payload?.Answer || payload?.AbstractText || payload?.Definition);
  if (!text) return [];
  const url = cleanWhitespace(payload?.AbstractURL || payload?.AbstractSource || "https://duckduckgo.com/");
  return dedupeDirectAnswers([{ source: "instant_answer", text, url }]);
}

export async function fetchDuckDuckGoInstantAnswers(query, config = {}) {
  const timeoutMs = Math.min(config.browserOpTimeoutMs || 15000, 15000);
  const url = `${DUCKDUCKGO_INSTANT_ANSWER_URL}?${new URLSearchParams({
    q: query,
    format: "json",
    no_html: "1",
    skip_disambig: "1",
    t: "navigator"
  })}`;
  const text = await fetchTextWithTimeout(url, {
    headers: { "user-agent": config.userAgent, "accept": "application/json" }
  }, timeoutMs);
  return parseDuckDuckGoInstantAnswers(JSON.parse(text));
}
