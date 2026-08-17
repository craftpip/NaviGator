const DEFAULT_MAX_CONCURRENCY = 2;

const MINERU_MAX_INPUT_CHARS = 400000;
const DEFAULT_MAX_INPUT_CHARS = 60000;
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TIMEOUT_MS = 60000;

const DEFAULT_SCREENSHOT_PROMPT =
  "Extract all readable content from this page as Markdown, preserving tables and formulas.";

const API_DEFAULT_OUTPUT_FIELD = "text";

export function getPostProcessorModels(config) {
  if (!Array.isArray(config?.postProcessorModels) || !config.postProcessorModels.length) return [];
  return config.postProcessorModels.filter((entry) => entry?.id);
}

export function isPostProcessorConfigured(config, modelId) {
  if (!modelId || typeof modelId !== "string") return false;
  return getPostProcessorModels(config).some((entry) => entry.id === modelId);
}

export function getPostProcessorKind(config, modelId) {
  const entry = getPostProcessorModels(config).find((item) => item.id === modelId);
  return entry?.kind === "mineru" || entry?.kind === "api" ? entry.kind : "chat";
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

export function _resetConcurrencyForTests() {
  inFlight = 0;
  waiters = [];
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

/**
 * Transport functions — each takes (entry, input, config, debug) → string.
 */
async function extractWithChat(entry, inputText, config, debug) {
  const url = `${entry.baseUrl}/chat/completions`;
  const payload = {
    model: entry.model,
    messages: [{ role: "user", content: inputText }],
    max_tokens: entry.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0,
  };
  const res = await timeoutFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(entry.headers || {}) },
      body: JSON.stringify(payload),
    },
    entry.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[post-processor] chat request failed: ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`chat request failed: ${res.status} ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("empty chat completion: no content in response");
  }
  return content;
}

async function extractWithMineru(entry, preparedHtml, config, debug) {
  const url = `${entry.baseUrl}/extract`;
  const payload = { html: preparedHtml, mode: "auto" };
  const res = await timeoutFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    entry.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[post-processor] mineru request failed: ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`mineru request failed: ${res.status} ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.text || data?.result?.documents?.[0]?.text || "";
  if (!content) {
    throw new Error("empty mineru response: no text in response");
  }
  return content;
}

async function extractWithChatImage(entry, imageDataUrl, prompt, config, debug) {
  const url = `${entry.baseUrl}/chat/completions`;
  const payload = {
    model: entry.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_tokens: entry.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0,
  };
  const res = await timeoutFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(entry.headers || {}) },
      body: JSON.stringify(payload),
    },
    entry.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[post-processor] chat image request failed: ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`chat request failed: ${res.status} ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("empty chat completion: no content in response");
  }
  return content;
}

function interpolateInput(bodyText, input) {
  const encoded = JSON.stringify(input);
  return bodyText.split('"{{input}}"').join(encoded).split("{{input}}").join(encoded);
}

async function extractWithApi(entry, input, config, debug) {
  const url = `${entry.baseUrl}${entry.path || ""}`;
  const method = (entry.method || "POST").toUpperCase();
  const bodyTemplate =
    typeof entry.body === "string"
      ? entry.body
      : JSON.stringify(entry.body ?? { input: "{{input}}" });
  const res = await timeoutFetch(
    url,
    {
      method,
      headers: { "Content-Type": "application/json", ...(entry.headers || {}) },
      body: interpolateInput(bodyTemplate, input),
    },
    entry.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[post-processor] api request failed: ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`api request failed: ${res.status} ${text.slice(0, 500)}`);
  }
  if (entry.outputType === "text") {
    const raw = await res.text();
    if (!raw.trim()) throw new Error("empty api response: no body");
    return raw;
  }
  const data = await res.json();
  const field = entry.outputField || API_DEFAULT_OUTPUT_FIELD;
  let content = data;
  for (const part of field.split(".")) {
    if (content == null) break;
    content = content[part];
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`empty api response: outputField "${field}" not found`);
  }
  return content;
}

// ── Transport Registry ───────────────────────────────────────────────────────
const TRANSPORTS = {
  chat: extractWithChat,
  mineru: extractWithMineru,
  api: extractWithApi,
};

/**
 * Run the post-processor model over exactly one extractor-output payload.
 *
 * @param {object} opts
 * @param {string} [opts.text]      - Text content to process.
 * @param {string} [opts.html]      - HTML content to process.
 * @param {string} [opts.screenshot] - Base64 screenshot to process.
 * @param {string} opts.model       - Model ID from POST_PROCESSOR_MODELS.
 * @param {object} opts.config      - manager.config.
 * @param {boolean} [opts.debug]    - Enable debug logging.
 */
export async function runPostProcessor({ text, html, screenshot, model, config, debug }) {
  const entry = getPostProcessorModels(config).find((item) => item.id === model);
  if (!entry) {
    throw new Error(`Post-processor "${model}" is not configured — set POST_PROCESSOR_MODELS`);
  }
  const payloads = [html, text, screenshot].filter((v) => v !== undefined && v !== null);
  if (payloads.length !== 1) {
    throw new Error("exactly one of html / text / screenshot is required");
  }
  return acquireSlot().then(async () => {
    try {
      if (debug) {
        console.log(`[post-processor] runPostProcessor: model=${model} kind=${entry.kind} input=${html ? "html" : text ? "text" : "screenshot"}`);
      }

      // Screenshot → image variant of chat transport (regardless of kind).
      if (screenshot) {
        return await extractWithChatImage(entry, screenshot, entry.prompt || DEFAULT_SCREENSHOT_PROMPT, config, debug);
      }

      // Text/HTML → dispatch by kind.
      const transport = TRANSPORTS[entry.kind] || TRANSPORTS.chat;
      if (entry.kind === "mineru") {
        const preparedHtml = String(html ?? text ?? "").slice(0, MINERU_MAX_INPUT_CHARS);
        return await transport(entry, preparedHtml, config, debug);
      }
      const prepared = truncateTail(html ?? text ?? "", entry.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS);
      return await transport(entry, prepared, config, debug);
    } finally {
      releaseSlot();
    }
  });
}
