import type { JarvisDatabase } from "./connection.js";

interface ColumnInfo {
  name: string;
}

function tableColumns(database: JarvisDatabase, table: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  return new Set(rows.map((row) => row.name));
}

function addProjectColumnIfMissing(
  database: JarvisDatabase,
  columns: Set<string>,
  name: string,
  definition: string,
): void {
  if (!columns.has(name)) {
    database.exec(`ALTER TABLE projects ADD COLUMN ${name} ${definition}`);
    columns.add(name);
  }
}

export function migrate(database: JarvisDatabase): void {
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        repository_path TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_session_id TEXT,
        current_phase TEXT NOT NULL,
        latest_result TEXT NOT NULL,
        current_blocker TEXT NOT NULL,
        next_action TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        profile_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const columns = tableColumns(database, "projects");
    addProjectColumnIfMissing(database, columns, "repository_path", "TEXT NOT NULL DEFAULT ''");
    addProjectColumnIfMissing(database, columns, "provider", "TEXT NOT NULL DEFAULT 'codex'");
    addProjectColumnIfMissing(database, columns, "provider_session_id", "TEXT");
    addProjectColumnIfMissing(database, columns, "notes", "TEXT NOT NULL DEFAULT ''");
    addProjectColumnIfMissing(database, columns, "profile_json", "TEXT");

    database.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        provider TEXT NOT NULL,
        provider_session_id TEXT,
        instruction TEXT NOT NULL,
        proposal_json TEXT,
        proposal_revision INTEGER NOT NULL DEFAULT 0,
        approved_proposal_revision INTEGER,
        approval_decision TEXT,
        status TEXT NOT NULL,
        result_json TEXT,
        verification_json TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id),
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        UNIQUE(run_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS project_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id),
        run_id TEXT REFERENCES runs(id),
        category TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inspection_cache (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const runColumns = tableColumns(database, "runs");
    if (!runColumns.has("approved_proposal_revision")) {
      database.exec("ALTER TABLE runs ADD COLUMN approved_proposal_revision INTEGER");
    }
    if (!runColumns.has("context_json")) {
      database.exec("ALTER TABLE runs ADD COLUMN context_json TEXT");
    }
    if (!runColumns.has("pre_snapshot_json")) database.exec("ALTER TABLE runs ADD COLUMN pre_snapshot_json TEXT");
    if (!runColumns.has("post_snapshot_json")) database.exec("ALTER TABLE runs ADD COLUMN post_snapshot_json TEXT");

    database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      )
      .run(1, new Date().toISOString());
    database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      )
      .run(2, new Date().toISOString());
    database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      )
      .run(3, new Date().toISOString());
    database
      .prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(4, new Date().toISOString());
    database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(5, new Date().toISOString());
    database.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(6, new Date().toISOString());
  })();
}
