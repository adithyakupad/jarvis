# UI Integration Requests

**Status:** Research-phase handoff; not a final contract proposal

**Constraint:** Gate 2 is being implemented concurrently. This document records UI needs without creating or changing shared types.

## 1. Confirmed from the repository

The following capabilities or records already exist in current source/docs. “Confirmed” does not imply a browser API already exists.

### Project data

`src/shared/projects.ts` currently defines:

- project identity: `id`, `name`, `objective`;
- `status`: `active | blocked | paused | completed | archived`;
- `repository_path`;
- `provider`: `codex | claude-code`;
- nullable `provider_session_id`;
- `current_phase`, `latest_result`, `current_blocker`, `next_action`;
- `created_at`, `updated_at`.

The server repository can create, get, and list projects. UI read/create endpoints or an equivalent application bridge are not yet confirmed.

### Provider availability

`src/shared/providers.ts` currently provides availability fields:

- provider id;
- installed;
- authenticated (`boolean | null`);
- version (`string | null`);
- detail.

Detection exists behind the provider layer. A UI-facing detection endpoint and retry behavior are not yet confirmed.

### Inspection and proposal shape

The provider contract currently contains:

- inspection input: project id, repository path, instruction;
- proposal: objective, current state, ordered steps, expected scope, risks, completion test, and nullable provider session id.

The PRD requires read-only inspection and structured proposals. Gate 2 is expected to establish the durable workflow around these concepts.

### Execution foundations

The provider contract currently anticipates execute, resume, event callback, result, and cancel operations. The database migration already creates `runs`, `run_events`, and `project_logs` tables with proposal revision, approval decision, status, result, verification, event sequence, and timestamps.

These are foundations, not confirmation of final Gate 2/3 behavior or UI APIs.

### Product invariants

- Four views: Setup, Projects, Project Workspace, Run Details.
- Inspect → propose → Proceed/Modify/Cancel → execute → verify → reconcile.
- Approval binds to one exact proposal revision and expected scope.
- Scope expansion requires a new proposal and approval.
- Completion requires verification evidence.
- Cancellation and partial changes must be recorded.
- Provider events must be normalized, validated, persisted, and safe for display.

## 2. Provisional assumptions

These assumptions are needed to shape the UX but must be confirmed after Gate 2/3. They are intentionally not final shared types.

### Query/read capabilities

- List projects with current status and updated time.
- Fetch one project with recent log summary and active/latest run reference.
- Fetch one run with instruction, proposal revisions, approval record, current status, result, verification, and timestamps.
- Page or incrementally fetch ordered run events by stable sequence.
- Rehydrate the current state after browser refresh/application restart.

### Command capabilities

- Create a project after server-side path validation/canonicalization.
- Trigger/retry provider detection.
- Submit an instruction for read-only inspection.
- Proceed with an explicit `run id + proposal revision` (or stronger revision token).
- Submit modification text against an explicit current revision and receive a new revision.
- Cancel before approval without starting execution.
- Request cancellation of active work and observe `cancelling` until terminal confirmation.

### State/event behavior

- Project status remains distinct from workflow/run status.
- Server responses expose a display-safe state plus timestamps and stable identities.
- Events include stable sequence, category/type, occurred-at time, and a redacted display-safe payload/message.
- Reconnect supports “events after sequence N” or an equivalent replay mechanism.
- Connection/stream failure is distinguishable from run failure.
- Unknown progress remains indeterminate; determinate progress is supplied only with meaningful current/total units.

### Evidence behavior

- Verification identifies each check, its status, summary, and optional display-safe detail.
- Reconciliation identifies actual changed files/scope and any mismatch from approved scope.
- Terminal cancellation/failure reports whether partial changes are known, absent, present, or unknown.
- Errors expose a stable category, plain-language summary, recoverability, and optional technical detail without secrets.

## 3. Decisions blocked on Gate 2

Reinspect the repository after Gate 2 is committed before component architecture is approved.

