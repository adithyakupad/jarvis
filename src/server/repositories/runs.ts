import { randomUUID } from "node:crypto";

import type { JarvisDatabase } from "../database/connection.js";
import {
  PlanProposalSchema,
  RunSchema,
  type PlanProposal,
  type Run,
} from "../../shared/runs.js";
import type { ProviderId } from "../../shared/projects.js";
import { ContextPacketSchema, type ContextPacket } from "../../shared/context.js";

interface RunRow {
  id: string;
  project_id: string;
  provider: string;
  provider_session_id: string | null;
  instruction: string;
  proposal_json: string | null;
  proposal_revision: number;
  approved_proposal_revision: number | null;
  approval_decision: string | null;
  status: string;
  result_json: string | null;
  created_at: string;
  completed_at: string | null;
  context_json: string | null;
  verification_json: string | null;
  pre_snapshot_json: string | null;
  post_snapshot_json: string | null;
}

interface ProposalEventRow {
  payload_json: string;
}

export class RunNotFoundError extends Error {}
export class InvalidRunTransitionError extends Error {}
export class StaleProposalRevisionError extends Error {}

export type RunClock = () => Date;
export type RunIdFactory = () => string;

function parseJson(value: string | null): unknown | null {
  return value === null ? null : JSON.parse(value);
}

function toRun(row: RunRow): Run {
  return RunSchema.parse({
    id: row.id,
    project_id: row.project_id,
    provider: row.provider,
    provider_session_id: row.provider_session_id,
    instruction: row.instruction,
    proposal: parseJson(row.proposal_json),
    proposal_revision: row.proposal_revision,
    approved_proposal_revision: row.approved_proposal_revision,
    approval_decision: row.approval_decision,
    status: row.status,
    failure: row.status === "failed" ? parseJson(row.result_json) : null,
    execution_result: row.status === "failed" ? null : parseJson(row.result_json),
    verification: parseJson(row.verification_json),
    pre_execution_snapshot: parseJson(row.pre_snapshot_json),
    post_execution_snapshot: parseJson(row.post_snapshot_json),
    context_packet: row.context_json === null ? null : ContextPacketSchema.parse(JSON.parse(row.context_json)),
    created_at: row.created_at,
    completed_at: row.completed_at,
  });
}

export class RunRepository {
  private readonly eventListeners = new Map<string, Set<(event: import("../../shared/runs.js").RunEvent) => void>>();
  constructor(
    private readonly database: JarvisDatabase,
    private readonly clock: RunClock = () => new Date(),
    private readonly idFactory: RunIdFactory = randomUUID,
  ) {}

