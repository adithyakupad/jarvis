import { mkdirSync, mkdtempSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type JarvisDatabase } from "../src/server/database/connection.js";
import { buildApi } from "../src/server/http/app.js";
import { NodeProcessRunner } from "../src/server/providers/process-runner.js";
import { AgentAdapterRegistry } from "../src/server/providers/registry.js";
import { buildPlanningPrompt } from "../src/server/providers/codex-planning-adapter.js";
import { HandoffRepository } from "../src/server/repositories/handoffs.js";
import { ProjectRepository } from "../src/server/repositories/projects.js";
import { RunRepository } from "../src/server/repositories/runs.js";
import { HandoffService } from "../src/server/services/handoffs.js";
import { PlanningService } from "../src/server/services/planning.js";
import type { AgentAdapter, ExecutionResult, HandoffGenerationRequest, InspectionRequest, ProviderAvailability } from "../src/shared/providers.js";
import type { PlanProposal, RepositorySnapshot, Verification } from "../src/shared/runs.js";

const databases: JarvisDatabase[] = [];
const apps: Array<ReturnType<typeof buildApi>> = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const database of databases.splice(0)) if (database.open) database.close();
});

const at = "2026-07-23T12:00:00.000Z";
const proposal = (session = "session-project"): PlanProposal => ({
  objective: "Add divide support",
  currentState: "The repository exports add.",
  steps: ["Add divide", "Add focused tests"],
  expectedScope: ["math.js", "math.test.js"],
  risks: ["Preserve native JavaScript division-by-zero behavior."],
  completionTest: "npm test passes.",
  validationCommands: ["npm test"],
  revision: 1,
  providerSessionId: session,
});

class HandoffAdapter implements AgentAdapter {
  readonly id = "codex" as const;
  readonly handoffRequests: HandoffGenerationRequest[] = [];
  readonly inspections: InspectionRequest[] = [];
  handoffFailure: Error | null = null;
  modelOutput: unknown = {
    currentObjective: "Ship calculator arithmetic safely.",
    currentStatus: "Divide support is implemented and verified.",
    lastMeaningfulAction: "Added divide and focused tests.",
    blockers: [],
    openDecisions: [],
    activeConstraints: ["Preserve native JavaScript division-by-zero behavior."],
    recommendedNextAction: "Document division behavior.",
    inferredEvidence: [{ category: "inferred", summary: "Modulo support may be a useful next feature." }],
  };
  async detect(): Promise<ProviderAvailability> { return { provider: "codex", installed: true, authenticated: true, version: "fake", detail: "ready" }; }
  async inspect(input: InspectionRequest): Promise<unknown> { this.inspections.push(input); return { ...proposal(input.providerSessionId ?? "session-project"), revision: input.proposalRevision }; }
  async generateHandoff(input: HandoffGenerationRequest): Promise<unknown> { this.handoffRequests.push(input); if (this.handoffFailure) throw this.handoffFailure; return this.modelOutput; }
  async execute(): Promise<ExecutionResult> { throw new Error("unused"); }
  async resume(): Promise<ExecutionResult> { throw new Error("unused"); }
  async cancel(): Promise<void> { throw new Error("unused"); }
}

function repository(): string {
  const path = join(mkdtempSync(join(tmpdir(), "jarvis-handoff-")), "repo");
  mkdirSync(path);
  writeFileSync(join(path, "math.js"), "export const add = (a, b) => a + b;\n");
  writeFileSync(join(path, "math.test.js"), "import test from 'node:test';\n");
  writeFileSync(join(path, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  spawnSync("git", ["init"], { cwd: path });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: path });
  spawnSync("git", ["config", "user.name", "Test"], { cwd: path });
  spawnSync("git", ["add", "."], { cwd: path });
  spawnSync("git", ["commit", "-m", "initial"], { cwd: path });
  return realpathSync.native(path);
}

