# JARVIS UI Research

**Status:** Initial research for JARVIS Core v0.1

**Date:** 2026-07-21

**Scope:** Functional principles, not visual reproduction

## 1. Research scope and methodology

This study asks why the MCU's Stark/JARVIS interfaces read as intelligent, spatial, calm, responsive, and integrated with technical work. It covers four families: workshop holograms, the Iron Man helmet HUD, glass/workstation/environmental displays, and JARVIS as a system presence.

The method was:

1. Treat the released films as primary designed artifacts and observe composition, hierarchy, transitions, and the division between spoken and visual information.
2. Prefer accounts from credited designers and studios for design intent and production facts.
3. Label statements as **documented** when a source explicitly supports them and **interpretation** when they are product-design conclusions drawn from observed patterns.
4. Compare cinematic behavior with the repository's text-first inspect → propose → approve → execute → verify workflow.
5. Reject patterns that depend on film editing, invisible input mechanisms, protected assets, or inaccessible presentation.

This is a qualitative design study, not a frame-by-frame catalog or claim that every MCU interface follows one canonical system.

## 2. Sources studied and evidence register

### Primary artifacts

- *Iron Man* (2008): workshop construction/diagnostics and early helmet HUD. Supports direct observation of object-centered engineering, peripheral instrumentation, and a HUD composed to preserve the performer's face.
- *Iron Man 2* (2010): workshop/holographic discovery, smart phone, glass table, windows, mirror, and system warnings. Supports direct observation of spatial manipulation, environmental continuity, and context following the user.
- *The Avengers* (2012): Mark VII HUD and Stark/Helicarrier glass displays. Supports direct observation of mode-dependent HUD reconfiguration and shared visual language across device sizes.
- *Iron Man 3* (2013): workshop, suit telemetry, remote operation, failure, and multi-system monitoring. Supports direct observation of escalation, distributed technical objects, and partial-failure communication.
- *Avengers: Age of Ultron* (2015): Stark lab and JARVIS/Ultron system representations. Supports direct observation of technical-object abstraction and distinct system identities.

Film observations in this document are interpretations unless corroborated below.

### Credited designers and studios

