import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type JarvisDatabase } from "../src/server/database/connection.js";
import { buildApi } from "../src/server/http/app.js";
import { AgentAdapterRegistry } from "../src/server/providers/registry.js";
import type { ProcessRunner } from "../src/server/providers/process-runner.js";
import type { AgentAdapter, AgentEventHandler, ExecutionRequest, ExecutionResult, InspectionRequest, ProviderAvailability } from "../src/shared/providers.js";
import type { PlanProposal } from "../src/shared/runs.js";

const databases: JarvisDatabase[] = [];
const apps: Array<ReturnType<typeof buildApi>> = [];

function proposal(revision: number): PlanProposal {
  return { objective: "Understand validation", currentState: "Tests exist but their entry point is unclear.", steps: ["Inspect validation scripts", "Document the smallest safe clarity change"], expectedScope: ["package.json", "README.md"], risks: ["Planning only; no files change."], completionTest: "The proposal cites repository validation details.", revision, providerSessionId: "thread-real" };
}

class FakeAdapter implements AgentAdapter {
  readonly id = "codex" as const;
  readonly requests: InspectionRequest[] = [];
  executeCalls = 0;
  constructor(private readonly responses: unknown[]) {}
  async detect(): Promise<ProviderAvailability> { return { provider: "codex", installed: true, authenticated: true, version: "test", detail: "Ready" }; }
  async inspect(input: InspectionRequest): Promise<unknown> { this.requests.push(input); return this.responses.shift(); }
  async execute(_input: ExecutionRequest, _handler: AgentEventHandler): Promise<ExecutionResult> { this.executeCalls += 1; throw new Error("must not execute"); }
  async resume(): Promise<ExecutionResult> { throw new Error("must not execute"); }
  async cancel(): Promise<void> { throw new Error("must not execute"); }
}

const processRunner: ProcessRunner = { async run(executable, args) {
  if (args[0] === "--version") return { exitCode: executable === "codex" ? 0 : 1, stdout: executable === "codex" ? "codex 1.0" : "", stderr: "" };
  return { exitCode: 0, stdout: "Logged in", stderr: "" };
} };

function fixture(responses: unknown[] = [proposal(1), proposal(2)]) {
  const root = mkdtempSync(join(tmpdir(), "jarvis-api-"));
  const repositoryPath = join(root, "repo"); mkdirSync(repositoryPath);
  const database = openDatabase(join(root, "jarvis.db")); databases.push(database);
  const adapter = new FakeAdapter(responses);
  const app = buildApi({ database, adapters: new AgentAdapterRegistry([adapter]), processRunner }); apps.push(app);
  return { app, adapter, repositoryPath };
}

async function createProject(context: ReturnType<typeof fixture>): Promise<void> {
  const response = await context.app.inject({ method: "POST", url: "/api/projects", payload: { id: "mk-42", name: "MK 42", objective: "Validate armor", repository_path: context.repositoryPath, provider: "codex" } });
  expect(response.statusCode).toBe(201);
}

afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const database of databases.splice(0)) if (database.open) database.close(); });

