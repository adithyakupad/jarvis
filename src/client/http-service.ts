import { z } from "zod";

import { ProjectSchema, type Project } from "../shared/projects.js";
import { ProviderAvailabilitySchema } from "../shared/providers.js";
import { PlanProposalSchema, RunEventSchema, RunSchema, type Run } from "../shared/runs.js";
import type { CreateProjectInput, JarvisClientService, JarvisSnapshot, RepositoryValidation, RunPresentation, UiWorkflowState, UpdateProjectInput } from "./service.js";
import { ContextPacketSchema, type ContextPacket } from "../shared/context.js";

const runEnvelopeSchema = z.object({ run: RunSchema, revisions: z.array(PlanProposalSchema), events: z.array(RunEventSchema).default([]) });
const projectEnvelopeSchema = z.object({ project: ProjectSchema, activeRun: runEnvelopeSchema.nullable() });
const contextEnvelopeSchema = runEnvelopeSchema.extend({ contextPacket: ContextPacketSchema, currentProposal: PlanProposalSchema });

function stateFor(run: Run): UiWorkflowState {
  return run.status === "awaiting_approval" ? "awaiting approval" : run.status;
}

function present(envelope: z.infer<typeof runEnvelopeSchema>): RunPresentation {
  const approved = envelope.run.status === "approved";
  const status = envelope.run.status;
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
          : status === "executing" || status === "preparing_execution" ? `Executing approved proposal revision ${envelope.run.approved_proposal_revision}.`
          : status === "verifying" ? "Verifying repository changes and approved checks."
          : status === "awaiting_approval"
            ? `Proposal revision ${envelope.run.proposal_revision} is ready for your decision.`
            : "Inspecting the repository in read-only mode.",
  };
}

export class HttpJarvisClientService implements JarvisClientService {
  private snapshot: JarvisSnapshot = { projects: [], providers: [], activeRun: null, error: null, hydrationStatus: "not_initialized", projectLoading: false, selectedProjectId: null };
  private readonly listeners = new Set<(snapshot: JarvisSnapshot) => void>();
  private initializationPromise: Promise<void> | null = null;

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
    this.patch({ projects, selectedProjectId: null, activeRun: null, error: null });
    if (projects[0]) await this.selectProject(projects[0].id);
  }

  async selectProject(projectId: string): Promise<void> {
    this.patch({ projectLoading: true, error: null });
    try {
      const result = await this.request(`/api/projects/${encodeURIComponent(projectId)}`, undefined, projectEnvelopeSchema);
      window.localStorage.setItem("jarvis.activeProjectId", projectId);
      this.patch({ selectedProjectId: projectId, activeRun: result.activeRun ? present(result.activeRun) : null, projectLoading: false, error: null });
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
      return this.setRun(present(result));
    } catch (error) {
      await this.selectProject(projectId).catch(() => undefined);
      throw error;
    }
  }

  async modify(runId: string, currentRevision: number, modification: string): Promise<RunPresentation> {
    this.patch({ activeRun: this.snapshot.activeRun ? { ...this.snapshot.activeRun, state: "modifying", statusMessage: "Codex is revising the proposal in the same session." } : null });
    const result = await this.request(`/api/runs/${encodeURIComponent(runId)}/modify`, { method: "POST", body: JSON.stringify({ currentRevision, modification }) }, runEnvelopeSchema);
    return this.setRun(present(result));
  }

  async addContext(runId: string, currentRevision: number, packetInput: ContextPacket): Promise<RunPresentation> {
    const packet = ContextPacketSchema.parse(packetInput);
    this.patch({ activeRun: this.snapshot.activeRun ? { ...this.snapshot.activeRun, state: "planning", statusMessage: "Context saved. Codex is replanning in the same session." } : null });
    const result = await this.request(`/api/runs/${encodeURIComponent(runId)}/context`, { method: "POST", body: JSON.stringify({ currentRevision, ...packet }) }, contextEnvelopeSchema);
    return this.setRun(present(result));
  }

  async proceed(runId: string, revision: number): Promise<RunPresentation> {
    const approved = await this.request(`/api/runs/${encodeURIComponent(runId)}/proceed`, { method: "POST", body: JSON.stringify({ revision }) }, runEnvelopeSchema);
    this.setRun(present(approved));
    const stopStreaming = this.streamRun(runId);
    try { return this.setRun(present(await this.request(`/api/runs/${encodeURIComponent(runId)}/execute`, { method: "POST", body: "{}" }, runEnvelopeSchema))); }
    finally { stopStreaming(); }
  }

  async cancel(runId: string): Promise<RunPresentation> {
    return this.setRun(present(await this.request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: "{}" }, runEnvelopeSchema)));
  }

  async cancelExecution(): Promise<RunPresentation> { throw new Error("Execution is not available until Gate 3."); }
  async resetDemo(projectId: string): Promise<void> { await this.selectProject(projectId); }
  async demonstrateMalformedProposal(): Promise<RunPresentation> { throw new Error("Malformed proposal demonstrations are available only in explicit mock mode."); }

  private temporaryRun(projectId: string, instruction: string): RunPresentation {
    const run = RunSchema.parse({ id: "pending", project_id: projectId, provider: "codex", provider_session_id: null, instruction, proposal: null, proposal_revision: 0, approved_proposal_revision: null, approval_decision: null, status: "inspecting", failure: null, created_at: new Date().toISOString(), completed_at: null });
    return present({ run, revisions: [], events: [] });
  }

  private async request<T>(path: string, init: RequestInit | undefined, schema: z.ZodType<T>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = z.object({ error: z.object({ message: z.string() }) }).safeParse(body);
      throw new Error(message.success ? message.data.error.message : `JARVIS API request failed (${response.status}).`);
    }
    return schema.parse(body);
  }

  private streamRun(runId: string): () => void {
    if (typeof EventSource === "undefined") return () => undefined;
    const source = new EventSource(`${this.baseUrl}/api/runs/${encodeURIComponent(runId)}/events/stream`);
    const refresh = (): void => { void this.request(`/api/runs/${encodeURIComponent(runId)}`, undefined, runEnvelopeSchema).then((envelope) => this.setRun(present(envelope))).catch(() => undefined); };
    for (const type of ["execution_started", "provider_message", "file_change", "command_started", "command_completed", "warning", "verification_started", "verification_result", "execution_completed", "execution_failed"]) source.addEventListener(type, refresh);
    return () => source.close();
  }

  private setRun(activeRun: RunPresentation): RunPresentation { this.patch({ activeRun, error: null }); return activeRun; }
  private patch(next: Partial<JarvisSnapshot>): void { this.snapshot = { ...this.snapshot, ...next }; this.listeners.forEach((listener) => listener(this.snapshot)); }
}
