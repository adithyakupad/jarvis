# AGENTS.md

## Mission

Build JARVIS v0.1 as a fresh, provider-neutral, text-first execution interface for Codex and Claude Code.

## Source of truth

Read these documents before changing product behavior:

1. `docs/PRD.md`
2. `README.md`
3. `docs/ROADMAP.md`
4. `docs/DESIGN_REFERENCES.md`

## Current phase

Approved gated implementation. Complete, verify, and commit one gate before beginning the next.

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

## Implementation gates

1. TypeScript, SQLite project persistence, provider contract, and detection
2. Inspection, proposals, Proceed/Modify/Cancel, and fake-adapter tests
3. Live Codex execution, events, SSE, cancellation, verification, and reconciliation
4. Claude Code execution, resumption, permissions, and conformance tests
5. Four-view interface, fresh-clone verification, parity, and Python removal

## Engineering standards

- TypeScript end to end for v0.1
- Node.js 22.12+
- Type annotations for public functions
- Zod validation at process and API boundaries
- SQLite initially
- Tests for persistence and state transitions
- Deterministic fake providers for workflow tests
- Never use dangerous provider permission-bypass flags
- Keep Python runnable until TypeScript parity is verified
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
