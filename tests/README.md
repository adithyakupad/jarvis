# Tests

JARVIS v0.1 uses Vitest for the TypeScript implementation. Each delivery gate adds deterministic tests and must pass before it is committed.

The temporary Python persistence tests remain until Gate 5 confirms TypeScript parity.

Gate 1 proves:

- schema migration from the existing Python-era project table;
- project creation and retrieval;
- persistence across database reconnection;
- validation and duplicate-ID behavior; and
- deterministic Codex and Claude Code detection.

Gate 2 proves:

- instructions create read-only inspection runs;
- structured proposals are validated before persistence;
- malformed output produces an explicit failed run;
- modifications preserve the run and provider session while adding revisions;
- stale proposal revisions cannot be approved;
- Proceed seals approval to the exact current revision;
- Cancel prevents approval and execution; and
- runs, proposal history, and provider sessions survive restart.

Gate 2.5 additionally proves:

- provider and SQLite project data cross the loopback API boundary;
- API bodies and parameters reject invalid input explicitly;
- HTTP Modify, Proceed, and Cancel preserve Gate 2 lifecycle guarantees;
- the real HTTP client restores persisted state and never falls back to mock data; and
- Proceed remains approval-only and emits no fabricated execution evidence.

Gate 2.6 proves that hydration is single-attempt and explicit, selected runs are restored before the workspace is ready, and initialization failures remain visible. It also validates summary-only and structured Context Packet normalization, legacy packet compatibility, persistence across restart, provider-failure retention, same-session replanning, focused model follow-up questions, general-knowledge versus repository provenance boundaries, API conflicts, and browser-client restoration.
