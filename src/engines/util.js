export function cleanWhitespace(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

// Convert an error into a human-readable message. AggregateError instances
// (e.g. from Promise.any when every selector wait times out) only expose the
// generic "All promises were rejected" as their message; the real reasons live
// in error.errors. Unwrap those so circuit breakers, attempt logs, and the
// console show what actually failed instead of the cryptic AggregateError text.
export function readableErrorMessage(error, maxLen = 300) {
  if (error && typeof error === "object" && Array.isArray(error.errors)) {
    const reasons = error.errors
      .map((reason) => readableErrorMessage(reason, maxLen))
      .map((message) => String(message).trim())
      .filter((message) => message && message !== "All promises were rejected");
    const unique = [...new Set(reasons)];
    if (unique.length) {
      return unique.join("; ").slice(0, maxLen);
    }
  }
  return String(error?.message || error || "").slice(0, maxLen);
}

export function normalizeQueryText(input) {
  let text = String(input || "").trim();
  if (!text) return "";

  const quotePairs = [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
    ["“", "”"],
    ["‘", "’"]
  ];
  const quoteChars = new Set(["\"", "'", "`", "“", "”", "‘", "’"]);

  let changed = true;
  while (changed && text.length > 1) {
    changed = false;
    for (const [open, close] of quotePairs) {
      if (text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length) {
        text = text.slice(open.length, text.length - close.length).trim();
        changed = true;
      }
    }
  }

  if (text.length > 1 && quoteChars.has(text[0]) && !quoteChars.has(text[text.length - 1])) {
    text = text.slice(1).trimStart();
  }

  // Humanize: make the query look like a natural human search instead of an LLM prompt.
  // Lowercase everything, drop "unused" symbols (backslashes, forward slashes, quotes),
  // and strip trailing punctuation. Meaning-bearing symbols (+ # .) are left intact.
  text = text.toLowerCase();
  text = text.replace(/[\\/:;]/g, " ");
  text = text.replace(/["'`“”‘’]/g, "");
  text = text.replace(/[.,!?]+$/g, "");
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function decodeBingRedirectUrl(u) {
  for (const candidate of [u, u.replace(/^a\d+/, "")]) {
    for (let depth = 1; depth <= 2; depth += 1) {
      try {
        let decoded = candidate;
        for (let i = 0; i < depth; i += 1) {
          decoded = Buffer.from(decoded, "base64").toString("utf8");
        }
        if (/^https?:\/\//.test(decoded)) return decoded;
      } catch {
        // try the next candidate/depth
      }
    }
  }
  return null;
}

export function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes("google.") && parsed.pathname === "/url") {
      const redirect = parsed.searchParams.get("q");
      if (redirect) return redirect;
    }
    if (parsed.hostname.includes("duckduckgo.") && parsed.pathname === "/l/") {
      const redirect = parsed.searchParams.get("uddg");
      if (redirect) return redirect;
    }
    if (parsed.hostname.includes("bing.") && parsed.pathname === "/ck/a") {
      const u = parsed.searchParams.get("u");
      if (u) {
        const redirect = decodeBingRedirectUrl(u);
        if (redirect) return redirect;
      }
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

export function buildLlmText(result) {
  return cleanWhitespace(`${result.title}\n${result.snippet}`);
}

export function dedupeDirectAnswers(answers, maxItems = 10) {
  const byKey = new Map();

  for (const item of answers) {
    const text = cleanWhitespace(item?.text);
    if (!text) continue;

    const source = cleanWhitespace(item?.source || "answer").toLowerCase();
    const key = `${source}|${text.toLowerCase()}`;
    const queryVariants = Array.isArray(item?.queryVariants)
      ? item.queryVariants.map((q) => cleanWhitespace(q)).filter(Boolean)
      : [cleanWhitespace(item?.queryVariant)].filter(Boolean);

    if (!byKey.has(key)) {
      byKey.set(key, {
        source,
        text,
        url: cleanWhitespace(item?.url || ""),
        ...(queryVariants.length ? { queryVariants } : {})
      });
      continue;
    }

    if (queryVariants.length) {
      const existing = byKey.get(key);
      const merged = [...new Set([...(existing.queryVariants || []), ...queryVariants])];
      if (merged.length) {
        existing.queryVariants = merged;
      }
    }
  }

  return [...byKey.values()].slice(0, maxItems);
}

export function cleanAndTruncateText(text, maxChars) {
  return String(text || "").replace(/[^\S\n]+/g, " ").trim().slice(0, maxChars);
}

export async function fetchTextWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 160)}`);
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}
