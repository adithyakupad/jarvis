import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpJarvisClientService } from "../src/client/http-service.js";

const project = { id: "mk-42", name: "MK 42", objective: "Validate", status: "active", repository_path: "/tmp/repo", provider: "codex", provider_session_id: null, current_phase: "", latest_result: "", current_blocker: "", next_action: "", created_at: "2026-07-21T13:00:00.000Z", updated_at: "2026-07-21T13:00:00.000Z" };
const proposal = { objective: "Inspect validation", currentState: "Validation exists.", steps: ["Inspect scripts"], expectedScope: ["package.json"], risks: [], completionTest: "Plan is specific.", revision: 1, providerSessionId: "thread-1" };
const run = { id: "run-1", project_id: "mk-42", provider: "codex", provider_session_id: "thread-1", instruction: "Inspect", proposal, proposal_revision: 1, approved_proposal_revision: null, approval_decision: null, status: "awaiting_approval", failure: null, created_at: "2026-07-21T13:00:00.000Z", completed_at: null };

function response(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("HTTP client service", () => {
  it("maps API data and restores the persisted active run", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/api/setup/providers")) return response({ providers: [{ provider: "codex", installed: true, authenticated: true, version: "1", detail: "Ready" }] });
      if (url.endsWith("/api/projects")) return response({ projects: [project] });
      return response({ project, activeRun: { run, revisions: [proposal] } });
    }));
    const service = new HttpJarvisClientService();
    await service.initialize();
    expect(service.getSnapshot()).toMatchObject({ projects: [{ id: "mk-42" }], activeRun: { state: "awaiting approval", run: { id: "run-1" } }, error: null });
  });

  it("surfaces backend failure and never creates mock data", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    vi.stubGlobal("fetch", vi.fn(async () => response({ error: { message: "API unavailable" } }, 503)));
    const service = new HttpJarvisClientService();
    await service.initialize();
    expect(service.getSnapshot()).toMatchObject({ projects: [], providers: [], activeRun: null, error: "API unavailable" });
  });

  it("keeps Proceed at the approved Gate 2 boundary", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    const approved = { ...run, status: "approved", approval_decision: "proceed", approved_proposal_revision: 1 };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/proceed") ? response({ run: approved, revisions: [proposal] }) : response(url.endsWith("providers") ? { providers: [] } : { projects: [] })));
    const service = new HttpJarvisClientService();
    const presentation = await service.proceed("run-1", 1);
    expect(presentation).toMatchObject({ state: "approved", events: [], changedFiles: [], statusMessage: "Plan approved. Execution is not available until Gate 3." });
  });
});
