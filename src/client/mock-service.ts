import { PlanProposalSchema, RunSchema, type PlanProposal, type Run } from "../shared/runs.js";
import { ProjectSchema, type Project } from "../shared/projects.js";
import type { ProviderAvailability } from "../shared/providers.js";
import {
  InvalidLifecycleActionError,
  StaleProposalError,
  type CreateProjectInput,
  type JarvisClientService,
  type JarvisSnapshot,
  type RunPresentation,
  type SimulatedGate3Event,
  type UiWorkflowState,
  type VerificationCheck,
} from "./service.js";

const WAIT = 560;
const now = (): string => new Date().toISOString();
const pause = (ms = WAIT): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const providerAvailability: ProviderAvailability[] = [
  { provider: "codex", installed: true, authenticated: true, version: "0.144.6", detail: "Ready for local execution" },
  { provider: "claude-code", installed: true, authenticated: null, version: "1.0.58", detail: "Detected · authentication not checked" },
];

function mk42(): Project {
  return ProjectSchema.parse({
    id: "mk-42",
    name: "MK 42",
    objective: "Upgrade and validate the MK 42 armor systems",
    status: "active",
    repository_path: "/Users/example/Projects/MK-42",
    provider: "codex",
    provider_session_id: null,
    current_phase: "Planning lifecycle ready",
    latest_result: "Gate 2 planning and approval verified",
    current_blocker: "",
    next_action: "Inspect the current armor systems",
    created_at: "2026-07-21T13:00:00.000Z",
    updated_at: now(),
  });
}

function proposal(revision: number): PlanProposal {
  const revised = revision > 1;
  return PlanProposalSchema.parse({
    objective: "Prepare MK 42 for a safe systems validation",
    currentState: "Project persistence and planning are operational. Propulsion controls remain protected.",
    steps: revised
      ? ["Inspect the armor diagnostics and current tests", "Update power-distribution validation only", "Run focused checks and report evidence"]
      : ["Inspect armor diagnostics and power distribution", "Apply the smallest safe validation update", "Run focused checks and reconcile actual scope"],
    expectedScope: revised
      ? ["src/armor/diagnostics.ts", "tests/armor/diagnostics.test.ts"]
      : ["src/armor/", "tests/armor/"],
    risks: ["Propulsion controls are excluded; expanding scope requires a new proposal."],
    completionTest: "Focused armor diagnostics pass and changed files remain inside the approved scope.",
    revision,
    providerSessionId: "session-mk42",
  });
}

function runRecord(id: string, projectId: string, instruction: string): Run {
  return RunSchema.parse({
    id,
    project_id: projectId,
    provider: "codex",
    provider_session_id: null,
    instruction,
    proposal: null,
    proposal_revision: 0,
    approved_proposal_revision: null,
    approval_decision: null,
    status: "inspecting",
    failure: null,
    created_at: now(),
    completed_at: null,
  });
}

function event(id: string, kind: SimulatedGate3Event["kind"], title: string, detail: string): SimulatedGate3Event {
  return { id, kind, title, detail, occurredAt: now() };
}

export class DeterministicMockJarvisClientService implements JarvisClientService {
  private snapshot: JarvisSnapshot = { projects: [mk42()], providers: providerAvailability, activeRun: null };
  private readonly listeners = new Set<(snapshot: JarvisSnapshot) => void>();
  private sequence = 1;
  private executionGeneration = 0;

