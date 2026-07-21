import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Project } from "../shared/projects.js";
import type { PlanProposal } from "../shared/runs.js";
import { ContextPacketSchema } from "../shared/context.js";
import { useJarvisService, useJarvisSnapshot } from "./runtime.js";
import type { RunPresentation, UiWorkflowState } from "./service.js";

type View = "setup" | "projects" | "workspace" | "run";

const stateLabel = (state: UiWorkflowState): string => state.toUpperCase();
const formatTime = (value: string): string => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

function StatusPill({ state }: { state: UiWorkflowState | Project["status"] }): ReactNode {
  return <span className={`status-pill status-${state.replaceAll(" ", "-")}`}>{state.toUpperCase()}</span>;
}

function AppShell({ view, setView, children, status }: { view: View; setView: (view: View) => void; children: ReactNode; status: UiWorkflowState }): ReactNode {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="global-header">
        <button className="brand" onClick={() => setView("projects")} aria-label="JARVIS Core, go to projects">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>JARVIS</strong><small>CORE / 0.1</small></span>
        </button>
        <div className="system-presence" role="status" aria-live="polite">
          <span className={`presence-dot presence-${status.replaceAll(" ", "-")}`} aria-hidden="true" />
          <span>{stateLabel(status)}</span>
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

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const project = await service.createProject({
        name: String(data.get("name")), objective: String(data.get("objective")), repositoryPath: String(data.get("path")), provider: "codex",
      });
      onCreated(project);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Project creation failed."); }
    finally { setBusy(false); }
  }

  return (
    <section className="view setup-view" aria-labelledby="setup-title">
      <header className="view-header"><p className="eyebrow">Local readiness</p><h1 id="setup-title">Make this device ready.</h1><p>Provider-aware, local by default, and explicit about every execution boundary.</p></header>
      <ol className="readiness-steps" aria-label="Setup progress"><li className="done"><b>01</b><span>Runtime<small>Node 22.12+ ready</small></span></li><li className="done"><b>02</b><span>Providers<small>Local adapters detected</small></span></li><li><b>03</b><span>Project<small>Create a workspace</small></span></li></ol>
      <div className="setup-grid">
        <section className="surface"><div className="section-kicker">Provider matrix</div>{providers.map((provider) => <article className="provider-row" key={provider.provider}><div><h2>{provider.provider === "codex" ? "Codex" : "Claude Code"}</h2><p>{provider.detail}</p></div><span className={provider.authenticated ? "ready" : "neutral"}>{provider.installed ? "Detected" : "Unavailable"}</span></article>)}</section>
        <form className="surface project-form" onSubmit={(event) => void submit(event)}><div className="section-kicker">New project</div><label>Project name<input name="name" defaultValue="MK 43" required /></label><label>Objective<textarea name="objective" defaultValue="Prepare and validate the next system iteration" required /></label><label>Repository path<input name="path" defaultValue="/Users/example/Projects/MK-43" required /></label>{error && <p className="inline-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create project"}</button></form>
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
  return <aside className="context-rail" aria-label="Project context"><p className="rail-label">Active project</p><h2>{project.name}</h2><p>{project.objective}</p><dl><div><dt>Provider</dt><dd>{project.provider}</dd></div><div><dt>Repository</dt><dd className="mono">{project.repository_path}</dd></div><div><dt>Current phase</dt><dd>{project.current_phase}</dd></div><div><dt>Next action</dt><dd>{project.next_action}</dd></div></dl></aside>;
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
      <footer className="decision-bar"><div><span>Current approvable revision</span><strong>REV {proposal.revision}</strong></div><div className="button-group"><button className="button ghost" onClick={onCancel}>Cancel</button><button className="button secondary" onClick={onModify}>Modify</button><button className="button secondary" onClick={onContext}>Add Context and Replan</button><button className="button primary" onClick={() => onProceed(proposal.revision)}>Proceed with revision {proposal.revision}</button></div></footer>
    </article>
  );
}

