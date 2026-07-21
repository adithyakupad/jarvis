# JARVIS

An open-source personal execution layer for Codex and Claude Code.

JARVIS maintains persistent project context, interprets high-level instructions, inspects the current state of the user’s work, proposes an execution plan, operates after approval, verifies the result, and updates the project record automatically.

## Core interaction

```text
High-level instruction
→ inspect context and current state
→ propose a plan
→ user approves or modifies
→ execute with Codex or Claude Code
→ verify the result
→ update project state and logs
→ report completion
```

## Example

**User**

> Jarvis, get persistent project memory working.

**JARVIS**

> You want project context to survive application restarts and be retrieved automatically when that project becomes active.
>
> Proposed approach:
> 1. Add SQLite-backed project storage.
> 2. Associate memories with project IDs.
> 3. Add project-scoped retrieval.
> 4. Add restart-persistence tests.
> 5. Verify the flow and update the project log.
>
> Expected scope: `app/projects/`, `app/memory/`, and persistence tests. No interface changes.
>
> Proceed?

## v1 target user

Technical AI-native builders who already use Codex or Claude Code and want one persistent, MCU-inspired command layer across their projects.

## v1 scope

- JARVIS-owned projects
- Persistent project status
- Append-only activity logs
- Context packets for Codex and Claude Code
- Plan → approval → execution workflow
- Bounded execution permissions
- Verification and project-state reconciliation
- One opinionated MCU-inspired desktop interface

## Not in v1

- ChatGPT Projects synchronization
- Claude Projects synchronization
- Local model inference
- Mobile apps
- Smart-home control
- Calendar and email automation
- Wake-word detection
- Multi-user hosting
- Plugin marketplace

## Repository status

**Phase:** product definition and architecture.

The current source of truth is [`docs/PRD.md`](docs/PRD.md).

## Development order

1. Product requirements
2. Technical architecture
3. Project and log persistence
4. Agent adapters
5. Plan approval workflow
6. Verification and reconciliation
7. MCU-inspired interface
8. Voice

## Open-source principles

- Fresh architecture; no renamed JARVIS clone
- Existing libraries used as declared dependencies
- Directly adapted code attributed in `docs/DESIGN_REFERENCES.md`
- User-owned, inspectable project state and logs
- Provider-neutral core

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
