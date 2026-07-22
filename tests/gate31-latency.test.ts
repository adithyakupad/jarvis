import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type JarvisDatabase } from "../src/server/database/connection.js";
import { buildApi } from "../src/server/http/app.js";
import { NodeProcessRunner, type ProcessRunOptions, type ProcessRunner, type ProcessResult } from "../src/server/providers/process-runner.js";
import { AgentAdapterRegistry } from "../src/server/providers/registry.js";
import { ProjectRepository } from "../src/server/repositories/projects.js";
import { RunRepository } from "../src/server/repositories/runs.js";
import { PlanningService } from "../src/server/services/planning.js";
import type { AgentAdapter, AgentEventHandler, ExecutionRequest, ExecutionResult, InspectionRequest, ProviderAvailability } from "../src/shared/providers.js";
import type { PlanProposal } from "../src/shared/runs.js";

const databases: JarvisDatabase[] = [];
const apps: Array<ReturnType<typeof buildApi>> = [];
const proposal = (revision = 1, session = "session-a"): PlanProposal => ({ objective: "Add arithmetic", currentState: "math.js exists.", steps: ["Edit math.js"], expectedScope: ["math.js"], risks: [], completionTest: "Tests pass.", validationCommands: ["npm test"], revision, providerSessionId: session });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function until(predicate: () => boolean): Promise<void> { for (let index = 0; index < 400 && !predicate(); index += 1) await new Promise<void>((resolve) => setTimeout(resolve, 5)); expect(predicate()).toBe(true); }

class DelayedAdapter implements AgentAdapter {
  readonly id = "codex" as const;
  inspections: InspectionRequest[] = [];
  executions: ExecutionRequest[] = [];
  inspection = deferred<unknown>();
  execution = deferred<ExecutionResult>();
  async detect(): Promise<ProviderAvailability> { return { provider: "codex", installed: true, authenticated: true, version: "fake", detail: "ready" }; }
  async inspect(input: InspectionRequest): Promise<unknown> { this.inspections.push(input); return this.inspection.promise; }
  async execute(input: ExecutionRequest, event: AgentEventHandler): Promise<ExecutionResult> { this.executions.push(input); event({ type: "provider_message", message: "Editing", occurredAt: "2026-07-22T12:00:05.000Z" }); return this.execution.promise; }
  async resume(): Promise<ExecutionResult> { throw new Error("unused"); }
  async cancel(): Promise<void> { throw new Error("unused"); }
}

class HybridRunner implements ProcessRunner {
  readonly node = new NodeProcessRunner(); validationCalls = 0;
  async run(executable: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult> {
    if (executable === "git") return this.node.run(executable, args, options);
    this.validationCalls += 1; return { exitCode: 0, stdout: "tests passed", stderr: "" };
  }
}

function repository(): string {
  const path = join(mkdtempSync(join(tmpdir(), "jarvis-latency-")), "repo"); mkdirSync(path);
  writeFileSync(join(path, "math.js"), "export const add = (a, b) => a + b;\n");
  writeFileSync(join(path, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  spawnSync("git", ["init"], { cwd: path }); spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: path }); spawnSync("git", ["config", "user.name", "Test"], { cwd: path }); spawnSync("git", ["add", "."], { cwd: path }); spawnSync("git", ["commit", "-m", "initial"], { cwd: path });
  return realpathSync.native(path);
}

afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const database of databases.splice(0)) if (database.open) database.close(); });