function ActivityObject({ run, onDetails, onCancel }: { run: RunPresentation; onDetails: () => void; onCancel: () => void }): ReactNode {
  return <article className={`active-object activity activity-${run.state}`}><header className="object-header"><div><p className="eyebrow">Run / {run.run.id}</p><h2>{run.state === "approved" ? "Plan approved." : run.state === "cancelled" ? "Run exited safely." : run.state === "failed" ? "Planning could not continue." : "System activity in progress."}</h2></div><StatusPill state={run.state} /></header><div className="activity-core"><div className="activity-orbit" aria-hidden="true"><i /><i /><span /></div><div><p className="state-message">{run.statusMessage}</p><p className="quiet">Planning behavior follows the persisted Gate 2 lifecycle. No execution occurs in this gate.</p></div></div><footer className="activity-actions"><button className="button secondary" onClick={onDetails}>Open run details</button>{run.state === "working" && <button className="button ghost danger" onClick={onCancel}>Cancel execution</button>}</footer></article>;
}

function WorkspaceView({ project, onRunDetails }: { project: Project; onRunDetails: () => void }): ReactNode {
  const service = useJarvisService();
  const { activeRun } = useJarvisSnapshot();
  const [instruction, setInstruction] = useState("Inspect the MK 42 diagnostic systems, propose the smallest safe validation update, and keep propulsion controls out of scope.");
  const [modifying, setModifying] = useState(false);
  const [addingContext, setAddingContext] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [modification, setModification] = useState("Narrow the scope to diagnostics and their focused tests only.");
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [activeRun?.state]);

  const invoke = async (operation: () => Promise<unknown>): Promise<void> => { try { setError(""); await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed."); } };

  function center(): ReactNode {
    if (!activeRun) return <article className="active-object instruction-object"><p className="eyebrow">Instruction / read-only entry</p><h2>What should JARVIS examine?</h2><p>Inspection gathers project-aware context and returns a structured proposal. No files change before explicit approval.</p><label htmlFor="instruction">High-level instruction</label><textarea id="instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={5} />{error && <p className="inline-error" role="alert">{error}</p>}<div className="instruction-footer"><span><i aria-hidden="true" /> Read-only inspection</span><button className="button primary" onClick={() => void invoke(() => service.inspect(project.id, instruction))}>Inspect and propose</button></div></article>;
    if (activeRun.state === "awaiting approval") {
      if (addingContext) return <form className="active-object modify-object" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const packetResult = ContextPacketSchema.safeParse({ problem: data.get("problem"), expectedBehavior: data.get("expectedBehavior"), actualBehavior: data.get("actualBehavior"), reproductionSteps: String(data.get("reproductionSteps") ?? "").split("\n"), evidence: data.get("evidence"), constraints: String(data.get("constraints") ?? "").split("\n") }); if (!packetResult.success) { setError("Add at least one non-empty context field."); return; } setContextBusy(true); void invoke(async () => { await service.addContext(activeRun.run.id, activeRun.run.proposal_revision, packetResult.data); setAddingContext(false); }).finally(() => setContextBusy(false)); }}><p className="eyebrow">User-supplied Context Packet / Revision {activeRun.run.proposal_revision}</p><h2>Add missing facts and replan.</h2><p>Use this for symptoms, evidence, or reproduction details not available in the repository. Modify remains the action for correcting the plan itself.</p><label>Problem<textarea name="problem" rows={2} /></label><label>Expected behavior<textarea name="expectedBehavior" rows={2} /></label><label>Actual behavior<textarea name="actualBehavior" rows={2} /></label><label>Reproduction steps<textarea name="reproductionSteps" rows={4} placeholder="One step per line" /></label><label>Evidence or logs<textarea name="evidence" rows={3} /></label><label>Constraints<textarea name="constraints" rows={3} placeholder="One constraint per line" /></label>{error && <p className="inline-error" role="alert">{error}</p>}<div className="button-group"><button type="button" className="button ghost" disabled={contextBusy} onClick={() => setAddingContext(false)}>Back</button><button className="button primary" disabled={contextBusy}>{contextBusy ? "Saving and replanning…" : `Add context and create revision ${activeRun.run.proposal_revision + 1}`}</button></div></form>;
      if (modifying) return <article className="active-object modify-object"><p className="eyebrow">Modify / Same run · Revision {activeRun.run.proposal_revision}</p><h2>Refine the proposal boundary.</h2><p>The current proposal remains preserved. Submitting creates revision {activeRun.run.proposal_revision + 1} in this run and keeps the provider session.</p><label htmlFor="modification">Requested change</label><textarea id="modification" value={modification} onChange={(event) => setModification(event.target.value)} rows={4} autoFocus /><div className="button-group"><button className="button ghost" onClick={() => setModifying(false)}>Back</button><button className="button primary" onClick={() => void invoke(async () => { await service.modify(activeRun.run.id, activeRun.run.proposal_revision, modification); setModifying(false); })}>Create revision {activeRun.run.proposal_revision + 1}</button></div></article>;
      return <ProposalReview presentation={activeRun} error={error} onModify={() => setModifying(true)} onContext={() => setAddingContext(true)} onCancel={() => void invoke(() => service.cancel(activeRun.run.id))} onProceed={(revision) => void invoke(() => service.proceed(activeRun.run.id, revision))} />;
    }
    return <ActivityObject run={activeRun} onDetails={onRunDetails} onCancel={() => void invoke(() => service.cancelExecution(activeRun.run.id))} />;
  }

  return <section className="view workspace-view" aria-labelledby="workspace-title"><header className="workspace-header"><div><p className="eyebrow">Project workspace</p><h1 id="workspace-title" ref={headingRef} tabIndex={-1}>{project.name}</h1></div><div className="workspace-state"><span>Current state</span><strong>{activeRun ? stateLabel(activeRun.state) : "IDLE"}</strong></div></header><p className="sr-only" role="status" aria-live="polite">{activeRun?.statusMessage || "Project is idle and ready for an instruction."}</p><div className="workspace-grid"><ProjectContext project={project} /><div className="center-stage">{center()}</div><aside className="evidence-rail" aria-label="Current context"><p className="rail-label">Context / now</p>{activeRun ? <><dl><div><dt>Run</dt><dd className="mono">{activeRun.run.id}</dd></div><div><dt>Proposal</dt><dd>Revision {activeRun.run.proposal_revision || "—"}</dd></div><div><dt>Approved</dt><dd>{activeRun.run.approved_proposal_revision ? `Revision ${activeRun.run.approved_proposal_revision}` : "Not yet"}</dd></div><div><dt>Session</dt><dd className="mono">{activeRun.run.provider_session_id || "Pending"}</dd></div></dl>{activeRun.revisions.length > 1 && <div className="revision-stack"><span>Revision history</span>{activeRun.revisions.map((item) => <b key={item.revision}>REV {item.revision}{item.revision === activeRun.run.proposal_revision ? " / CURRENT" : " / SUPERSEDED"}</b>)}</div>}</> : <p className="quiet">Project context will remain peripheral until inspection produces a decision.</p>}</aside></div></section>;
}

