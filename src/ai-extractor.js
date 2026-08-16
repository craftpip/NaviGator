import { performance } from "node:perf_hooks";

const DEFAULT_MAX_CONCURRENCY = 2;

// Absolute safety cap for MinerU-HTML inputs. The sidecar's LLM classifies the
// whole page (vLLM KV cache on the GPU bounds the effective context), so we
// send the full HTML — no reader-lm-style tail-cut at AI_EXTRACTOR_MAX_INPUT_CHARS.
// This cap only guards the HTTP body against pathological pages.
const MINERU_MAX_INPUT_CHARS = 400000;

export function getAiExtractorModels(config) {
  if (!Array.isArray(config?.aiExtractorModels) || !config.aiExtractorModels.length) return [];
  return config.aiExtractorModels.filter((entry) => entry?.id && entry?.model && entry?.baseUrl);
}

export function isAiExtractorConfigured(config, modelId) {
  if (!modelId || typeof modelId !== "string") return false;
  return getAiExtractorModels(config).some((entry) => entry.id === modelId);
}

export function getAiExtractorKind(config, modelId) {
  const entry = getAiExtractorModels(config).find((item) => item.id === modelId);
  return entry?.kind === "mineru" ? "mineru" : "chat";
}

let inFlight = 0;
let waiters = [];

function acquireSlot() {
  if (inFlight < DEFAULT_MAX_CONCURRENCY) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  inFlight -= 1;
  const next = waiters.shift();
  if (next) next();
}

export function getInFlightCount() {
  return inFlight;
}

function truncateTail(text, maxChars) {
  if (!text || text.length <= maxChars) return text || "";
  return text.slice(-maxChars);
}

function timeoutFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function extractWithChat({ entry, html, config, maxChars, timeoutMs, debug }) {
  const maxInputChars = Math.min(
    Number(config?.aiExtractorMaxInputChars) || 60000,
    Number.isFinite(maxChars) && maxChars > 0 ? Math.max(maxChars * 2, 60000) : Infinity
  );
  const maxTokens = Number(config?.aiExtractorMaxTokens) || 8192;

  let prepared = typeof html === "string" ? html : "";
  if (prepared.length > maxInputChars) {
    // Tail-cut: the interesting content (tables, footnotes) tends to live at the end;
    // a head-cut would drop it. AI_EXTRACTOR_MAX_INPUT_CHARS keeps us under the model's
    // context window (~32K tokens ≈ 60K chars of HTML).
    prepared = truncateTail(prepared, maxInputChars);
  }

  if (debug) {
    console.log(`[web_fetch] [ai-extractor] ${entry.label} preparing ${prepared.length} chars (of ${html?.length || 0})`);
  }

  const response = await timeoutFetch(`${entry.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: entry.model,
      messages: [{ role: "user", content: prepared }],
      max_tokens: maxTokens,
      temperature: 0
    })
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`AI extractor HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI extractor returned empty content");
  }
  return content.trim();
}

async function extractWithMineru({ entry, html, config, timeoutMs, debug }) {
  let prepared = typeof html === "string" ? html : "";
  if (prepared.length > MINERU_MAX_INPUT_CHARS) {
    prepared = truncateTail(prepared, MINERU_MAX_INPUT_CHARS);
  }

  if (debug) {
    console.log(`[web_fetch] [ai-extractor] ${entry.label} (mineru) sending ${prepared.length} chars (of ${html?.length || 0})`);
  }

  const response = await timeoutFetch(`${entry.baseUrl}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: prepared })
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`MinerU extractor HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data?.text;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("MinerU extractor returned empty content");
  }
  return content.trim();
}

export async function extractHtmlWithAiModel({ html, model, config, maxChars, debug = false }) {
  const entries = getAiExtractorModels(config);
  const entry = entries.find((item) => item.id === model);
  if (!entry) {
    throw new Error(`AI extractor "${model}" is not configured — set AI_EXTRACTOR_MODELS or AI_EXTRACTOR_BASE_URL`);
  }

  const tStart = performance.now();
  const timeoutMs = Number(config?.aiExtractorTimeoutMs) || 60000;

  await acquireSlot();
  try {
    const content = entry.kind === "mineru"
      ? await extractWithMineru({ entry, html, config, timeoutMs, debug })
      : await extractWithChat({ entry, html, config, maxChars, timeoutMs, debug });

    if (debug) {
      console.log(
        `[web_fetch] [ai-extractor] ${entry.label} returned ${content.length} chars in ${Math.round(performance.now() - tStart)}ms`
      );
    }
    return content;
  } finally {
    releaseSlot();
  }
}
