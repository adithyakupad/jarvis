# Gate 3 — Approved-plan execution

Proceed first seals the exact current proposal revision, then asks the server to execute that persisted proposal. The execution endpoint accepts an empty body: repository paths, instructions, scope, context, provider sessions, and validation commands are loaded from JARVIS state and cannot be replaced by browser input. Repeated approval or execution requests return the existing run and never start a second provider call.

Codex runs in the canonical project directory with `workspace-write`, approval policy `never`, networking disabled, and no additional writable directories. The provider receives the original instruction, approved proposal and revision, Context Packet, project profile, and allowed scope. JARVIS does not use permission-bypass flags. Claude Code execution is deferred to Gate 4.

JARVIS records a pre-execution snapshot before allowing writes and a post-execution snapshot before reconciliation. Each includes canonical path, Git status, branch, HEAD, dirty-file fingerprints, and time. Files already dirty before execution remain identified as pre-existing; if their contents change during the execution window, attribution is `ambiguous`. JARVIS never resets, cleans, stashes, commits, pushes, or discards repository state, and a changed HEAD fails verification without attempting an automatic repair.

Provider telemetry is normalized into durable `run_events`. `/api/runs/:runId/events/stream` replays prior events and streams new ones through SSE; `/api/runs/:runId/events` and ordinary run reads remain the refresh/recovery source of truth.

Validation commands must be present in the exact approved proposal. JARVIS rejects shell metacharacters and unknown executables, invokes known tools with argument arrays and no shell, applies a timeout, and persists exit code, duration, and truncated output. A required command failure prevents completion. With no approved command, verification explicitly reports that automated validation was unavailable.

Provider failures retain pre/post snapshots, normalized events, partial repository changes, and available validation evidence. Active Codex execution cancellation is not advertised because the current SDK adapter does not offer a run-scoped cancellation guarantee; Cancel remains available only before execution starts.
