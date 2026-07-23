# New-user audit and public-alpha checklist

**Audited:** 2026-07-22

**Perspective:** A technical GitHub user familiar with Git and a terminal, but unfamiliar with JARVIS or its implementation history.

## Findings addressed in this gate

- Replaced the README's internal gate chronology with an outcome-first introduction and a single first-run path.
- Separated stable project identity and durable context from the immediate task in setup copy.
- Made provider readiness, absolute-path requirements, edit risk after approval, and the safe disposable-repository recommendation explicit.
- Clarified that planning is read-only, Proceed seals one proposal revision, and JARVIS neither commits nor pushes.
- Added symptom/cause/next-action troubleshooting and honest limits around validation, interruption, startup coordination, and provider readiness.
- Added a structured public bug-report template that asks for reproducible, sanitized evidence.
- Reduced startup output to one user-facing URL while retaining a plain API readiness signal, and replaced internal "Core" branding with public-alpha language.
- Added a concise **Where we left off** handoff that separates verified facts, user corrections, model inference, unresolved questions, and stale repository state.
- Made the recommended next action advisory: it fills the next task field without submitting, approving, or executing.

## Application-copy or UX follow-ups

The runtime merge addressed duplicate instances, stale locks, compatibility failures, interrupted work, timing diagnostics, and actionable repository errors. Remaining post-alpha improvements are:

1. Show expected and observed build versions in expandable compatibility diagnostics.
2. Link interrupted runs directly to repository evidence.
3. Add a dedicated outcome sentence for validation failure and unsupported validation: provider edits may exist, validation did not pass/run, inspect `git diff` next.
4. Disable project submission when no provider is ready and provide exact authentication guidance when provider detection can report it reliably.
5. Consider rejecting, rather than strongly warning about, the running JARVIS source directory as an execution target.
6. Replace raw technical event details with concise summaries while retaining expandable diagnostics.

## README-visible comprehension check

A release candidate passes when a reader can answer from the README alone:

- What JARVIS is and what it does today.
- Which users and repositories are appropriate for the alpha.
- Which prerequisites are required and how to verify them.
- How to install, start, stop, restart, and reset local state.
- Where to enter durable project context versus the immediate task.
- What Proceed authorizes and how Revise plan and Cancel differ.
- Which provider has been live-tested and whether fallback exists.
- How independent validation differs from a provider claim.
- How to inspect changes and whether JARVIS commits or pushes.
- Where state is stored, what the major limitations are, and how to report a useful bug safely.

## Release reconciliation

- Public repository: `https://github.com/adithyakupad/jarvis`; release version: `0.1.0-alpha.1`; intended tag: `v0.1.0-alpha.1`.
- This release is verified on macOS only. Other operating systems are not claimed as release-tested.
- One-origin startup, health compatibility, duplicate startup, stale and malformed lock handling, port diagnostics, and owned-lock shutdown are covered by deterministic tests and controlled smokes.
- Interrupted runs are marked interrupted on restart and are not automatically rerun.
- The final clean-clone results are recorded in the release-preparation report.
- Claude Code remains implemented but not live-tested for this release.
