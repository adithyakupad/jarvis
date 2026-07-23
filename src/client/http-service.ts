import { z } from "zod";

import { ProjectSchema, type Project } from "../shared/projects.js";
import { ProviderAvailabilitySchema } from "../shared/providers.js";
import { PlanProposalSchema, RunEventSchema, RunSchema, type Run } from "../shared/runs.js";
import type { CreateProjectInput, JarvisClientService, JarvisSnapshot, RepositoryValidation, RunPresentation, UiWorkflowState, UpdateProjectInput } from "./service.js";
import { ContextPacketSchema, type ContextPacket } from "../shared/context.js";
import { API_SCHEMA_VERSION, FRONTEND_BUILD_ID, HealthResponseSchema, buildsCompatible, type HealthResponse } from "../shared/runtime.js";
import { HandoffCorrectionsSchema, ProjectHandoffSchema, type HandoffCorrections, type ProjectHandoff } from "../shared/handoffs.js";

export type ClientErrorCategory = "api_unavailable" | "incompatible_api" | "route_missing" | "request_validation_failed" | "repository_unavailable" | "provider_unavailable" | "conflict" | "internal_error";

export class JarvisClientError extends Error {
  constructor(readonly category: ClientErrorCategory, message: string) { super(message); }
}

const unavailableMessage = "JARVIS is not running. Start it with npm run jarvis and reload this page.";
const incompatibleMessage = "A different JARVIS version is currently running. Stop the existing instance, restart JARVIS, and reload this page.";

const runEnvelopeSchema = z.object({ run: RunSchema, revisions: z.array(PlanProposalSchema), events: z.array(RunEventSchema).default([]) });
const projectEnvelopeSchema = z.object({ project: ProjectSchema, handoff: ProjectHandoffSchema.nullable().default(null), activeRun: runEnvelopeSchema.nullable() });
const contextEnvelopeSchema = runEnvelopeSchema.extend({ contextPacket: ContextPacketSchema, currentProposal: PlanProposalSchema });

function stateFor(run: Run): UiWorkflowState {
  return run.status === "awaiting_approval" ? "awaiting approval" : run.status;
}

function present(envelope: z.infer<typeof runEnvelopeSchema>): RunPresentation {
  const approved = envelope.run.status === "approved";
  const status = envelope.run.status;
  const latestStage = envelope.events.at(-1)?.type.replaceAll("_", " ");
  return {
    ...envelope,
    state: stateFor(envelope.run),
    events: envelope.events.map((event) => ({ id: String(event.sequence), kind: event.type.includes("command") ? "command" : event.type.includes("file") ? "file" : event.type.includes("fail") ? "error" : event.type.includes("verification") ? "verification" : "status", title: event.type.replaceAll("_", " "), detail: typeof event.payload === "object" && event.payload && "message" in event.payload ? String((event.payload as { message: unknown }).message) : JSON.stringify(event.payload), occurredAt: event.occurredAt })), changedFiles: envelope.run.execution_result?.changedFiles ?? [], checks: envelope.run.verification?.checks.map((check, index) => ({ id: String(index), label: check.command, status: check.passed ? "passed" : "failed", evidence: check.output })) ?? [], isGate3Simulation: false,
    statusMessage: approved
      ? `Proposal revision ${envelope.run.approved_proposal_revision} is approved and ready to execute.`
      : status === "cancelled" || status === "cancelled_before_execution"
        ? "Planning was cancelled. No execution started."
        : status === "failed"
          ? String((envelope.run.failure as { message?: string } | null)?.message ?? "The run failed.")
          : status === "completed" ? envelope.run.verification?.message ?? "Execution and verification completed."
          : status === "executing" || status === "preparing_execution" ? latestStage ?? `Executing approved proposal revision ${envelope.run.approved_proposal_revision}.`
          : status === "verifying" ? latestStage ?? "Collecting repository evidence and running independent validation."
          : status === "awaiting_approval"
            ? `Proposal revision ${envelope.run.proposal_revision} is ready for your decision.`
            : latestStage ?? "Task received. Inspecting the repository in read-only mode.",
  };
}

