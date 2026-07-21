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

Gate 1 provides:

- A TypeScript runtime.
- SQLite project persistence and migrations.
- Project creation and retrieval.
- Codex and Claude Code installation detection.
- A shared provider contract for later execution gates.

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

## Planned v0.1 workflow

Later approved gates add:

1. Inspection and structured plans.
2. Proceed, Modify, and Cancel controls.
3. Live Codex execution, events, cancellation, and verification.
4. Claude Code execution and session resumption.
5. A small four-view interface.

Ollama, Whisper, voice, calendar, email, mobile apps, embeddings, and domain modules are not part of v0.1.

## Documentation

- [Product requirements](docs/PRD.md)
- [Roadmap](docs/ROADMAP.md)
- [Design references](docs/DESIGN_REFERENCES.md)
- [Security policy](SECURITY.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
