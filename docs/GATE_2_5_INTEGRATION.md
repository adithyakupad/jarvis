# Gate 2.5 integration

The browser now uses the local Node API, SQLite, and authenticated Codex planning by default.

## Runtime flow

The Vite client calls `/api`; its development proxy forwards requests to the Fastify server on `127.0.0.1:3000`. The server validates all parameters and bodies with Zod, canonicalizes the selected repository path, and invokes Codex through the provider-neutral `AgentAdapter` contract. Codex starts or resumes a thread with a read-only sandbox, disabled network access, and no approval prompts. Its structured response is validated as a `PlanProposal` before persistence.

The browser remembers the selected project ID. Reloading retrieves that project and its latest persisted run and proposal history from SQLite.

As of Gate 2.6, hydration is an explicit tracked lifecycle. The HTTP client constructor performs no asynchronous work. React calls one idempotent initializer, repeated development-lifecycle calls share its promise, and the UI distinguishes not initialized, hydrating, ready, and failed states. Selected-project loading atomically applies the project ID and active run before the workspace becomes interactive.

## Context Packets

A Context Packet stores external facts that repository inspection cannot establish. Its primary optional field is freeform `context`; structured `problem`, `expectedBehavior`, `actualBehavior`, `reproductionSteps`, `evidence`, and `constraints` remain compatible and optional. At least one normalized non-empty field is required. Packets are associated with a planning run and restored through both run reads and project `activeRun` restoration.

The UI asks “What should JARVIS know?” and accepts one sentence by default. The planner first assesses whether that sentence adequately identifies the problem. Only when it returns `needs_more_context` does the UI retain the form, display its single focused follow-up question, and offer the collapsed “Add more details” fields. This avoids forcing users to manufacture structured facts while keeping structured packets and audit history intact.

**Modify** corrects or redirects a proposal. **Add Context and Replan** supplies missing symptoms, evidence, reproduction details, or constraints. Context is persisted before provider replanning, so a provider failure does not erase it. Replanning remains read-only, preserves the run and provider session, and creates the next proposal revision while retaining earlier revisions.

Provider prompts delimit user-supplied context and require the proposal to distinguish it from repository-confirmed findings and unresolved assumptions. A user claim is not treated as a repository fact merely because it appears in a Context Packet.

## Boundary

Proceed seals approval to the exact current proposal revision. No provider execution method is called, no commands or tests are run, and no execution or verification events are generated. Execution, SSE, provider cancellation, verification, and reconciliation remain Gate 3 work.

Claude Code is detected for setup visibility but is not registered for planning in this gate. Selecting it returns an explicit unavailable-provider response.

## Development

Run `npm run dev:api` and `npm run dev` in separate terminals. Use `VITE_JARVIS_DATA_MODE=mock npm run dev` only when an explicit deterministic UI demonstration is desired. Real mode never falls back to it.

To confirm real Codex planning, use an existing SQLite project whose repository path is valid, confirm Codex is authenticated in Setup, submit a repository-specific instruction, and verify that the resulting proposal references actual repository files and includes a persisted session ID.
