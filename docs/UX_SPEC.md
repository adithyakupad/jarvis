# JARVIS Core v0.1 UX Specification

**Status:** Initial specification; interface implementation is not yet authorized

**Research basis:** `docs/UI_RESEARCH.md`

**Product basis:** `docs/PRD.md`

## 1. Experience intent

JARVIS Core is a restrained, text-first execution environment. It should feel intelligent because it preserves context, surfaces the right object at the right time, explains state changes, and never overstates certainty. It is not an Iron Man HUD replica.

The primary desktop model is **context → active object → supporting evidence**. The active object changes by state: setup task, selected project, instruction, proposal revision, running operation, blocker, or verification result.

## 2. Global visual hierarchy

### Persistent shell

1. **Application landmark:** JARVIS Core name and global state, visually quiet.
2. **Primary navigation:** Setup, Projects, and current project; Run Details is reached from a project/run.
3. **Active-project identity:** name, objective summary, provider, and repository identity.
4. **State sentence:** one plain-language line describing current state and required action.
5. **Active object:** the largest and most readable region.
6. **Context rail:** project facts, history, scope, or event metadata relevant to the active object.
7. **Action zone:** explicit controls adjacent to the decision they affect.

### Desktop grid

- Left context/navigation rail: 14–18rem, collapsible.
- Main active region: flexible, preferred readable width 42–60rem.
- Right contextual rail: 18–24rem when useful; absent rather than empty.
- Header/status band: compact and stable; warnings may replace its secondary content.
- Do not center all text or place controls in circular/radial arrangements.

### Urgency rule

`warning`, `blocked`, and `failed` replace low-priority secondary content near the center. Navigation and project identity remain stable. Urgent content contains: what happened, consequence, evidence/source, safest next action, and alternatives.

## 3. Four-view structure

### 3.1 Setup view

**Purpose:** establish a runnable local environment and create the first valid project.

**Center:** a short readiness sequence: runtime readiness, provider detection, then project creation. Show one current step at a time while completed steps remain summarized.

**Peripheral:** provider version/authentication detail, local-only/privacy note, requirements, and troubleshooting.

**Primary actions:** retry detection; choose an available provider; create project. Provider cards must say installed/authenticated/unknown in text.

**Validation:** repository path and required fields validate on blur and submit. Errors remain adjacent to inputs and are summarized at the form heading. Project creation does not imply provider execution.

**Exit:** successful project creation navigates to its Project Workspace with focus on the workspace heading.

### 3.2 Projects view

**Purpose:** find the right project and understand its current situation at a glance.

**Center:** project list ordered by recent meaningful activity, with search/filter only if needed by actual scale.

**Each project row/card:** name, objective excerpt, project status, current phase, next action, provider, and last-updated time. `current_blocker` replaces objective excerpt when blocked. Status is text plus a restrained marker, never color alone.

**Peripheral:** aggregate counts and setup/provider health only when actionable.

**Primary actions:** open project; create project. Archival or destructive management is outside this initial spec unless supported later.

### 3.3 Project Workspace view

**Purpose:** orient to one project and move safely through inspect, plan, approval, execution, and result.

**Center by state:**

- idle/completed/cancelled/failed: instruction composer or next-action/result card.
- inspecting: inspection activity and repository identity.
- planning/modifying: proposal-generation status or modification input.
- awaiting approval: exact proposal revision and decision controls.
- approved/working/cancelling/verifying: current run summary with a path to Run Details.
- warning/blocked: issue and recovery object.

**Left context:** project identity, objective, repository, provider, current phase.

**Right context:** recent project log, latest result, blocker, or proposal scope—only the context relevant to the center.

**Instruction composer:** plain multiline input with a clear “Inspect and propose” action. Explain that inspection is read-only. Preserve draft text on recoverable errors.

### 3.4 Run Details view

**Purpose:** provide the durable, auditable account of one run.

**Center:** state summary followed by the active run object:

- proposal and approval record before execution;
- current normalized event during work;
- verification summary and evidence after execution.

**Supporting regions:** chronological event log; expected versus actual scope; changed files; checks; provider/session metadata; timestamps; errors and partial-change notices.

