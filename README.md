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
- Exact-revision Codex and Claude Code execution, pre/post repository snapshots, normalized event streaming, independent package-test validation, and project reconciliation.
- Prompt HTTP acknowledgement, persisted live progress, local timing diagnostics, provider-session continuity, and conservative repository-inspection reuse.

The automated suite uses deterministic fake adapters. In real mode, Proceed seals the current proposal revision and executes it through the selected local provider. There is no cross-provider or mock fallback.

## Provider status

- Codex: implemented and live-tested
- Claude Code: implemented, but not yet live-tested in the current alpha environment

JARVIS never silently switches providers. If the selected provider is unavailable,
the run fails explicitly rather than falling back to another provider.

The earlier Python implementation remains available until the TypeScript version reaches verified parity.

## First run

A fresh production database contains no sample projects. Open Setup, choose **Add an existing project**, paste an absolute repository path, describe what you are building, and select an installed provider. JARVIS canonicalizes and validates the path on the local server, performs a concise read-only inspection of known project files, saves the project, and opens its workspace. The repository does not need to be clean.

The browser cannot reliably provide a local server with an absolute folder path, so the developer alpha uses pasted paths. Native directory selection is planned for a future desktop wrapper.

## Requirements

- Node.js 22.12 or newer
- npm
- Codex CLI installed and authenticated with `codex login`, and/or Claude Code installed and authenticated with `claude auth login`

Python 3.12 is needed only for the temporary legacy implementation during migration.

## Install and start the local alpha

Install dependencies and compile TypeScript:

```bash
npm install
npm run jarvis
```

Open the single URL printed by JARVIS (normally `http://127.0.0.1:4173`). The command builds the production React application and serves it with `/api/*` from one Fastify process and one loopback origin; it does not rely on the Vite development proxy. State is stored in `data/jarvis.db` by default. To isolate it:

```bash
JARVIS_DATA_DIR=/absolute/path/to/isolated-state npm run jarvis
```

The launcher creates `jarvis.instance.lock` inside the resolved data directory. A second invocation with the same compatible running instance prints its existing URL and exits successfully instead of starting duplicate servers. Dead locks are removed, malformed locks are preserved with a diagnostic suffix, and orderly Ctrl+C or SIGTERM shutdown removes only the lock owned by that process. JARVIS never kills a conflicting process automatically.

The browser checks `/api/health` before loading projects or enabling actions. The frontend and backend share an API schema constant and build identity. A missing health route or incompatible response blocks the UI with restart instructions, preventing a newly built browser from sending onboarding requests to an old API.

Detect installed providers:

```bash
npm run build
npm run cli -- provider detect
```

Run the Gate 1 checks:

```bash
npm test
npm run typecheck
```

## Development mode

Install dependencies, then start the API and browser development server in two terminals:

```bash
npm install
npm run dev:api
```

```bash
npm run dev
```

Open `http://127.0.0.1:4173`. The API binds only to `127.0.0.1:3000`, uses `data/jarvis.db` by default, and the Vite server proxies `/api` requests to it. Set `JARVIS_DATABASE_PATH` before `npm run dev:api` to use another database.

SQLite and all JARVIS-owned project/run state live in that database. For an isolated installation or smoke test, use `JARVIS_DATABASE_PATH=/absolute/path/to/isolated/jarvis.db npm run dev:api`. Remove one project through **Edit project settings → Remove project**; this deletes only its JARVIS record and history. To remove all JARVIS state, stop JARVIS and delete the configured database or isolated data directory. Neither operation deletes a connected repository.

Real mode detects local providers, loads projects from SQLite, and asks the selected provider to inspect the repository read-only. Codex uses the official SDK; Claude Code uses the authenticated local `claude` executable in noninteractive JSON mode. Both persist proposal revisions and provider session IDs. Proceed approves and executes only that persisted revision inside the canonical repository. Codex uses repository-scoped workspace-write sandboxing with networking disabled. Claude uses `acceptEdits` with only read and file-edit tools; it never uses `--dangerously-skip-permissions`.

Before execution JARVIS persists branch, HEAD, Git status, dirty-file fingerprints, and the canonical path. After execution it captures the same evidence, labels newly dirty files as execution-window changes, and labels changed pre-existing dirty files as ambiguous. It never resets, cleans, stashes, commits, pushes, or discards work. A changed HEAD is treated as an execution failure.

After edits, JARVIS independently detects a supported `package.json` test script and invokes the selected package manager without a shell. The command is derived entirely from server-inspected repository state, has a timeout, and persists exit status, duration, and bounded output. Provider completion text alone is not treated as verification.

Execution events are written to SQLite before display. The SSE endpoint streams live normalized activity, while ordinary run and event GET routes restore the durable history after refresh. Failures retain snapshots, prior events, partial changes, and verification evidence for recovery.

Planning and Proceed requests return an HTTP `202` after JARVIS persists the accepted transition. The provider operation continues asynchronously in the local server process, and the existing SSE stream updates the workspace from real persisted stages. The UI shows elapsed time from server timestamps without invented percentages. Typical latency depends on repository size and the selected provider; JARVIS does not promise a fixed response time.

