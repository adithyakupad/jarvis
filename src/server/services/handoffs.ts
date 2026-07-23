import { HandoffNarrativeSchema, ProjectHandoffSchema, type HandoffCorrections, type HandoffNarrative, type ProjectHandoff, type StoredHandoffCorrections } from "../../shared/handoffs.js";
import type { Project } from "../../shared/projects.js";
import type { Run } from "../../shared/runs.js";
import { AgentAdapterRegistry } from "../providers/registry.js";
import { NodeProcessRunner, type ProcessRunner } from "../providers/process-runner.js";
import { HandoffRepository } from "../repositories/handoffs.js";
import { ProjectRepository } from "../repositories/projects.js";
import { RunRepository } from "../repositories/runs.js";
import { canonicalizeRepositoryPath } from "../security/repository-path.js";
import { repositoryFingerprint } from "./repository-fingerprint.js";

const terminalStatuses = new Set(["completed", "failed", "cancelled", "cancelled_before_execution"]);

function outcome(run: Run): string {
  if (run.status === "completed") return run.verification?.message ?? "Execution completed.";
  if (run.status === "cancelled" || run.status === "cancelled_before_execution") return "Cancelled before execution completed.";
  const category = (run.failure as { category?: string } | null)?.category;
  return category === "interrupted" ? "Interrupted by JARVIS restart; repository review is required." : `Failed: ${run.failure?.message ?? "Unknown failure."}`;
}

function fallbackNarrative(project: Project, run: Run, prior: ProjectHandoff | null): HandoffNarrative {
  const interrupted = (run.failure as { category?: string } | null)?.category === "interrupted";
  const failed = run.status === "failed";
  const cancelled = run.status === "cancelled" || run.status === "cancelled_before_execution";
  const constraints = [...new Set([project.notes.trim(), ...(run.proposal?.risks ?? []), ...(run.context_packet?.constraints ?? [])].filter(Boolean))];
  return HandoffNarrativeSchema.parse({
    currentObjective: prior?.currentObjective ?? project.objective,
    currentStatus: interrupted ? "Work was interrupted; inspect the repository before continuing." : failed ? "The latest run failed; preserved evidence is available for review." : cancelled ? "The latest planning run was cancelled without approved execution." : run.verification?.message ?? "The latest approved work completed.",
    lastMeaningfulAction: run.execution_result?.summary || run.failure?.message || (cancelled ? "The user cancelled the run before execution." : run.instruction),
    blockers: interrupted ? ["Repository state may have changed before JARVIS restarted."] : failed ? [run.failure?.message ?? "The latest run failed."] : [],
    openDecisions: prior?.openDecisions ?? [],
    activeConstraints: constraints.length ? constraints : prior?.activeConstraints ?? [],
    recommendedNextAction: interrupted || failed ? "Review the working tree and the latest run evidence before starting new work." : cancelled ? "Submit a new task when the project is ready." : "Review the verified change set and choose the next project task.",
    inferredEvidence: [],
  });
}

export class HandoffService {
  private readonly updates = new Map<string, Promise<ProjectHandoff>>();

  constructor(
    private readonly projects: ProjectRepository,
    private readonly runs: RunRepository,
    private readonly handoffs: HandoffRepository,
    private readonly adapters: AgentAdapterRegistry,
    private readonly runner: ProcessRunner = new NodeProcessRunner(),
    private readonly clock: () => Date = () => new Date(),
    private readonly monotonicNow: () => number = () => Date.now(),
  ) {}

  updateForRun(runId: string): Promise<ProjectHandoff> {
    const existing = this.updates.get(runId);
    if (existing) return existing;
    const update = this.performUpdate(runId).finally(() => this.updates.delete(runId));
    this.updates.set(runId, update);
    return update;
  }

