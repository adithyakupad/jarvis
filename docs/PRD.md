# JARVIS v1 Product Requirements Document

**Status:** Draft v0.1  
**Owner:** Adithya Upadhyayula  
**Last updated:** 2026-07-20

## 1. Product summary

JARVIS is an open-source personal execution layer for Codex and Claude Code. It maintains persistent project context, interprets high-level instructions, inspects current state, proposes an execution plan, executes after approval, verifies the result, and updates the project record automatically.

## 2. Vision

Enable a user to work with AI agents the way Tony Stark works with JARVIS: communicate the desired outcome in natural shorthand, review the proposed approach, approve it, and allow the system to coordinate detailed execution while maintaining continuity.

## 3. Core promise

> Tell JARVIS what outcome you want. It determines what must happen, shows you its plan, executes after approval, verifies the result, and remembers where everything stands.

## 4. Problem

Current AI coding workflows are fragmented across chats, terminals, repositories, and providers. Users repeatedly have to reconstruct context, identify where work stopped, monitor execution, transfer information between tools, record what changed, and determine the next action.

Codex and Claude Code can execute substantial technical work, but they do not independently provide one durable, provider-neutral model of the user’s projects and activity.

## 5. Target user

The initial user:

- Already uses Codex or Claude Code
- Is comfortable with Git, repositories, and terminal workflows
- Works across multiple projects
- Wants persistent project continuity
- Is willing to approve AI-generated execution plans
- Values an MCU-inspired command-center experience

## 6. Product principles

1. **Intent over instructions** — the user states the outcome, not every implementation step.
2. **Plan before action** — meaningful work requires a concise execution proposal.
3. **Approve scope, not every tool call** — approved execution envelopes permit autonomous work within clear boundaries.
4. **Verify reality** — JARVIS must inspect outputs, tests, or files before claiming success.
5. **Update state automatically** — completed work updates project status, logs, blockers, and next action.
6. **One continuous identity** — Codex and Claude Code are execution engines, not separate assistants.
7. **Quiet visibility** — progress is observable without flooding the user.
8. **Fresh architecture** — borrow primitives, not complete products.

## 7. Core workflow

```text
User gives high-level instruction
→ JARVIS resolves active project and intent
→ JARVIS inspects repository and stored state
→ JARVIS proposes interpretation, plan, scope, risks, and completion test
→ user approves, modifies, or cancels
→ JARVIS creates an execution envelope
→ Codex or Claude Code performs the work
→ JARVIS monitors progress
→ JARVIS verifies the actual result
→ JARVIS updates project state and append-only logs
→ JARVIS reports completion concisely
```

## 8. Primary user stories

### 8.1 Continue a project

As a user, I can say “Jarvis, continue Forge,” and JARVIS identifies the project, loads its state and agent session, reconciles it with the repository, and proposes the next coherent action.

### 8.2 Execute meaningful work

As a user, I can give a high-level objective, review a concise plan, approve it once, and allow JARVIS to execute within the approved scope.

### 8.3 Understand status

As a user, I can ask what was completed, what is blocked, and what should happen next, and receive an answer grounded in recorded events and verified outputs.

### 8.4 Resume after interruption

As a user, I can restart JARVIS and resume a project without restating its complete background.

## 9. Functional requirements

### 9.1 Projects

Each project must store:

- ID
- Name
- Objective
- Status
- Current phase
- Repository or folder path
- Preferred agent provider
- Agent session ID
- Latest result
- Current blocker
- Next action
- Created and updated timestamps

### 9.2 Logs

JARVIS must maintain append-only activity logs containing:

- Timestamp
- Project
- Category
- User instruction
- Proposed plan
- Approval decision
- Agent action
- Result
- Files changed
- Verification result
- State changes
- Next action

### 9.3 Context builder

Before invoking an agent, JARVIS must select only the relevant:

- User standing preferences
- Active project state
- Recent decisions
- Current blocker
- Recent relevant logs
- Current task
- Tool and permission constraints

