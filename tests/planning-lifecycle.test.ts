import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type JarvisDatabase } from "../src/server/database/connection.js";
import { AgentAdapterRegistry } from "../src/server/providers/registry.js";
import { ProjectRepository } from "../src/server/repositories/projects.js";
import {
  InvalidRunTransitionError,
  RunRepository,
  StaleProposalRevisionError,
} from "../src/server/repositories/runs.js";
import {
  PlanningInspectionError,
  PlanningService,
} from "../src/server/services/planning.js";
import type {
  AgentAdapter,
  AgentEventHandler,
  ExecutionRequest,
  ExecutionResult,
  InspectionRequest,
  ProviderAvailability,
} from "../src/shared/providers.js";
import type { PlanProposal } from "../src/shared/runs.js";

const FIXED_TIME = new Date("2026-07-21T13:00:00.000Z");
const databases: JarvisDatabase[] = [];

function proposal(revision: number, sessionId = "session-mk42"): PlanProposal {
  return {
    objective: "Prepare the MK 42 armor systems for validation",
    currentState: "Project persistence is operational; armor inspection is pending.",
    steps: ["Inspect the armor repository", "Identify the smallest safe update"],
    expectedScope: ["src/armor/", "tests/armor/"],
    risks: ["Do not modify propulsion controls without a new approval."],
    completionTest: "The proposed checks pass without changing files during inspection.",
    revision,
    providerSessionId: sessionId,
  };
}

class FakeAdapter implements AgentAdapter {
  readonly id = "codex" as const;
  readonly inspectionRequests: InspectionRequest[] = [];
  executeCalls = 0;

  constructor(private readonly responses: unknown[]) {}

  async detect(): Promise<ProviderAvailability> {
    return {
      provider: "codex",
      installed: true,
      authenticated: true,
      version: "fake",
      detail: "Deterministic fake adapter",
    };
  }

  async inspect(input: InspectionRequest): Promise<unknown> {
    this.inspectionRequests.push(input);
    return this.responses.shift();
  }

  async execute(
    _input: ExecutionRequest,
    _onEvent: AgentEventHandler,
  ): Promise<ExecutionResult> {
    this.executeCalls += 1;
    throw new Error("Gate 2 must not execute projects.");
  }

  async resume(): Promise<ExecutionResult> {
    throw new Error("Gate 2 must not resume execution.");
  }

  async cancel(): Promise<void> {
    throw new Error("Gate 2 cancellation is a persisted planning transition only.");
  }
}

interface Fixture {
  databasePath: string;
  database: JarvisDatabase;
  projects: ProjectRepository;
  runs: RunRepository;
  adapter: FakeAdapter;
  planning: PlanningService;
  repositoryPath: string;
}

function fixture(responses: unknown[]): Fixture {
  const root = mkdtempSync(join(tmpdir(), "jarvis-planning-"));
  const databasePath = join(root, "jarvis.db");
  const repositoryPath = join(root, "MK-42");
  mkdirSync(repositoryPath);
  const database = openDatabase(databasePath);
  databases.push(database);
  const projects = new ProjectRepository(database, () => FIXED_TIME);
  projects.create({
    id: "mk-42",
    name: "MK 42",
    objective: "Upgrade and validate the MK 42 armor systems",
    repository_path: repositoryPath,
    provider: "codex",
  });
  const runs = new RunRepository(database, () => FIXED_TIME, () => "run-mk42");
  const adapter = new FakeAdapter(responses);
  const planning = new PlanningService(
    projects,
    runs,
    new AgentAdapterRegistry([adapter]),
  );
  return {
    databasePath,
    database,
    projects,
    runs,
    adapter,
    planning,
    repositoryPath: realpathSync.native(repositoryPath),
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    if (database.open) database.close();
  }
});