  private async performUpdate(runId: string): Promise<ProjectHandoff> {
    const run = this.runs.require(runId);
    if (!terminalStatuses.has(run.status)) throw new Error(`Run '${runId}' is not terminal.`);
    const project = this.projects.get(run.project_id);
    if (!project) throw new Error(`Project '${run.project_id}' was not found.`);
    const prior = this.handoffs.get(project.id);
    const started = this.monotonicNow();
    const generatedAt = this.clock().toISOString();
    this.runs.recordExecutionEvent(run.id, "project_handoff_update_started", { projectId: project.id });
    let canonical: string | null = null;
    let fingerprint: string | null = null;
    try { canonical = canonicalizeRepositoryPath(project.repository_path); fingerprint = await repositoryFingerprint(canonical, this.runner); } catch { canonical = null; }
    const fallback = fallbackNarrative(project, run, prior);
    const pending = this.compose(project, run, prior, fallback, fingerprint, generatedAt, "pending", null, null, []);
    this.handoffs.save(pending);
    this.runs.recordExecutionEvent(run.id, "deterministic_handoff_evidence_captured", { projectId: project.id, changedFiles: pending.changedFiles, validationStatus: pending.validationSummary.status });
    try {
      if (!canonical) throw new Error("Repository is unavailable for read-only handoff generation.");
      const adapter = this.adapters.require(run.provider);
      if (!adapter.generateHandoff) throw new Error(`Provider '${run.provider}' does not implement structured handoff generation.`);
      const availability = await adapter.detect();
      if (!availability.installed || availability.authenticated !== true) throw new Error(availability.detail);
      const raw = await adapter.generateHandoff({ projectId: project.id, repositoryPath: canonical, providerSessionId: run.provider_session_id, priorHandoff: prior, currentRun: run, currentProjectProfile: project.profile, userCorrections: prior?.corrections ?? null, deterministicEvidence: this.deterministicPacket(pending), readOnly: true, providerReadinessVerified: true });
      const diagnostics = this.conflictDiagnostics(raw);
      const narrative = HandoffNarrativeSchema.parse(raw);
      const ready = this.compose(project, run, prior, narrative, fingerprint, generatedAt, "ready", null, this.monotonicNow() - started, diagnostics);
      this.handoffs.save(ready);
      this.runs.recordExecutionEvent(run.id, "project_handoff_ready", { projectId: project.id, revision: ready.revision, durationMs: ready.generationDurationMs });
      return ready;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Structured handoff generation failed.";
      const fallbackResult = this.compose(project, run, prior, fallback, fingerprint, generatedAt, "deterministic_fallback", message, this.monotonicNow() - started, [message]);
      this.handoffs.save(fallbackResult);
      this.runs.recordExecutionEvent(run.id, "project_handoff_fallback_created", { projectId: project.id, revision: fallbackResult.revision, message });
      return fallbackResult;
    }
  }

  async current(projectId: string): Promise<ProjectHandoff | null> {
    const stored = this.handoffs.get(projectId);
    if (!stored) return null;
    const project = this.projects.get(projectId);
    if (!project) return null;
    let fingerprint: string | null = null;
    try { fingerprint = await repositoryFingerprint(canonicalizeRepositoryPath(project.repository_path), this.runner); } catch { /* unavailable is stale */ }
    const current = fingerprint !== null && stored.repositoryFingerprint !== null && fingerprint === stored.repositoryFingerprint;
    const freshnessStatus = current ? "current" : "potentially_stale";
    if (stored.freshnessStatus === freshnessStatus) return stored;
    const evidenceEntries = freshnessStatus === "potentially_stale" && !stored.evidenceEntries.some((entry) => entry.category === "stale")
      ? [...stored.evidenceEntries, { category: "stale" as const, summary: "Repository state differs from the state captured for this handoff.", sourceRunId: stored.lastRunId, eventType: "handoff_marked_potentially_stale", proposalRevision: stored.approvedProposalRevision, repositoryEvidence: "repository_fingerprint", validationReference: null, timestamp: this.clock().toISOString() }]
      : stored.evidenceEntries;
    const updated = this.handoffs.save({ ...stored, freshnessStatus, evidenceEntries });
    if (freshnessStatus === "potentially_stale") this.runs.recordExecutionEvent(stored.lastRunId, "handoff_marked_potentially_stale", { projectId });
    return updated;
  }

  async planningContext(projectId: string): Promise<ProjectHandoff | null> { return this.current(projectId); }

  async correct(projectId: string, input: HandoffCorrections): Promise<ProjectHandoff> {
    const correction = this.handoffs.saveCorrections(projectId, input);
    const current = this.handoffs.require(projectId);
    const corrected = this.applyCorrections({ ...current, revision: current.revision + 1, correctedAt: correction.correctedAt, corrections: correction });
    const entry = { category: "user_provided" as const, summary: "User corrected the canonical project state.", sourceRunId: corrected.lastRunId, eventType: "user_correction_saved", proposalRevision: corrected.approvedProposalRevision, repositoryEvidence: null, validationReference: null, timestamp: correction.correctedAt };
    const saved = this.handoffs.save({ ...corrected, evidenceEntries: [...corrected.evidenceEntries.filter((item) => !(item.category === "user_provided" && item.eventType === "user_correction_saved")), entry] });
    this.runs.recordExecutionEvent(saved.lastRunId, "user_correction_saved", { projectId, fields: Object.keys(input) });
    return saved;
  }

  async reconcileMissing(): Promise<number> {
    let count = 0;
    for (const project of this.projects.list()) {
      const run = this.runs.latestForProject(project.id);
      const handoff = this.handoffs.get(project.id);
      if (run && terminalStatuses.has(run.status) && (handoff?.lastRunId !== run.id || handoff.generationStatus === "pending")) { await this.updateForRun(run.id); count += 1; }
    }
    return count;
  }

