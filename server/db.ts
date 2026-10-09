import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";

let dbInstance: Database | null = null;
let initialization: Promise<Database> | null = null;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE_PATH = path.join(DATA_DIR, "canon_engine.sqlite");
let isPersisting = false;
let persistPending = false;

export async function getDatabase(): Promise<Database> {
  if (!initialization) initialization = initializeDatabase().catch(error => { initialization = null; throw error; });
  return initialization;
}
async function initializeDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE_PATH);
      const testDb = new SQL.Database(fileBuffer);
      // Verify database integrity
      const check = testDb.exec("PRAGMA integrity_check;");
      if (check.length && check[0].values.length && check[0].values[0][0] === "ok") {
        dbInstance = testDb;
      } else {
        throw new Error("Integrity check failed");
      }
    } catch (e) {
      console.warn("Failed or malformed SQLite file detected, recreating fresh database:", e);
      try {
        if (fs.existsSync(DB_FILE_PATH)) fs.copyFileSync(DB_FILE_PATH, DB_FILE_PATH + ".corrupt-" + Date.now());
      } catch (err) {}
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  initTables(dbInstance);
  return dbInstance;
}

function initTables(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      proposal_id INTEGER,
      proposer TEXT,
      title TEXT,
      content TEXT,
      ipfs_cid TEXT,
      status INTEGER,
      status_label TEXT,
      votes_for INTEGER DEFAULT 0,
      votes_against INTEGER DEFAULT 0,
      threshold INTEGER DEFAULT 0,
      planet TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      tx_id TEXT,
      raw_json TEXT,
      source_url TEXT,
      pull_request_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS governance_telemetry (
      id TEXT PRIMARY KEY,
      metric_key TEXT UNIQUE,
      metric_value TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS canon_nodes (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      planet TEXT,
      faction TEXT,
      description TEXT,
      metadata_json TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS canon_edges (
      id TEXT PRIMARY KEY,
      source TEXT,
      target TEXT,
      relation TEXT,
      weight REAL DEFAULT 1.0,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS hyperion_actions (
      id TEXT PRIMARY KEY,
      global_sequence TEXT,
      trx_id TEXT,
      block_num INTEGER,
      timestamp TEXT,
      action_name TEXT,
      actor TEXT,
      data_json TEXT
    );

    CREATE TABLE IF NOT EXISTS github_pr_sources (
      pr_id INTEGER PRIMARY KEY,
      pr_url TEXT NOT NULL,
      title TEXT,
      author TEXT,
      head_sha TEXT,
      file_path TEXT,
      source_kind TEXT,
      content TEXT,
      content_sha256 TEXT,
      resolution_status TEXT NOT NULL,
      resolution_reason TEXT,
      candidates_json TEXT,
      last_attempt_status TEXT,
      last_attempt_reason TEXT,
      last_attempt_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS planetary_metrics (
      planet_id TEXT PRIMARY KEY,
      planet_name TEXT,
      active_lore_count INTEGER DEFAULT 0,
      passed_proposals INTEGER DEFAULT 0,
      active_scribes INTEGER DEFAULT 0,
      description TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      path TEXT,
      planet TEXT,
      lore_id TEXT,
      lore_title TEXT,
      user_id TEXT,
      session_id TEXT,
      duration_ms INTEGER DEFAULT 0,
      metadata_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_views (
      id TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      view_name TEXT,
      planet TEXT,
      user_id TEXT,
      session_id TEXT,
      timestamp INTEGER NOT NULL
    );
  `);

  // Lightweight forward migration for existing runtime databases.
  // Source provenance is stored separately from IPFS so URLs/PR ids never
  // masquerade as content-addressed identifiers.
  ensureColumn(db, "proposals", "source_url", "TEXT");
  ensureColumn(db, "proposals", "pull_request_id", "INTEGER");
  ensureColumn(db, "github_pr_sources", "last_attempt_status", "TEXT");
  ensureColumn(db, "github_pr_sources", "last_attempt_reason", "TEXT");
  ensureColumn(db, "github_pr_sources", "last_attempt_at", "INTEGER");

  db.run("CREATE INDEX IF NOT EXISTS idx_proposals_pull_request_id ON proposals(pull_request_id)");

  persistDatabase();
}

function ensureColumn(db: Database, table: string, column: string, type: string) {
  const info = db.exec(`PRAGMA table_info(${table});`);
  const columns = info.length ? info[0].values.map((row) => String(row[1])) : [];
  if (!columns.includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function persistDatabase() {
  if (!dbInstance || isPersisting) {
    if (isPersisting) persistPending = true;
    return;
  }
  isPersisting = true;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const tmpPath = `${DB_FILE_PATH}.${Date.now()}.tmp`;
    const snapshot = fs.openSync(tmpPath, "w");
    try { fs.writeFileSync(snapshot, buffer); fs.fsyncSync(snapshot); } finally { fs.closeSync(snapshot); }
    // Windows does not reliably allow renaming over an existing file. Remove
    // the old snapshot only after the new export has been written successfully.
    if (fs.existsSync(DB_FILE_PATH)) fs.copyFileSync(DB_FILE_PATH, DB_FILE_PATH + ".bak");
    fs.renameSync(tmpPath, DB_FILE_PATH);
  } catch (error) {
    console.error("Error persisting SQLite database:", error);
  } finally {
    isPersisting = false;
    if (persistPending) {
      persistPending = false;
      setTimeout(() => persistDatabase(), 100);
    }
  }
}