describe("Gate 3.1 asynchronous lifecycle", () => {
  it("returns a persisted planning acceptance before a delayed provider completes", async () => {
    const repo = repository(); const database = openDatabase(join(repo, "..", "jarvis.db")); databases.push(database);
    new ProjectRepository(database).create({ id: "project", name: "Project", objective: "Plan", repository_path: repo, provider: "codex" });
    const adapter = new DelayedAdapter(); const tasks: Array<() => Promise<void>> = [];
    const app = buildApi({ database, adapters: new AgentAdapterRegistry([adapter]), processRunner: new HybridRunner(), schedule: (task) => tasks.push(task) }); apps.push(app);
    const response = await app.inject({ method: "POST", url: "/api/projects/project/instructions", payload: { instruction: "Add subtract" } });
    expect(response.statusCode).toBe(202); expect(response.json().run).toMatchObject({ status: "inspecting", proposal: null }); expect(tasks).toHaveLength(1);
    const work = tasks.shift()?.(); await until(() => adapter.inspections.length === 1);
    const active = await app.inject({ method: "GET", url: `/api/runs/${response.json().run.id}` });
    expect(active.json()).toMatchObject({ run: { status: "inspecting" }, events: expect.arrayContaining([expect.objectContaining({ type: "provider_invocation_started" })]) });
    adapter.inspection.resolve(proposal()); await work;
    expect((await app.inject({ method: "GET", url: `/api/runs/${response.json().run.id}` })).json().run.status).toBe("awaiting_approval");
  });

  it("acknowledges Proceed before execution, exposes live events, and launches once", async () => {
    const repo = repository(); const database = openDatabase(join(repo, "..", "jarvis.db")); databases.push(database);
    const projects = new ProjectRepository(database); projects.create({ id: "project", name: "Project", objective: "Execute", repository_path: repo, provider: "codex" });
    const runs = new RunRepository(database); const run = runs.createInspection("project", "codex", "Add subtract"); runs.recordProposal(run.id, proposal());
    const adapter = new DelayedAdapter(); const runner = new HybridRunner(); const tasks: Array<() => Promise<void>> = [];
    const app = buildApi({ database, adapters: new AgentAdapterRegistry([adapter]), processRunner: runner, schedule: (task) => tasks.push(task) }); apps.push(app);
    const first = await app.inject({ method: "POST", url: `/api/runs/${run.id}/proceed`, payload: { revision: 1 } });
    const duplicate = await app.inject({ method: "POST", url: `/api/runs/${run.id}/proceed`, payload: { revision: 1 } });
    expect(first.statusCode).toBe(202); expect(first.json().run.status).toBe("approved"); expect(duplicate.statusCode).toBe(202);
    const one = tasks.shift()?.(); const two = tasks.shift()?.(); await until(() => adapter.executions.length === 1);
    expect((await app.inject({ method: "GET", url: `/api/runs/${run.id}` })).json()).toMatchObject({ run: { status: "executing" }, events: expect.arrayContaining([expect.objectContaining({ type: "provider_execution_started" }), expect.objectContaining({ type: "first_provider_event" })]) });
    expect(adapter.executions).toHaveLength(1);
    adapter.execution.resolve({ summary: "Done", providerSessionId: "session-a", succeeded: true }); await Promise.all([one, two]);
    expect(adapter.executions).toHaveLength(1); expect(runner.validationCalls).toBe(1);
  });

  it("reuses an unchanged fingerprint and invalidates it for dirty content and a changed HEAD", async () => {
    const repo = repository(); const database = openDatabase(join(repo, "..", "jarvis.db")); databases.push(database);
    const projects = new ProjectRepository(database); projects.create({ id: "project", name: "Project", objective: "Plan", repository_path: repo, provider: "codex" });
    class ImmediateAdapter extends DelayedAdapter { override async inspect(input: InspectionRequest): Promise<unknown> { this.inspections.push(input); return proposal(input.proposalRevision); } }
    const adapter = new ImmediateAdapter(); const runs = new RunRepository(database); const planning = new PlanningService(projects, runs, new AgentAdapterRegistry([adapter]), new NodeProcessRunner());
    const first = await planning.inspect("project", "Inspect"); await planning.modify(first.id, 1, "Narrow");
    expect(adapter.inspections[1].repositoryCacheHit).toBe(true);
    writeFileSync(join(repo, "math.js"), "export const add = (a, b) => a + b + 0;\n"); await planning.modify(first.id, 2, "Revise");
    expect(adapter.inspections[2].repositoryCacheHit).toBe(false);
    spawnSync("git", ["add", "."], { cwd: repo }); spawnSync("git", ["commit", "-m", "change"], { cwd: repo }); await planning.modify(first.id, 3, "Again");
    expect(adapter.inspections[3].repositoryCacheHit).toBe(false);
  });

  it("marks abandoned work interrupted without automatically rerunning it", () => {
    const repo = repository(); const path = join(repo, "..", "jarvis.db"); const database = openDatabase(path); databases.push(database);
    new ProjectRepository(database).create({ id: "project", name: "Project", objective: "Plan", repository_path: repo, provider: "codex" });
    const runs = new RunRepository(database); const run = runs.createInspection("project", "codex", "Inspect");
    expect(runs.interruptActiveRuns()).toBe(1); expect(runs.require(run.id)).toMatchObject({ status: "failed", failure: { category: "interrupted" } });
    expect(runs.events(run.id).at(-1)?.type).toBe("operation_interrupted");
  });
});