### 9.4 Agent adapters

JARVIS must support a common adapter interface for:

- Codex
- Claude Code

The common operations are:

- Start session
- Resume session
- Run task
- Stream status
- Cancel task
- Return structured result

### 9.5 Plan approval

For meaningful work, JARVIS must present:

- Objective interpretation
- Current state
- Proposed plan
- Expected changes
- Risks or decisions
- Completion test

The user can:

- Proceed
- Modify the plan
- Cancel

### 9.6 Execution envelope

An approved plan creates a bounded scope defining:

- Approved project
- Approved directories
- Allowed actions
- Prohibited actions
- Escalation conditions

### 9.7 Verification

JARVIS must not claim completion until it verifies the result using relevant evidence such as:

- Tests
- Build output
- Git diff
- Generated files
- Structured tool response

### 9.8 Reconciliation

After execution, JARVIS must update:

- Project status
- Latest result
- Current blocker
- Next action
- Agent session ID
- Activity log

## 10. Interface requirements

The v1 interface should be opinionated and MCU-inspired, with:

- One central presence visualization
- Listening, thinking, planning, awaiting approval, working, warning, and completed states
- Current project
- Current action
- Concise proposed plan
- Proceed / Modify / Cancel controls
- Quiet progress display
- Completion summary
- Expandable technical details

The visual design must be original and must not bundle Marvel assets or actor voice clones.

## 11. Personality requirements

JARVIS should communicate with:

- Calm technical precision
- Brief responses
- Restrained formality
- Mild dry wit used sparingly
- Respectful disagreement when risk or contradiction is detected
- No excessive enthusiasm or customer-service filler

## 12. Autonomy model

### Direct answer

Questions and status requests are answered immediately.

### Small reversible action

Low-risk actions such as appending a log may occur immediately and be reported afterward.

### Planned execution

Meaningful implementation work requires a proposal and approval before execution.

JARVIS must pause when:

- Scope must materially expand
- Access outside the project is required
- Credentials are required
- Important files may be deleted
- Software installation is required
- Deployment, publication, submission, or purchase is requested
- A consequential product decision is unresolved

## 13. MVP scope

Included:

- Local, single-user project state
- Append-only project activity logs
- Codex adapter
- Claude Code adapter
- Project session persistence
- Context builder
- Proposal and approval workflow
- Execution envelopes
- Progress tracking
- Verification
- Automatic reconciliation
- Basic MCU-inspired desktop interface

## 14. Non-goals

Not included in v1:

- ChatGPT Projects synchronization
- Claude Projects synchronization
- Local language models
- Mobile clients
- Smart-home control
- Calendar and email automation
- Camera or gesture input
- Wake word
- Multi-user support
- Cloud hosting
- Plugin marketplace
- Full health coaching
- Complex vector or graph memory

## 15. Success criteria

The MVP succeeds when a user can:

1. Create a JARVIS project and attach a repository.
2. Select Codex or Claude Code.
3. Give a high-level instruction.
4. Review and approve a plan.
5. Allow execution within a bounded scope.
6. See meaningful progress.
7. Receive a verified completion report.
8. Restart JARVIS.
9. Resume the project without restating context.
10. Ask what happened and receive an answer from recorded events.

## 16. Acceptance scenario

**User:** “Jarvis, continue Forge.”

Expected behavior:

1. JARVIS resolves Forge.
2. Loads the repository, stored project state, recent logs, and agent session.
3. Inspects the actual repository state.
4. Reconciles discrepancies.
5. Proposes the smallest coherent next action.
6. Waits for approval.
7. Executes through the selected agent.
8. Verifies changes.
9. Updates Forge status and logs.
10. Reports completion and the next action.

## 17. Open decisions

- Final public product and repository name
- Desktop framework
- Exact Codex integration path
- Exact Claude Code integration path
- Storage schema
- Streaming event format
- Voice provider and whether voice enters v1 or v1.1
