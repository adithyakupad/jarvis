import { z } from "zod";

import { ProjectSchema, type Project } from "../shared/projects.js";
import { ProviderAvailabilitySchema } from "../shared/providers.js";
import { PlanProposalSchema, RunSchema, type Run } from "../shared/runs.js";
import type { CreateProjectInput, JarvisClientService, JarvisSnapshot, RunPresentation, UiWorkflowState } from "./service.js";
import { ContextPacketSchema, type ContextPacket } from "../shared/context.js";

const runEnvelopeSchema = z.object({ run: RunSchema, revisions: z.array(PlanProposalSchema) });
const projectEnvelopeSchema = z.object({ project: ProjectSchema, activeRun: runEnvelopeSchema.nullable() });
const contextEnvelopeSchema = runEnvelopeSchema.extend({ contextPacket: ContextPacketSchema, currentProposal: PlanProposalSchema });

function stateFor(run: Run): UiWorkflowState {
  return run.status === "awaiting_approval" ? "awaiting approval" : run.status;
}

function present(envelope: z.infer<typeof runEnvelopeSchema>): RunPresentation {
  const approved = envelope.run.status === "approved";
  return {
    ...envelope,
    state: stateFor(envelope.run),
    events: [], changedFiles: [], checks: [], isGate3Simulation: false,
    statusMessage: approved
      ? "Plan approved. Execution is not available until Gate 3."
      : envelope.run.status === "cancelled"
        ? "Planning was cancelled. No execution started."
        : envelope.run.status === "failed"
          ? String((envelope.run.failure as { message?: string } | null)?.message ?? "Planning failed.")
          : envelope.run.status === "awaiting_approval"
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
    const id = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const result = await this.request("/api/projects", { method: "POST", body: JSON.stringify({ id, name: input.name, objective: input.objective, repository_path: input.repositoryPath, provider: input.provider }) }, z.object({ project: ProjectSchema }));
    this.patch({ projects: [...this.snapshot.projects, result.project], error: null });
    await this.selectProject(result.project.id);
    return result.project;
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
    return this.setRun(present(await this.request(`/api/runs/${encodeURIComponent(runId)}/proceed`, { method: "POST", body: JSON.stringify({ revision }) }, runEnvelopeSchema)));
  }

  async cancel(runId: string): Promise<RunPresentation> {
    return this.setRun(present(await this.request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: "{}" }, runEnvelopeSchema)));
  }

  async cancelExecution(): Promise<RunPresentation> { throw new Error("Execution is not available until Gate 3."); }
  async resetDemo(projectId: string): Promise<void> { await this.selectProject(projectId); }
  async demonstrateMalformedProposal(): Promise<RunPresentation> { throw new Error("Malformed proposal demonstrations are available only in explicit mock mode."); }

  private temporaryRun(projectId: string, instruction: string): RunPresentation {
    const run = RunSchema.parse({ id: "pending", project_id: projectId, provider: "codex", provider_session_id: null, instruction, proposal: null, proposal_revision: 0, approved_proposal_revision: null, approval_decision: null, status: "inspecting", failure: null, created_at: new Date().toISOString(), completed_at: null });
    return present({ run, revisions: [] });
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

  private setRun(activeRun: RunPresentation): RunPresentation { this.patch({ activeRun, error: null }); return activeRun; }
  private patch(next: Partial<JarvisSnapshot>): void { this.snapshot = { ...this.snapshot, ...next }; this.listeners.forEach((listener) => listener(this.snapshot)); }
}
