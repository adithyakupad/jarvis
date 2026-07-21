import type { JarvisDatabase } from "../database/connection.js";
import {
  CreateProjectSchema,
  ProjectSchema,
  type CreateProject,
  type Project,
} from "../../shared/projects.js";

function fromRow(row: unknown): Project {
  const record = row as Record<string, unknown>;
  return ProjectSchema.parse({ ...record, profile: typeof record.profile_json === "string" ? JSON.parse(record.profile_json) : null });
}

export class ProjectAlreadyExistsError extends Error {
  constructor(projectId: string) {
    super(`Project '${projectId}' already exists.`);
    this.name = "ProjectAlreadyExistsError";
  }
}

export type Clock = () => Date;

export class ProjectRepository {
  constructor(
    private readonly database: JarvisDatabase,
    private readonly clock: Clock = () => new Date(),
  ) {}

  create(input: CreateProject): Project {
    const parsed = CreateProjectSchema.parse(input);
    const timestamp = this.clock().toISOString();
    const project = ProjectSchema.parse({
      ...parsed,
      created_at: timestamp,
      updated_at: timestamp,
    });

    try {
      this.database
        .prepare(
          `INSERT INTO projects (
            id, name, objective, status, repository_path, provider,
            provider_session_id, current_phase, latest_result,
            current_blocker, next_action, notes, profile_json, created_at, updated_at
          ) VALUES (
            @id, @name, @objective, @status, @repository_path, @provider,
            @provider_session_id, @current_phase, @latest_result,
            @current_blocker, @next_action, @notes, @profile_json, @created_at, @updated_at
          )`,
        )
        .run({ ...project, profile_json: project.profile ? JSON.stringify(project.profile) : null });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed: projects.id")
      ) {
        throw new ProjectAlreadyExistsError(project.id);
      }
      throw error;
    }

    return project;
  }

  get(projectId: string): Project | null {
    const row = this.database
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId);
    return row === undefined ? null : fromRow(row);
  }

  list(): Project[] {
    return this.database
      .prepare("SELECT * FROM projects ORDER BY created_at, id")
      .all()
      .map(fromRow);
  }

  update(projectId: string, input: Partial<Pick<Project, "name" | "objective" | "status" | "repository_path" | "provider" | "notes" | "profile">>): Project | null {
    const existing = this.get(projectId);
    if (!existing) return null;
    const updated = ProjectSchema.parse({ ...existing, ...input, updated_at: this.clock().toISOString() });
    this.database.prepare(`UPDATE projects SET name=@name, objective=@objective, status=@status, repository_path=@repository_path, provider=@provider, notes=@notes, profile_json=@profile_json, updated_at=@updated_at WHERE id=@id`)
      .run({ ...updated, profile_json: updated.profile ? JSON.stringify(updated.profile) : null });
    return updated;
  }

  delete(projectId: string): boolean {
    return this.database.transaction(() => {
      this.database.prepare("DELETE FROM run_events WHERE run_id IN (SELECT id FROM runs WHERE project_id = ?)").run(projectId);
      this.database.prepare("DELETE FROM project_logs WHERE project_id = ?").run(projectId);
      this.database.prepare("DELETE FROM runs WHERE project_id = ?").run(projectId);
      return this.database.prepare("DELETE FROM projects WHERE id = ?").run(projectId).changes > 0;
    })();
  }
}
