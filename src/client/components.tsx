import type { ReactNode } from "react";
import type { Project } from "../shared/projects.js";
import type { SimulatedGate3Event, UiWorkflowState } from "./service.js";

type Material = "base" | "elevated" | "interactive" | "inset";

export function GlassPanel({
  as = "section",
  material = "base",
  className = "",
  children,
}: {
  as?: "section" | "article" | "aside" | "div";
  material?: Material;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const Element = as;
  return <Element className={`glass-surface glass-surface-${material} ${className}`.trim()}>{children}</Element>;
}

export function TechnicalLabel({ children, className = "" }: { children: ReactNode; className?: string }): ReactNode {
  return <p className={`hud-label ${className}`.trim()}>{children}</p>;
}

export function StatusPill({ state }: { state: UiWorkflowState | Project["status"] }): ReactNode {
  return (
    <span className={`status-pill status-${state.replaceAll(" ", "-")}`}>
      <span className="status-dot" aria-hidden="true" />
      {state.toUpperCase()}
    </span>
  );
}

export function SystemStatus({
  label,
  value,
  state = "neutral",
  mono = false,
}: {
  label: string;
  value: string;
  state?: "neutral" | "ready" | "active" | "warning" | "error";
  mono?: boolean;
}): ReactNode {
  return (
    <span className={`system-status system-status-${state}`}>
      <span className="system-status-label">{label}</span>
      <span className={`system-status-value${mono ? " mono" : ""}`}>
        <i aria-hidden="true" />
        {value}
      </span>
    </span>
  );
}

export function DiagnosticsDisclosure({
  event,
  children,
}: {
  event?: SimulatedGate3Event;
  children?: ReactNode;
}): ReactNode {
  return (
    <details className="diagnostics-disclosure">
      <summary>Technical payload</summary>
      {children ?? <pre>{JSON.stringify(event, null, 2)}</pre>}
    </details>
  );
}

export interface HandoffCardShellProps {
  objective: string;
  status: string;
  lastMeaningfulAction: string;
  freshness: string;
  blockers?: string[];
  openDecisions?: string[];
  recommendedNextAction: string;
  children?: ReactNode;
  actions?: ReactNode;
  evidence?: ReactNode;
}

export function HandoffCardShell({
  objective,
  status,
  lastMeaningfulAction,
  freshness,
  blockers = [],
  openDecisions = [],
  recommendedNextAction,
  children,
  actions,
  evidence,
}: HandoffCardShellProps): ReactNode {
  return (
    <GlassPanel as="article" material="elevated" className="handoff-card" >
      <header className="handoff-card-header">
        <div>
          <TechnicalLabel>Where we left off</TechnicalLabel>
          <h2>{objective}</h2>
        </div>
        <span className="handoff-freshness">{freshness}</span>
      </header>
      <div className="handoff-grid">
        <div><TechnicalLabel>Status</TechnicalLabel><p>{status}</p></div>
        <div><TechnicalLabel>Last meaningful action</TechnicalLabel><p>{lastMeaningfulAction}</p></div>
      </div>
      {(blockers.length > 0 || openDecisions.length > 0) && (
        <div className="handoff-lists">
          {blockers.length > 0 && <section><TechnicalLabel>Blockers</TechnicalLabel><ul>{blockers.map((item) => <li key={item}>{item}</li>)}</ul></section>}
          {openDecisions.length > 0 && <section><TechnicalLabel>Open decisions</TechnicalLabel><ul>{openDecisions.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        </div>
      )}
      <div className="handoff-next"><TechnicalLabel>Recommended next action</TechnicalLabel><p>{recommendedNextAction}</p></div>
      {children}
      {actions && <div className="button-group handoff-actions">{actions}</div>}
      {evidence && <DiagnosticsDisclosure>{evidence}</DiagnosticsDisclosure>}
    </GlassPanel>
  );
}