1. **Canonical planning state machine.** Exact run statuses and valid transitions for inspection, proposal generation, awaiting approval, modification, and cancellation.
2. **Proposal revision identity.** Whether integer revision is sufficient or approval requires an immutable digest/token in addition to run id and revision.
3. **Modify semantics.** Whether modification starts a new inspection, resumes a provider session, or can do either; how the previous revision is retained.
4. **Pre-execution Cancel semantics.** Whether cancellation is an approval decision, a terminal run state, or both.
5. **Concurrency/idempotency.** Behavior for double submission, stale revision approval, simultaneous modification, refresh during mutation, and more than one active run per project.
6. **Inspection progress.** Whether Gate 2 emits/persists milestones or only returns a final proposal.
7. **Failure/blocker model.** Structured categories and recovery guidance versus plain strings.
8. **API surface.** Routes/commands, validation errors, response envelopes, and whether the client talks to HTTP endpoints or another bridge.
9. **Durable project reconciliation during Gate 2.** Which project fields update after inspection/cancel and when project logs are appended.
10. **Authorization boundary for execution.** Exact server check proving execution uses the approved immutable proposal revision.

## 4. Decisions blocked on Gate 3

1. Normalized event taxonomy and display-safe payload shapes.
2. SSE endpoint, replay cursor, heartbeat, reconnect, and retention behavior.
3. Cancellation acknowledgement and terminal-state semantics.
4. Verification check/evidence schema.
5. Expected-versus-actual scope reconciliation schema.
6. Partial-change reporting for cancelled, blocked, and failed runs.
7. Provider session visibility and resumption behavior.
8. Execution/verification timing fields and whether a meaningful progress total ever exists.

## 5. Dependencies or configuration needed before React implementation

No package or configuration change is requested by this research phase. Before React work begins, confirm:

- Gate 2 is complete, tested, and committed; then refresh this document against its actual contracts.
- The four-view route model and browser-facing server/API boundary are approved.
- A client-consumable project list/detail and provider-detection capability exists.
- The proposal revision/approval command is concurrency-safe and rejects stale revisions with a recoverable response.
- Browser refresh can recover the active project/run without relying on client memory.
- Gate 3 contracts are either available or represented by an approved deterministic UI fixture boundary for states not yet implemented.
- Display-safe redaction occurs before event/error content reaches or is persisted for the UI.
- Dates are returned in an unambiguous machine format and formatted in the user's locale/time zone by the client.
- Accessibility and motion acceptance tests are included in the UI gate plan; exact tooling can be selected during component-architecture approval.
- Any new UI dependency is reviewed for license, maintenance, bundle impact, and whether native React/CSS is sufficient.

## 6. Requested contract qualities (not requested types)

When Gate 2/3 contracts are finalized, the UI needs them to be:

- **explicit:** project, run, proposal revision, and event identities are never inferred from screen state;
- **monotonic where possible:** event sequence and durable transitions allow replay and reconciliation;
- **idempotent:** repeated approval/cancel submissions cannot broaden scope or duplicate work;
- **honest:** accepted, requested, running, cancelling, cancelled, verifying, and completed are distinguishable;
- **evidence-bearing:** completion includes verification, not a success boolean alone;
- **display-safe:** untrusted provider/repository output is structured, redacted, and rendered as text;
- **recoverable:** errors say whether retry, modify, reconfigure, or user intervention is appropriate;
- **provider-neutral:** client behavior does not branch on Codex/Claude-specific telemetry except in optional disclosed detail.

## 7. Integration acceptance questions

Before React implementation is approved, the core and UI work should be able to answer:

1. What exact persisted response restores each visible state after refresh?
2. What immutable value is submitted when the user clicks Proceed?
3. How does the server reject approval of an outdated revision?
4. What event confirms that cancellation has actually completed?
5. How can the UI distinguish a disconnected event stream from failed execution?
6. Which evidence permits the UI to render `completed`?
7. How are partial changes represented after cancellation or failure?
8. Which content is guaranteed redacted and safe to present?
9. How does the UI retrieve missed events without duplication or reordering?
10. Which state transitions require user action, and which occur automatically?