describe("Gate 2.5 HTTP API", () => {
  it("returns provider status and projects from SQLite", async () => {
    const context = fixture(); await createProject(context);
    expect((await context.app.inject({ method: "GET", url: "/api/setup/providers" })).json().providers[0]).toMatchObject({ provider: "codex", installed: true, authenticated: true });
    expect((await context.app.inject({ method: "GET", url: "/api/projects" })).json().projects).toEqual([expect.objectContaining({ id: "mk-42" })]);
  });

  it("creates a persisted proposal, modifies the same session, and rejects stale approval", async () => {
    const context = fixture(); await createProject(context);
    const created = await context.app.inject({ method: "POST", url: "/api/projects/mk-42/instructions", payload: { instruction: "Inspect validation." } });
    expect(created.statusCode).toBe(201); expect(created.json().run).toMatchObject({ status: "awaiting_approval", proposal_revision: 1, provider_session_id: "thread-real" });
    const runId = created.json().run.id as string;
    const modified = await context.app.inject({ method: "POST", url: `/api/runs/${runId}/modify`, payload: { currentRevision: 1, modification: "Narrow scope." } });
    expect(modified.json()).toMatchObject({ run: { id: runId, proposal_revision: 2, provider_session_id: "thread-real" }, revisions: [{ revision: 1 }, { revision: 2 }] });
    expect(context.adapter.requests[1]).toMatchObject({ providerSessionId: "thread-real", proposalRevision: 2, readOnly: true });
    expect((await context.app.inject({ method: "POST", url: `/api/runs/${runId}/proceed`, payload: { revision: 1 } })).statusCode).toBe(409);
    const approved = await context.app.inject({ method: "POST", url: `/api/runs/${runId}/proceed`, payload: { revision: 2 } });
    expect(approved.json().run).toMatchObject({ status: "approved", approved_proposal_revision: 2 });
    expect(context.adapter.executeCalls).toBe(0);
  });

  it("validates input and makes cancellation idempotent while preventing approval", async () => {
    const context = fixture(); await createProject(context);
    expect((await context.app.inject({ method: "POST", url: "/api/projects/mk-42/instructions", payload: { instruction: "" } })).statusCode).toBe(400);
    const created = await context.app.inject({ method: "POST", url: "/api/projects/mk-42/instructions", payload: { instruction: "Inspect." } });
    const runId = created.json().run.id as string;
    expect((await context.app.inject({ method: "POST", url: `/api/runs/${runId}/cancel`, payload: {} })).json().run.status).toBe("cancelled");
    expect((await context.app.inject({ method: "POST", url: `/api/runs/${runId}/cancel`, payload: {} })).statusCode).toBe(200);
    expect((await context.app.inject({ method: "POST", url: `/api/runs/${runId}/proceed`, payload: { revision: 1 } })).statusCode).toBe(409);
  });

  it("returns persisted run state through project and run reads", async () => {
    const context = fixture(); await createProject(context);
    const created = await context.app.inject({ method: "POST", url: "/api/projects/mk-42/instructions", payload: { instruction: "Inspect." } });
    const runId = created.json().run.id as string;
    expect((await context.app.inject({ method: "GET", url: `/api/projects/mk-42` })).json().activeRun.run.id).toBe(runId);
    expect((await context.app.inject({ method: "GET", url: `/api/runs/${runId}` })).json().run.proposal.objective).toBe("Understand validation");
  });

  it("validates context, replans, and returns the persisted packet", async () => {
    const context = fixture(); await createProject(context);
    const created = await context.app.inject({ method: "POST", url: "/api/projects/mk-42/instructions", payload: { instruction: "Resolve icing." } });
    const runId = created.json().run.id as string;
    expect((await context.app.inject({ method: "POST", url: `/api/runs/${runId}/context`, payload: { currentRevision: 1 } })).statusCode).toBe(400);
    expect((await context.app.inject({ method: "POST", url: `/api/runs/${runId}/context`, payload: { currentRevision: 1, reproductionSteps: ["   "] } })).statusCode).toBe(400);
    const replanned = await context.app.inject({ method: "POST", url: `/api/runs/${runId}/context`, payload: { currentRevision: 1, problem: "  Shoulder icing. ", evidence: " Temperature trace drops. " } });
    expect(replanned.statusCode).toBe(200);
    expect(replanned.json()).toMatchObject({ run: { id: runId, provider_session_id: "thread-real", proposal_revision: 2, context_packet: { problem: "Shoulder icing.", evidence: "Temperature trace drops." } }, contextPacket: { problem: "Shoulder icing." }, currentProposal: { revision: 2 }, revisions: [{ revision: 1 }, { revision: 2 }] });
    expect(context.adapter.requests[1]).toMatchObject({ instruction: "Resolve icing.", contextPacket: { problem: "Shoulder icing.", evidence: "Temperature trace drops." } });
  });

  it("accepts and preserves a freeform-only context sentence", async () => {
    const context = fixture(); await createProject(context);
    const created = await context.app.inject({ method: "POST", url: "/api/projects/mk-42/instructions", payload: { instruction: "Resolve icing." } });
    const runId = created.json().run.id as string;
    const replanned = await context.app.inject({ method: "POST", url: `/api/runs/${runId}/context`, payload: { currentRevision: 1, context: "  My suit starts freezing at high altitudes when I fly.  " } });
    expect(replanned.statusCode).toBe(200);
    expect(replanned.json().contextPacket).toEqual({ context: "My suit starts freezing at high altitudes when I fly." });
  });

  it("rejects unknown, cancelled, and stale context operations", async () => {
    const context = fixture(); await createProject(context);
    expect((await context.app.inject({ method: "POST", url: "/api/runs/missing/context", payload: { currentRevision: 1, problem: "Icing" } })).statusCode).toBe(404);
    const created = await context.app.inject({ method: "POST", url: "/api/projects/mk-42/instructions", payload: { instruction: "Resolve icing." } });
    const runId = created.json().run.id as string;
    expect((await context.app.inject({ method: "POST", url: `/api/runs/${runId}/context`, payload: { currentRevision: 2, problem: "Icing" } })).statusCode).toBe(409);
    await context.app.inject({ method: "POST", url: `/api/runs/${runId}/cancel`, payload: {} });
    expect((await context.app.inject({ method: "POST", url: `/api/runs/${runId}/context`, payload: { currentRevision: 1, problem: "Icing" } })).statusCode).toBe(409);
  });
});
