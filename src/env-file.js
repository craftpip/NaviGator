import fs from "node:fs/promises";
import path from "node:path";

export function getEnvFilePath() {
  return process.env.NAVIGATOR_ENV_FILE
    ? path.resolve(process.env.NAVIGATOR_ENV_FILE)
    : path.join(process.cwd(), ".env");
}

export function parseEnvFile(text) {
  const lines = [];
  const keyToLine = new Map();
  String(text || "")
    .split("\n")
    .forEach((raw, index) => {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
      const entry = { raw, index, key: null, value: null, hasValue: false };
      if (match) {
        const key = match[1];
        const value = stripQuotes(stripInlineComment(match[2]));
        entry.key = key;
        entry.value = value;
        entry.hasValue = true;
        if (!keyToLine.has(key)) keyToLine.set(key, entry);
      }
      lines.push(entry);
    });
  return { lines, keyToLine };
}

function stripInlineComment(value) {
  const idx = value.search(/\s+#/);
  return idx === -1 ? value : value.slice(0, idx);
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(\\|n|t|")/g, (_, ch) => ch === "\\" ? "\\" : ch === "n" ? "\n" : ch === "t" ? "\t" : '"');
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed;
}

function serializeValue(raw) {
  const value = String(raw);
  if (/^[A-Za-z0-9_,.\-:/+@%]+$/.test(value) && value === value.trim()) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function upsertEnvText(text, updates) {
  const { lines, keyToLine } = parseEnvFile(text);
  const result = { changed: [], unchanged: [] };
  let didAddNewline = false;

  for (const [key, value] of Object.entries(updates)) {
    const existing = keyToLine.get(key);
    if (existing && existing.hasValue) {
      const newRaw = existing.raw.replace(/^(.*?=).*$/, `$1${serializeValue(value)}`);
      if (newRaw !== existing.raw) {
        existing.raw = newRaw;
        existing.value = String(value);
        result.changed.push(key);
      } else {
        result.unchanged.push(key);
      }
    } else {
      if (!didAddNewline && lines.length && lines[lines.length - 1].raw !== "") {
        lines.push({ raw: "", index: lines.length, key: null, value: null, hasValue: false });
        didAddNewline = true;
      }
      lines.push({
        raw: `${key}=${serializeValue(value)}`,
        index: lines.length,
        key,
        value: String(value),
        hasValue: true
      });
      result.changed.push(key);
    }
  }

  return { text: lines.map((entry) => entry.raw).join("\n"), changed: result.changed, unchanged: result.unchanged };
}

export function removeEnvKeysText(text, keys) {
  const { lines } = parseEnvFile(text);
  const remove = new Set(keys);
  const removed = [];
  const kept = lines.filter((entry) => {
    if (entry.key && remove.has(entry.key)) {
      removed.push(entry.key);
      return false;
    }
    return true;
  });
  return { text: kept.map((entry) => entry.raw).join("\n"), removed };
}

export async function backupEnvFile(filePath) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupPath = `${filePath}.backup-${stamp}`;
    const text = await fs.readFile(filePath, "utf8");
    await fs.writeFile(backupPath, text, "utf8");
    return backupPath;
  } catch {
    return null;
  }
}

export async function latestBackupPath(filePath) {
  try {
    const dir = path.dirname(filePath);
    const entries = await fs.readdir(dir);
    const prefix = `${path.basename(filePath)}.backup-`;
    const backups = entries.filter((entry) => entry.startsWith(prefix)).sort().reverse();
    return backups.length ? path.join(dir, backups[0]) : null;
  } catch {
    return null;
  }
}

export async function revertEnvFile(filePath) {
  const backupPath = await latestBackupPath(filePath);
  if (!backupPath) return null;
  const text = await fs.readFile(backupPath, "utf8");
  await fs.writeFile(filePath, text, "utf8");
  return backupPath;
}

const envChangeHistory = [];

export function recordEnvChange(entry) {
  envChangeHistory.unshift({ ts: new Date().toISOString(), ...entry });
  if (envChangeHistory.length > 50) envChangeHistory.length = 50;
}

export function getEnvChangeHistory() {
  return envChangeHistory.slice();
}

export async function readEnvFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function writeEnvFile(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}