  createInspection(
    projectId: string,
    provider: ProviderId,
    instruction: string,
  ): Run {
    const id = this.idFactory();
    const createdAt = this.clock().toISOString();
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO runs (
            id, project_id, provider, provider_session_id, instruction,
            proposal_json, proposal_revision, approved_proposal_revision,
            approval_decision, status, result_json, verification_json,
            created_at, started_at, completed_at
          ) VALUES (?, ?, ?, NULL, ?, NULL, 0, NULL, NULL, 'inspecting', NULL, NULL, ?, NULL, NULL)`,
        )
        .run(id, projectId, provider, instruction.trim(), createdAt);
      this.appendEvent(id, "inspection_started", { instruction }, createdAt);
    })();
    return this.require(id);
  }

  get(runId: string): Run | null {
    const row = this.database
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(runId) as RunRow | undefined;
    return row === undefined ? null : toRun(row);
  }

  latestForProject(projectId: string): Run | null {
    const row = this.database
      .prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(projectId) as RunRow | undefined;
    return row === undefined ? null : toRun(row);
  }

  require(runId: string): Run {
    const run = this.get(runId);
    if (run === null) throw new RunNotFoundError(`Run '${runId}' was not found.`);
    return run;
  }

  recordProposal(runId: string, proposalInput: unknown): Run {
    const proposal = PlanProposalSchema.parse(proposalInput);
    return this.database.transaction(() => {
      const run = this.require(runId);
      if (run.status !== "inspecting" && run.status !== "awaiting_approval") {
        throw new InvalidRunTransitionError(
          `Run '${runId}' cannot accept a proposal while ${run.status}.`,
        );
      }
      const expectedRevision = run.proposal_revision + 1;
      if (proposal.revision !== expectedRevision) {
        throw new StaleProposalRevisionError(
          `Expected proposal revision ${expectedRevision}, received ${proposal.revision}.`,
        );
      }
      if (
        run.provider_session_id !== null &&
        proposal.providerSessionId !== run.provider_session_id
      ) {
        throw new InvalidRunTransitionError(
          "A modified proposal must preserve the provider session ID.",
        );
      }

      const occurredAt = this.clock().toISOString();
      this.database
        .prepare(
          `UPDATE runs
           SET proposal_json = ?, proposal_revision = ?, provider_session_id = ?,
               approval_decision = NULL, approved_proposal_revision = NULL,
               status = 'awaiting_approval'
           WHERE id = ?`,
        )
        .run(
          JSON.stringify(proposal),
          proposal.revision,
          proposal.providerSessionId,
          runId,
        );
      this.appendEvent(
        runId,
        proposal.revision === 1 ? "proposal_created" : "proposal_modified",
        proposal,
        occurredAt,
      );
      return this.require(runId);
    })();
  }

  recordContext(runId: string, currentRevision: number, packetInput: unknown): Run {
    const packet = ContextPacketSchema.parse(packetInput);
    return this.database.transaction(() => {
      const run = this.require(runId);
      if (run.status !== "awaiting_approval") {
        throw new InvalidRunTransitionError(`Run '${runId}' cannot accept context while ${run.status}.`);
      }
      if (currentRevision !== run.proposal_revision) {
        throw new StaleProposalRevisionError(`Proposal revision ${currentRevision} is stale; current revision is ${run.proposal_revision}.`);
      }
      const occurredAt = this.clock().toISOString();
      this.database.prepare("UPDATE runs SET context_json = ?, status = 'inspecting' WHERE id = ?")
        .run(JSON.stringify(packet), runId);
      this.appendEvent(runId, "context_attached", packet, occurredAt);
      return this.require(runId);
    })();
  }

  approve(runId: string, revision: number): Run {
    return this.database.transaction(() => {
      const run = this.require(runId);
      if (run.approval_decision === "proceed" && run.approved_proposal_revision === revision && run.proposal_revision === revision && ["approved", "preparing_execution", "executing", "verifying", "completed", "failed"].includes(run.status)) return run;
      if (run.status !== "awaiting_approval") {
        throw new InvalidRunTransitionError(
          `Run '${runId}' cannot be approved while ${run.status}.`,
        );
      }
      if (revision !== run.proposal_revision) {
        throw new StaleProposalRevisionError(
          `Proposal revision ${revision} is stale; current revision is ${run.proposal_revision}.`,
        );
      }
      const occurredAt = this.clock().toISOString();
      this.database
        .prepare(
          `UPDATE runs
           SET approval_decision = 'proceed', approved_proposal_revision = ?, status = 'approved'
           WHERE id = ?`,
        )
        .run(revision, runId);
      this.appendEvent(runId, "proposal_approved", { revision }, occurredAt);
      return this.require(runId);
    })();
  }

  cancel(runId: string): Run {
    return this.database.transaction(() => {
      const run = this.require(runId);
      if (run.status === "cancelled" || run.status === "cancelled_before_execution") return run;
      if (["preparing_execution", "executing", "verifying", "completed"].includes(run.status)) throw new InvalidRunTransitionError("Execution has started and this provider does not support reliable cancellation.");
      if (run.status === "failed") {
        throw new InvalidRunTransitionError(`Run '${runId}' already failed.`);
      }
      const occurredAt = this.clock().toISOString();
      this.database
        .prepare(
          `UPDATE runs
           SET approval_decision = 'cancel', approved_proposal_revision = NULL,
               status = 'cancelled', completed_at = ?
           WHERE id = ?`,
        )
        .run(occurredAt, runId);
      this.appendEvent(runId, "run_cancelled", {}, occurredAt);
      return this.require(runId);
    })();
  }

  failInspection(runId: string, error: unknown): Run {
    return this.database.transaction(() => {
      const run = this.require(runId);
      if (run.status !== "inspecting" && run.status !== "awaiting_approval") {
        throw new InvalidRunTransitionError(`Run '${runId}' cannot fail while ${run.status}.`);
      }
      const occurredAt = this.clock().toISOString();
      const failure = {
        message: error instanceof Error ? error.message : "Malformed provider proposal.",
      };
      this.database
        .prepare(
          `UPDATE runs SET status = 'failed', result_json = ?, completed_at = ? WHERE id = ?`,
        )
        .run(JSON.stringify(failure), occurredAt, runId);
      this.appendEvent(runId, "inspection_failed", failure, occurredAt);
      return this.require(runId);
    })();
  }

  proposalRevisions(runId: string): PlanProposal[] {
    this.require(runId);
    const rows = this.database
      .prepare(
        `SELECT payload_json FROM run_events
         WHERE run_id = ? AND type IN ('proposal_created', 'proposal_modified')
         ORDER BY sequence`,
      )
      .all(runId) as ProposalEventRow[];
    return rows.map((row) => PlanProposalSchema.parse(JSON.parse(row.payload_json)));
  }

  prepareExecution(runId: string, snapshot: unknown): Run {
    return this.database.transaction(() => {
      const run = this.require(runId);
      if (run.status === "preparing_execution" || run.status === "executing" || run.status === "verifying" || run.status === "completed") return run;
      if (run.status !== "approved" || run.approved_proposal_revision !== run.proposal_revision || !run.proposal) throw new InvalidRunTransitionError(`Run '${runId}' does not have an executable current approval.`);
      const at = this.clock().toISOString();
      this.database.prepare("UPDATE runs SET status='preparing_execution', pre_snapshot_json=?, started_at=? WHERE id=?").run(JSON.stringify(snapshot), at, runId);
      this.appendEvent(runId, "execution_started", { revision: run.approved_proposal_revision }, at);
      return this.require(runId);
    })();
  }

  setExecutionState(runId: string, status: "executing" | "verifying"): Run {
    this.database.prepare("UPDATE runs SET status=? WHERE id=?").run(status, runId);
    return this.require(runId);
  }

  recordExecutionEvent(runId: string, type: string, payload: unknown, occurredAt = this.clock().toISOString()): void { this.appendEvent(runId, type, payload, occurredAt); }

  completeExecution(runId: string, result: unknown, verification: unknown, snapshot: unknown, providerSessionId: string | null): Run {
    const at = this.clock().toISOString();
    this.database.prepare("UPDATE runs SET status='completed', result_json=?, verification_json=?, post_snapshot_json=?, provider_session_id=?, completed_at=? WHERE id=?")
      .run(JSON.stringify(result), JSON.stringify(verification), JSON.stringify(snapshot), providerSessionId, at, runId);
    this.appendEvent(runId, "execution_completed", result, at);
    return this.require(runId);
  }

  failExecution(runId: string, error: unknown, snapshot?: unknown, verification?: unknown): Run {
    const at = this.clock().toISOString();
    const failure = { message: error instanceof Error ? error.message : "Execution failed." };
    this.database.prepare("UPDATE runs SET status='failed', result_json=?, post_snapshot_json=COALESCE(?, post_snapshot_json), verification_json=COALESCE(?, verification_json), completed_at=? WHERE id=?")
      .run(JSON.stringify(failure), snapshot === undefined ? null : JSON.stringify(snapshot), verification === undefined ? null : JSON.stringify(verification), at, runId);
    this.appendEvent(runId, "execution_failed", failure, at);
    return this.require(runId);
  }

  events(runId: string): import("../../shared/runs.js").RunEvent[] {
    this.require(runId);
    return (this.database.prepare("SELECT sequence, type, payload_json, occurred_at FROM run_events WHERE run_id=? ORDER BY sequence").all(runId) as Array<{sequence:number;type:string;payload_json:string;occurred_at:string}>).map((row) => ({ sequence: row.sequence, type: row.type, payload: JSON.parse(row.payload_json), occurredAt: row.occurred_at }));
  }

  subscribe(runId: string, listener: (event: import("../../shared/runs.js").RunEvent) => void): () => void {
    this.require(runId);
    const listeners = this.eventListeners.get(runId) ?? new Set(); listeners.add(listener); this.eventListeners.set(runId, listeners);
    return () => { listeners.delete(listener); if (!listeners.size) this.eventListeners.delete(runId); };
  }

  private appendEvent(
    runId: string,
    type: string,
    payload: unknown,
    occurredAt: string,
  ): void {
    const sequence = (
      this.database
        .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM run_events WHERE run_id = ?")
        .get(runId) as { sequence: number }
    ).sequence;
    this.database
      .prepare(
        `INSERT INTO run_events (run_id, sequence, type, payload_json, occurred_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(runId, sequence, type, JSON.stringify(payload), occurredAt);
    const event = { sequence, type, payload, occurredAt };
    this.eventListeners.get(runId)?.forEach((listener) => listener(event));
  }
}
