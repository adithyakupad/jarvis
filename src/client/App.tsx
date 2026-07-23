import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Project } from "../shared/projects.js";
import type { PlanProposal } from "../shared/runs.js";
import { ContextPacketSchema } from "../shared/context.js";
import type { HandoffCorrections, ProjectHandoff } from "../shared/handoffs.js";
import { useJarvisService, useJarvisSnapshot } from "./runtime.js";
import type { RunPresentation, UiWorkflowState } from "./service.js";
import { DiagnosticsDisclosure, GlassPanel, HandoffCardShell, StatusPill, SystemStatus, TechnicalLabel } from "./components.js";

type View = "setup" | "projects" | "workspace" | "run";

const stateLabel = (state: UiWorkflowState): string => state.toUpperCase();
const formatTime = (value: string): string => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
const elapsedLabel = (from: string, to = Date.now()): string => `${Math.max(0, Math.floor((to - new Date(from).getTime()) / 1000))}s elapsed`;

function AppShell({ view, setView, children, status, project }: { view: View; setView: (view: View) => void; children: ReactNode; status: UiWorkflowState; project?: Project }): ReactNode {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="global-header">
        <button className="brand" onClick={() => setView("projects")} aria-label="JARVIS, go to projects">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>JARVIS</strong><small>LOCAL ALPHA / 0.1</small></span>
        </button>
        <div className="system-deck" role="status" aria-live="polite">
          <SystemStatus label="Project" value={project?.name ?? "No project"} mono />
          <SystemStatus label="Provider" value={project?.provider ?? "Local"} state={project ? "ready" : "neutral"} />
          <SystemStatus label="Runtime" value="Loopback" state="ready" />
          <SystemStatus label="Operation" value={stateLabel(status)} state={["failed", "cancelled"].includes(status) ? "error" : ["working", "executing", "verifying", "planning", "inspecting"].includes(status) ? "active" : status === "warning" || status === "blocked" ? "warning" : "neutral"} />
        </div>
      </header>
      <div className="body-grid">
        <nav className="primary-nav" aria-label="Primary">
          <button className={view === "setup" ? "active" : ""} onClick={() => setView("setup")}><span>01</span>Setup</button>
          <button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")}><span>02</span>Projects</button>
          <button className={view === "workspace" ? "active" : ""} onClick={() => setView("workspace")}><span>03</span>Workspace</button>
          <button className={view === "run" ? "active" : ""} onClick={() => setView("run")}><span>04</span>Run details</button>
        </nav>
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

function SetupView({ onCreated }: { onCreated: (project: Project) => void }): ReactNode {
  const service = useJarvisService();
  const { providers } = useJarvisSnapshot();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pathStatus, setPathStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const project = await service.createProject({
        name: String(data.get("name")), objective: String(data.get("objective")), repositoryPath: String(data.get("path")), provider: String(data.get("provider")) as "codex" | "claude-code", notes: String(data.get("notes") ?? ""),
      });
      onCreated(project);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Project creation failed."); }
    finally { setBusy(false); }
  }

  return (
    <section className="view setup-view" aria-labelledby="setup-title">
      <header className="view-header"><p className="eyebrow">First-run setup</p><h1 id="setup-title">Add an existing project</h1><p>Choose an existing local Git repository. JARVIS inspects it read-only first; the selected provider may edit files only after you approve a proposal.</p></header>
      <ol className="readiness-steps" aria-label="Setup progress"><li className="done"><b>01</b><span>Runtime<small>Node 22.12+ ready</small></span></li><li className="done"><b>02</b><span>Providers<small>Local adapters detected</small></span></li><li><b>03</b><span>Project<small>Create a workspace</small></span></li></ol>
      <div className="setup-grid">
        <GlassPanel material="elevated"><TechnicalLabel>Provider readiness</TechnicalLabel>{providers.length === 0 && <p>No coding provider was detected. Install and authenticate Codex, restart JARVIS, then reload this page.</p>}{providers.map((provider) => <article className="provider-row" key={provider.provider}><div><h2>{provider.provider === "codex" ? "Codex" : "Claude Code"}</h2><p>{provider.detail}</p></div><span className={provider.authenticated ? "ready" : "neutral"}>{!provider.installed ? "Not installed" : provider.authenticated === true ? "Ready" : "Authentication required"}</span></article>)}</GlassPanel>
        <form className="surface project-form" onSubmit={(event) => void submit(event)}><div className="section-kicker">Add your first project</div><label>Project name <small>A short label shown only in JARVIS</small><input name="name" placeholder="Calculator" required /></label><label>Repository path <small>Absolute path to an existing local Git repository</small><input name="path" placeholder="/Users/you/Projects/my-app" required onBlur={(event) => { const value = event.currentTarget.value; if (!value) return; setPathStatus("Checking that this directory exists and is readable…"); void service.validateRepositoryPath(value).then((repo) => setPathStatus(repo.isGitRepository ? `${repo.directoryName} is ready · Git${repo.currentBranch ? ` · ${repo.currentBranch}` : ""}. Files may change only after you approve a proposal.` : `${repo.directoryName} is readable, but it is not a Git repository. Choose a Git repository so changes can be reviewed safely.`)).catch((cause) => setPathStatus(`${cause instanceof Error ? cause.message : "Repository validation failed."} Check that the absolute path exists and is readable by your user.`)); }} /></label>{pathStatus && <p className="quiet" role="status">{pathStatus}</p>}<label>What are you building? <small>Stable project identity, not today's task</small><textarea name="objective" placeholder="A TypeScript calculator library with automated tests." required /></label><label>Which provider should JARVIS use? <small>The coding agent JARVIS will ask to plan and execute</small><select name="provider" defaultValue={providers.find((provider) => provider.authenticated === true)?.provider ?? "codex"}>{providers.map((provider) => <option key={provider.provider} value={provider.provider} disabled={provider.authenticated !== true}>{provider.provider === "codex" ? "Codex" : "Claude Code"}{provider.authenticated === true ? "" : provider.installed ? " (authentication required)" : " (not installed)"}</option>)}</select></label><label>Project context <small>(optional, durable)</small><textarea name="notes" placeholder={'Examples: "Use TypeScript strict mode." "Do not modify generated files."'} /></label><p className="quiet"><strong>Submit the immediate coding task after the workspace opens.</strong> Do not put today's task in Project context.</p><p className="quiet">Paste an absolute local path. Do not use the JARVIS source repository as your first target; start with a disposable repository or one whose changes you can review.</p>{error && <p className="inline-error" role="alert">Could not add this project. {error} No provider execution started.</p>}<button className="button primary" disabled={busy}>{busy ? "Checking and saving…" : "Open workspace"}</button></form>
      </div>
    </section>
  );
}