**Primary action:** state-dependent—Proceed/Modify/Cancel before work, Cancel during cancellable work, then return to project/retry/recover after a terminal state.

**Event log behavior:** append without stealing focus or forcing scroll. If the user is at the bottom, follow new events; otherwise show “new events” with a jump action. Group repetitive low-value telemetry while preserving an expansion path and sequence.

## 4. Active-project-centered layout

The selected project is the stable coordinate system. Navigation changes must not make the user wonder which repository or provider is active. The project name and repository identity remain visible during approval and execution. Every proposal/run includes the project and proposal revision in accessible text.

The center is not a decorative visualization. It is the object requiring comprehension or action. At most one object receives primary emphasis. Secondary panels may update, but they must not compete with or spatially displace it.

## 5. System-state model

The UI state vocabulary is product-facing and may map to multiple future backend fields. It must not be treated as an approved shared enum until Gate 2/3 contracts settle.

| State | Meaning | Center object | Primary actions | Announcement |
|---|---|---|---|---|
| idle | No active operation | Instruction/next action | Inspect and propose | Polite on entry only |
| inspecting | Read-only repository inspection active | Inspection status | Cancel if supported; view detail | Polite milestones |
| planning | Initial proposal being formed | Planning status | None besides safe navigation | Polite completion/failure |
| awaiting approval | Exact proposal revision ready | Proposal + scope/risks | Proceed, Modify, Cancel | Polite, focus proposal heading |
| modifying | User is revising intent or revision is generating | Modification input/status | Submit, return/cancel | Validation as needed |
| approved | Approval recorded; execution not yet active | Sealed revision summary | None/Cancel if supported | Polite |
| working | Provider executing approved scope | Current activity | Cancel, view details | Polite milestones only |
| cancelling | Cancellation requested, not settled | Cancellation status | None except navigation | Polite then terminal result |
| cancelled | Run stopped | Partial-change/result summary | Return, inspect/retry as allowed | Polite |
| verifying | Execution ended; evidence being checked | Check list/status | View detail | Polite check outcomes |
| blocked | Cannot proceed without user/external change | Blocker + recovery | Context-specific recovery | Assertive only if immediate action is required |
| warning | Material concern; operation may continue or await choice | Warning + consequence | Context-specific | Assertive only for time-critical/destructive risk |
| completed | Verification supports success | Result + evidence | Return/new instruction | Polite |
| failed | Operation or verification failed | Failure + evidence/recovery | Retry/modify/return as supported | Polite unless immediate risk |

### State rules

- Project status and run/workflow state are distinct concepts.
- `warning` may be an interrupting overlay state over another nonterminal state, but it must have a durable event/evidence record.
- `blocked` means progress cannot continue; `warning` means material attention is needed but the underlying operation may have options.
- `completed` requires verification evidence. A provider's success response alone advances to `verifying`, not `completed`.
- `cancelled` and `failed` must disclose possible partial changes.

## 6. State-transition map

```text
idle
  └─ submit instruction → inspecting
       ├─ inspection error → failed
       ├─ material concern → warning ── acknowledge/resolve → inspecting|failed|blocked
       └─ inspection complete → planning
            ├─ planning error → failed
            └─ proposal ready → awaiting approval
                 ├─ Modify → modifying
                 │    ├─ submit revision → inspecting|planning
                 │    └─ abandon revision → awaiting approval|cancelled
                 ├─ Cancel → cancelled
                 └─ Proceed → approved → working
                                      ├─ warning → working|blocked|failed
                                      ├─ blocker → blocked
                                      ├─ cancel request → cancelling
                                      │    ├─ confirmed → cancelled
                                      │    └─ could not cancel → working|failed
                                      ├─ execution error → failed
                                      └─ execution ends → verifying
                                                           ├─ checks pass → completed
                                                           ├─ checks fail → failed|blocked
                                                           └─ insufficient evidence → blocked
```

Transitions must be driven by persisted/server-confirmed state, not animation completion. Refresh/restart should restore the durable state and active object.

## 7. Proposed component tree

This is conceptual architecture, not authorization to create React components or shared types.

