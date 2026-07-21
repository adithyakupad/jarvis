import { z } from "zod";

import { PlanProposalSchema, type Run } from "../../shared/runs.js";
import { AgentAdapterRegistry } from "../providers/registry.js";
import { ProjectRepository } from "../repositories/projects.js";
import { RunRepository } from "../repositories/runs.js";
import { canonicalizeRepositoryPath } from "../security/repository-path.js";

const instructionSchema = z.string().trim().min(1);

export class ProjectNotFoundError extends Error {}

export class PlanningInspectionError extends Error {
  constructor(
    readonly runId: string,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : "Provider returned a malformed proposal.");
    this.name = "PlanningInspectionError";
    this.cause = cause;
  }
}

export class PlanningService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly runs: RunRepository,
    private readonly adapters: AgentAdapterRegistry,
  ) {}

  async inspect(projectId: string, instructionInput: string): Promise<Run> {
    const instruction = instructionSchema.parse(instructionInput);
    const project = this.projects.get(projectId);
    if (project === null) throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    const repositoryPath = canonicalizeRepositoryPath(project.repository_path);
    const adapter = this.adapters.require(project.provider);
    const run = this.runs.createInspection(project.id, project.provider, instruction);

    try {
      const proposal = PlanProposalSchema.parse(
        await adapter.inspect({
          projectId: project.id,
          repositoryPath,
          instruction,
          readOnly: true,
          proposalRevision: 1,
          providerSessionId: null,
          previousProposal: null,
          modification: null,
        }),
      );
      if (proposal.revision !== 1) {
        throw new Error(`Initial proposal must be revision 1, received ${proposal.revision}.`);
      }
      return this.runs.recordProposal(run.id, proposal);
    } catch (error) {
      this.runs.failInspection(run.id, error);
      throw new PlanningInspectionError(run.id, error);
    }
  }

  async modify(
    runId: string,
    currentRevision: number,
    modificationInput: string,
  ): Promise<Run> {
    const modification = instructionSchema.parse(modificationInput);
    const run = this.runs.require(runId);
    if (run.status !== "awaiting_approval" || run.proposal === null) {
      throw new Error(`Run '${runId}' is not awaiting proposal approval.`);
    }
    if (currentRevision !== run.proposal_revision) {
      throw new Error(
        `Proposal revision ${currentRevision} is stale; current revision is ${run.proposal_revision}.`,
      );
    }
    const project = this.projects.get(run.project_id);
    if (project === null) throw new ProjectNotFoundError(`Project '${run.project_id}' was not found.`);
    const repositoryPath = canonicalizeRepositoryPath(project.repository_path);
    const adapter = this.adapters.require(run.provider);
    const expectedRevision = run.proposal_revision + 1;

    try {
      const proposal = PlanProposalSchema.parse(
        await adapter.inspect({
          projectId: project.id,
          repositoryPath,
          instruction: run.instruction,
          readOnly: true,
          proposalRevision: expectedRevision,
          providerSessionId: run.provider_session_id,
          previousProposal: run.proposal,
          modification,
        }),
      );
      if (proposal.revision !== expectedRevision) {
        throw new Error(
          `Modified proposal must be revision ${expectedRevision}, received ${proposal.revision}.`,
        );
      }
      if (proposal.providerSessionId !== run.provider_session_id) {
        throw new Error("Modified proposal changed the provider session ID.");
      }
      return this.runs.recordProposal(run.id, proposal);
    } catch (error) {
      this.runs.failInspection(run.id, error);
      throw new PlanningInspectionError(run.id, error);
    }
  }

  proceed(runId: string, revision: number): Run {
    return this.runs.approve(runId, revision);
  }

  cancel(runId: string): Run {
    return this.runs.cancel(runId);
  }
}