function ProjectsView({ onSelect, onSetup }: { onSelect: (project: Project) => void; onSetup: () => void }): ReactNode {
  const { projects } = useJarvisSnapshot();
  return (
    <section className="view projects-view" aria-labelledby="projects-title">
      <header className="view-header split"><div><p className="eyebrow">Project index / {String(projects.length).padStart(2, "0")}</p><h1 id="projects-title">Active systems.</h1><p>Select a project to inspect its current decision and evidence.</p></div><button className="button secondary" onClick={onSetup}>New project</button></header>
      <div className="project-list">{projects.map((project, index) => <button className="project-card" key={project.id} onClick={() => onSelect(project)}><span className="project-index">{String(index + 1).padStart(2, "0")}</span><span className="project-main"><span className="project-title-line"><strong>{project.name}</strong><StatusPill state={project.status} /></span><span className="project-objective">{project.current_blocker || project.objective}</span><span className="project-meta"><span>PHASE / {project.current_phase || "Ready"}</span><span>PROVIDER / {project.provider}</span></span></span><span className="project-next"><small>Next action</small>{project.next_action}<i aria-hidden="true">↗</i></span></button>)}</div>
    </section>
  );
}

function ProjectContext({ project }: { project: Project }): ReactNode {
  const service = useJarvisService();
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  return <aside className="context-rail" aria-label="Project context"><p className="rail-label">Active project</p><h2>{project.name}</h2><p>{project.objective}</p><dl><div><dt>Provider</dt><dd>{project.provider}</dd></div><div><dt>Repository</dt><dd className="mono">{project.repository_path}</dd></div><div><dt>Current phase</dt><dd>{project.current_phase}</dd></div><div><dt>Next action</dt><dd>{project.next_action}</dd></div></dl>{project.profile && <details><summary>Initial inspection</summary><p>{project.profile.summary}</p><strong>Repository-confirmed</strong><ul>{project.profile.repositoryFindings.map((item) => <li key={item}>{item}</li>)}</ul>{project.profile.inferredTechnologies.length > 0 && <><strong>Inferred technologies</strong><ul>{project.profile.inferredTechnologies.map((item) => <li key={item}>{item}</li>)}</ul></>}</details>}<details><summary>Edit project settings</summary><form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void service.updateProject(project.id, { name: String(data.get("name")), objective: String(data.get("objective")), notes: String(data.get("notes")) }).then(() => setMessage("Project settings saved.")).catch((cause) => setMessage(cause instanceof Error ? cause.message : "Settings could not be saved.")); }}><label>Name<input name="name" defaultValue={project.name} required /></label><label>Objective<textarea name="objective" defaultValue={project.objective} required /></label><label>Persistent context<textarea name="notes" defaultValue={project.notes} /></label><button className="button secondary">Save settings</button></form><hr /><p className="quiet">Removing this project deletes only JARVIS records and planning history. Repository files are never deleted.</p>{confirming ? <button type="button" className="button ghost danger" onClick={() => void service.removeProject(project.id)}>Confirm remove from JARVIS</button> : <button type="button" className="button ghost" onClick={() => setConfirming(true)}>Remove project</button>}{message && <p role="status">{message}</p>}</details></aside>;
}