```text
AppShell
├─ GlobalHeader
│  ├─ ProductIdentity
│  └─ GlobalStatus
├─ PrimaryNavigation
├─ RouteAnnouncer
└─ ViewOutlet
   ├─ SetupView
   │  ├─ ReadinessStepper
   │  ├─ ProviderAvailabilityList
   │  └─ ProjectSetupForm
   ├─ ProjectsView
   │  ├─ ProjectsHeader
   │  └─ ProjectList
   │     └─ ProjectSummary
   ├─ ProjectWorkspaceView
   │  ├─ ProjectContext
   │  ├─ StateSummary
   │  ├─ ActiveObject
   │  │  ├─ InstructionComposer
   │  │  ├─ ProposalReview
   │  │  ├─ RunSummary
   │  │  ├─ BlockerPanel
   │  │  └─ ResultSummary
   │  └─ ContextRail
   └─ RunDetailsView
      ├─ RunIdentity
      ├─ StateSummary
      ├─ ApprovalRecord
      ├─ EventTimeline
      ├─ ScopeComparison
      └─ VerificationEvidence

Shared primitives
├─ StatusLabel
├─ StateSentence
├─ ActionGroup
├─ Disclosure
├─ EvidenceList
├─ EmptyState
├─ InlineNotice
└─ ConfirmDialog (only when consequence warrants it)
```

## 8. Approval experience

The approval surface is deliberately calm and static.

1. Header states project, provider, and proposal revision.
2. Objective interpretation and current state appear first.
3. Ordered steps and expected scope are central.
4. Risks/unresolved decisions and completion test remain visible before action.
5. Proceed, Modify, and Cancel are explicit text buttons. Proceed is primary but not preselected.
6. Proceed submits the exact visible revision identifier. While recording approval, disable repeat submission and show “Recording approval…” without claiming execution.
7. Modify opens a labeled input while preserving the prior proposal read-only. Submitting creates a revision cycle; it never silently edits the sealed revision.
8. Cancel explains that no execution will begin. If no work has begun, do not use an alarming destructive-confirmation pattern.

Keyboard order follows reading order. Focus enters at the proposal heading, not the primary button. A sticky action zone may be used only if it never obscures focused content.

## 9. Execution-monitoring experience

- Lead with “what JARVIS is doing now,” then elapsed time and last event time.
- Show an indeterminate activity indicator unless a real bounded total exists.
- Normalize events into understandable categories such as status, command, file, message, approval, verification, and error; retain provider detail behind disclosure.
- Separate current activity from chronological history.
- Show expected scope during work and actual scope when available; highlight divergence without declaring wrongdoing before reconciliation.
- Cancel is explicit and visually separated from navigation. On request, transition to `cancelling`; do not immediately say `cancelled`.
- Refresh/reconnect shows last persisted sequence and connection status. “Live updates interrupted” is not the same as “run failed.”

## 10. Warning and blocker behavior

Warnings replace the right rail or secondary center content; they do not appear as transient toast-only messages. Each warning contains a plain-language title, affected project/run, cause/source, consequence, and available action.

Blocked state becomes the active object. Show:

- what is blocked;
- why JARVIS cannot continue;
- whether files may already have changed;
- the last verified/persisted evidence;
- the smallest user or environment action that can unblock work;
- safe navigation back to the project.

Use modal dialogs only for a decision that must interrupt interaction, such as confirming a consequential cancellation under clearly described conditions. Errors never disappear solely on a timer.

## 11. Verification and completion behavior

Verification is a first-class phase, not a spinner between work and celebration.

The center lists named checks with pending/pass/fail/unknown states and textual evidence. If the backend cannot measure overall progress, do not aggregate a percentage. Changed files and scope reconciliation appear beside or below checks.

Completion requires a stable summary containing:

- actual outcome;
- verification evidence;
- actual changed files/scope when available;
- unresolved issues;
- updated project phase/status and next action;
- durable timestamps/run identity.

Completion illumination may resolve once, but the persistent proof is text and structure. Failed verification yields `failed` or `blocked`, not a “completed with warning” ambiguity.

## 12. Typography direction

