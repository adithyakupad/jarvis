# JARVIS v0.1 Roadmap

## Gate 1 — Foundation

- [x] Approve TypeScript architecture and migration plan
- [x] Align product documentation and MK 42 example
- [x] Add TypeScript build and test setup
- [x] Add SQLite migrations
- [x] Create and retrieve projects
- [x] Preserve state across restarts
- [x] Define shared provider contract
- [x] Detect Codex and Claude Code installations
- [x] Run tests and commit the gate

## Gate 2 — Planning and approval

- [x] Read-only inspection
- [x] Structured proposal
- [x] Proceed
- [x] Revise plan and proposal revision
- [x] Cancel
- [x] Deterministic fake-adapter tests
- [x] Run tests and commit the gate

## Gate 3 — Live Codex execution

- [x] Codex SDK execution
- [x] Normalized run events
- [x] SSE event streaming
- [x] Reliable pre-execution cancellation boundary
- [x] Verification
- [x] Project reconciliation and append-only log
- [x] Run tests and commit the gate

## Gate 2.5 — Real planning interface integration

- [x] Loopback Fastify API over Gate 2 services
- [x] Read-only authenticated Codex SDK planning and session resumption
- [x] SQLite-backed React client with reload restoration
- [x] Real Revise plan, Proceed, and Cancel lifecycle
- [x] Explicit Gate 3 execution boundary
- [x] Deterministic API and HTTP-client coverage

## Gate 2.6 — Reliable hydration and planning context

- [x] Explicit idempotent client hydration
- [x] Atomic selected-project and active-run restoration
- [x] Persistent Context Packet migration and API
- [x] Same-run, same-session context-aware replanning
- [x] User-supplied context UI and refresh restoration
- [x] Provenance boundaries for claims, repository findings, and unresolved questions

## Gate 4 — Claude Code

- [x] Constrained `stream-json` subprocess
- [x] Session persistence and resumption
- [x] Permission handling without bypass flags
- [x] Adapter conformance tests
- [ ] Run tests and commit the gate

## Gate 5 — Interface and parity

- [ ] Setup view
- [ ] Projects view
- [ ] Project workspace
- [ ] Run details
- [ ] Fresh-clone README verification
- [ ] TypeScript parity confirmation
- [ ] Remove superseded Python only after acceptance passes
- [ ] Release acceptance test

## Later

- v0.2: Ollama provider
- v0.3: Whisper push-to-talk input
- v0.4: Original spoken output
- v0.5: School module
- v0.6: Research module
- v0.7: Content module
- v0.8: Makerspace module
