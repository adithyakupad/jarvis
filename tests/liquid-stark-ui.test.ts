import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/client/App.tsx", "utf8");
const components = readFileSync("src/client/components.tsx", "utf8");
const styles = readFileSync("src/client/styles.css", "utf8");

describe("Liquid Stark client presentation", () => {
  it("keeps task submission read-only and disabled until an instruction exists", () => {
    expect(app).toContain("Planning is read-only · approval required");
    expect(app).toContain("disabled={!instruction.trim()}");
    expect(app).toContain("service.inspect(project.id, instruction)");
  });

  it("preserves exact-revision approval actions", () => {
    expect(app).toContain("onProceed(proposal.revision)");
    expect(app).toContain("Proceed with revision {proposal.revision}");
    expect(app).toContain("service.proceed(activeRun.run.id, revision)");
  });

  it("keeps event diagnostics and validation evidence visible", () => {
    expect(app).toContain("<DiagnosticsDisclosure event={item}");
    expect(app).toContain("Authoritative JARVIS validation");
    expect(app).toContain("<dt>Exit code</dt>");
  });

  it("provides reusable glass, status, diagnostics, and handoff components", () => {
    for (const name of ["GlassPanel", "TechnicalLabel", "StatusPill", "SystemStatus", "DiagnosticsDisclosure", "HandoffCardShell"]) {
      expect(components).toContain(`function ${name}`);
    }
  });

  it("renders the real structured handoff through the visual shell", () => {
    expect(app).toContain("<HandoffCardShell");
    expect(app).toContain("objective={handoff.currentObjective}");
    expect(app).toContain("status={handoff.currentStatus}");
    expect(app).toContain("freshness={handoff.freshnessStatus.replaceAll");
    expect(app).toContain("handoff.evidenceEntries.map");
  });

  it("keeps stale state prominent and deterministic facts outside correction controls", () => {
    expect(app).toContain('className="handoff-stale-warning" role="alert"');
    expect(app).toContain("Repository changes were detected after this handoff was created.");
    expect(app).not.toContain('name="changedFiles"');
    expect(app).not.toContain('name="validationSummary"');
    expect(app).not.toContain('name="repositorySummary"');
  });

  it("uses the recommended step only to populate the redesigned composer", () => {
    expect(app).toContain("onUseNextStep={(next) => setInstruction(next)}");
    expect(app).toContain("onClick={() => onUseNextStep(handoff.recommendedNextAction)}");
    expect(app).not.toContain("onUseNextStep={service.inspect");
  });

  it("keeps corrections in the existing persistence handler and visibly classifies success", () => {
    expect(app).toContain("service.correctHandoff(projectId, corrections)");
    expect(app).toContain("saved as user-provided context");
    expect(app).toContain('role={saveFailed ? "alert" : "status"}');
  });

  it("supports reduced motion and a no-backdrop-filter fallback", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))");
    expect(styles).toContain("background-color: var(--glass-fallback)");
  });

  it("retains accessible controls and interrupted/failure state styling", () => {
    expect(app).toContain('aria-live="polite"');
    expect(app).toContain('role="alert"');
    expect(styles).toContain(".status-cancelled_before_execution");
    expect(styles).toContain(".status-failed");
  });
});