- [Perception — Iron Man 2 Technology Design](https://www.experienceperception.com/work/iron-man-2/) (**near-primary studio case study**). Documents work on more than 125 shots; workshop holograms; the smart phone, coffee table, windows, and mirror; the aim to make JARVIS a visual manifestation of Stark's imagination; familiar behavior within futuristic presentation; and location-dependent displays.
- [Jayse Hansen — Iron Man UI, HUDs + Holograms](https://jayse.tv/v2/?portfolio=hud-2-2) (**primary designer portfolio**). Documents the HUD Bible, a purpose for each readable part, the diagnostic as an expandable/collapsible information widget, contextual anticipation by AI, dimensional layers, and separate 2D/3D radar modes.
- [Jayse Hansen — Mark VII HUD](https://jayse.tv/avengers/) (**primary designer portfolio**). Documents simple dock icons becoming more complex when active and animation communicating suit-mode status.
- [Inventing Interactive — interview with Jayse Hansen](https://inventinginteractive.com/2012/07/08/interview-jayse-hansen/) (**designer interview**). Documents story-first direction, a reason for every widget, the HUD Bible, a reusable framework adapted to different screen arrangements, and dimensional differentiation of the Mark VI and Mark VII.
- [Pushing Pixels — interview with Jayse Hansen](https://www.pushing-pixels.org/2012/06/01/the-craft-of-screen-graphics-and-movie-user-interfaces-conversation-with-jayse-hansen.html) (**designer interview**). Documents the tension between information density and overload, use of depth to differentiate information, and real-world expert input.
- [Andy Polaine — interview excerpt with Dav Rauch](https://www.polaine.com/2008/05/iron-mans-hud-and-interaction-design/) (**interview with a credited designer**). Documents an explicit interaction question: whether gaze leads the HUD response or the HUD prompts gaze. This supports treating attention changes as causal, not decorative.
- [Territory Studio — Avengers: Age of Ultron](https://territorystudio.com/project/marvels-avengers-age-of-ultron/) (**primary studio case study**). Documents research-led content, interfaces tailored to characters and disciplines, and visual language adjusted to the film's darker state.
- [Maxon — Creating the Dark Side of Marvel](https://www.maxon.net/en/article/creating-the-dark-side-of-marvel) (**near-primary production interview**). Corroborates Territory's fresh, story-supporting direction for *Age of Ultron* and the production reality of last-minute on-set changes.
- [Pushing Pixels — interview with John LePore](https://www.pushing-pixels.org/2016/07/20/the-craft-of-screen-graphics-and-movie-user-interfaces-interview-with-john-lepore.html) (**studio principal interview**). Provides production context for Perception's *Iron Man 2* work and its growth from a narrow brief into a connected technology system.

### Product and accessibility references

- `docs/PRD.md`, `README.md`, `docs/ROADMAP.md`, and `docs/DESIGN_REFERENCES.md` define the four views, text-first workflow, provider neutrality, approval boundaries, verification requirement, and originality constraint.
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria/) and [W3C ARIA22](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22) support named regions and polite status announcements that do not steal focus.
- [W3C ARIA25](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA25) supports conveying changing progress in text through a live region rather than relying on a visual bar alone.
- [WCAG 2.2 focus guidance](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) and [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast?level=0) support visible, unobscured focus and sufficient contrast for meaningful interface graphics.

## 3. Interface-family analysis

### 3.1 Workshop and holographic engineering interfaces

**Observed structure.** The current technical object—not a generic dashboard—occupies the visual and narrative center. A suit, element, model, scan, or simulation becomes the workspace. Supporting measurements, materials, variants, and system readouts orbit it or appear on nearby surfaces. Tony's body and gestures establish a spatial relationship with the model.

**Documented intent.** Perception describes the workshop environment as a visual manifestation of JARVIS and, more specifically, Stark's imagination. The periodic-table sequence makes combining elements the principal action. The interface is therefore less a menu system than an externalized working model.

**Behavior.** Context appears when an object, region, or hypothesis becomes active. Detail can be isolated, expanded, rotated, compared, or discarded. Motion explains relationships: fragments assemble, a scan traverses an object, alternatives separate, and accepted pieces integrate.

**Product interpretation.** JARVIS Core's “technical object” is the active project and, within a run, the approved proposal plus current execution evidence. The center should hold the current decision or work object. Repository facts, history, provider identity, and secondary metadata should remain peripheral until relevant.

**Cinematic amplification.** Room-scale volume, free-air manipulation, translucency, particle fields, and effortless spatial precision make intent legible on film but do not translate literally to a laptop.

### 3.2 Iron Man helmet HUD

**Observed structure.** The forward view/target and the actor's face occupy the center. Diagnostics, navigation, targeting, suit health, and communications stay near the periphery. High-priority targeting or damage information can temporarily move inward or suppress routine telemetry.

**Documented intent.** Hansen describes the diagnostic as a radial tool that expands or collapses to the required “altitude” of information. Dock icons start simple and become complex when active. Each readable widget had a defined purpose. The AI anticipates feedback based on task and urgency. Depth differentiates information layers.

**Modes.** Flight, battle, targeting, diagnostic, and damaged states reorganize the same visual system. A mode is not merely a color theme: it changes which tools are available, their prominence, and the density of information.

**Product interpretation.** The persistent shell should be quiet. State-relevant details expand in place. Awaiting approval emphasizes scope and decision controls; working emphasizes current activity and cancellation; blocked emphasizes the blocker and recovery path. The interface should not show every possible control at once.

**Cinematic amplification.** The center is intentionally kept open partly to preserve the actor and action. Curved radial layouts, tiny labels, constant parallax, gaze/neural input, and rapid target switching are poor defaults for desktop productivity.

### 3.3 Workstation, glass-device, and environmental interfaces

**Observed structure.** A shared visual language crosses devices, but layouts adapt to the surface and social context. A phone supports a short, direct task; tables support browsing/manipulation; windows provide glanceable ambient information; workstations support sustained analysis.

**Documented intent.** Perception explicitly balanced futuristic complexity with familiar phone behavior, adapted interfaces to already-performed gestures, provided glanceable news/weather/stock layers on windows, and made mirror information appear according to location. Hansen's Helicarrier framework accommodated multiple screen arrangements.

**Product interpretation.** Responsive behavior should preserve task priority rather than shrink a desktop composition. Narrow screens should linearize center first, then decision/action, then supporting context. Shared semantic tokens and components may span views, but each view needs a layout suited to its job.

**Cinematic amplification.** Transparent glass reads well because lighting, camera angle, compositing, and set design are controlled. On a normal display it reduces contrast and wastes space. Gesture-only manipulation hides affordances and excludes keyboard and assistive-technology users.

### 3.4 JARVIS as a system presence

**Observed structure.** JARVIS usually has no avatar. Presence is inferred from timely response, changes in the environment, concise speech, targeted visual emphasis, and continuity across devices. The system seems intelligent because it selects what matters and changes the environment coherently.

**Across states:**

- **Idle:** ambient readiness; minimal activity; project context remains available.
- **Analysis:** the relevant object is isolated; scanning/relation-making motion shows inquiry without claiming an answer.
- **Warning:** routine information yields to the threat, consequence, and recommended action.
- **Execution:** causal activity is visible—systems activate, paths propagate, and affected parts respond.
- **Completion:** the object settles into a stable state and the result is summarized.

**Voice, text, and visuals.** In the films, voice carries concise orientation, warnings, confirmations, and exceptions while visuals carry spatial relationships, persistent state, telemetry, and evidence. Dialogue is also a storytelling device that allows the audience to understand events without reading dense graphics.

**Product interpretation.** Voice is out of scope for v0.1. Its functional role becomes short, well-timed text: one current-state sentence, explicit warning text, and a result summary. Persistent detail belongs in structured visual/text regions. JARVIS presence should emerge from truthful status, continuity, prioritization, and restrained motion—not an avatar, simulated personality, or chatty narration.

## 4. Repeated structural patterns

1. **A dominant active object.** The current object, target, decision, or anomaly anchors attention.
2. **Peripheral context.** Stable telemetry and secondary facts remain available without competing with the center.
3. **Contextual instruments.** Tools expand when activated and collapse when irrelevant.
4. **Mode-dependent composition.** Mode changes content priority and available action, not just color.
5. **Progressive disclosure.** Summary precedes detail; the user can move between levels.
6. **Semantic depth.** Foreground means actionable/current; middle layers mean supporting evidence; background means persistent context.
7. **Replacement under urgency.** Warnings take space from low-priority content rather than stacking endlessly on top.
8. **Purposeful motion.** Motion reveals cause, direction, relationship, or state change.
9. **System continuity.** The same object and state persist across surfaces and modes.
10. **Purpose behind detail.** Even film graphics feel more credible when elements have an explainable function.

## 5. Information hierarchy

For JARVIS Core, the hierarchy should be:

1. **Immediate decision or active work:** instruction, proposal, blocker, current operation, or verified result.
2. **System state and consequence:** what is happening, why it matters, whether user action is required.
3. **Primary action:** proceed, submit modification, cancel, retry, or inspect evidence.
4. **Supporting evidence:** scope, events, changed files, checks, risks, and timestamps.
5. **Persistent context:** project objective, provider, repository, history, and settings.

Urgency changes placement as well as styling. Warning/blocked/failed content replaces low-priority center-adjacent information. It must not be conveyed only by red/amber illumination.

## 6. Motion and state behavior

- **Scanning/inspecting:** a bounded sweep or staged reveal indicates the region being examined. Never fake percentage completion.
- **Planning:** grouped proposal sections resolve in stable order; motion shows organization, not “thinking.”
- **Awaiting approval:** motion settles. The decision surface becomes visually stable to support careful reading.
- **Working:** the active event advances through a chronological stream; a subtle pulse may indicate liveness. Activity does not imply measured progress.
- **Warning/blocked:** background activity stops or dims; the causal event and required action take precedence.
- **Cancelling:** controls lock except safe navigation; status clearly says cancellation is requested and work may still be stopping.
- **Verifying:** checks appear as pending → pass/fail with evidence; successful execution is not yet completion.
- **Completed:** motion resolves once, then stops. The stable result and evidence remain.
- **Failed/cancelled:** no celebratory motion; preserve partial-change and recovery information.

Motion must never manufacture causality or certainty. Unknown duration is indeterminate; determinate progress is used only when the backend supplies a meaningful total.

## 7. Interaction principles

- Make the next valid action obvious, but retain explicit controls for consequential decisions.
- Keep approval bound to a visible proposal revision and expected scope.
- Treat Modify as a new planning cycle, not an inline mutation of an approved plan.
- Keep Cancel available during cancellable work and explain that partial changes may exist.
- Allow direct navigation to details without losing the active project's state.
- Preserve user attention: background updates do not steal focus, scroll position, or selection.
- Use ordinary desktop inputs first: keyboard, pointer, scrolling, and standard form controls.
- Do not use hidden gestures, hover-only disclosure, drag-only actions, or radial navigation.

## 8. What is functional and what is spectacle

| Pattern | Functional value | Film-specific/spectacle risk | Product treatment |
|---|---|---|---|
| Active object at center | Sustains task focus | Can become an actor-framing device | Center the project/decision/evidence |
| Peripheral telemetry | Maintains context | Dense unreadable decoration | Show only real, legible data |
| Contextual expansion | Reduces overload | Magical anticipation may obscure control | Expand predictably with visible triggers |
| Mode changes | Align tools with task | Abrupt cinematic reconfiguration | Preserve landmarks and focus |
| Depth | Encodes priority/relationship | Parallax and transparency harm reading | Use restrained elevation, overlap, and contrast |
| Motion | Shows cause and state | Constant spinning/scanning becomes noise | Animate only meaningful transitions |
| Voice | Fast orientation and warnings | Dialogue serves exposition and character | Use concise text; no imitation voice |
| Holographic object manipulation | Makes systems spatial | Impossible precision and no affordances | Use structured lists, diagrams only when useful |
| Color-coded systems | Fast recognition | Neon glow and color-only meaning | Pair color with text, icon, and structure |

## 9. Laptop-app translation principles

- Replace room-scale space with a stable three-zone desktop: project context, active center, contextual rail.
- Replace holographic objects with truthful structured objects: proposal revision, event stream, scope, file/check evidence.
- Replace ambient voice with a concise state sentence and accessible announcements.
- Replace radial tools with conventional, discoverable controls near the object they affect.
- Replace transparency with opaque dark surfaces and subtle tonal layering.
- Replace continuous animation with brief causal transitions and quiet steady states.
- Replace omniscience with provenance: say what JARVIS knows, what source produced it, and what remains unknown.

## 10. Patterns that would harm usability or accessibility

- Tiny uppercase microtext as primary content.
- Low-contrast cyan lines or text on transparent/complex backgrounds.
- Color, glow, sound, or motion as the only state signal.
- Constant rotation, scanlines, flicker, particles, or parallax.
- Spatial reordering that moves focused controls during live updates.
- Important content at the extreme periphery or behind hover.
- Automatic scrolling that prevents reading prior events.
- False precision, fake percentages, or animation that implies unverified success.
- Gesture-only, drag-only, gaze-dependent, or voice-dependent interaction.
- Warning overlays that hide the evidence needed to recover.

## 11. Copyright and originality boundaries

JARVIS Core may study abstract functional principles: center/periphery hierarchy, contextual disclosure, mode-based prioritization, semantic depth, restrained causal motion, and non-avatar system presence. Ideas and interaction principles must be expressed through an original visual system suited to this product.

The project must not download, commit, trace, or recreate Marvel/Film assets; Iron Man or Marvel logos; film stills; extracted or redrawn HUD widgets; exact radial arrangements; proprietary type treatments; screen compositions; movie sound effects; dialogue; or Paul Bettany's voice, likeness, or performance. Source links provide attribution for research only and do not grant rights to reuse imagery. If later implementation directly adapts third-party code or assets, it requires license review and the repository's attribution process; this research authorizes none.

## 12. Recommended product principles

1. Put the active project, decision, or evidence object at the center.
2. Keep stable context peripheral until it becomes relevant.
3. Let state change hierarchy and available actions, not merely color.
4. Replace low-priority information when urgency rises.
5. Use progressive disclosure with truthful, purposeful detail.
6. Use depth sparingly to encode actionability and provenance.
7. Use motion only to explain cause, activity, or transition; keep steady states calm.
8. Represent JARVIS through timely system behavior, continuity, and truthful summaries—not an avatar.
9. Keep consequential controls explicit, conventional, and scope-aware.
10. Treat verification evidence as the completion object; execution alone is not success.
11. Preserve accessibility semantics, focus, contrast, and reduced-motion equivalence.
12. Maintain an original visual language; evoke competence and presence without copying MCU graphics.
