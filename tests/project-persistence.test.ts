import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type JarvisDatabase } from "../src/server/database/connection.js";
import {
  ProjectAlreadyExistsError,
  ProjectRepository,
} from "../src/server/repositories/projects.js";

const FIXED_TIME = new Date("2026-07-21T12:00:00.000Z");
const openDatabases: JarvisDatabase[] = [];

function temporaryDatabasePath(): string {
  return join(mkdtempSync(join(tmpdir(), "jarvis-gate1-")), "jarvis.db");
}

function track(database: JarvisDatabase): JarvisDatabase {
  openDatabases.push(database);
  return database;
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.open) database.close();
  }
});

describe("project persistence", () => {
  it("creates and retrieves MK 42 after reopening SQLite", () => {
    const databasePath = temporaryDatabasePath();
    const firstDatabase = track(openDatabase(databasePath));
    const firstRepository = new ProjectRepository(firstDatabase, () => FIXED_TIME);

    const created = firstRepository.create({
      id: "mk-42",
      name: "MK 42",
      objective: "Upgrade and validate the MK 42 armor systems",
      repository_path: "/Users/example/Projects/MK-42",
      provider: "codex",
      current_phase: "foundation",
      next_action: "Inspect the current armor systems",
    });
    firstDatabase.close();

    const restartedDatabase = track(openDatabase(databasePath));
    const retrieved = new ProjectRepository(restartedDatabase).get("mk-42");

    expect(retrieved).toEqual(created);
    expect(retrieved?.created_at).toBe("2026-07-21T12:00:00.000Z");
    expect(retrieved?.updated_at).toBe("2026-07-21T12:00:00.000Z");
  });

  it("returns null for an unknown project", () => {
    const database = track(openDatabase(temporaryDatabasePath()));
    expect(new ProjectRepository(database).get("missing")).toBeNull();
  });

  it("rejects duplicate IDs without weakening the original record", () => {
    const database = track(openDatabase(temporaryDatabasePath()));
    const repository = new ProjectRepository(database, () => FIXED_TIME);
    const input = {
      id: "mk-42",
      name: "MK 42",
      objective: "Upgrade and validate the MK 42 armor systems",
      repository_path: "/Users/example/Projects/MK-42",
      provider: "codex" as const,
    };
    repository.create(input);

    expect(() => repository.create(input)).toThrow(ProjectAlreadyExistsError);
    expect(repository.get("mk-42")?.name).toBe("MK 42");
  });

  it("migrates the existing Python project table without losing data", () => {
    const databasePath = temporaryDatabasePath();
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL,
        current_phase TEXT NOT NULL,
        latest_result TEXT NOT NULL,
        current_blocker TEXT NOT NULL,
        next_action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacy
      .prepare(
        `INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "legacy",
        "Legacy Project",
        "Preserve existing project state",
        "active",
        "foundation",
        "Python persistence works",
        "",
        "Migrate to TypeScript",
        "2026-07-20T12:00:00+00:00",
        "2026-07-20T12:00:00+00:00",
      );
    legacy.close();

    const migrated = track(openDatabase(databasePath));
    const project = new ProjectRepository(migrated).get("legacy");

    expect(project).toMatchObject({
      id: "legacy",
      name: "Legacy Project",
      repository_path: "",
      provider: "codex",
      provider_session_id: null,
      latest_result: "Python persistence works",
    });
    const tables = migrated
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "projects",
        "runs",
        "run_events",
        "project_logs",
        "settings",
      ]),
    );
  });
});
