import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type JarvisDatabase } from "../src/server/database/connection.js";
import { buildApi } from "../src/server/http/app.js";
import { AgentAdapterRegistry } from "../src/server/providers/registry.js";
import { NodeProcessRunner, type ProcessRunOptions, type ProcessRunner, type ProcessResult } from "../src/server/providers/process-runner.js";
import { ProjectRepository } from "../src/server/repositories/projects.js";
import { InvalidRunTransitionError, RunRepository } from "../src/server/repositories/runs.js";
import { ExecutionFailedError, ExecutionService } from "../src/server/services/execution.js";
import type { AgentAdapter, AgentEventHandler, ExecutionRequest, ExecutionResult, InspectionRequest, ProviderAvailability } from "../src/shared/providers.js";
import type { PlanProposal } from "../src/shared/runs.js";

const databases: JarvisDatabase[] = [];
const apps: Array<ReturnType<typeof buildApi>> = [];

class FakeAdapter implements AgentAdapter {
  readonly id = "codex" as const;
  executeCalls = 0;
  request: ExecutionRequest | null = null;
  constructor(private readonly behavior: "success" | "failure" | "touch-dirty" = "success") {}
  async detect(): Promise<ProviderAvailability> { return { provider: "codex", installed: true, authenticated: true, version: "fake", detail: "ready" }; }
  async inspect(_input: InspectionRequest): Promise<unknown> { throw new Error("not used"); }
  async execute(input: ExecutionRequest, onEvent: AgentEventHandler): Promise<ExecutionResult> {
    this.executeCalls += 1; this.request = input;
    onEvent({ type: "provider_message", message: "Applying approved revision.", occurredAt: new Date().toISOString() });
    writeFileSync(join(input.repositoryPath, "src", "math.ts"), "export const multiply = (a: number, b: number) => a * b;\n");
    if (this.behavior === "touch-dirty") writeFileSync(join(input.repositoryPath, "notes.txt"), "provider also changed this\n");
    if (this.behavior === "failure") throw new Error("provider stopped");
    return { summary: "Added multiply.", providerSessionId: "session-execution", succeeded: true };
  }
  async resume(): Promise<ExecutionResult> { throw new Error("not used"); }
  async cancel(): Promise<void> { throw new Error("unsupported"); }
}

class TestRunner implements ProcessRunner {
  readonly validationCalls: string[] = [];
  constructor(private readonly validationExitCode = 0, private readonly node = new NodeProcessRunner()) {}
  async run(executable: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    if (executable === "git") return this.node.run(executable, args, options);
    this.validationCalls.push([executable, ...args].join(" "));
    return { exitCode: this.validationExitCode, stdout: this.validationExitCode ? "failed" : "passed", stderr: "" };
  }
}

function proposal(includeDirty = false): PlanProposal { return { objective: "Add multiplication", currentState: "src/math.ts exists.", steps: ["Add multiply"], expectedScope: includeDirty ? ["src/math.ts", "notes.txt"] : ["src/math.ts"], risks: [], completionTest: "Tests pass.", validationCommands: ["npm run test"], revision: 1, providerSessionId: "session-plan" }; }

function fixture(behavior: "success" | "failure" | "touch-dirty" = "success", validationExitCode = 0) {
  const root = mkdtempSync(join(tmpdir(), "jarvis-execution-")); const repo = join(root, "repo"); mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "math.ts"), "export const add = (a: number, b: number) => a + b;\n");
  spawnSync("git", ["init"], { cwd: repo }); spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: repo }); spawnSync("git", ["config", "user.name", "Test"], { cwd: repo }); spawnSync("git", ["add", "."], { cwd: repo }); spawnSync("git", ["commit", "-m", "initial"], { cwd: repo });
  const canonicalRepo = realpathSync.native(repo);
  const databasePath = join(root, "jarvis.db"); const database = openDatabase(databasePath); databases.push(database);
  const projects = new ProjectRepository(database); projects.create({ id: "project", name: "Project", objective: "Test execution", repository_path: canonicalRepo, provider: "codex" });
  const runs = new RunRepository(database); const run = runs.createInspection("project", "codex", "Add multiply"); runs.recordProposal(run.id, proposal(behavior === "touch-dirty"));
  const adapter = new FakeAdapter(behavior); const runner = new TestRunner(validationExitCode); const registry = new AgentAdapterRegistry([adapter]);
  return { root, repo: canonicalRepo, databasePath, database, projects, runs, runId: run.id, adapter, runner, registry, execution: new ExecutionService(projects, runs, registry, runner) };
}

afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const database of databases.splice(0)) if (database.open) database.close(); });

describe("Gate 3 execution lifecycle", () => {
  it("executes only the exact approval, uses the canonical repository, persists evidence, and is idempotent", async () => {
    const context = fixture(); writeFileSync(join(context.repo, "notes.txt"), "pre-existing\n");
    context.runs.approve(context.runId, 1);
    const completed = await context.execution.execute(context.runId);
    expect(completed).toMatchObject({ status: "completed", approved_proposal_revision: 1, execution_result: { changedFiles: ["src/math.ts"], preExistingFiles: ["notes.txt"], ambiguousFiles: [] }, verification: { checks: [{ command: "npm run test", passed: true }] } });
    expect(context.adapter.request).toMatchObject({ repositoryPath: context.repo, approvedRevision: 1, providerSessionId: "session-plan", allowedScope: ["src/math.ts"] });
    expect(context.runner.validationCalls).toEqual(["npm run test"]);
    await context.execution.execute(context.runId);
    expect(context.adapter.executeCalls).toBe(1);
    expect(context.runs.events(context.runId).map((event) => event.type)).toEqual(expect.arrayContaining(["execution_started", "provider_message", "verification_started", "verification_result", "execution_completed"]));
    context.database.close();
    const restarted = openDatabase(context.databasePath); databases.push(restarted); const restoredRuns = new RunRepository(restarted);
    expect(restoredRuns.require(context.runId)).toMatchObject({ status: "completed", execution_result: { changedFiles: ["src/math.ts"] } });
    expect(restoredRuns.events(context.runId).at(-1)?.type).toBe("execution_completed");
  });

  it("rejects unapproved and cancelled runs", async () => {
    const unapproved = fixture(); await expect(unapproved.execution.execute(unapproved.runId)).rejects.toThrow(InvalidRunTransitionError);
    const cancelled = fixture(); cancelled.runs.cancel(cancelled.runId); await expect(cancelled.execution.execute(cancelled.runId)).rejects.toThrow(InvalidRunTransitionError);
    expect(cancelled.adapter.executeCalls).toBe(0);
  });

  it("persists snapshots and failure events when the provider fails", async () => {
    const context = fixture("failure"); context.runs.approve(context.runId, 1);
    await expect(context.execution.execute(context.runId)).rejects.toThrow(ExecutionFailedError);
    expect(context.runs.require(context.runId)).toMatchObject({ status: "failed", pre_execution_snapshot: { canonicalPath: context.repo }, post_execution_snapshot: { canonicalPath: context.repo }, failure: { message: "provider stopped" } });
    expect(context.runs.events(context.runId).at(-1)?.type).toBe("execution_failed");
  });

  it("labels a provider-touched pre-existing dirty file as ambiguous", async () => {
    const context = fixture("touch-dirty"); writeFileSync(join(context.repo, "notes.txt"), "user work\n"); context.runs.approve(context.runId, 1);
    const completed = await context.execution.execute(context.runId);
    expect(completed.execution_result).toMatchObject({ preExistingFiles: ["notes.txt"], ambiguousFiles: ["notes.txt"], changedFiles: ["notes.txt", "src/math.ts"] });
  });

  it("does not complete when an approved validation fails", async () => {
    const context = fixture("success", 1); context.runs.approve(context.runId, 1);
    await expect(context.execution.execute(context.runId)).rejects.toThrow("approved validation command failed");
    expect(context.runs.require(context.runId)).toMatchObject({ status: "failed", verification: { checks: [{ passed: false }] } });
  });

  it("serves persisted events, SSE, and rejects browser-supplied execution controls", async () => {
    const context = fixture(); context.runs.approve(context.runId, 1);
    const app = buildApi({ database: context.database, adapters: context.registry, processRunner: context.runner }); apps.push(app);
    expect((await app.inject({ method: "POST", url: `/api/runs/${context.runId}/execute`, payload: { repositoryPath: "/tmp/other", command: "rm -rf" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/runs/${context.runId}/execute`, payload: {} })).statusCode).toBe(200);
    const events = await app.inject({ method: "GET", url: `/api/runs/${context.runId}/events` }); expect(events.json().events.length).toBeGreaterThan(3);
    const stream = await app.inject({ method: "GET", url: `/api/runs/${context.runId}/events/stream?replayOnly=true` }); expect(stream.headers["content-type"]).toContain("text/event-stream"); expect(stream.body).toContain("event: execution_completed");
  });
});
