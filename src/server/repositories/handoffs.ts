import type { JarvisDatabase } from "../database/connection.js";
import { HandoffCorrectionsSchema, ProjectHandoffSchema, StoredHandoffCorrectionsSchema, type HandoffCorrections, type ProjectHandoff, type StoredHandoffCorrections } from "../../shared/handoffs.js";

interface HandoffRow { handoff_json: string; corrections_json: string | null; }

export class HandoffUnavailableError extends Error {}

export class HandoffRepository {
  constructor(private readonly database: JarvisDatabase, private readonly clock: () => Date = () => new Date()) {}

  get(projectId: string): ProjectHandoff | null {
    const row = this.database.prepare("SELECT handoff_json, corrections_json FROM project_handoffs WHERE project_id=?").get(projectId) as HandoffRow | undefined;
    if (!row) return null;
    const corrections = row.corrections_json ? StoredHandoffCorrectionsSchema.parse(JSON.parse(row.corrections_json)) : null;
    return ProjectHandoffSchema.parse({ ...JSON.parse(row.handoff_json), corrections });
  }

  require(projectId: string): ProjectHandoff {
    const handoff = this.get(projectId);
    if (!handoff) throw new HandoffUnavailableError(`No project handoff is available for '${projectId}'.`);
    return handoff;
  }

  save(handoffInput: ProjectHandoff): ProjectHandoff {
    const handoff = ProjectHandoffSchema.parse(handoffInput);
    const at = this.clock().toISOString();
    this.database.prepare(`INSERT INTO project_handoffs(project_id,revision,source_run_id,handoff_json,corrections_json,repository_fingerprint,generation_status,generated_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision,source_run_id=excluded.source_run_id,handoff_json=excluded.handoff_json,corrections_json=excluded.corrections_json,repository_fingerprint=excluded.repository_fingerprint,generation_status=excluded.generation_status,generated_at=excluded.generated_at,updated_at=excluded.updated_at`)
      .run(handoff.projectId, handoff.revision, handoff.lastRunId, JSON.stringify({ ...handoff, corrections: undefined }), handoff.corrections ? JSON.stringify(handoff.corrections) : null, handoff.repositoryFingerprint, handoff.generationStatus, handoff.generatedAt, at);
    return this.require(handoff.projectId);
  }

  corrections(projectId: string): StoredHandoffCorrections | null { return this.get(projectId)?.corrections ?? null; }

  saveCorrections(projectId: string, input: HandoffCorrections): StoredHandoffCorrections {
    const current = this.require(projectId);
    const parsed = HandoffCorrectionsSchema.parse(input);
    const correction = StoredHandoffCorrectionsSchema.parse({ ...(current.corrections ?? {}), ...parsed, correctedAt: this.clock().toISOString() });
    this.database.prepare("UPDATE project_handoffs SET corrections_json=?,updated_at=? WHERE project_id=?").run(JSON.stringify(correction), correction.correctedAt, projectId);
    return correction;
  }
}
