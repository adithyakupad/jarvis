# JARVIS v0.1 Product Requirements Document

**Status:** Approved for gated implementation
**Owner:** Adithya Upadhyayula
**Last updated:** 2026-07-21

## 1. Product

JARVIS v0.1 is a local, text-first execution interface for Codex and Claude Code. It owns project state, asks a selected coding agent to inspect a repository, presents the resulting plan for approval, executes only after approval, verifies the result, and records what happened.

```text
Create or select project
→ give high-level instruction
→ inspect repository
→ propose plan
→ approve, revise, or cancel
→ execute with selected provider
→ verify result
→ update project and append activity log
```

## 2. Target user

A technical builder who already uses Codex or Claude Code and wants a persistent interface across projects and provider sessions.

## 3. v0.1 success condition

A fresh user can clone the repository, install dependencies, launch JARVIS, detect an existing Codex or Claude Code installation, create a project, receive a project-aware plan, approve it, observe execution, review verification evidence, restart JARVIS, and see the updated project status and activity history.

## 4. Technology decisions

- TypeScript end to end
- React and Vite frontend
- Node.js TypeScript backend
- SQLite persistence
- Zod validation
- Official `@openai/codex-sdk` for Codex
- Constrained Claude Code subprocess with `stream-json`
- Vitest testing
- npm scripts for packaging and operation
- Node.js 22.12 or newer for the selected SQLite and Vite versions

The TypeScript Codex SDK is the v0.1 integration. Direct Codex app-server integration is deferred. The Python implementation remains until TypeScript parity is verified, then is removed.

## 5. Core records

### Project

- `id`
- `name`
- `objective`
- `status`
- `repository_path`
- `provider`
- `provider_session_id`
- `current_phase`
- `latest_result`
- `current_blocker`
- `next_action`
- `created_at`
- `updated_at`

### Run

- Project and provider
- User instruction
- Structured proposal and revision
- Approval decision
- Provider session ID
- Run status
- Structured result and verification
- Created, started, and completed timestamps

### Run event

Normalized, ordered provider telemetry such as status, command, file, message, approval, and error events.

### Project log

An append-only durable record of meaningful project changes and verified results.

## 6. Provider contract

All providers implement detection, inspection, execution, resumption, and cancellation behind one interface. Provider-specific events are validated and normalized before persistence or display.

Codex is the first fully working live provider. Claude Code follows after the Codex execution gate passes.

## 7. Planning and approval

Inspection is read-only. A structured proposal must contain:

- Objective interpretation
- Current state
- Steps
- Expected scope
- Risks or unresolved decisions
- Completion test

The user may Proceed, Revise plan, or Cancel. Approval binds to one exact proposal revision. Scope expansion requires a new proposal and approval.

## 8. Execution and verification

Approved work runs with the least provider permissions required. JARVIS records normalized events, supports cancellation, collects the actual changed files and check results, and never reports success without verification evidence.

After verification, JARVIS updates project status, latest result, blocker, next action, provider session ID, and the append-only project log.

## 9. Interface

Only four views are required:

- Setup
- Projects
- Project workspace
- Run details

The design is a restrained, original cinematic command center: dark surfaces, blue-white presence, thin typography, and clear listening, planning, working, warning, and completed states. It must not copy Marvel assets, actor voices, or dialogue.

## 10. Example project

Documentation and fixtures use:

```text
Name: MK 42
Objective: Upgrade and validate the MK 42 armor systems
Repository: /Users/example/Projects/MK-42
Provider: Codex
```

MK 42 is used as a thematic reference to Tony Stark's suit. No protected visual or audio assets are included.

## 11. Security boundaries

- Bind the application server to loopback.
- Canonicalize repository paths.
- Keep inspection read-only.
- Seal approval to an exact proposal revision and expected scope.
- Spawn known provider binaries with argument arrays, never shell-built commands.
- Never use dangerous permission-bypass flags.
- Preserve pre-existing user changes.
- Treat repository content and provider output as untrusted.
- Validate provider responses with Zod.
- Redact secrets from persistence and streamed UI events.
- Record cancellation and partial changes.

## 12. Delivery gates

1. Documentation, TypeScript foundation, SQLite project persistence, provider contract, and detection.
2. Inspection, structured proposals, Proceed/Revise plan/Cancel, and deterministic fake-adapter tests.
3. Live Codex execution, normalized events, SSE, cancellation, verification, and reconciliation.
4. Claude Code execution, resumption, constrained permissions, and conformance tests.
5. Four-view interface, fresh-clone verification, parity confirmation, and removal of Python.

Every gate must leave a runnable repository, pass its tests, and be committed before the next gate begins.

## 13. Non-goals

- Ollama
- Whisper or voice
- Calendar or email
- Mobile applications
- Embeddings or knowledge graphs
- School, research, content, makerspace, or editing modules
- Cloud hosting or multi-user operation
- Dangerous autonomous execution