  private compose(project: Project, run: Run, prior: ProjectHandoff | null, narrative: HandoffNarrative, fingerprint: string | null, generatedAt: string, generationStatus: ProjectHandoff["generationStatus"], generationError: string | null, generationDurationMs: number | null, diagnostics: string[]): ProjectHandoff {
    const result = run.execution_result;
    const validation = run.verification?.validation;
    const post = run.post_execution_snapshot ?? run.pre_execution_snapshot;
    const confirmed = [
      { summary: `Run outcome: ${outcome(run)}`, eventType: run.status === "completed" ? "execution_completed" : run.status === "failed" ? "execution_failed" : "run_cancelled", repositoryEvidence: null, validationReference: validation ? "validation" : null },
      { summary: `Observed changed files: ${(result?.changedFiles ?? []).join(", ") || "none"}.`, eventType: "repository_reconciliation_completed", repositoryEvidence: "post_execution_snapshot", validationReference: null },
    ].map((entry) => ({ category: "confirmed" as const, ...entry, sourceRunId: run.id, proposalRevision: run.approved_proposal_revision, timestamp: run.completed_at ?? generatedAt }));
    const inferred = narrative.inferredEvidence.map((entry) => ({ category: entry.category, summary: entry.summary, sourceRunId: run.id, eventType: "project_handoff_ready", proposalRevision: run.approved_proposal_revision, repositoryEvidence: null, validationReference: null, timestamp: generatedAt }));
    const interrupted = (run.failure as { category?: string } | null)?.category === "interrupted";
    const requiredBlockers = interrupted
      ? ["Repository state may have changed before JARVIS restarted."]
      : run.status === "failed"
        ? [run.failure?.message ?? "The latest run failed."]
        : [];
    const handoff = ProjectHandoffSchema.parse({
      projectId: project.id, revision: (prior?.revision ?? 0) + 1, freshnessStatus: fingerprint ? "current" : "potentially_stale",
      ...narrative, blockers: [...new Set([...requiredBlockers, ...narrative.blockers])], lastRunId: run.id, lastRunOutcome: outcome(run), selectedProvider: run.provider, approvedProposalRevision: run.approved_proposal_revision,
      changedFiles: result?.changedFiles ?? [], createdFiles: result?.createdFiles ?? [], deletedFiles: result?.deletedFiles ?? [], preExistingFiles: result?.preExistingFiles ?? [], ambiguousFiles: result?.ambiguousFiles ?? [],
      validationSummary: { status: validation?.status ?? "not_run", command: validation?.commandDisplay ?? null, exitCode: validation?.exitCode ?? null, durationMs: validation?.durationMs ?? null },
      repositorySummary: { head: post?.head ?? null, dirtyPaths: Object.keys(post?.files ?? {}).sort(), isGitRepository: post?.isGitRepository ?? fingerprint !== null, capturedAt: post?.capturedAt ?? null },
      evidenceEntries: [...confirmed, ...inferred], repositoryFingerprint: fingerprint, generatedAt, correctedAt: prior?.correctedAt ?? null, generationStatus, generationError, generationDurationMs, corrections: prior?.corrections ?? null, diagnostics,
    });
    return this.applyCorrections(handoff);
  }

  private applyCorrections(handoff: ProjectHandoff): ProjectHandoff {
    const correction = handoff.corrections;
    if (!correction) return handoff;
    return ProjectHandoffSchema.parse({ ...handoff,
      currentObjective: correction.currentObjective ?? handoff.currentObjective,
      currentStatus: correction.currentStatus ?? handoff.currentStatus,
      blockers: correction.blockers ?? handoff.blockers,
      openDecisions: correction.openDecisions ?? handoff.openDecisions,
      activeConstraints: correction.activeConstraints ?? handoff.activeConstraints,
      recommendedNextAction: correction.recommendedNextAction ?? handoff.recommendedNextAction,
    });
  }

  private deterministicPacket(handoff: ProjectHandoff): Record<string, unknown> {
    const { currentObjective: _objective, currentStatus: _status, lastMeaningfulAction: _action, blockers: _blockers, openDecisions: _decisions, activeConstraints: _constraints, recommendedNextAction: _next, evidenceEntries: _entries, diagnostics: _diagnostics, ...facts } = handoff;
    return facts;
  }

  private conflictDiagnostics(raw: unknown): string[] {
    if (!raw || typeof raw !== "object") return [];
    const forbidden = ["changedFiles", "createdFiles", "deletedFiles", "validationSummary", "repositorySummary", "repositoryFingerprint", "lastRunId", "approvedProposalRevision", "selectedProvider"];
    return forbidden.filter((key) => key in raw).map((key) => `Provider handoff output attempted to supply deterministic field '${key}'; JARVIS ignored it.`);
  }
}
