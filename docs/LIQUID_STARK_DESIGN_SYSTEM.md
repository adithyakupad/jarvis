# JARVIS Liquid Stark Design System

## Visual philosophy

Liquid Stark is an original interface language for JARVIS: calm, layered local software with the precision of a technical instrument. It combines translucent graphite materials, restrained cyan system presence, and small HUD-like metadata without copying Apple layouts or using Marvel imagery.

Content clarity wins over spectacle. Depth establishes hierarchy; cyan indicates attention or active state, not decoration. Provider narrative and JARVIS-owned evidence remain visually distinct.

## Color tokens

The canonical tokens live in `src/client/styles.css`.

| Role | Token | Intent |
| --- | --- | --- |
| Canvas | `--bg-void`, `--bg-midnight` | Near-black graphite with a cool undertone |
| Material | `--glass`, `--glass-strong`, `--glass-inset` | Translucent layers at increasing authority |
| Fallback | `--glass-fallback` | Opaque readable material when blur is unavailable |
| Structure | `--line`, `--line-strong`, `--line-hot` | Quiet separators and selective cyan edges |
| Primary text | `--text` | High-contrast cool white |
| Secondary text | `--muted`, `--dim` | Supporting content and instrumentation |
| Active | `--cyan`, `--cyan-bright` | Arc-reactor cyan used sparingly |
| Secondary | `--blue`, `--indigo` | File and secondary system accents |
| Warning | `--amber` | Risk, timeout, or attention |
| Failure | `--red` | Genuine failure or destructive action |
| Verified | `--green` | Independently verified success or readiness |

Status meaning must always be stated in text; color is supplementary.

## Glass materials

- `glass-surface` is the standard content layer.
- `glass-surface-elevated` increases opacity, border luminance, and depth for focal information.
- `glass-surface-interactive` adds gentle hover elevation.
- `glass-surface-inset` and `inset-data-panel` hold commands, output, and dense diagnostics.
- `active-object` is the command-center material for the current decision or operation.
- `technical-divider` provides a luminous but restrained section break.

Materials use an opaque fallback before translucent gradient declarations. `@supports not (backdrop-filter)` reinforces the fallback. Blur is limited to discrete panels and bars rather than a viewport-sized layer.

## Typography

Primary content uses `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Technical metadata uses `--mono`, beginning with `SFMono-Regular`, only for identifiers, paths, commands, revisions, durations, and instrumentation.

Headings use weight and tight tracking instead of glow. `hud-label`, `eyebrow`, `section-kicker`, and `rail-label` are compact uppercase metadata patterns and must not replace normal explanatory copy.

## Spacing and shape

Spacing follows a loose 4 px base with most gaps between 8 and 24 px. Focal panels use `--radius-md` or `--radius-lg`; controls use smaller radii. The system avoids putting an equally prominent border around every item: whitespace, inset fills, dividers, and material elevation should do most grouping.

## Status and authority

- Cyan: active, planning, inspecting, or awaiting a decision.
- Green: ready or independently verified.
- Amber: unsupported, timed out, blocked, or warning.
- Red: failed, interrupted, or destructive.
- Neutral: idle, pending, or descriptive metadata.

`StatusPill` pairs status text with a dot. `SystemStatus` is for the compact top bar. Validation uses a stronger material, left-edge state accent, and JARVIS seal so authoritative evidence outranks provider narrative.

## Motion

Entry uses one short fade-and-rise. Interactive surfaces lift by one or two pixels. Only an active operation may pulse or orbit continuously. No animation implies progress that does not exist.

All animation and transition duration collapses under `prefers-reduced-motion: reduce`; the operation remains understandable through status text.

## Accessibility

- Keep semantic form controls, headings, buttons, lists, `time`, and `details`.
- Provide a visible cyan focus ring and a skip link.
- Keep primary copy readable without transparency or blur.
- Never encode status only with color or motion.
- Place raw event payloads behind keyboard-accessible disclosure controls.
- Preserve failure details, exit codes, command output, and interrupted state text.
- Forced-colors mode allows native color adjustment and restores outlines on indicator dots.

## Component patterns

- `GlassPanel`: material wrapper with semantic element selection.
- `TechnicalLabel`: compact instrumentation label.
- `SystemStatus`: label/value pair for project, provider, runtime, and operation state.
- `StatusPill`: state text and redundant visual indicator.
- `DiagnosticsDisclosure`: raw technical payload or evidence disclosure.
- `HandoffCardShell`: display-only shell for the real structured project handoff.
- Existing command composer, proposal, activity timeline, and validation markup use the same material classes without moving business logic.

## “Where we left off” integration

The workspace renders `HandoffCardShell` before the command composer and maps the durable Gate 4 handoff explicitly. The shell owns hierarchy and material only; `App.tsx` owns fetching, generation state, freshness, corrections, and actions.

```tsx
<HandoffCardShell
  objective={handoff.currentObjective}
  status={handoff.currentStatus}
  lastMeaningfulAction={handoff.lastMeaningfulAction}
  freshness={handoff.freshnessStatus}
  blockers={handoff.blockers}
  openDecisions={handoff.openDecisions}
  recommendedNextAction={handoff.recommendedNextAction}
  evidence={<ClassifiedEvidence entries={handoff.evidenceEntries} />}
/>
```

The component intentionally owns no fetching, validation, freshness calculation, correction persistence, or state transition. Those remain with the application service and existing handoff owner.

### Handoff hierarchy and evidence

The card shows current objective, current status, last meaningful action, and freshness in its first reading layer. Last run outcome, changed files, independent validation, repository condition, blockers, decisions, constraints, generation status, and recommended next action follow. Source run, timestamps, classified evidence, and generation diagnostics remain available in `DiagnosticsDisclosure`.

Deterministic repository and validation evidence uses direct factual language. Model-derived content remains labeled by its evidence category (`inferred` or `unresolved`), and saved corrections remain `user provided`. Styling must never imply that inferred text is independently verified.

### Freshness and correction rules

Current freshness is always visible in the card header. A potentially stale handoff also shows an amber text warning in the primary card body; it must never be hidden in a disclosure. The warning states that repository changes were detected and fresh inspection will occur before stored state is relied upon.

`Correct project state` exposes only narrative fields. Repository fingerprint, Git state, source run, changed files, approval, provider session, and validation evidence are not editable. Save success uses a polite status message; save failure uses a visible alert. The form and disclosure remain keyboard accessible, with visible focus.

`Use recommended next step` fills the existing command composer. It does not submit planning, approve a revision, execute, or change provider selection.

### Validation authority and interaction

The independent JARVIS validation panel remains visually stronger and semantically separate from provider narrative. Command, status, exit code, duration, stdout, and stderr remain readable, including unsupported, unavailable, timeout, interrupted, and failed states.

All state meaning is textual as well as colored. Reduced-motion, forced-colors, skip-navigation, focus-visible, and opaque no-backdrop-filter behavior are release requirements. Disclosures use native `details`/`summary`; primary controls and stale warnings are never placed behind them.
