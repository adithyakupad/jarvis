# Gate 3 — Approved-plan execution

Proceed first seals the exact current proposal revision, then asks the server to execute that persisted proposal. The execution endpoint accepts an empty body: repository paths, instructions, scope, context, provider sessions, and validation commands are loaded from JARVIS state and cannot be replaced by browser input. Repeated approval or execution requests return the existing run and never start a second provider call.

Codex runs in the canonical project directory with `workspace-write`, approval policy `never`, networking disabled, and no additional writable directories. Claude Code runs through the local authenticated `claude` executable with argument-array spawning, noninteractive JSON output, `acceptEdits`, and a read/edit-only tool allowlist. Planning uses Claude's read-only plan mode. Neither adapter uses permission-bypass flags or cross-provider fallback.

JARVIS records a pre-execution snapshot before allowing writes and a post-execution snapshot before reconciliation. Each includes canonical path, Git status, branch, HEAD, dirty-file fingerprints, and time. Files already dirty before execution remain identified as pre-existing; if their contents change during the execution window, attribution is `ambiguous`. JARVIS never resets, cleans, stashes, commits, pushes, or discards repository state, and a changed HEAD fails verification without attempting an automatic repair.

Provider telemetry is normalized into durable `run_events`. `/api/runs/:runId/events/stream` replays prior events and streams new ones through SSE; `/api/runs/:runId/events` and ordinary run reads remain the refresh/recovery source of truth.

After provider execution, JARVIS independently detects a real `package.json` test script and selects npm, pnpm, Yarn, or Bun from repository lockfiles. The server supplies the canonical repository path and fixed `test` argument, invokes the executable without a shell, applies a timeout, and persists exit code, duration, and bounded output. Browser and provider-authored commands are never accepted. Test failure is recorded separately from provider execution and does not discard edits. Unsupported repositories explicitly report that automated validation was unavailable.

Provider failures retain pre/post snapshots, normalized events, partial repository changes, and available validation evidence. Active Codex execution cancellation is not advertised because the current SDK adapter does not offer a run-scoped cancellation guarantee; Cancel remains available only before execution starts.
