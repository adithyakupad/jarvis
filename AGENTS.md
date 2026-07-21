# AGENTS.md

## Mission

Build JARVIS as a fresh, provider-neutral personal execution layer above Codex and Claude Code.

## Source of truth

Read these documents before changing product behavior:

1. `docs/PRD.md`
2. `README.md`
3. `docs/ROADMAP.md`
4. `docs/DESIGN_REFERENCES.md`

## Current phase

Product definition and repository setup. Do not implement major features until the PRD is explicitly approved.

## Product rules

- Do not clone or reproduce another JARVIS repository.
- Use established libraries as dependencies rather than copying code.
- Attribute directly adapted code in `docs/DESIGN_REFERENCES.md` and `THIRD_PARTY_NOTICES.md`.
- Keep the core provider-neutral.
- Codex and Claude Code are execution adapters, not the source of project truth.
- Store canonical project state and logs inside JARVIS.
- Meaningful execution follows: inspect → propose → approve → execute → verify → reconcile.
- Never claim completion without verification evidence.
- Never silently expand an approved execution scope.

## Initial implementation order

1. Project and activity-log data models
2. SQLite persistence
3. Deterministic project CRUD and restart persistence
4. Context builder
5. Agent adapter protocol
6. Codex adapter
7. Claude Code adapter
8. Proposal and approval workflow
9. Execution status and verification
10. Reconciliation
11. Interface
12. Voice

## Engineering standards

- Python 3.12+
- Type annotations for public functions
- Pydantic models at API boundaries
- SQLite initially
- Tests for persistence and state transitions
- No credentials in source control
- No destructive filesystem operations without explicit approval
- Prefer small vertical slices over broad scaffolding

## Before coding

For every slice:

1. State the objective.
2. Inspect the current repository.
3. Propose affected files and acceptance tests.
4. Wait for user approval.
5. Implement only the approved scope.
6. Run relevant tests.
7. Summarize actual changes and unresolved issues.
