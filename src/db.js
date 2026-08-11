import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const RETENTION_DAYS = 7;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

let db = null;
let lastPrune = 0;

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    query TEXT NOT NULL,
    variants TEXT,
    requested_engine TEXT,
    engines TEXT,
    result_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'running',
    ok INTEGER,
    error TEXT,
    source TEXT NOT NULL DEFAULT 'mcp'
  );
  CREATE INDEX IF NOT EXISTS idx_searches_ts ON searches(ts);
  CREATE INDEX IF NOT EXISTS idx_searches_status ON searches(status);
  CREATE TABLE IF NOT EXISTS engine_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id INTEGER REFERENCES searches(id) ON DELETE CASCADE,
    ts INTEGER NOT NULL,
    engine TEXT NOT NULL,
    backend TEXT,
    status TEXT NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_engine_attempts_search_id ON engine_attempts(search_id);
  CREATE INDEX IF NOT EXISTS idx_engine_attempts_ts ON engine_attempts(ts);
  CREATE INDEX IF NOT EXISTS idx_engine_attempts_engine ON engine_attempts(engine);
  CREATE TABLE IF NOT EXISTS page_ops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    tool TEXT NOT NULL,
    url TEXT,
    backend TEXT,
    duration_ms INTEGER,
    ok INTEGER NOT NULL,
    error TEXT,
    source TEXT NOT NULL DEFAULT 'mcp'
  );
   CREATE INDEX IF NOT EXISTS idx_page_ops_ts ON page_ops(ts);
   CREATE INDEX IF NOT EXISTS idx_page_ops_tool ON page_ops(tool);`,
  `ALTER TABLE page_ops ADD COLUMN response_chars INTEGER NOT NULL DEFAULT 0;`
];

export function initDb(dataDir = path.join(process.cwd(), "data")) {
  if (db) return db;
  mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, "navigator.db");
  db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  let version = row?.version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i += 1) {
    db.exec(MIGRATIONS[i]);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(i + 1);
  }
  pruneActivity(true);
  return db;
}

export function getDb() {
  if (!db) throw new Error("Database not initialized — call initDb() first");
  return db;
}

export function isDbReady() {
  return Boolean(db);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
    lastPrune = 0;
  }
}

export function pruneActivity(force = false) {
  const now = Date.now();
  if (!force && now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  if (!db) return;
  try {
    const cutoff = now - RETENTION_DAYS * 86400_000;
    db.prepare("DELETE FROM searches WHERE ts < ?").run(cutoff);
    db.prepare("DELETE FROM page_ops WHERE ts < ?").run(cutoff);
    db.prepare("DELETE FROM engine_attempts WHERE search_id IS NULL AND ts < ?").run(cutoff);
  } catch (error) {
    console.error(`⚠️  Activity prune failed: ${String(error?.message || error)}`);
  }
}