describe("Gate 2 planning lifecycle", () => {
  it("creates a read-only inspection run from a high-level instruction", async () => {
    const context = fixture([proposal(1)]);

    const run = await context.planning.inspect("mk-42", "Prepare the armor demo.");

    expect(run).toMatchObject({
      id: "run-mk42",
      project_id: "mk-42",
      provider: "codex",
      instruction: "Prepare the armor demo.",
      status: "awaiting_approval",
      proposal_revision: 1,
      provider_session_id: "session-mk42",
    });
    expect(context.adapter.inspectionRequests).toEqual([
      expect.objectContaining({
        repositoryPath: context.repositoryPath,
        readOnly: true,
        proposalRevision: 1,
      }),
    ]);
    expect(context.adapter.executeCalls).toBe(0);
  });

  it("validates and persists a structured proposal", async () => {
    const context = fixture([proposal(1)]);
    await context.planning.inspect("mk-42", "Prepare the armor demo.");

    const persisted = context.runs.require("run-mk42");
    expect(persisted.proposal).toEqual(proposal(1));
    expect(context.runs.proposalRevisions("run-mk42")).toEqual([proposal(1)]);
  });

  it("records an explicit failed run for malformed provider output", async () => {
    const context = fixture([{ objective: "Incomplete response" }]);

    const error = await context.planning
      .inspect("mk-42", "Prepare the armor demo.")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlanningInspectionError);
    expect((error as PlanningInspectionError).runId).toBe("run-mk42");
    expect(context.runs.require("run-mk42")).toMatchObject({
      status: "failed",
      proposal: null,
      proposal_revision: 0,
    });
  });

  it("modifies the same run and provider session as proposal revision 2", async () => {
    const context = fixture([proposal(1), proposal(2)]);
    await context.planning.inspect("mk-42", "Prepare the armor demo.");

    const revised = await context.planning.modify(
      "run-mk42",
      1,
      "Keep propulsion controls out of scope.",
    );

    expect(revised).toMatchObject({
      id: "run-mk42",
      proposal_revision: 2,
      provider_session_id: "session-mk42",
      status: "awaiting_approval",
    });
    expect(context.runs.proposalRevisions("run-mk42")).toEqual([
      proposal(1),
      proposal(2),
    ]);
    expect(context.adapter.inspectionRequests[1]).toMatchObject({
      readOnly: true,
      proposalRevision: 2,
      providerSessionId: "session-mk42",
      modification: "Keep propulsion controls out of scope.",
    });
  });

  it("does not approve revision 1 after revision 2 exists", async () => {
    const context = fixture([proposal(1), proposal(2)]);
    await context.planning.inspect("mk-42", "Prepare the armor demo.");
    await context.planning.modify("run-mk42", 1, "Narrow the scope.");

    expect(() => context.planning.proceed("run-mk42", 1)).toThrow(
      StaleProposalRevisionError,
    );
    expect(context.runs.require("run-mk42").status).toBe("awaiting_approval");
  });

  it("cancels planning and prevents approval or execution", async () => {
    const context = fixture([proposal(1)]);
    await context.planning.inspect("mk-42", "Prepare the armor demo.");

    const cancelled = context.planning.cancel("run-mk42");

    expect(cancelled).toMatchObject({
      status: "cancelled",
      approval_decision: "cancel",
      approved_proposal_revision: null,
    });
    expect(() => context.planning.proceed("run-mk42", 1)).toThrow(
      InvalidRunTransitionError,
    );
    expect(context.adapter.executeCalls).toBe(0);
  });

  it("proceeds by sealing approval to the exact current revision", async () => {
    const context = fixture([proposal(1)]);
    await context.planning.inspect("mk-42", "Prepare the armor demo.");

    const approved = context.planning.proceed("run-mk42", 1);

    expect(approved).toMatchObject({
      status: "approved",
      approval_decision: "proceed",
      approved_proposal_revision: 1,
      proposal_revision: 1,
    });
    expect(context.adapter.executeCalls).toBe(0);
  });

  it("preserves run state, proposal revisions, and session ID after restart", async () => {
    const context = fixture([proposal(1), proposal(2)]);
    await context.planning.inspect("mk-42", "Prepare the armor demo.");
    await context.planning.modify("run-mk42", 1, "Narrow the scope.");
    context.database.close();

    const restartedDatabase = openDatabase(context.databasePath);
    databases.push(restartedDatabase);
    const restartedRuns = new RunRepository(restartedDatabase);

    expect(restartedRuns.require("run-mk42")).toMatchObject({
      status: "awaiting_approval",
      proposal_revision: 2,
      provider_session_id: "session-mk42",
    });
    expect(restartedRuns.proposalRevisions("run-mk42")).toEqual([
      proposal(1),
      proposal(2),
    ]);
  });

  it("persists normalized context and replans in the same run and session", async () => {
    const context = fixture([proposal(1), proposal(2)]);
    await context.planning.inspect("mk-42", "Resolve the reported icing problem.");

    const revised = await context.planning.addContext("run-mk42", 1, {
      problem: "  Ice forms around the left actuator.  ",
      reproductionSteps: [" Run the thermal simulation. ", "Inspect the trace."],
      constraints: [" Keep flight controls unchanged. "],
    });

    expect(revised).toMatchObject({ id: "run-mk42", proposal_revision: 2, provider_session_id: "session-mk42", context_packet: { problem: "Ice forms around the left actuator.", reproductionSteps: ["Run the thermal simulation.", "Inspect the trace."], constraints: ["Keep flight controls unchanged."] } });
    expect(context.adapter.inspectionRequests[1]).toMatchObject({ instruction: "Resolve the reported icing problem.", proposalRevision: 2, providerSessionId: "session-mk42", contextPacket: revised.context_packet, readOnly: true });
    expect(context.runs.proposalRevisions("run-mk42")).toEqual([proposal(1), proposal(2)]);
    expect(context.adapter.executeCalls).toBe(0);
  });

  it("preserves normalized freeform context without artificial structured fields", async () => {
    const context = fixture([proposal(1), proposal(2)]);
    await context.planning.inspect("mk-42", "Resolve icing.");
    const revised = await context.planning.addContext("run-mk42", 1, { summary: "  My suit freezes at high altitude.  " });
    expect(revised.context_packet).toEqual({ summary: "My suit freezes at high altitude." });
    expect(context.adapter.inspectionRequests[1]?.contextPacket).toEqual({ summary: "My suit freezes at high altitude." });
  });

  it("keeps submitted context when provider replanning fails", async () => {
    const context = fixture([proposal(1), { objective: "malformed" }]);
    await context.planning.inspect("mk-42", "Resolve icing.");
    await expect(context.planning.addContext("run-mk42", 1, { evidence: "Temperature drops below threshold." })).rejects.toBeInstanceOf(PlanningInspectionError);
    expect(context.runs.require("run-mk42")).toMatchObject({ status: "failed", context_packet: { evidence: "Temperature drops below threshold." }, proposal_revision: 1 });
  });

  it("restores context after a database restart", async () => {
    const context = fixture([proposal(1)]);
    await context.planning.inspect("mk-42", "Resolve icing.");
    context.runs.recordContext("run-mk42", 1, { summary: "The suit freezes at high altitude." });
    context.database.close();
    const restartedDatabase = openDatabase(context.databasePath); databases.push(restartedDatabase);
    expect(new RunRepository(restartedDatabase).require("run-mk42").context_packet).toEqual({ summary: "The suit freezes at high altitude." });
  });

  it("continues reading legacy Context Packet field names", async () => {
    const context = fixture([proposal(1)]);
    await context.planning.inspect("mk-42", "Resolve icing.");
    context.runs.recordContext("run-mk42", 1, { context: "Legacy freeform context.", problem: "Legacy problem field." });
    expect(context.runs.require("run-mk42").context_packet).toEqual({ context: "Legacy freeform context.", problem: "Legacy problem field." });
  });
});
