import { AsyncLocalStorage } from "node:async_hooks";
import { getDb, initDb, isDbReady, pruneActivity } from "./db.js";

export const searchContext = new AsyncLocalStorage();

const RETENTION_STATS_MS = 24 * 60 * 60 * 1000;

function searchIdFromContext() {
  return searchContext.getStore()?.searchId ?? null;
}

function runExclusive(task) {
  try {
    if (!isDbReady()) initDb();
    const result = task();
    pruneActivity();
    return result;
  } catch (error) {
    console.error(`⚠️  Activity DB error: ${String(error?.message || error)}`);
    return null;
  }
}

export function recordSearchStart({ query, variants, requestedEngine, engines }) {
  return runExclusive(() => {
    const info = getDb()
      .prepare(
        "INSERT INTO searches (ts, query, variants, requested_engine, engines, status) VALUES (?, ?, ?, ?, ?, 'running')"
      )
      .run(
        Date.now(),
        String(query || "").slice(0, 500),
        Array.isArray(variants) && variants.length > 1 ? JSON.stringify(variants) : null,
        requestedEngine ? String(requestedEngine) : null,
        Array.isArray(engines) && engines.length ? JSON.stringify(engines) : null
      );
    return Number(info.lastInsertRowid);
  });
}

export function recordSearchEnd(searchId, { ok = true, error = "", resultCount = 0, durationMs = 0 } = {}) {
  if (!searchId) return;
  runExclusive(() => {
    getDb()
      .prepare("UPDATE searches SET status = ?, ok = ?, error = ?, result_count = ?, duration_ms = ? WHERE id = ?")
      .run(
        ok ? "ok" : "fail",
        ok ? 1 : 0,
        ok ? "" : String(error || "").slice(0, 300),
        Math.max(0, Number(resultCount) || 0),
        Math.max(0, Math.round(durationMs) || 0),
        searchId
      );
  });
}

export function recordDbEngineAttempt({ engine, backend, status, resultCount = 0, error = "", durationMs = 0 }) {
  runExclusive(() => {
    getDb()
      .prepare(
        "INSERT INTO engine_attempts (search_id, ts, engine, backend, status, result_count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        searchIdFromContext(),
        Date.now(),
        String(engine),
        backend || null,
        String(status),
        Math.max(0, Number(resultCount) || 0),
        Math.max(0, Math.round(durationMs) || 0),
        String(error || "").slice(0, 300)
      );
  });
}

export function recordPageOp({ tool, url, backend, durationMs = 0, ok = true, error = "", source = "mcp" }) {
  runExclusive(() => {
    getDb()
      .prepare("INSERT INTO page_ops (ts, tool, url, backend, duration_ms, ok, error, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        Date.now(),
        String(tool),
        String(url || "").slice(0, 2000),
        backend || null,
        Math.max(0, Math.round(durationMs) || 0),
        ok ? 1 : 0,
        ok ? "" : String(error || "").slice(0, 300),
        source
      );
  });
}

export function getRecentActivity({ sinceId = 0, sinceOpId = 0, limit = 100, includePageOps = false } = {}) {
  const db = getDb();
  const searches = db
    .prepare("SELECT * FROM searches WHERE id > ? ORDER BY id DESC LIMIT ?")
    .all(Number(sinceId) || 0, Math.min(500, Math.max(1, Number(limit) || 100)));
  const attemptStmt = db.prepare("SELECT * FROM engine_attempts WHERE search_id = ? ORDER BY id");
  const entries = searches.map((search) => ({
    ...search,
    attempts: attemptStmt.all(search.id)
  }));
  let pageOps = [];
  if (includePageOps) {
    pageOps = db
      .prepare("SELECT * FROM page_ops WHERE id > ? ORDER BY id DESC LIMIT ?")
      .all(Number(sinceOpId) || 0, Math.min(500, Math.max(1, Number(limit) || 100)));
  }
  return { entries, pageOps };
}

export function getEngineSuccessStats({ sinceMs = Date.now() - RETENTION_STATS_MS } = {}) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT engine, backend, status,
              COUNT(*) AS attempts,
              COALESCE(SUM(result_count), 0) AS results
       FROM engine_attempts
       WHERE ts >= ?
       GROUP BY engine, backend, status
       ORDER BY engine`
    )
    .all(sinceMs);
  const byEngine = {};
  for (const row of rows) {
    const entry = (byEngine[row.engine] ||= { engine: row.engine, backend: row.backend, total: 0, ok: 0, fail: 0, skip: 0, results: 0 });
    entry.total += row.attempts;
    entry.results += row.results;
    if (row.status === "ok") entry.ok += row.attempts;
    else if (row.status === "skip") entry.skip += row.attempts;
    else entry.fail += row.attempts;
  }
  const list = Object.values(byEngine);
  const total = list.reduce((sum, entry) => sum + entry.total, 0);
  const ok = list.reduce((sum, entry) => sum + entry.ok, 0);
  const fail = list.reduce((sum, entry) => sum + entry.fail, 0);
  const skip = list.reduce((sum, entry) => sum + entry.skip, 0);
  return { sinceMs, total, ok, fail, skip, byEngine: list };
}
