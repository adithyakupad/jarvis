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