- Use an original, commonly licensed or system type stack; do not imitate MCU title/interface lettering.
- Primary UI: humanist or neo-grotesque sans with clear lowercase forms and robust screen rendering.
- Technical values, paths, identifiers, and event details: monospace companion.
- Default body size at least 16px; dense metadata no smaller than 12–13px with adequate line height.
- Use sentence case. Reserve uppercase for very short metadata labels; never use tracked microtype for essential content.
- Limit main text line length to roughly 65–80 characters.
- Establish hierarchy by size, weight, spacing, and placement—not glow alone.

## 13. Color and illumination rules

- Base surfaces are opaque near-black/blue-gray, with distinguishable elevation through lightness and borders.
- Neutral text uses warm/blue-white with WCAG-compliant contrast.
- A restrained cool-blue accent indicates selection, readiness, and active but nonurgent system presence.
- Amber indicates warning/attention; red indicates failure or immediate risk; green/teal indicates verified success. Every state also has a label and icon/shape.
- Glow is decorative reinforcement only. It cannot be the sole boundary, focus indicator, or state signal.
- No scanlines, bloom over text, full-screen color wash, rapid flicker, or transparent glass simulation.
- Design tokens must be contrast-tested in default, hover, focus, disabled, and high-contrast/forced-colors conditions.

## 14. Depth and layering rules

Use three semantic layers:

1. **Base:** navigation and persistent project context.
2. **Work:** active object and supporting evidence.
3. **Interrupt:** warning, blocker, or confirmation requiring immediate comprehension.

Depth is expressed through spacing, borders, small tonal shifts, and limited shadow. Do not use continuous parallax or perspective transforms. A foreground layer must be more actionable, not merely more decorative. Avoid nested cards beyond two visible levels.

## 15. Meaningful motion rules

- Motion must answer one of: what changed, where did it come from, what is active, or what completed?
- Route/state transition: 140–220ms fade/translate over a short distance; preserve landmarks.
- Disclosure: 120–180ms; content remains operable after motion.
- Active work: one subtle low-frequency indicator; no constant motion across multiple panels.
- Warning: a single emphasis transition, then stillness. Never pulse indefinitely.
- Completion: a single settle/illumination under 300ms; no confetti.
- Event insertion: brief highlight that fades without moving focused/selected content.
- Do not animate fake scanning, thinking, percentages, or success.

## 16. Reduced-motion behavior

Honor `prefers-reduced-motion: reduce` and provide semantic equivalence:

- replace transforms, parallax, sweeps, pulses, and animated progress with immediate state changes or a static indicator;
- allow at most a short opacity transition when it does not delay content;
- never require animation to understand sequence or causality;
- keep live state text and timestamps visible;
- do not autoplay decorative motion or audio.

## 17. Keyboard and screen-reader requirements

- All flows work without pointer, drag, hover, gesture, or voice.
- Use native controls and landmarks before ARIA. Provide one `main` landmark and labeled navigation/regions.
- Logical heading structure identifies view, project, active object, and supporting regions.
- Provide a skip link to main content.
- Focus is always visible, sufficiently contrasted, and never hidden behind sticky regions.
- Route changes move focus to the new view heading; background updates do not move focus.
- `Escape` closes nonessential disclosures/dialogs but never silently cancels a run.
- Dialogs trap and restore focus appropriately; destructive/consequential choices describe impact.
- Use `role="status"`/polite live announcements for ordinary state and milestone updates. Reserve assertive alerts for immediate risks; do not announce every event.
- Event history is a labeled log/list with sequence, category, time, and text. Visual grouping has semantic headings.
- Progress exposes a name and textual value/state. Indeterminate work is announced as such.
- Status, warning, pass, and failure are never conveyed by color/icon alone.
- Keyboard shortcuts, if added, supplement visible controls and must be documented; v0.1 requires none beyond platform conventions.

## 18. Desktop and narrow-screen behavior

### Wide desktop (≥ 1200px)

Use the three-zone layout when contextual content exists. Keep the center dominant. Rails may independently scroll only when this does not fracture reading or keyboard navigation.

### Standard laptop (768–1199px)

Collapse the right rail into disclosures below the active object. Left navigation may become a compact rail/drawer. Keep action controls next to the active decision.

