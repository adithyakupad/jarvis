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
- `HandoffCardShell`: display-only future handoff surface.
- Existing command composer, proposal, activity timeline, and validation markup use the same material classes without moving business logic.

## “Where we left off” integration

After merging Structured Project Handoffs, render `HandoffCardShell` in the workspace’s center column before the command composer when durable handoff data exists. Map data explicitly:

```tsx
<HandoffCardShell
  objective={handoff.currentObjective}
  status={handoff.currentStatus}
  lastMeaningfulAction={handoff.lastMeaningfulAction}
  freshness={handoff.freshness}
  blockers={handoff.blockers}
  openDecisions={handoff.openDecisions}
  recommendedNextAction={handoff.recommendedNextAction}
  evidence={<pre>{JSON.stringify(handoff.evidence, null, 2)}</pre>}
/>
```

The component intentionally owns no fetching, validation, freshness calculation, or state transition. Those remain with the merged feature’s existing owner. If field names differ after rebase, adapt them at the render boundary instead of changing API contracts. Keep evidence collapsed by default and do not infer “fresh” or “verified” in the visual layer.