function setup(id = "project"): { repo: string; projects: ProjectRepository; runs: RunRepository; handoffs: HandoffRepository; adapter: HandoffAdapter; service: HandoffService; database: JarvisDatabase } {
  const repo = repository();
  const database = openDatabase(join(repo, "..", "jarvis.db")); databases.push(database);
  const projects = new ProjectRepository(database);
  projects.create({ id, name: "Calculator", objective: "Build a calculator library.", repository_path: repo, provider: "codex", notes: "Keep the public API small." });
  const runs = new RunRepository(database, () => new Date(at));
  const handoffs = new HandoffRepository(database, () => new Date(at));
  const adapter = new HandoffAdapter();
  const service = new HandoffService(projects, runs, handoffs, new AgentAdapterRegistry([adapter]), new NodeProcessRunner(), () => new Date(at), (() => { let value = 100; return () => value += 25; })());
  return { repo, projects, runs, handoffs, adapter, service, database };
}

function snapshot(repo: string, files: Record<string, { status: string; fingerprint: string | null }> = {}): RepositorySnapshot {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
  return { canonicalPath: repo, isGitRepository: true, branch: "main", head, files, capturedAt: at };
}

function complete(setupResult: ReturnType<typeof setup>): string {
  const { repo, runs } = setupResult;
  const run = runs.createInspection("project", "codex", "Add divide and tests.");
  runs.recordProposal(run.id, proposal());
  runs.approve(run.id, 1);
  runs.prepareExecution(run.id, snapshot(repo));
  writeFileSync(join(repo, "math.js"), "export const add = (a, b) => a + b;\nexport const divide = (a, b) => a / b;\n");
  const verification: Verification = {
    repositoryValid: true,
    message: "Tests passed.",
    checks: [{ command: "npm test", exitCode: 0, durationMs: 12, output: "2 tests passed", passed: true }],
    validation: { status: "passed", packageManager: "npm", executable: "npm", args: ["test"], commandDisplay: "npm test", startedAt: at, completedAt: at, exitCode: 0, signal: null, stdout: "2 tests passed", stderr: "", durationMs: 12, failureCategory: null },
  };
  runs.completeExecution(run.id, { summary: "Added divide.", providerSessionId: "session-project", succeeded: true, changedFiles: ["math.js", "math.test.js"], createdFiles: [], deletedFiles: [], preExistingFiles: [], ambiguousFiles: [] }, verification, snapshot(repo, { "math.js": { status: " M", fingerprint: "changed" } }), "session-project");
  return run.id;
}

