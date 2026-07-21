import type { Project, ProviderId } from "../shared/projects.js";
import type { ProviderAvailability } from "../shared/providers.js";
import type { PlanProposal, Run } from "../shared/runs.js";

export type UiWorkflowState =
  | "idle"
  | "inspecting"
  | "planning"
  | "awaiting approval"
  | "modifying"
  | "approved"
  | "working"
  | "cancelling"
  | "cancelled"
  | "verifying"
  | "blocked"
  | "warning"
  | "completed"
  | "failed";

export interface SimulatedGate3Event {
  id: string;
  kind: "status" | "command" | "file" | "verification" | "error";
  title: string;
  detail: string;
  occurredAt: string;
}

export interface VerificationCheck {
  id: string;
  label: string;
  status: "pending" | "passed" | "failed";
  evidence: string;
}

export interface RunPresentation {
  run: Run;
  revisions: PlanProposal[];
  state: UiWorkflowState;
  events: SimulatedGate3Event[];
  changedFiles: string[];
  checks: VerificationCheck[];
  statusMessage: string;
  isGate3Simulation: boolean;
}

export interface JarvisSnapshot {
  projects: Project[];
  providers: ProviderAvailability[];
  activeRun: RunPresentation | null;
  error: string | null;
  hydrationStatus: "not_initialized" | "hydrating" | "ready" | "failed";
  projectLoading: boolean;
  selectedProjectId: string | null;
}

export interface CreateProjectInput {
  name: string;
  objective: string;
  repositoryPath: string;
  provider: ProviderId;
}

export class StaleProposalError extends Error {}
export class InvalidLifecycleActionError extends Error {}

export interface JarvisClientService {
  subscribe(listener: (snapshot: JarvisSnapshot) => void): () => void;
  getSnapshot(): JarvisSnapshot;
  initialize(): Promise<void>;
  createProject(input: CreateProjectInput): Promise<Project>;
  selectProject(projectId: string): Promise<void>;
  inspect(projectId: string, instruction: string): Promise<RunPresentation>;
  modify(runId: string, currentRevision: number, modification: string): Promise<RunPresentation>;
  proceed(runId: string, revision: number): Promise<RunPresentation>;
  cancel(runId: string): Promise<RunPresentation>;
  cancelExecution(runId: string): Promise<RunPresentation>;
  resetDemo(projectId: string): Promise<void>;
  demonstrateMalformedProposal(projectId: string): Promise<RunPresentation>;
}
