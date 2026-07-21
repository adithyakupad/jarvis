import type { JarvisDatabase } from "./connection.js";

interface ColumnInfo {
  name: string;
}

function projectColumns(database: JarvisDatabase): Set<string> {
  const rows = database.prepare("PRAGMA table_info(projects)").all() as ColumnInfo[];
  return new Set(rows.map((row) => row.name));
}

function addColumnIfMissing(
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const columns = projectColumns(database);
    addColumnIfMissing(database, columns, "repository_path", "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(database, columns, "provider", "TEXT NOT NULL DEFAULT 'codex'");
    addColumnIfMissing(database, columns, "provider_session_id", "TEXT");

    database.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        provider TEXT NOT NULL,
        provider_session_id TEXT,
        instruction TEXT NOT NULL,
        proposal_json TEXT,
        proposal_revision INTEGER NOT NULL DEFAULT 0,
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
    `);

    database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      )
      .run(1, new Date().toISOString());
  })();
}