describe("structured project handoffs", () => {
  it("creates a canonical handoff from deterministic terminal-run evidence", async () => {
    const state = setup(); const runId = complete(state);
    const [handoff, duplicate] = await Promise.all([state.service.updateForRun(runId), state.service.updateForRun(runId)]);
    expect(duplicate).toEqual(handoff);
    expect(handoff).toMatchObject({
      projectId: "project", revision: 1, generationStatus: "ready", freshnessStatus: "current",
      lastRunId: runId, lastRunOutcome: "Tests passed.", selectedProvider: "codex", approvedProposalRevision: 1,
      changedFiles: ["math.js", "math.test.js"],
      validationSummary: { status: "passed", command: "npm test", exitCode: 0, durationMs: 12 },
      activeConstraints: ["Preserve native JavaScript division-by-zero behavior."],
    });
    expect(state.adapter.handoffRequests[0]).toMatchObject({ readOnly: true, providerSessionId: "session-project", priorHandoff: null });
    expect(state.adapter.handoffRequests).toHaveLength(1);
    expect(state.runs.require(runId).status).toBe("completed");
    expect(state.runs.events(runId).map((event) => event.type)).toEqual(expect.arrayContaining(["project_handoff_update_started", "deterministic_handoff_evidence_captured", "project_handoff_ready"]));
  });

  it("preserves deterministic facts when model output conflicts", async () => {
    const state = setup(); const runId = complete(state);
    state.adapter.modelOutput = { ...(state.adapter.modelOutput as object), changedFiles: ["invented.txt"], validationSummary: { status: "failed" }, lastRunId: "wrong-run" };
    const handoff = await state.service.updateForRun(runId);
    expect(handoff.changedFiles).toEqual(["math.js", "math.test.js"]);
    expect(handoff.validationSummary.status).toBe("passed");
    expect(handoff.lastRunId).toBe(runId);
    expect(handoff.diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("changedFiles"), expect.stringContaining("validationSummary"), expect.stringContaining("lastRunId")]));
  });

  it("creates honest fallback, failed, cancelled, and interrupted handoffs without altering terminal runs", async () => {
    const fallback = setup(); const completedId = complete(fallback); fallback.adapter.handoffFailure = new Error("summary unavailable");
    expect(await fallback.service.updateForRun(completedId)).toMatchObject({ generationStatus: "deterministic_fallback", generationError: "summary unavailable", changedFiles: ["math.js", "math.test.js"] });
    expect(fallback.runs.require(completedId).status).toBe("completed");

    const failed = setup(); const failedRun = failed.runs.createInspection("project", "codex", "Broken task"); failed.runs.failInspection(failedRun.id, new Error("provider failed"));
    expect(await failed.service.updateForRun(failedRun.id)).toMatchObject({ lastRunOutcome: "Failed: provider failed", changedFiles: [], blockers: ["provider failed"] });

    const cancelled = setup(); const cancelledRun = cancelled.runs.createInspection("project", "codex", "Do nothing"); cancelled.runs.cancel(cancelledRun.id);
    expect(await cancelled.service.updateForRun(cancelledRun.id)).toMatchObject({ changedFiles: [], createdFiles: [], deletedFiles: [], lastRunOutcome: "Cancelled before execution completed." });

    const interrupted = setup(); const interruptedRun = interrupted.runs.createInspection("project", "codex", "Started work"); interrupted.runs.interruptActiveRuns();
    const interruptedHandoff = await interrupted.service.updateForRun(interruptedRun.id);
    expect(interruptedHandoff.lastRunOutcome).toContain("repository review is required");
    expect(interruptedHandoff.blockers.join(" ")).toContain("Repository state may have changed");
  });

  it("uses only the bounded prior handoff for a subsequent update", async () => {
    const state = setup(); const firstRun = complete(state); const first = await state.service.updateForRun(firstRun);
    const second = state.runs.createInspection("project", "codex", "Document division."); state.runs.failInspection(second.id, new Error("documentation provider failed"));
    await state.service.updateForRun(second.id);
    expect(state.adapter.handoffRequests[1].priorHandoff).toMatchObject({ revision: first.revision, lastRunId: firstRun });
    expect(JSON.stringify(state.adapter.handoffRequests[1])).not.toContain("run_events");
  });

  it("persists corrections as user-provided precedence without altering deterministic facts", async () => {
    const state = setup(); const runId = complete(state); const original = await state.service.updateForRun(runId);
    const corrected = await state.service.correct("project", { currentObjective: "Add modulo support next.", activeConstraints: ["Do not modify generated files."] });
    expect(corrected).toMatchObject({ revision: original.revision + 1, currentObjective: "Add modulo support next.", changedFiles: original.changedFiles, validationSummary: original.validationSummary });
    expect(corrected.corrections).toMatchObject({ currentObjective: "Add modulo support next." });
    expect(corrected.evidenceEntries).toEqual(expect.arrayContaining([expect.objectContaining({ category: "user_provided", eventType: "user_correction_saved" })]));
    state.adapter.modelOutput = { ...(state.adapter.modelOutput as object), currentObjective: "Ignore the correction." };
    const next = state.runs.createInspection("project", "codex", "Plan modulo"); state.runs.failInspection(next.id, new Error("stop"));
    const refreshed = await state.service.updateForRun(next.id);
    expect(refreshed.currentObjective).toBe("Add modulo support next.");
    expect(state.handoffs.get("project")?.corrections?.currentObjective).toBe("Add modulo support next.");
  });

  it("marks tracked, untracked, and HEAD changes stale and treats non-Git freshness conservatively", async () => {
    const state = setup(); const runId = complete(state); await state.service.updateForRun(runId);
    expect((await state.service.current("project"))?.freshnessStatus).toBe("current");
    writeFileSync(join(state.repo, "math.js"), "manual change\n");
    expect((await state.service.current("project"))?.freshnessStatus).toBe("potentially_stale");

    const cleanState = setup(); const cleanRun = complete(cleanState); await cleanState.service.updateForRun(cleanRun);
    writeFileSync(join(cleanState.repo, "untracked.txt"), "visible untracked content\n");
    expect((await cleanState.service.current("project"))?.freshnessStatus).toBe("potentially_stale");

    const headState = setup(); const headRun = complete(headState); await headState.service.updateForRun(headRun);
    spawnSync("git", ["add", "."], { cwd: headState.repo }); spawnSync("git", ["commit", "-m", "new head"], { cwd: headState.repo });
    expect((await headState.service.current("project"))?.freshnessStatus).toBe("potentially_stale");

    const nonGit = setup(); renameSync(join(nonGit.repo, ".git"), join(nonGit.repo, ".git-hidden"));
    const nonGitRun = nonGit.runs.createInspection("project", "codex", "Inspect"); nonGit.runs.cancel(nonGitRun.id);
    expect((await nonGit.service.updateForRun(nonGitRun.id)).freshnessStatus).toBe("potentially_stale");
  });

  it("injects the correct handoff into planning and prevents cross-project or browser replacement", async () => {
    const state = setup(); const runId = complete(state); const handoff = await state.service.updateForRun(runId);
    state.projects.create({ id: "project-b", name: "Other", objective: "Other project", repository_path: repository(), provider: "codex" });
    const planning = new PlanningService(state.projects, state.runs, new AgentAdapterRegistry([state.adapter]), new NodeProcessRunner(), state.service);
    writeFileSync(join(state.repo, "README.md"), "manual repository change\n");
    const projectRun = await planning.inspect("project", "Document division");
    await planning.modify(projectRun.id, 1, "Keep the scope narrow");
    await planning.inspect("project-b", "Inspect the other project");
    expect(state.adapter.inspections.at(-3)?.projectHandoff).toMatchObject({ projectId: "project", revision: handoff.revision, freshnessStatus: "potentially_stale" });
    expect(state.adapter.inspections.at(-2)?.repositoryCacheHit).toBe(false);
    expect(state.adapter.inspections.at(-1)?.projectHandoff).toBeNull();
    const prompt = buildPlanningPrompt(state.adapter.inspections.at(-3)!);
    expect(prompt).toContain("CONFIRMED RUN AND REPOSITORY FACTS");
    expect(prompt).toContain("USER-PROVIDED CORRECTIONS");
    expect(prompt).toContain("MODEL INFERENCES");
    expect(prompt).toContain("UNRESOLVED QUESTIONS");
    expect(prompt).toContain("POTENTIALLY STALE INFORMATION");

    const app = buildApi({ database: state.database, adapters: new AgentAdapterRegistry([state.adapter]), processRunner: new NodeProcessRunner() }); apps.push(app);
    const rejected = await app.inject({ method: "PATCH", url: "/api/projects/project/handoff/corrections", payload: { currentStatus: "User correction", changedFiles: ["forged.txt"], validationSummary: { status: "failed" } } });
    expect(rejected.statusCode).toBe(400);
    expect(state.handoffs.get("project")?.changedFiles).toEqual(["math.js", "math.test.js"]);
  });

  it("restores handoffs and corrections after reopening the database", async () => {
    const state = setup(); const runId = complete(state); await state.service.updateForRun(runId); await state.service.correct("project", { recommendedNextAction: "Add modulo support." });
    const path = state.database.name;
    state.database.close(); databases.splice(databases.indexOf(state.database), 1);
    const reopened = openDatabase(path); databases.push(reopened);
    const restored = new HandoffRepository(reopened).require("project");
    expect(restored).toMatchObject({ lastRunId: runId, recommendedNextAction: "Add modulo support.", corrections: { recommendedNextAction: "Add modulo support." } });
  });
});
