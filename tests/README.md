# Tests

JARVIS v0.1 uses Vitest for the TypeScript implementation. Each delivery gate adds deterministic tests and must pass before it is committed.

The temporary Python persistence tests remain until Gate 5 confirms TypeScript parity.

Gate 1 proves:

- schema migration from the existing Python-era project table;
- project creation and retrieval;
- persistence across database reconnection;
- validation and duplicate-ID behavior; and
- deterministic Codex and Claude Code detection.
