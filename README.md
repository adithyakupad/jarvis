# JARVIS

JARVIS is an open-source, local execution interface for Codex and Claude Code.

The goal is simple:

```text
Create a project
→ give JARVIS a high-level instruction
→ review the proposed plan
→ approve, revise, or cancel it
→ let the selected coding agent work
→ verify the result
→ remember what happened
```

## Current status

JARVIS v0.1 is being built in sequential, tested gates.

Gates 1, 2, 2.5, 2.6, 2.7, and 3 provide:

- A TypeScript runtime.
- SQLite project persistence and migrations.
- Project creation and retrieval.
- Codex and Claude Code installation detection.
- A shared provider contract.
- Read-only inspection runs and Zod-validated structured proposals.
- Persisted proposal revisions and provider session IDs.
- Proceed, Revise plan, and Cancel transitions sealed to exact revisions.
- A loopback-only Fastify API and SQLite-backed React interface.
- Authenticated Codex SDK planning in a read-only repository sandbox.
- Explicit browser hydration that restores the selected project, run, proposal revisions, and Context Packet before the workspace becomes interactive.
- Persistent user-supplied Context Packets and same-session context-aware replanning.
- First-run provider readiness, local repository validation, read-only project profiling, and persisted project settings.
- Exact-revision Codex execution, pre/post repository snapshots, normalized event streaming, approved-command verification, and project reconciliation.

The automated suite uses deterministic fake adapters. In real mode, Proceed seals the current proposal revision and executes it through the local Codex adapter. Claude Code execution remains Gate 4 work.

The earlier Python implementation remains available until the TypeScript version reaches verified parity.

## First run

A fresh production database contains no sample projects. Open Setup, choose **Add an existing project**, paste an absolute repository path, describe what you are building, and select an installed provider. JARVIS canonicalizes and validates the path on the local server, performs a concise read-only inspection of known project files, saves the project, and opens its workspace. The repository does not need to be clean.

The browser cannot reliably provide a local server with an absolute folder path, so the developer alpha uses pasted paths. Native directory selection is planned for a future desktop wrapper.

## Requirements

- Node.js 22.12 or newer
- npm
- Codex and/or Claude Code installed for provider detection

Python 3.12 is needed only for the temporary legacy implementation during migration.

## Development startup

Install dependencies and compile TypeScript:

```bash
npm install
npm run build
```

Detect installed providers:

```bash
npm run jarvis -- provider detect
```

Run the Gate 1 checks:

```bash
npm test
npm run typecheck
```

## Run the Gate 2.5 interface

Install dependencies, then start the API and browser development server in two terminals:

```bash
npm install
npm run dev:api
```

```bash
npm run dev
```

Open `http://127.0.0.1:4173`. The API binds only to `127.0.0.1:3000`, uses `data/jarvis.db` by default, and the Vite server proxies `/api` requests to it. Set `JARVIS_DATABASE_PATH` before `npm run dev:api` to use another database.

SQLite and all JARVIS-owned project/run state live in that database. For an isolated installation or smoke test, use `JARVIS_DATABASE_PATH=/absolute/path/to/isolated/jarvis.db npm run dev:api`. Removing a project deletes its JARVIS record and planning history only; it never deletes or modifies the connected repository.

Real mode detects local providers, loads projects from SQLite, asks authenticated Codex to inspect the selected repository read-only, persists proposal revisions and the Codex thread ID, and restores the latest project run after a browser reload. Revise plan resumes that same Codex thread. Proceed approves and executes only that persisted revision inside the canonical repository with workspace-write sandboxing, no network access, no elevated permissions, and no additional writable directories.

Before execution JARVIS persists branch, HEAD, Git status, dirty-file fingerprints, and the canonical path. After execution it captures the same evidence, labels newly dirty files as execution-window changes, and labels changed pre-existing dirty files as ambiguous. It never resets, cleans, stashes, commits, pushes, or discards work. A changed HEAD is treated as an execution failure.

Only validation commands embedded in the approved proposal may run. They are restricted to known validation executables, run without a shell, have timeouts, and persist exit status, duration, and truncated output. If no approved command exists, JARVIS reports that automated validation was unavailable. Provider completion text alone is not treated as verification.

Execution events are written to SQLite before display. The SSE endpoint streams live normalized activity, while ordinary run and event GET routes restore the durable history after refresh. Failures retain snapshots, prior events, partial changes, and verification evidence for recovery.

Client initialization is explicit and idempotent: constructors do not launch network work, React starts one tracked initialization, and the UI remains in a hydration state until the selected project and its persisted run have been applied. Refreshing a project workspace therefore cannot treat `activeRun: null` as ready state before restoration finishes.

Use **Revise plan** to correct, narrow, or redirect the existing proposal. Use **Add Context and Replan** when relevant facts are external to the repository. The normal interaction is one freeform `summary` sentence under “What should JARVIS know?” Structured expected/actual behavior, reproduction steps, evidence, and constraints appear only when the planner says the context remains insufficient and asks one focused follow-up question. JARVIS combines user context with general model knowledge, then inspects the repository to confirm actual implementation facts. User claims, model inferences, repository findings, and unresolved questions remain explicitly separate. JARVIS persists the normalized packet before replanning in the same run and session; provider failure leaves it stored for auditing.

Gate 2.6 does not perform live web research. A provider-neutral `ResearchAdapter` boundary is reserved for future cited evidence, but no adapter is registered and Codex planning remains network-disabled.

Codex planning is active when Setup reports Codex as detected and authenticated, a proposal cites details from the selected repository, and Run details shows a persisted provider session ID. Provider or server failures are shown as errors; there is no automatic mock fallback.

For explicit UI-only development with deterministic data:

```bash
VITE_JARVIS_DATA_MODE=mock npm run dev
```

This is the only built-in demo path; production mode never seeds MK 42 or silently falls back to mock data.

Run all deterministic checks with `npm test`, `npm run typecheck`, and `npm run build`. The temporary Python baseline remains `python -m pytest` until TypeScript parity is complete.

## Disposable execution smoke test

Create a temporary Git repository with a tiny implementation and deterministic test, make an initial clean commit, and add its canonical path through onboarding using an isolated `JARVIS_DATABASE_PATH`. Ask for one narrowly scoped function and test, review that the proposal names only the disposable files and an exact validation command, then Proceed. Confirm the completed run and events restore after refresh, `git status` shows only the expected uncommitted changes, and `git log -1` is still the initial commit. Never use an important repository as the first write target.

## Planned v0.1 workflow

Later approved gates add:

1. Claude Code execution and session resumption.
2. Interface parity and removal of the temporary Python baseline after verification.

Ollama, Whisper, voice, calendar, email, mobile apps, embeddings, and domain modules are not part of v0.1.

## Documentation

- [Product requirements](docs/PRD.md)
- [Roadmap](docs/ROADMAP.md)
- [Design references](docs/DESIGN_REFERENCES.md)
- [Security policy](SECURITY.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