export class HttpJarvisClientService implements JarvisClientService {
  private snapshot: JarvisSnapshot = { projects: [], providers: [], activeRun: null, activeHandoff: null, handoffUpdating: false, error: null, hydrationStatus: "not_initialized", projectLoading: false, selectedProjectId: null };
  private readonly listeners = new Set<(snapshot: JarvisSnapshot) => void>();
  private initializationPromise: Promise<void> | null = null;
  private readonly activeStreams = new Map<string, () => void>();

  constructor(private readonly baseUrl = "") {}

  subscribe(listener: (snapshot: JarvisSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getSnapshot(): JarvisSnapshot { return this.snapshot; }

  initialize(): Promise<void> {
    this.initializationPromise ??= this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    this.patch({ hydrationStatus: "hydrating", error: null });
    try {
      await this.requireCompatibleHealth();
      const [providers, projects] = await Promise.all([
        this.request("/api/setup/providers", undefined, z.object({ providers: z.array(ProviderAvailabilitySchema) })),
        this.request("/api/projects", undefined, z.object({ projects: z.array(ProjectSchema) })),
      ]);
      this.patch({ providers: providers.providers, projects: projects.projects, error: null });
      const remembered = window.localStorage.getItem("jarvis.activeProjectId");
      const projectId = projects.projects.some((project) => project.id === remembered) ? remembered : projects.projects[0]?.id;
      if (projectId) await this.selectProject(projectId);
      this.patch({ hydrationStatus: "ready", error: null });
    } catch (error) {
      this.patch({ hydrationStatus: "failed", projectLoading: false, error: error instanceof Error ? error.message : "The local JARVIS API is unavailable." });
      throw error;
    }
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const result = await this.request("/api/projects", { method: "POST", body: JSON.stringify({ name: input.name, objective: input.objective, repository_path: input.repositoryPath, provider: input.provider, notes: input.notes }) }, z.object({ project: ProjectSchema }));
    this.patch({ projects: [...this.snapshot.projects, result.project], error: null });
    await this.selectProject(result.project.id);
    return result.project;
  }

  async validateRepositoryPath(path: string): Promise<RepositoryValidation> {
    const schema = z.object({ repository: z.object({ canonicalPath: z.string(), directoryName: z.string(), isGitRepository: z.boolean(), currentBranch: z.string().nullable(), commonFiles: z.array(z.string()) }) });
    return (await this.request("/api/projects/validate-path", { method: "POST", body: JSON.stringify({ repository_path: path }) }, schema)).repository;
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
    const result = await this.request(`/api/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: JSON.stringify({ ...input, repository_path: input.repositoryPath }) }, z.object({ project: ProjectSchema }));
    this.patch({ projects: this.snapshot.projects.map((project) => project.id === projectId ? result.project : project) });
    return result.project;
  }

  async removeProject(projectId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Project removal failed.");
    const projects = this.snapshot.projects.filter((project) => project.id !== projectId);
    window.localStorage.removeItem("jarvis.activeProjectId");
    this.patch({ projects, selectedProjectId: null, activeRun: null, activeHandoff: null, handoffUpdating: false, error: null });
    if (projects[0]) await this.selectProject(projects[0].id);
  }

  async selectProject(projectId: string): Promise<void> {
    this.patch({ projectLoading: true, error: null });
    try {
      const result = await this.request(`/api/projects/${encodeURIComponent(projectId)}`, undefined, projectEnvelopeSchema);
      window.localStorage.setItem("jarvis.activeProjectId", projectId);
      this.patch({ selectedProjectId: projectId, activeHandoff: result.handoff, handoffUpdating: result.handoff?.generationStatus === "pending", activeRun: result.activeRun ? present(result.activeRun) : null, projectLoading: false, error: null });
    } catch (error) {
      this.patch({ projectLoading: false, error: error instanceof Error ? error.message : "Project loading failed." });
      throw error;
    }
  }

  async inspect(projectId: string, instruction: string): Promise<RunPresentation> {
    this.patch({ activeRun: null, error: null });
    const pending = this.temporaryRun(projectId, instruction);
    this.patch({ activeRun: pending });
    try {
      const result = await this.request(`/api/projects/${encodeURIComponent(projectId)}/instructions`, { method: "POST", body: JSON.stringify({ instruction }) }, runEnvelopeSchema);
      const accepted = this.setRun(present(result)); this.watchRun(accepted.run.id); return accepted;
    } catch (error) {
      await this.selectProject(projectId).catch(() => undefined);
      throw error;
    }
  }

  async modify(runId: string, currentRevision: number, modification: string): Promise<RunPresentation> {
    this.patch({ activeRun: this.snapshot.activeRun ? { ...this.snapshot.activeRun, state: "modifying", statusMessage: "Codex is revising the proposal in the same session." } : null });
    const result = await this.request(`/api/runs/${encodeURIComponent(runId)}/modify`, { method: "POST", body: JSON.stringify({ currentRevision, modification }) }, runEnvelopeSchema);
    const accepted = this.setRun(present(result)); this.watchRun(runId); return accepted;
  }

  async addContext(runId: string, currentRevision: number, packetInput: ContextPacket): Promise<RunPresentation> {
    const packet = ContextPacketSchema.parse(packetInput);
    this.patch({ activeRun: this.snapshot.activeRun ? { ...this.snapshot.activeRun, state: "planning", statusMessage: "Context saved. Codex is replanning in the same session." } : null });
    const result = await this.request(`/api/runs/${encodeURIComponent(runId)}/context`, { method: "POST", body: JSON.stringify({ currentRevision, ...packet }) }, contextEnvelopeSchema);
    const accepted = this.setRun(present(result)); this.watchRun(runId); return accepted;
  }

  async proceed(runId: string, revision: number): Promise<RunPresentation> {
    const approved = await this.request(`/api/runs/${encodeURIComponent(runId)}/proceed`, { method: "POST", body: JSON.stringify({ revision }) }, runEnvelopeSchema);
    const accepted = this.setRun(present(approved)); this.watchRun(runId); return accepted;
  }

  async cancel(runId: string): Promise<RunPresentation> {
    const cancelled = this.setRun(present(await this.request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: "{}" }, runEnvelopeSchema)));
    this.watchRun(runId);
    return cancelled;
  }

  async correctHandoff(projectId: string, correctionsInput: HandoffCorrections): Promise<ProjectHandoff> {
    const corrections = HandoffCorrectionsSchema.parse(correctionsInput);
    const result = await this.request(`/api/projects/${encodeURIComponent(projectId)}/handoff/corrections`, { method: "PATCH", body: JSON.stringify(corrections) }, z.object({ handoff: ProjectHandoffSchema }));
    this.patch({ activeHandoff: result.handoff, handoffUpdating: false, error: null });
    return result.handoff;
  }

  async cancelExecution(): Promise<RunPresentation> { throw new Error("Execution is not available until Gate 3."); }
  async resetDemo(projectId: string): Promise<void> { await this.selectProject(projectId); }
  async demonstrateMalformedProposal(): Promise<RunPresentation> { throw new Error("Malformed proposal demonstrations are available only in explicit mock mode."); }

  private temporaryRun(projectId: string, instruction: string): RunPresentation {
    const run = RunSchema.parse({ id: "pending", project_id: projectId, provider: "codex", provider_session_id: null, instruction, proposal: null, proposal_revision: 0, approved_proposal_revision: null, approval_decision: null, status: "inspecting", failure: null, created_at: new Date().toISOString(), completed_at: null });
    return present({ run, revisions: [], events: [] });
  }

  private async request<T>(path: string, init: RequestInit | undefined, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try { response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } }); }
    catch { throw new JarvisClientError("api_unavailable", unavailableMessage); }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 404) {
        const health = await this.checkHealth();
        if (health === null || !this.isCompatible(health)) throw new JarvisClientError("incompatible_api", incompatibleMessage);
        throw new JarvisClientError("route_missing", `JARVIS route '${path}' is missing from a compatible API. Restart JARVIS; if the problem persists, review the local server logs.`);
      }
      const parsed = z.object({ error: z.object({ code: z.string().optional(), message: z.string() }) }).safeParse(body);
      if (parsed.success) throw new JarvisClientError(this.mapErrorCategory(response.status, parsed.data.error.code), parsed.data.error.message);
      throw new JarvisClientError("internal_error", `JARVIS could not complete this request (${response.status}).`);
    }
    return schema.parse(body);
  }

  private async requireCompatibleHealth(): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const health = await this.checkHealth();
      if (health === null) throw new JarvisClientError("incompatible_api", incompatibleMessage);
      if (!this.isCompatible(health)) throw new JarvisClientError("incompatible_api", incompatibleMessage);
      if (health.status === "ready") return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    }
    throw new JarvisClientError("api_unavailable", "JARVIS is still starting. Wait a moment, then reload this page.");
  }

  private async checkHealth(): Promise<HealthResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, { headers: { accept: "application/json" } });
      if (!response.ok) return null;
      const parsed = HealthResponseSchema.safeParse(await response.json().catch(() => null));
      return parsed.success ? parsed.data : null;
    } catch { throw new JarvisClientError("api_unavailable", unavailableMessage); }
  }

  private isCompatible(health: HealthResponse): boolean {
    return health.apiSchemaVersion === API_SCHEMA_VERSION && buildsCompatible(FRONTEND_BUILD_ID, health.buildId);
  }

  private mapErrorCategory(status: number, code?: string): ClientErrorCategory {
    if (code === "validation_error") return "request_validation_failed";
    if (code === "filesystem_error") return "repository_unavailable";
    if (code === "provider_unavailable") return "provider_unavailable";
    if (code === "conflict" || status === 409) return "conflict";
    return "internal_error";
  }

  private watchRun(runId: string): void {
    this.activeStreams.get(runId)?.();
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`${this.baseUrl}/api/runs/${encodeURIComponent(runId)}/events/stream`);
    const stop = (): void => { source.close(); this.activeStreams.delete(runId); };
    this.activeStreams.set(runId, stop);
    const refreshProject = (): void => {
      this.patch({ handoffUpdating: false });
      const projectId = this.snapshot.selectedProjectId;
      if (projectId) void this.selectProject(projectId).finally(stop);
      else stop();
    };
    const handoffStarted = (): void => { this.patch({ handoffUpdating: true }); refresh(); };
    const refresh = (): void => { void this.request(`/api/runs/${encodeURIComponent(runId)}`, undefined, runEnvelopeSchema).then((envelope) => { this.setRun(present(envelope)); if (envelope.run.status === "awaiting_approval") stop(); }).catch(() => undefined); };
    for (const type of ["request_accepted", "loading_project_state", "checking_provider", "provider_ready", "inspection_cache_hit", "inspection_cache_miss", "repository_inspection_started", "repository_inspection_completed", "provider_invocation_started", "proposal_ready", "execution_accepted", "capturing_repository_baseline", "repository_baseline_completed", "execution_started", "provider_execution_started", "first_provider_event", "provider_message", "file_change", "command_started", "command_completed", "warning", "provider_execution_completed", "collecting_repository_changes", "repository_reconciliation_completed", "validation_detected", "validation_started", "validation_completed", "verification_result", "execution_completed", "execution_failed", "inspection_failed", "operation_interrupted", "deterministic_handoff_evidence_captured", "handoff_marked_potentially_stale", "user_correction_saved"]) source.addEventListener(type, refresh);
    source.addEventListener("project_handoff_update_started", handoffStarted);
    for (const type of ["project_handoff_ready", "project_handoff_fallback_created", "project_handoff_update_failed"]) source.addEventListener(type, refreshProject);
  }

  private setRun(activeRun: RunPresentation): RunPresentation { this.patch({ activeRun, error: null }); return activeRun; }
  private patch(next: Partial<JarvisSnapshot>): void { this.snapshot = { ...this.snapshot, ...next }; this.listeners.forEach((listener) => listener(this.snapshot)); }
}