  subscribe(listener: (snapshot: JarvisSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): JarvisSnapshot {
    return this.snapshot;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `project-${this.sequence++}`;
    const project = ProjectSchema.parse({
      id, name: input.name, objective: input.objective, repository_path: input.repositoryPath,
      provider: input.provider, status: "active", provider_session_id: null,
      current_phase: "Ready", latest_result: "", current_blocker: "", next_action: "Submit an instruction",
      created_at: now(), updated_at: now(),
    });
    this.patch({ projects: [...this.snapshot.projects, project] });
    return project;
  }

  async inspect(projectId: string, instruction: string): Promise<RunPresentation> {
    if (!instruction.trim()) throw new InvalidLifecycleActionError("Enter a high-level instruction before inspection.");
    const run = runRecord(`run-${this.sequence++}`, projectId, instruction.trim());
    this.setRun(this.present(run, [], "inspecting", "Inspecting the repository in read-only mode."));
    await pause();
    this.setState("planning", "Inspection is complete. Organizing a bounded proposal.");
    await pause();
    const first = proposal(1);
    const proposed = RunSchema.parse({ ...run, proposal: first, proposal_revision: 1, provider_session_id: first.providerSessionId, status: "awaiting_approval" });
    return this.setRun(this.present(proposed, [first], "awaiting approval", "Proposal revision 1 is ready for your decision."));
  }

  async modify(runId: string, currentRevision: number, modification: string): Promise<RunPresentation> {
    const current = this.requireRun(runId);
    this.requireApprovable(current, currentRevision);
    if (!modification.trim()) throw new InvalidLifecycleActionError("Describe the proposal change you need.");
    this.setState("modifying", "Revising the proposal while preserving this run and provider session.");
    await pause();
    const nextProposal = proposal(currentRevision + 1);
    const nextRun = RunSchema.parse({ ...current.run, proposal: nextProposal, proposal_revision: nextProposal.revision, status: "awaiting_approval" });
    return this.setRun(this.present(nextRun, [...current.revisions, nextProposal], "awaiting approval", `Proposal revision ${nextProposal.revision} is now the only approvable revision.`));
  }

  async proceed(runId: string, revision: number): Promise<RunPresentation> {
    const current = this.requireRun(runId);
    this.requireApprovable(current, revision);
    const approved = RunSchema.parse({ ...current.run, status: "approved", approval_decision: "proceed", approved_proposal_revision: revision });
    this.setRun({ ...current, run: approved, state: "approved", statusMessage: `Approval sealed to proposal revision ${revision}.` });
    await pause(420);
    const generation = ++this.executionGeneration;
    await this.simulateGate3(approved, current.revisions, generation);
    return this.requireRun(runId);
  }

  async cancel(runId: string): Promise<RunPresentation> {
    const current = this.requireRun(runId);
    if (current.run.status === "failed") throw new InvalidLifecycleActionError("A failed planning run cannot be cancelled.");
    const cancelled = RunSchema.parse({ ...current.run, status: "cancelled", approval_decision: "cancel", approved_proposal_revision: null, completed_at: now() });
    return this.setRun({ ...current, run: cancelled, state: "cancelled", statusMessage: "Planning was cancelled. No execution started." });
  }

  async cancelExecution(runId: string): Promise<RunPresentation> {
    const current = this.requireRun(runId);
    if (current.state !== "working") throw new InvalidLifecycleActionError("This run is not currently cancellable.");
    this.executionGeneration += 1;
    this.setState("cancelling", "Cancellation requested. Waiting for the simulated worker to stop safely.");
    await pause(420);
    const cancelled = RunSchema.parse({ ...current.run, status: "cancelled", completed_at: now() });
    return this.setRun({ ...this.requireRun(runId), run: cancelled, state: "cancelled", statusMessage: "Execution stopped. Review partial-change information before continuing." });
  }

  async resetDemo(projectId: string): Promise<void> {
    const project = this.snapshot.projects.find((item) => item.id === projectId);
    if (project) this.patch({ projects: this.snapshot.projects.map((item) => item.id === projectId ? ProjectSchema.parse({ ...item, status: "active", current_phase: "Planning lifecycle ready", latest_result: "Gate 2 planning and approval verified", next_action: "Inspect the current armor systems", updated_at: now() }) : item), activeRun: null });
  }

  async demonstrateMalformedProposal(projectId: string): Promise<RunPresentation> {
    const run = runRecord(`run-${this.sequence++}`, projectId, "Demonstrate malformed proposal handling");
    this.setRun(this.present(run, [], "inspecting", "Inspecting provider response."));
    await pause(350);
    const failed = RunSchema.parse({ ...run, status: "failed", failure: { message: "Provider returned a malformed proposal: expected at least one scoped step." }, completed_at: now() });
    return this.setRun(this.present(failed, [], "failed", "The proposal could not be validated. No approval or execution is possible."));
  }

  private async simulateGate3(run: Run, revisions: PlanProposal[], generation: number): Promise<void> {
    const stages: Array<[UiWorkflowState, string, SimulatedGate3Event]> = [
      ["working", "Executing the exact approved scope.", event("e1", "status", "Execution started", "Simulated Gate 3 adapter accepted the sealed proposal.")],
      ["working", "Updating armor diagnostics.", event("e2", "file", "Diagnostics updated", "src/armor/diagnostics.ts")],
      ["working", "Adding focused validation coverage.", event("e3", "file", "Validation updated", "tests/armor/diagnostics.test.ts")],
      ["verifying", "Execution ended. Verifying evidence before completion.", event("e4", "verification", "Focused checks running", "Armor diagnostics test suite")],
    ];
    let events: SimulatedGate3Event[] = [];
    for (const [state, message, nextEvent] of stages) {
      if (generation !== this.executionGeneration) return;
      events = [...events, nextEvent];
      const checks: VerificationCheck[] = state === "verifying" ? [
        { id: "typecheck", label: "Type checking", status: "pending", evidence: "Awaiting result" },
        { id: "diagnostics", label: "Armor diagnostics", status: "pending", evidence: "Awaiting result" },
      ] : [];
      this.setRun({ ...this.requireRun(run.id), run, revisions, state, events, checks, changedFiles: events.filter((item) => item.kind === "file").map((item) => item.detail), statusMessage: message, isGate3Simulation: true });
      await pause(620);
    }
    if (generation !== this.executionGeneration) return;
    const checks: VerificationCheck[] = [
      { id: "typecheck", label: "Type checking", status: "passed", evidence: "No type errors" },
      { id: "diagnostics", label: "Armor diagnostics", status: "passed", evidence: "12 focused checks passed" },
      { id: "scope", label: "Scope reconciliation", status: "passed", evidence: "2 changed files match proposal revision scope" },
    ];
    const completedRun = RunSchema.parse({ ...run, completed_at: now() });
    this.setRun({ ...this.requireRun(run.id), run: completedRun, state: "completed", events: [...events, event("e5", "verification", "Verification complete", "All evidence supports completion.")], checks, changedFiles: ["src/armor/diagnostics.ts", "tests/armor/diagnostics.test.ts"], statusMessage: "Verified complete. MK 42 is ready for the next validation cycle.", isGate3Simulation: true });
    this.patch({ projects: this.snapshot.projects.map((project) => project.id === run.project_id ? ProjectSchema.parse({ ...project, status: "completed", current_phase: "Diagnostics validated", latest_result: "Focused armor diagnostics passed with approved scope reconciled", next_action: "Review verification evidence", updated_at: now() }) : project) });
  }

  private present(run: Run, revisions: PlanProposal[], state: UiWorkflowState, statusMessage: string): RunPresentation {
    return { run, revisions, state, events: [], changedFiles: [], checks: [], statusMessage, isGate3Simulation: false };
  }

  private requireRun(runId: string): RunPresentation {
    const current = this.snapshot.activeRun;
    if (!current || current.run.id !== runId) throw new InvalidLifecycleActionError(`Run '${runId}' is not active.`);
    return current;
  }

  private requireApprovable(current: RunPresentation, revision: number): void {
    if (current.run.status !== "awaiting_approval") throw new InvalidLifecycleActionError(`Run cannot be approved or modified while ${current.run.status}.`);
    if (revision !== current.run.proposal_revision) throw new StaleProposalError(`Proposal revision ${revision} is stale; current revision is ${current.run.proposal_revision}.`);
  }

  private setState(state: UiWorkflowState, statusMessage: string): RunPresentation {
    const current = this.snapshot.activeRun;
    if (!current) throw new InvalidLifecycleActionError("No active run.");
    return this.setRun({ ...current, state, statusMessage });
  }

  private setRun(activeRun: RunPresentation): RunPresentation {
    this.patch({ activeRun });
    return activeRun;
  }

  private patch(next: Partial<JarvisSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