function RunDetailsView({ project, onBack }: { project: Project; onBack: () => void }): ReactNode {
  const { activeRun } = useJarvisSnapshot();
  if (!activeRun) return <section className="view empty-run"><p className="eyebrow">Run details</p><h1>No active run.</h1><p>Start an inspection from the project workspace.</p><button className="button primary" onClick={onBack}>Open workspace</button></section>;
  const proposal = activeRun.run.proposal;
  const context = activeRun.run.context_packet;
  return <section className="view run-view" aria-labelledby="run-title"><header className="view-header split"><div><p className="eyebrow">{project.name} / {activeRun.run.id}</p><h1 id="run-title">Run evidence.</h1><p>{activeRun.statusMessage}</p></div><StatusPill state={activeRun.state} /></header><div className="run-grid"><section className="surface event-timeline"><div className="section-kicker">Chronological activity</div>{activeRun.events.length ? <ol>{activeRun.events.map((item, index) => <li key={item.id}><span className="event-sequence">{String(index + 1).padStart(2, "0")}</span><span className={`event-kind kind-${item.kind}`} aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.detail}</p><time dateTime={item.occurredAt}>{formatTime(item.occurredAt)}</time></div></li>)}</ol> : <p className="quiet">Execution events begin after an exact proposal revision is approved.</p>}</section><aside className="run-side"><section className="surface"><div className="section-kicker">Approval record</div><dl><div><dt>Decision</dt><dd>{activeRun.run.approval_decision || "Pending"}</dd></div><div><dt>Current revision</dt><dd>{activeRun.run.proposal_revision || "—"}</dd></div><div><dt>Sealed revision</dt><dd>{activeRun.run.approved_proposal_revision || "—"}</dd></div></dl></section>{context && <section className="surface"><div className="section-kicker">User-supplied Context Packet</div>{context.problem && <p><strong>Problem:</strong> {context.problem}</p>}{context.expectedBehavior && <p><strong>Expected:</strong> {context.expectedBehavior}</p>}{context.actualBehavior && <p><strong>Actual:</strong> {context.actualBehavior}</p>}{context.reproductionSteps && <ol>{context.reproductionSteps.map((step) => <li key={step}>{step}</li>)}</ol>}{context.evidence && <p><strong>Evidence:</strong> {context.evidence}</p>}{context.constraints && <ul>{context.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul>}</section>}<section className="surface"><div className="section-kicker">Scope reconciliation</div>{activeRun.changedFiles.length ? <ul className="scope-list">{activeRun.changedFiles.map((file) => <li className="mono" key={file}>{file}</li>)}</ul> : <p className="quiet">No execution changes recorded.</p>}</section></aside></div>{proposal && <section className="surface run-proposal"><div className="section-kicker">Approved decision object</div><h2>{proposal.objective}</h2><p>{proposal.completionTest}</p></section>}<button className="button secondary" onClick={onBack}>Return to workspace</button></section>;
}

