# JARVIS

JARVIS is an open-source, local execution interface for Codex and Claude Code.

The goal is simple:

```text
Create a project
→ give JARVIS a high-level instruction
→ review the proposed plan
→ approve, modify, or cancel it
→ let the selected coding agent work
→ verify the result
→ remember what happened
```

## Current status

JARVIS v0.1 is being built in sequential, tested gates.

Gates 1, 2, and the Gate 2.5 browser integration provide:

- A TypeScript runtime.
- SQLite project persistence and migrations.
- Project creation and retrieval.
- Codex and Claude Code installation detection.
- A shared provider contract.
- Read-only inspection runs and Zod-validated structured proposals.
- Persisted proposal revisions and provider session IDs.
- Proceed, Modify, and Cancel transitions sealed to exact revisions.
- A loopback-only Fastify API and SQLite-backed React interface.
- Authenticated Codex SDK planning in a read-only repository sandbox.

The automated suite uses deterministic fake adapters. The application uses the real local API and Codex planning adapter by default. It does not execute live project changes; live Codex execution begins in Gate 3.

The earlier Python implementation remains available until the TypeScript version reaches verified parity.

## Example project

The examples use **MK 42**, one of Tony Stark's Iron Man suits, as the project:

```text
Name: MK 42
Objective: Upgrade and validate the MK 42 armor systems
Repository: /Users/example/Projects/MK-42
Provider: Codex
```

The project name is only an example. JARVIS does not include Marvel artwork, dialogue, voices, or other licensed assets.

## Requirements

- Node.js 22.12 or newer
- npm
- Codex and/or Claude Code installed for provider detection

Python 3.12 is needed only for the temporary legacy implementation during migration.

## Run Gate 1

Install dependencies and compile TypeScript:

```bash
npm install
npm run build
```

Create MK 42 in a local SQLite database:

```bash
npm run jarvis -- \
  --database ./data/jarvis.db \
  project create \
  --id mk-42 \
  --name "MK 42" \
  --objective "Upgrade and validate the MK 42 armor systems" \
  --repository-path /Users/example/Projects/MK-42 \
  --provider codex \
  --current-phase foundation \
  --next-action "Inspect the current armor systems"
```

Retrieve it in a new process:

```bash
npm run jarvis -- --database ./data/jarvis.db project get mk-42
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

Real mode detects local providers, loads projects from SQLite, asks authenticated Codex to inspect the selected repository read-only, persists proposal revisions and the Codex thread ID, and restores the latest project run after a browser reload. Modify resumes that same Codex thread. Proceed only records exact-revision approval and displays “Plan approved. Execution is not available until Gate 3.” It never edits files or fabricates execution events.

Codex planning is active when Setup reports Codex as detected and authenticated, a proposal cites details from the selected repository, and Run details shows a persisted provider session ID. Provider or server failures are shown as errors; there is no automatic mock fallback.

For explicit UI-only development with deterministic data:

```bash
VITE_JARVIS_DATA_MODE=mock npm run dev
```

Run all deterministic checks with `npm test`, `npm run typecheck`, and `npm run build`. The temporary Python baseline remains `python -m pytest` until TypeScript parity is complete.

## Planned v0.1 workflow

Later approved gates add:

1. Live Codex execution, events, cancellation, and verification.
2. Claude Code execution and session resumption.
3. Interface parity and removal of the temporary Python baseline after verification.

Ollama, Whisper, voice, calendar, email, mobile apps, embeddings, and domain modules are not part of v0.1.

## Documentation

- [Product requirements](docs/PRD.md)
- [Roadmap](docs/ROADMAP.md)
- [Design references](docs/DESIGN_REFERENCES.md)
- [Security policy](SECURITY.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