### Narrow (< 768px)

Single column in this order: project identity, state sentence, active object, actions, supporting evidence, history. Navigation becomes a conventional menu. Tables become labeled stacked records; horizontal scrolling is limited to code/log content where wrapping would corrupt meaning. Sticky actions are optional and must not obscure focus/content.

JARVIS v0.1 is desktop-first, but narrow layouts must remain fully operable. No feature may require a wide canvas.

## 19. Low-fidelity text wireframes

### Setup

```text
┌ JARVIS CORE ───────────────────────────────────────────────────┐
│ Setup                                                         │
├───────────────────────────────────────────────────────────────┤
│                 Make this device ready                        │
│                                                               │
│  ✓ Runtime        2  Provider        3  Project               │
│                                                               │
│  Provider detection                                           │
│  Codex        Installed · Authenticated       [Use Codex]     │
│  Claude Code  Not detected                    [Details]       │
│                                                               │
│  [Retry detection]                                            │
└───────────────────────────────────────────────────────────────┘
```

### Projects

```text
┌ JARVIS CORE ─ Projects ────────────────────────────────────────┐
│ [Setup] [Projects]                              [New project]  │
├───────────────────────────────────────────────────────────────┤
│ Projects                                                      │
│                                                               │
│ MK 42                                      ACTIVE             │
│ Upgrade and validate the armor systems                        │
│ Next: Inspect current systems · Codex · Updated 10m ago   [→] │
│                                                               │
│ ORBIT                                      BLOCKED            │
│ Blocker: Repository path is unavailable                       │
│ Next: Select a valid repository                          [→]  │
└───────────────────────────────────────────────────────────────┘
```

### Project Workspace — awaiting approval

```text
┌ MK 42 ─ /Projects/MK-42 ─ Codex ─ AWAITING APPROVAL ──────────┐
│ Project context │ Proposal revision 2           │ Scope       │
│ Objective       │                               │ 4 files     │
│ Current phase   │ Objective interpretation      │ Risks       │
│ Latest result   │ Current state                  │ History     │
│                 │ 1. Inspect ...                 │             │
│                 │ 2. Change ...                  │             │
│                 │ Completion test                │             │
│                 │                               │             │
│                 │ [Proceed] [Modify] [Cancel]    │             │
└───────────────────────────────────────────────────────────────┘
```

### Project Workspace — blocked

```text
┌ MK 42 ─ BLOCKED ───────────────────────────────────────────────┐
│ Context         │ Work cannot continue          │ Evidence    │
│                 │                               │ Last event  │
│                 │ Repository is no longer       │ Partial     │
│                 │ available at the approved path│ changes: ?  │
│                 │                               │             │
│                 │ Reconnect the repository, then│             │
│                 │ [Retry check] [Return]         │             │
└───────────────────────────────────────────────────────────────┘
```

### Run Details — working/verifying

```text
┌ MK 42 / Run 0187 ─ WORKING ────────────────────────────────────┐
│ Current activity                                              │
│ Updating provider adapter · started 14:32 · live              │
│                                                    [Cancel]   │
├──────────────────────────────────────┬────────────────────────┤
│ Event timeline                       │ Approved scope          │
│ 14:32  Run started                   │ src/provider/...        │
│ 14:33  Read 6 files                  │ tests/provider/...      │
│ 14:34  Updating adapter              │                        │
│                                      │ Proposal revision 2    │
│ [3 new events]                       │ [View approval]        │
├──────────────────────────────────────┴────────────────────────┤
│ Verification (not started)                                   │
└───────────────────────────────────────────────────────────────┘
```

## 20. Acceptance criteria for later UI implementation

- All four views support their stated primary task.
- Every v0.1 state has a readable center object, action policy, and announcement policy.
- Proceed binds to a visible exact revision; Modify creates a revision cycle; Cancel has an honest intermediate state.
- Completion is impossible in the presentation model without verification evidence.
- The interface remains usable at 1280×720 and in a narrow single-column viewport.
- Full workflow is keyboard operable with visible focus and sensible reading order.
- Reduced-motion mode communicates identical state and causality.
- No protected Marvel visual/audio assets or traced compositions are present.
