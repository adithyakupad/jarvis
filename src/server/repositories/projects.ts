import type { JarvisDatabase } from "../database/connection.js";
import {
  CreateProjectSchema,
  ProjectSchema,
  type CreateProject,
  type Project,
} from "../../shared/projects.js";

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
            current_blocker, next_action, created_at, updated_at
          ) VALUES (
            @id, @name, @objective, @status, @repository_path, @provider,
            @provider_session_id, @current_phase, @latest_result,
            @current_blocker, @next_action, @created_at, @updated_at
          )`,
        )
        .run(project);
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
    return row === undefined ? null : ProjectSchema.parse(row);
  }

  list(): Project[] {
    return this.database
      .prepare("SELECT * FROM projects ORDER BY created_at, id")
      .all()
      .map((row) => ProjectSchema.parse(row));
  }
}
