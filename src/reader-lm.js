import { performance } from "node:perf_hooks";

const DEFAULT_MAX_CONCURRENCY = 2;

export function getAiModels(config) {
  if (!Array.isArray(config?.readerLmModels) || !config.readerLmModels.length) return [];
  return config.readerLmModels.filter((entry) => entry?.id && entry?.model && entry?.baseUrl);
}

export function isReaderLmConfigured(config, modelId) {
  if (!modelId || typeof modelId !== "string") return false;
  return getAiModels(config).some((entry) => entry.id === modelId);
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

export async function extractHtmlWithAiModel({ html, model, config, maxChars, debug = false }) {
  const entries = getAiModels(config);
  const entry = entries.find((item) => item.id === model);
  if (!entry) {
    throw new Error(`AI extractor "${model}" is not configured — set READER_LM_MODELS or READER_LM_BASE_URL`);
  }

  const tStart = performance.now();
  const timeoutMs = Number(config?.readerLmTimeoutMs) || 60000;
  const maxInputChars = Math.min(
    Number(config?.readerLmMaxInputChars) || 60000,
    Number.isFinite(maxChars) && maxChars > 0 ? Math.max(maxChars * 2, 60000) : Infinity
  );
  const maxTokens = Number(config?.readerLmMaxTokens) || 8192;

  let prepared = typeof html === "string" ? html : "";
  if (prepared.length > maxInputChars) {
    // Tail-cut: the interesting content (tables, footnotes) tends to live at the end;
    // a head-cut would drop it. READER_LM_MAX_INPUT_CHARS keeps us under the model's
    // context window (~32K tokens ≈ 60K chars of HTML).
    prepared = truncateTail(prepared, maxInputChars);
  }

  if (debug) {
    console.log(`[web_fetch] [ai-extractor] ${entry.label} preparing ${prepared.length} chars (of ${html?.length || 0})`);
  }

  await acquireSlot();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${entry.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: entry.model,
          messages: [{ role: "user", content: prepared }],
          max_tokens: maxTokens,
          temperature: 0
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`AI extractor HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("AI extractor returned empty content");
      }

      if (debug) {
        console.log(
          `[web_fetch] [ai-extractor] ${entry.label} returned ${content.length} chars in ${Math.round(performance.now() - tStart)}ms`
        );
      }
      return content.trim();
    } finally {
      clearTimeout(timer);
    }
  } finally {
    releaseSlot();
  }
}
