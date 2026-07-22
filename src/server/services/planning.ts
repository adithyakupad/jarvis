import { z } from "zod";

import { PlanProposalSchema, type Run } from "../../shared/runs.js";
import { ContextPacketSchema, type ContextPacket } from "../../shared/context.js";
import { ProviderUnavailableError } from "../providers/errors.js";
import { NodeProcessRunner, type ProcessRunner } from "../providers/process-runner.js";
import { AgentAdapterRegistry } from "../providers/registry.js";
import { ProjectRepository } from "../repositories/projects.js";
import { InvalidRunTransitionError, RunRepository, StaleProposalRevisionError } from "../repositories/runs.js";
import { canonicalizeRepositoryPath } from "../security/repository-path.js";
import { repositoryFingerprint } from "./repository-fingerprint.js";

const instructionSchema = z.string().trim().min(1);
export class ProjectNotFoundError extends Error {}
export class PlanningInspectionError extends Error {
  constructor(readonly runId: string, cause: unknown) { super(cause instanceof Error ? cause.message : "Provider returned a malformed proposal."); this.name = "PlanningInspectionError"; this.cause = cause; }
}

export class PlanningService {
  constructor(private readonly projects: ProjectRepository, private readonly runs: RunRepository, private readonly adapters: AgentAdapterRegistry, private readonly runner: ProcessRunner = new NodeProcessRunner()) {}

  acceptInspection(projectId: string, instructionInput: string): Run {
    const instruction = instructionSchema.parse(instructionInput);
    const project = this.projects.get(projectId);
    if (!project) throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    return this.runs.createInspection(project.id, project.provider, instruction);
  }

  async inspect(projectId: string, instructionInput: string): Promise<Run> { return this.performInspection(this.acceptInspection(projectId, instructionInput).id); }

  async performInspection(runId: string): Promise<Run> {
    const run = this.runs.require(runId);
    return this.invoke(run, 1, null, null);
  }

  acceptModification(runId: string, currentRevision: number, modificationInput: string): Run {
    return this.runs.beginModification(runId, currentRevision, instructionSchema.parse(modificationInput));
  }

  async performModification(runId: string, modificationInput: string): Promise<Run> {
    const run = this.runs.require(runId);
    return this.invoke(run, run.proposal_revision + 1, instructionSchema.parse(modificationInput), run.context_packet);
  }

  async modify(runId: string, currentRevision: number, modificationInput: string): Promise<Run> {
    this.acceptModification(runId, currentRevision, modificationInput);
    return this.performModification(runId, modificationInput);
  }

  acceptContext(runId: string, currentRevision: number, packetInput: ContextPacket): Run {
    return this.runs.recordContext(runId, currentRevision, ContextPacketSchema.parse(packetInput));
  }

  async performContext(runId: string): Promise<Run> {
    const run = this.runs.require(runId);
    if (!run.context_packet) throw new InvalidRunTransitionError(`Run '${runId}' has no persisted context packet.`);
    return this.invoke(run, run.proposal_revision + 1, null, run.context_packet);
  }

  async addContext(runId: string, currentRevision: number, packetInput: ContextPacket): Promise<Run> {
    this.acceptContext(runId, currentRevision, packetInput);
    return this.performContext(runId);
  }

  proceed(runId: string, revision: number): Run { return this.runs.markExecutionAccepted(this.runs.approve(runId, revision).id); }
  cancel(runId: string): Run { return this.runs.cancel(runId); }

  private async invoke(run: Run, revision: number, modification: string | null, contextPacket: ContextPacket | null): Promise<Run> {
    try {
      this.runs.recordExecutionEvent(run.id, "loading_project_state", {});
      const project = this.projects.get(run.project_id);
      if (!project) throw new ProjectNotFoundError(`Project '${run.project_id}' was not found.`);
      if (project.provider !== run.provider) throw new InvalidRunTransitionError("The run provider no longer matches its project.");
      const repositoryPath = canonicalizeRepositoryPath(project.repository_path);
      const adapter = this.adapters.require(run.provider);
      this.runs.recordExecutionEvent(run.id, "checking_provider", { provider: run.provider });
      const [availability, fingerprint] = await Promise.all([adapter.detect(), repositoryFingerprint(repositoryPath, this.runner)]);
      if (!availability.installed || availability.authenticated !== true) throw new ProviderUnavailableError(availability.detail);
      this.runs.recordExecutionEvent(run.id, "provider_ready", { provider: run.provider });
      const priorFingerprint = this.runs.inspectionFingerprint(project.id);
      const cacheHit = fingerprint !== null && fingerprint === priorFingerprint && revision > 1;
      this.runs.recordExecutionEvent(run.id, cacheHit ? "inspection_cache_hit" : "inspection_cache_miss", { reusable: cacheHit });
      this.runs.recordExecutionEvent(run.id, "repository_inspection_started", {});
      this.runs.recordExecutionEvent(run.id, "provider_invocation_started", { operation: "planning" });
      const proposal = PlanProposalSchema.parse(await adapter.inspect({ projectId: project.id, repositoryPath, instruction: run.instruction, readOnly: true, proposalRevision: revision, providerSessionId: run.provider_session_id, previousProposal: run.proposal, modification, contextPacket, repositoryCacheHit: cacheHit, providerReadinessVerified: true }));
      this.runs.recordExecutionEvent(run.id, "repository_inspection_completed", { cacheHit });
      if (proposal.revision !== revision) throw new Error(`Proposal must be revision ${revision}, received ${proposal.revision}.`);
      if (revision > 1 && proposal.providerSessionId !== run.provider_session_id) throw new Error("Replanning changed the provider session ID.");
      const completed = this.runs.recordProposal(run.id, proposal);
      if (fingerprint) this.runs.saveInspectionFingerprint(project.id, fingerprint);
      this.runs.recordExecutionEvent(run.id, "proposal_ready", { revision });
      return completed;
    } catch (error) {
      this.runs.failInspection(run.id, error);
      throw new PlanningInspectionError(run.id, error);
    }
  }
}