Planning revisions and context replans reuse the persisted provider session only for the same project and provider. A small inspection fingerprint combines the canonical path, Git HEAD, porcelain status, and the contents of visible dirty or untracked files. An unchanged fingerprint permits prior inspection findings to be reused; HEAD changes, dirty-content changes, and untracked changes invalidate it. Non-Git repositories conservatively skip reuse. Fresh pre/post execution evidence and post-edit validation detection are never cached.

Timing diagnostics are derived from persisted local events and are never sent to an external telemetry service. If JARVIS restarts while in-process planning, queued execution, provider execution, or validation is active, the run is marked interrupted. It is never automatically rerun; repository evidence and working-tree changes remain available for review.

Client initialization is explicit and idempotent: constructors do not launch network work, React starts one tracked initialization, and the UI remains in a hydration state until the selected project and its persisted run have been applied. Refreshing a project workspace therefore cannot treat `activeRun: null` as ready state before restoration finishes.

Use **Revise plan** to correct, narrow, or redirect the existing proposal. Use **Add Context and Replan** when relevant facts are external to the repository. The normal interaction is one freeform `summary` sentence under “What should JARVIS know?” Structured expected/actual behavior, reproduction steps, evidence, and constraints appear only when the planner says the context remains insufficient and asks one focused follow-up question. JARVIS combines user context with general model knowledge, then inspects the repository to confirm actual implementation facts. User claims, model inferences, repository findings, and unresolved questions remain explicitly separate. JARVIS persists the normalized packet before replanning in the same run and session; provider failure leaves it stored for auditing.

Gate 2.6 does not perform live web research. A provider-neutral `ResearchAdapter` boundary is reserved for future cited evidence, but no adapter is registered and Codex planning remains network-disabled.

A provider is selectable only when Setup reports it installed and authenticated. A grounded proposal must cite the selected repository, and Run details shows the selected provider and persisted session ID. Provider or server failures are shown honestly; selecting Claude never substitutes Codex, and selecting Codex never substitutes Claude.

For explicit UI-only development with deterministic data:

```bash
VITE_JARVIS_DATA_MODE=mock npm run dev
```

This is the only built-in demo path; production mode never seeds MK 42 or silently falls back to mock data.

Run all deterministic checks with `npm test`, `npm run typecheck`, and `npm run build`. The temporary Python baseline remains `python -m pytest` until TypeScript parity is complete.

## Disposable execution smoke test

Create two temporary Git repositories with tiny implementation files and initial commits. Add one with Codex and one with Claude Code through onboarding using isolated state. Ask each to add a `multiply` function without committing or pushing. Review the exact scope, Proceed, refresh, and confirm the selected provider/session, completed or failed status, changed paths, and provider summary restore. Verify `git status` contains only expected uncommitted changes and `git log -1` is still the initial commit. Never use an important repository as the first write target.

## Independent validation

After a provider finishes editing a JavaScript or TypeScript repository, JARVIS automatically runs a real, non-placeholder `test` script from `package.json`. It selects npm, pnpm, Yarn, or Bun from the repository lockfile and runs the tests locally inside the selected repository. Unsupported repository types and projects without a supported test script report that automated validation was not run.

Independent JARVIS validation remains authoritative. Providers are asked not to repeat the same full suite solely as final confirmation, although they may run targeted checks needed while implementing. Provider-reported checks remain activity evidence and never replace the single independent validation run.

Test scripts are repository code and may perform arbitrary project behavior. Onboard only repositories you trust. JARVIS does not automatically commit or push provider edits or validation results.

## Alpha limitations

JARVIS is a local developer alpha: no voice, web research, remote execution, desktop packaging, background jobs, automatic commits, pushes, or reliable mid-execution cancellation. Codex and Claude expose different raw telemetry; JARVIS persists a smaller normalized event set. Independent validation currently supports JavaScript and TypeScript `package.json` test scripts only.

## Troubleshooting

### A different JARVIS version is already running

Stop the old JARVIS terminal with Ctrl+C, run `npm run jarvis` again, and reload the browser. If the old terminal cannot be found, use the PID printed by JARVIS to identify and stop that specific stale process. Do not kill unrelated processes blindly.

If port 4173 belongs to another application, JARVIS refuses to start and reports the conflict; it never silently moves to another port or terminates the owner. Stop or reconfigure the application occupying the port, then retry.

If a repository cannot be added, confirm that the pasted path exists on the same computer as the JARVIS server, resolves to a directory, and is readable by your user. JARVIS reports missing, non-directory, and unreadable paths separately and retains server-side canonicalization. A Git working tree may be dirty; onboarding does not alter it.

The default data directory is `data/` under the JARVIS checkout. Override it with an absolute `JARVIS_DATA_DIR` for isolated installations or tests. Removing JARVIS state or a project record never removes repository files.

## Planned v0.1 workflow

Later approved gates add interface parity, packaging, and removal of the temporary Python baseline after verification.

Ollama, Whisper, voice, calendar, email, mobile apps, embeddings, and domain modules are not part of v0.1.

## Documentation

- [Product requirements](docs/PRD.md)
- [Roadmap](docs/ROADMAP.md)
- [Design references](docs/DESIGN_REFERENCES.md)
- [Security policy](SECURITY.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