export default function App(): ReactNode {
  const service = useJarvisService();
  const { projects, activeRun, error, hydrationStatus, projectLoading, selectedProjectId } = useJarvisSnapshot();
  const [view, setView] = useState<View>("projects");
  const [projectId, setProjectId] = useState("mk-42");
  const project = projects.find((item) => item.id === projectId) || projects[0];
  useEffect(() => { if (hydrationStatus === "ready" && selectedProjectId) { setProjectId(selectedProjectId); setView("workspace"); } }, [hydrationStatus, selectedProjectId]);
  const select = async (selected: Project): Promise<void> => { await service.selectProject(selected.id); setProjectId(selected.id); setView("workspace"); };
  if (hydrationStatus === "not_initialized" || hydrationStatus === "hydrating") return <main className="view empty-run" aria-busy="true"><p className="eyebrow">Restoring local state</p><h1>Loading JARVIS.</h1><p>Projects and the latest persisted planning run are being restored.</p></main>;
  if (hydrationStatus === "failed") return <main className="view empty-run"><p className="eyebrow">Startup unavailable</p><h1>JARVIS could not load.</h1><p className="inline-error" role="alert">{error}</p></main>;
  if (projectLoading) return <main className="view empty-run" aria-busy="true"><p className="eyebrow">Project restoration</p><h1>Loading project context.</h1><p>The persisted run and proposal history are being restored.</p></main>;
  return <AppShell view={view} setView={setView} status={activeRun?.state || "idle"}>{error && <p className="inline-error global-error" role="alert">{error}</p>}{view === "setup" && <SetupView onCreated={select} />}{view === "projects" && <ProjectsView onSelect={select} onSetup={() => setView("setup")} />}{view === "workspace" && project && <WorkspaceView project={project} onRunDetails={() => setView("run")} />}{view === "run" && project && <RunDetailsView project={project} onBack={() => setView("workspace")} />}</AppShell>;
}
