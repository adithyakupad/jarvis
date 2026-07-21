# Gate 2.5 integration

The browser now uses the local Node API, SQLite, and authenticated Codex planning by default.

## Runtime flow

The Vite client calls `/api`; its development proxy forwards requests to the Fastify server on `127.0.0.1:3000`. The server validates all parameters and bodies with Zod, canonicalizes the selected repository path, and invokes Codex through the provider-neutral `AgentAdapter` contract. Codex starts or resumes a thread with a read-only sandbox, disabled network access, and no approval prompts. Its structured response is validated as a `PlanProposal` before persistence.

The browser remembers the selected project ID. Reloading retrieves that project and its latest persisted run and proposal history from SQLite.

## Boundary

Proceed seals approval to the exact current proposal revision. No provider execution method is called, no commands or tests are run, and no execution or verification events are generated. Execution, SSE, provider cancellation, verification, and reconciliation remain Gate 3 work.

Claude Code is detected for setup visibility but is not registered for planning in this gate. Selecting it returns an explicit unavailable-provider response.

## Development

Run `npm run dev:api` and `npm run dev` in separate terminals. Use `VITE_JARVIS_DATA_MODE=mock npm run dev` only when an explicit deterministic UI demonstration is desired. Real mode never falls back to it.

To confirm real Codex planning, use an existing SQLite project whose repository path is valid, confirm Codex is authenticated in Setup, submit a repository-specific instruction, and verify that the resulting proposal references actual repository files and includes a persisted session ID.
