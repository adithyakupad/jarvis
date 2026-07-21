import { randomUUID } from "node:crypto";

import type { JarvisDatabase } from "../database/connection.js";
import {
  PlanProposalSchema,
  RunSchema,
  type PlanProposal,
  type Run,
} from "../../shared/runs.js";
import type { ProviderId } from "../../shared/projects.js";

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
    failure: parseJson(row.result_json),
    created_at: row.created_at,
    completed_at: row.completed_at,
  });
}

export class RunRepository {
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

  approve(runId: string, revision: number): Run {
    return this.database.transaction(() => {
      const run = this.require(runId);
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
      if (run.status === "cancelled") return run;
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
  }
}