function ProposalReview({ presentation, onModify, onContext, onCancel, onProceed, error }: { presentation: RunPresentation; onModify: () => void; onContext: () => void; onCancel: () => void; onProceed: (revision: number) => void; error: string }): ReactNode {
  const proposal = presentation.run.proposal;
  if (!proposal) return null;
  return (
    <article className="active-object proposal" aria-labelledby="proposal-title">
      <header className="object-header"><div><p className="eyebrow">Decision object / Revision {proposal.revision}</p><h2 id="proposal-title">{proposal.objective}</h2></div><StatusPill state="awaiting approval" /></header>
      <p className="current-state">{proposal.currentState}</p>
      <section className="proposal-section"><h3>Planned sequence</h3><ol>{proposal.steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol></section>
      <div className="proposal-grid"><section><h3>Expected scope</h3><ul className="scope-list">{proposal.expectedScope.map((scope) => <li className="mono" key={scope}>{scope}</li>)}</ul></section><section><h3>Risk boundary</h3>{proposal.risks.map((risk) => <p className="risk" key={risk}>{risk}</p>)}</section></div>
      <section className="completion-test"><span>Completion evidence</span><p>{proposal.completionTest}</p></section>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <footer className="decision-bar"><div><span>Current approvable revision</span><strong>REV {proposal.revision}</strong></div><div className="button-group"><button className="button ghost" onClick={onCancel}>Cancel</button><button className="button secondary" onClick={onModify}>Revise plan</button><button className="button secondary" onClick={onContext}>Add Context and Replan</button><button className="button primary" onClick={() => onProceed(proposal.revision)}>Proceed with revision {proposal.revision}</button></div></footer>
    </article>
  );
}

function ActivityObject({ run, onDetails, onCancel }: { run: RunPresentation; onDetails: () => void; onCancel: () => void }): ReactNode {
  const [now, setNow] = useState(Date.now());
  const terminal = ["awaiting approval", "completed", "failed", "cancelled", "cancelled_before_execution"].includes(run.state);
  const operationStartedAt = (run.run.approved_proposal_revision ? run.events.find((event) => event.title === "execution accepted")?.occurredAt : null) ?? run.events[0]?.occurredAt ?? run.run.created_at;
  useEffect(() => { if (terminal) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [terminal]);
  const heading = run.state === "inspecting" || run.state === "planning" || run.state === "modifying" ? "Preparing the plan." : run.state === "completed" ? "Execution completed." : run.state === "failed" ? "Operation failed." : run.state === "cancelled" || run.state === "cancelled_before_execution" ? "Run exited safely." : run.state === "approved" ? "Execution queued." : "Executing approved work.";
  const failureMessage = run.run.failure === null ? null : String((run.run.failure as { message?: string }).message ?? "Provider execution failed.");
  return <article className={`active-object activity activity-${run.state}`}><header className="object-header"><div><p className="eyebrow">{run.run.provider} / Revision {run.run.approved_proposal_revision ?? run.run.proposal_revision}</p><h2>{heading}</h2></div><StatusPill state={run.state} /></header><div className="activity-core"><div className="activity-orbit" aria-hidden="true"><i /><i /><span /></div><div><p className="state-message">{run.statusMessage}</p><p className="mono">{elapsedLabel(operationStartedAt, terminal ? new Date(run.run.completed_at ?? run.events.at(-1)?.occurredAt ?? operationStartedAt).getTime() : now)}</p>{run.events.length > 0 && <ol className="live-stages">{run.events.slice(-5).map((event) => <li key={event.id}><strong>{event.title}</strong><span>{event.detail}</span></li>)}</ol>}{run.run.execution_result?.summary && <p>{run.run.execution_result.summary}</p>}{failureMessage !== null && <p className="inline-error">{failureMessage}</p>}<p className="quiet">JARVIS does not commit or push repository changes.</p></div></div>{terminal && <TimingDiagnostics run={run} />}<footer className="activity-actions"><button className="button secondary" onClick={onDetails}>Open run details</button>{run.state === "working" && <button className="button ghost danger" onClick={onCancel}>Cancel execution</button>}</footer></article>;
}

function TimingDiagnostics({ run }: { run: RunPresentation }): ReactNode {
  const at = (type: string): number | null => { const event = run.events.find((item) => item.title === type.replaceAll("_", " ")); return event ? new Date(event.occurredAt).getTime() : null; };
  const duration = (start: string, end: string): string => { const left = at(start); const right = at(end); return left === null || right === null ? "—" : `${right - left} ms`; };
  return <details className="surface"><summary>Performance diagnostics</summary><p className="quiet">Stored locally from real backend events.</p><dl><div><dt>Preflight</dt><dd>{duration("request_accepted", "provider_ready")}</dd></div><div><dt>Repository inspection</dt><dd>{duration("repository_inspection_started", "repository_inspection_completed")}</dd></div><div><dt>Provider wait to first event</dt><dd>{duration("provider_execution_started", "first_provider_event")}</dd></div><div><dt>Provider total</dt><dd>{duration("provider_execution_started", "provider_execution_completed")}</dd></div><div><dt>Repository reconciliation</dt><dd>{duration("collecting_repository_changes", "repository_reconciliation_completed")}</dd></div><div><dt>Validation</dt><dd>{duration("validation_started", "validation_completed")}</dd></div><div><dt>Total elapsed</dt><dd>{elapsedLabel(run.run.created_at, new Date(run.run.completed_at ?? run.events.at(-1)?.occurredAt ?? run.run.created_at).getTime())}</dd></div></dl></details>;
}

function ContextReplanForm({ presentation, busy, error, onBack, onInvalid, onSubmit }: { presentation: RunPresentation; busy: boolean; error: string; onBack: () => void; onInvalid: () => void; onSubmit: (packet: ReturnType<typeof ContextPacketSchema.parse>) => Promise<void> }): ReactNode {
  const existing = presentation.run.context_packet;
  const proposal = presentation.run.proposal;
  const needsDetails = proposal?.contextStatus === "needs_more_context" && existing !== null;
  return <form className="active-object modify-object" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const packet = ContextPacketSchema.safeParse({ summary: String(data.get("summary") ?? ""), expectedBehavior: String(data.get("expectedBehavior") ?? ""), actualBehavior: String(data.get("actualBehavior") ?? ""), reproductionSteps: String(data.get("reproductionSteps") ?? "").split("\n"), evidence: String(data.get("evidence") ?? ""), constraints: String(data.get("constraints") ?? "").split("\n") }); if (!packet.success) { onInvalid(); return; } void onSubmit(packet.data); }}>
    <p className="eyebrow">User-supplied Context Packet / Revision {presentation.run.proposal_revision}</p>
    <h2>{proposal?.followUpQuestion ?? "What should JARVIS know?"}</h2>
    <p>Tell JARVIS what it is missing. It will combine your context with what it knows, then verify what the repository actually supports.</p>
    <label htmlFor="freeform-context">What should JARVIS know?<textarea id="freeform-context" name="summary" rows={4} defaultValue={existing?.summary ?? existing?.context ?? ""} placeholder="My suit starts freezing at high altitudes when I fly." autoFocus /></label>
    {needsDetails && <details><summary>Add more details</summary><p className="quiet">The model needs more specific information. Add only what you know.</p><label>Expected behavior<textarea name="expectedBehavior" rows={2} defaultValue={existing?.expectedBehavior ?? ""} /></label><label>Actual behavior<textarea name="actualBehavior" rows={2} defaultValue={existing?.actualBehavior ?? ""} /></label><label>Reproduction steps<textarea name="reproductionSteps" rows={4} placeholder="One step per line" defaultValue={existing?.reproductionSteps?.join("\n") ?? ""} /></label><label>Evidence or logs<textarea name="evidence" rows={3} defaultValue={existing?.evidence ?? ""} /></label><label>Constraints<textarea name="constraints" rows={3} placeholder="One constraint per line" defaultValue={existing?.constraints?.join("\n") ?? ""} /></label></details>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="button-group"><button type="button" className="button ghost" disabled={busy} onClick={onBack}>Back</button><button className="button primary" disabled={busy}>{busy ? "Assessing context…" : "Replan with context"}</button></div>
  </form>;
}

function HandoffCard({ projectId, handoff, updating, onUseNextStep }: { projectId: string; handoff: ProjectHandoff | null; updating: boolean; onUseNextStep: (instruction: string) => void }): ReactNode {
  const service = useJarvisService();
  const [correcting, setCorrecting] = useState(false);
  const [message, setMessage] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!handoff) return <GlassPanel material="elevated" className="handoff-card handoff-empty"><TechnicalLabel>Where we left off</TechnicalLabel><h2>{updating ? "Updating project state…" : "No handoff yet"}</h2><p role="status">{updating ? "JARVIS is generating a structured project handoff." : "JARVIS will summarize where this project stands after the first terminal run."}</p></GlassPanel>;
  const validationTitle = {
    passed: "Tests passed",
    failed: "Tests failed",
    timed_out: "Tests timed out",
    invocation_failed: "Test runner unavailable",
    not_supported: "No supported automated tests detected",
    pending: "Validation pending",
    running: "Validation running",
  }[handoff.validationSummary.status] ?? handoff.validationSummary.status.replaceAll("_", " ");
  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const list = (name: string): string[] | undefined => {
      const values = String(data.get(name) ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
      return values.length ? values : undefined;
    };
    const text = (name: string): string | undefined => String(data.get(name) ?? "").trim() || undefined;
    const corrections: HandoffCorrections = {
      currentObjective: text("currentObjective"),
      currentStatus: text("currentStatus"),
      blockers: list("blockers"),
      openDecisions: list("openDecisions"),
      activeConstraints: list("activeConstraints"),
      recommendedNextAction: text("recommendedNextAction"),
    };
    setBusy(true); setMessage(""); setSaveFailed(false);
    try { await service.correctHandoff(projectId, corrections); setCorrecting(false); setMessage("Project-state correction saved as user-provided context."); }
    catch (cause) { setSaveFailed(true); setMessage(cause instanceof Error ? cause.message : "The correction could not be saved."); }
    finally { setBusy(false); }
  };
  const evidence = <><p><strong>Source run:</strong> <span className="mono">{handoff.lastRunId}</span></p><p><strong>Updated:</strong> <time dateTime={handoff.generatedAt}>{new Date(handoff.generatedAt).toLocaleString()}</time></p><p><strong>Generation status:</strong> {handoff.generationStatus.replaceAll("_", " ")}</p>{handoff.evidenceEntries.map((entry, index) => <p key={`${entry.timestamp}-${index}`}><strong>{entry.category.replaceAll("_", " ")}:</strong> {entry.summary}</p>)}{handoff.diagnostics.map((item) => <p className="quiet" key={item}>{item}</p>)}</>;
  return <HandoffCardShell
    objective={handoff.currentObjective}
    status={handoff.currentStatus}
    lastMeaningfulAction={handoff.lastMeaningfulAction}
    freshness={handoff.freshnessStatus.replaceAll("_", " ")}
    blockers={handoff.blockers}
    openDecisions={handoff.openDecisions}
    recommendedNextAction={handoff.recommendedNextAction}
    actions={<><button className="button secondary" onClick={() => onUseNextStep(handoff.recommendedNextAction)}>Use recommended next step</button><button className="button ghost" aria-expanded={correcting} onClick={() => setCorrecting((value) => !value)}>Correct project state</button></>}
    evidence={evidence}
  >
    {(updating || handoff.generationStatus === "pending") && <p role="status">Updating project state…</p>}
    {handoff.generationStatus === "deterministic_fallback" && <p className="inline-error">JARVIS preserved the verified run result, but the project summary could not be fully updated.</p>}
    {handoff.freshnessStatus === "potentially_stale" && <p className="handoff-stale-warning" role="alert">Repository changes were detected after this handoff was created. JARVIS will inspect the current repository before relying on this state.</p>}
    <div className="handoff-facts"><div><TechnicalLabel>Last run outcome</TechnicalLabel><p>{handoff.lastRunOutcome}</p></div><div><TechnicalLabel>Independent validation</TechnicalLabel><p>{validationTitle}</p></div><div><TechnicalLabel>Repository condition</TechnicalLabel><p>{handoff.repositorySummary.isGitRepository ? `${handoff.repositorySummary.dirtyPaths.length} visible changed path(s)` : "Repository unavailable or non-Git; freshness is conservative"}</p></div><div><TechnicalLabel>Generation status</TechnicalLabel><p>{handoff.generationStatus.replaceAll("_", " ")}</p></div></div>
    {handoff.changedFiles.length > 0 && <section><TechnicalLabel>Changed files</TechnicalLabel><ul className="scope-list">{handoff.changedFiles.map((file) => <li className="mono" key={file}>{file}</li>)}</ul></section>}
    {handoff.activeConstraints.length > 0 && <section><TechnicalLabel>Active constraints</TechnicalLabel><ul>{handoff.activeConstraints.map((item) => <li key={item}>{item}</li>)}</ul></section>}
    {correcting && <form className="handoff-corrections" onSubmit={(event) => void save(event)}><p className="quiet">Corrections override narrative inference, remain auditable, and cannot change repository or validation evidence.</p><label>Current objective<textarea name="currentObjective" rows={2} /></label><label>Current status<textarea name="currentStatus" rows={2} /></label><label>Blockers <small>One per line</small><textarea name="blockers" rows={2} /></label><label>Open decisions <small>One per line</small><textarea name="openDecisions" rows={2} /></label><label>Active constraints <small>One per line</small><textarea name="activeConstraints" rows={2} /></label><label>Recommended next action<textarea name="recommendedNextAction" rows={2} /></label><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save correction"}</button></form>}
    {message && <p role={saveFailed ? "alert" : "status"} className={saveFailed ? "inline-error" : "quiet"}>{message}</p>}
  </HandoffCardShell>;
}

function WorkspaceView({ project, onRunDetails }: { project: Project; onRunDetails: () => void }): ReactNode {
  const service = useJarvisService();
  const { activeRun, activeHandoff, handoffUpdating } = useJarvisSnapshot();
  const [instruction, setInstruction] = useState("");
  const [modifying, setModifying] = useState(false);
  const [addingContext, setAddingContext] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [modification, setModification] = useState("Narrow the scope to diagnostics and their focused tests only.");
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [activeRun?.state]);

  const invoke = async (operation: () => Promise<unknown>): Promise<void> => { try { setError(""); await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed."); } };

  function center(): ReactNode {
    if (!activeRun) return <article className="active-object instruction-object command-composer"><div className="composer-context"><TechnicalLabel>Task / read-only planning first</TechnicalLabel><span className="mono">{project.provider} · {project.name}</span></div><h2>What should JARVIS change?</h2><p>Enter today's coding task here. JARVIS asks the selected provider to inspect the repository and propose a bounded plan; no files change until you approve it.</p><label htmlFor="instruction">Task instruction</label><textarea id="instruction" placeholder="Add a multiply function and an automated test. Follow existing conventions. Do not commit or push." value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={5} />{error && <p className="inline-error" role="alert">{error}</p>}<div className="instruction-footer"><span><i aria-hidden="true" /> Planning is read-only · approval required</span><button className="button primary" disabled={!instruction.trim()} onClick={() => void invoke(() => service.inspect(project.id, instruction))}>Inspect and propose <i aria-hidden="true">↗</i></button></div></article>;
    if (activeRun.state === "awaiting approval") {
      if (addingContext) return <ContextReplanForm presentation={activeRun} busy={contextBusy} error={error} onBack={() => setAddingContext(false)} onInvalid={() => setError("Tell JARVIS what it should know, or add a specific detail.")} onSubmit={async (packet) => { setContextBusy(true); setError(""); try { const result = await service.addContext(activeRun.run.id, activeRun.run.proposal_revision, packet); if (result.run.proposal?.contextStatus !== "needs_more_context") setAddingContext(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "Context replanning failed."); } finally { setContextBusy(false); } }} />;
      if (modifying) return <article className="active-object modify-object"><p className="eyebrow">Revise plan / Same run · Revision {activeRun.run.proposal_revision}</p><h2>Refine the proposal boundary.</h2><p>The current proposal remains preserved. Submitting creates revision {activeRun.run.proposal_revision + 1} in this run and keeps the provider session.</p><label htmlFor="modification">Requested change</label><textarea id="modification" value={modification} onChange={(event) => setModification(event.target.value)} rows={4} autoFocus /><div className="button-group"><button className="button ghost" onClick={() => setModifying(false)}>Back</button><button className="button primary" onClick={() => void invoke(async () => { await service.modify(activeRun.run.id, activeRun.run.proposal_revision, modification); setModifying(false); })}>Create revision {activeRun.run.proposal_revision + 1}</button></div></article>;
      return <ProposalReview presentation={activeRun} error={error} onModify={() => setModifying(true)} onContext={() => setAddingContext(true)} onCancel={() => void invoke(() => service.cancel(activeRun.run.id))} onProceed={(revision) => void invoke(() => service.proceed(activeRun.run.id, revision))} />;
    }
    const activity = <ActivityObject run={activeRun} onDetails={onRunDetails} onCancel={() => void invoke(() => service.cancelExecution(activeRun.run.id))} />;
    if (!["completed", "failed", "cancelled", "cancelled_before_execution"].includes(activeRun.state)) return activity;
    return <>{activity}<article className="active-object instruction-object command-composer"><div className="composer-context"><TechnicalLabel>Next task / read-only planning first</TechnicalLabel><span className="mono">{project.provider} · {project.name}</span></div><h2>What should JARVIS do next?</h2><label htmlFor="next-instruction">Task instruction</label><textarea id="next-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={4} placeholder="Describe the next bounded change." />{error && <p className="inline-error" role="alert">{error}</p>}<div className="instruction-footer"><span><i aria-hidden="true" /> Planning is read-only · approval required</span><button className="button primary" disabled={!instruction.trim()} onClick={() => void invoke(() => service.inspect(project.id, instruction))}>Inspect and propose <i aria-hidden="true">↗</i></button></div></article></>;
  }

  return <section className="view workspace-view" aria-labelledby="workspace-title"><header className="workspace-header"><div><p className="eyebrow">Project workspace</p><h1 id="workspace-title" ref={headingRef} tabIndex={-1}>{project.name}</h1></div><div className="workspace-state"><span>Current state</span><strong>{activeRun ? stateLabel(activeRun.state) : "IDLE"}</strong></div></header><p className="sr-only" role="status" aria-live="polite">{activeRun?.statusMessage || "Project is idle and ready for an instruction."}</p><HandoffCard projectId={project.id} handoff={activeHandoff} updating={handoffUpdating} onUseNextStep={(next) => setInstruction(next)} /><div className="workspace-grid"><ProjectContext project={project} /><div className="center-stage">{center()}</div><aside className="evidence-rail" aria-label="Current context"><p className="rail-label">Context / now</p>{activeRun ? <><dl><div><dt>Run</dt><dd className="mono">{activeRun.run.id}</dd></div><div><dt>Proposal</dt><dd>Revision {activeRun.run.proposal_revision || "—"}</dd></div><div><dt>Approved</dt><dd>{activeRun.run.approved_proposal_revision ? `Revision ${activeRun.run.approved_proposal_revision}` : "Not yet"}</dd></div><div><dt>Session</dt><dd className="mono">{activeRun.run.provider_session_id || "Pending"}</dd></div></dl>{activeRun.revisions.length > 1 && <div className="revision-stack"><span>Revision history</span>{activeRun.revisions.map((item) => <b key={item.revision}>REV {item.revision}{item.revision === activeRun.run.proposal_revision ? " / CURRENT" : " / SUPERSEDED"}</b>)}</div>}</> : <p className="quiet">Project context will remain peripheral until inspection produces a decision.</p>}</aside></div></section>;
}

function ValidationEvidence({ verification }: { verification: NonNullable<RunPresentation["run"]["verification"]> }): ReactNode {
  const result = verification.validation;
  if (!result) return <section className="surface validation-evidence validation-unsupported"><div className="section-kicker">Authoritative JARVIS validation</div><p>{verification.message}</p></section>;
  const title = {
    not_supported: "No supported automated tests detected",
    pending: "Tests pending",
    running: "Tests running",
    passed: "Tests passed",
    failed: "Tests failed",
    timed_out: "Tests timed out",
    invocation_failed: "Test runner unavailable",
  }[result.status];
  return <section className={`surface validation-evidence validation-${result.status}`}><div className="validation-heading"><div><div className="section-kicker">Authoritative JARVIS validation</div><h2>{title}</h2></div><span className="validation-seal" aria-hidden="true">J</span></div><p>{verification.message}</p>{result.packageManager && <dl><div><dt>Package manager</dt><dd>{result.packageManager}</dd></div><div><dt>Command</dt><dd className="mono">{result.commandDisplay}</dd></div>{result.durationMs !== null && <div><dt>Duration</dt><dd>{result.durationMs} ms</dd></div>}<div><dt>Exit code</dt><dd>{result.exitCode ?? "—"}</dd></div></dl>}{result.stdout && <details open><summary>Test output</summary><pre>{result.stdout}</pre></details>}{result.stderr && <details open={result.status !== "passed"}><summary>Test errors</summary><pre>{result.stderr}</pre></details>}</section>;
}

function RunDetailsView({ project, onBack }: { project: Project; onBack: () => void }): ReactNode {
  const { activeRun } = useJarvisSnapshot();
  if (!activeRun) return <section className="view empty-run"><p className="eyebrow">Run details</p><h1>No active run.</h1><p>Start an inspection from the project workspace.</p><button className="button primary" onClick={onBack}>Open workspace</button></section>;
  const proposal = activeRun.run.proposal;
  const context = activeRun.run.context_packet;
  return <section className="view run-view" aria-labelledby="run-title"><header className="view-header split"><div><p className="eyebrow">{project.name} / {activeRun.run.provider} / {activeRun.run.id}</p><h1 id="run-title">Run evidence.</h1><p>{activeRun.statusMessage}</p></div><StatusPill state={activeRun.state} /></header>{activeRun.run.execution_result?.summary && <section className="surface provider-summary"><div className="section-kicker">Provider narrative</div><p>{activeRun.run.execution_result.summary}</p></section>}{activeRun.run.failure && <p className="inline-error" role="alert">{String((activeRun.run.failure as { message?: string }).message ?? "Provider execution failed.")}</p>}{activeRun.run.verification && <ValidationEvidence verification={activeRun.run.verification} />}<div className="run-grid"><section className="surface event-timeline"><div className="section-kicker">Chronological activity</div>{activeRun.events.length ? <ol>{activeRun.events.map((item, index) => <li key={item.id}><span className="event-sequence">{String(index + 1).padStart(2, "0")}</span><span className={`event-kind kind-${item.kind}`} aria-hidden="true" /><div><span className="event-category">{item.kind}</span><strong>{item.title}</strong><p>{item.detail}</p><time dateTime={item.occurredAt}>{formatTime(item.occurredAt)}</time><DiagnosticsDisclosure event={item} /></div></li>)}</ol> : <p className="quiet">Execution events begin after an exact proposal revision is approved.</p>}</section><aside className="run-side"><section className="surface"><div className="section-kicker">Approval record</div><dl><div><dt>Provider</dt><dd>{activeRun.run.provider}</dd></div><div><dt>Decision</dt><dd>{activeRun.run.approval_decision || "Pending"}</dd></div><div><dt>Current revision</dt><dd>{activeRun.run.proposal_revision || "—"}</dd></div><div><dt>Sealed revision</dt><dd>{activeRun.run.approved_proposal_revision || "—"}</dd></div><div><dt>Repository before</dt><dd>{Object.keys(activeRun.run.pre_execution_snapshot?.files ?? {}).length} dirty path(s)</dd></div><div><dt>Repository after</dt><dd>{Object.keys(activeRun.run.post_execution_snapshot?.files ?? {}).length} dirty path(s)</dd></div></dl></section>{context && <section className="surface"><div className="section-kicker">User-supplied Context Packet</div>{context.summary && <p><strong>Context:</strong> {context.summary}</p>}{!context.summary && context.context && <p><strong>Context:</strong> {context.context}</p>}{context.problem && <p><strong>Problem:</strong> {context.problem}</p>}{context.expectedBehavior && <p><strong>Expected:</strong> {context.expectedBehavior}</p>}{context.actualBehavior && <p><strong>Actual:</strong> {context.actualBehavior}</p>}{context.reproductionSteps && <ol>{context.reproductionSteps.map((step) => <li key={step}>{step}</li>)}</ol>}{context.evidence && <p><strong>Evidence:</strong> {context.evidence}</p>}{context.constraints && <ul>{context.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul>}</section>}<section className="surface"><div className="section-kicker">Scope reconciliation</div>{activeRun.changedFiles.length ? <ul className="scope-list">{activeRun.changedFiles.map((file) => <li className="mono" key={file}>{file}</li>)}</ul> : <p className="quiet">No execution changes recorded.</p>}</section></aside></div>{proposal && <section className="surface run-proposal"><div className="section-kicker">Approved decision object</div><h2>{proposal.objective}</h2><p>{proposal.completionTest}</p></section>}<button className="button secondary" onClick={onBack}>Return to workspace</button></section>;
}

export default function App(): ReactNode {
  const service = useJarvisService();
  const { projects, activeRun, error, hydrationStatus, projectLoading, selectedProjectId } = useJarvisSnapshot();
  const [view, setView] = useState<View>("projects");
  const [projectId, setProjectId] = useState("");
  const project = projects.find((item) => item.id === projectId) || projects[0];
  useEffect(() => { if (hydrationStatus === "ready" && selectedProjectId) { setProjectId(selectedProjectId); setView("workspace"); } }, [hydrationStatus, selectedProjectId]);
  const select = async (selected: Project): Promise<void> => { await service.selectProject(selected.id); setProjectId(selected.id); setView("workspace"); };
  if (hydrationStatus === "not_initialized" || hydrationStatus === "hydrating") return <main className="view empty-run" aria-busy="true"><p className="eyebrow">Restoring local state</p><h1>Loading JARVIS.</h1><p>Projects and the latest persisted planning run are being restored.</p></main>;
  if (hydrationStatus === "failed") return <main className="view empty-run"><p className="eyebrow">Startup unavailable</p><h1>JARVIS could not load.</h1><p className="inline-error" role="alert">{error}</p></main>;
  if (projectLoading) return <main className="view empty-run" aria-busy="true"><p className="eyebrow">Project restoration</p><h1>Loading project context.</h1><p>The persisted run and proposal history are being restored.</p></main>;
  if (projects.length === 0) return <AppShell view="setup" setView={() => undefined} status="idle">{error && <p className="inline-error global-error" role="alert">{error}</p>}<SetupView onCreated={select} /></AppShell>;
  return <AppShell view={view} setView={setView} status={activeRun?.state || "idle"} project={project}>{error && <p className="inline-error global-error" role="alert">{error}</p>}{view === "setup" && <SetupView onCreated={select} />}{view === "projects" && <ProjectsView onSelect={select} onSetup={() => setView("setup")} />}{view === "workspace" && project && <WorkspaceView project={project} onRunDetails={() => setView("run")} />}{view === "run" && project && <RunDetailsView project={project} onBack={() => setView("workspace")} />}</AppShell>;
}
