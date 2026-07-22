import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpJarvisClientService } from "../src/client/http-service.js";
import { ContextPacketSchema, hasMeaningfulContext } from "../src/shared/context.js";
import { API_SCHEMA_VERSION } from "../src/shared/runtime.js";

const project = { id: "mk-42", name: "MK 42", objective: "Validate", status: "active", repository_path: "/tmp/repo", provider: "codex", provider_session_id: null, current_phase: "", latest_result: "", current_blocker: "", next_action: "", created_at: "2026-07-21T13:00:00.000Z", updated_at: "2026-07-21T13:00:00.000Z" };
const proposal = { objective: "Inspect validation", currentState: "Validation exists.", steps: ["Inspect scripts"], expectedScope: ["package.json"], risks: [], completionTest: "Plan is specific.", revision: 1, providerSessionId: "thread-1" };
const run = { id: "run-1", project_id: "mk-42", provider: "codex", provider_session_id: "thread-1", instruction: "Inspect", proposal, proposal_revision: 1, approved_proposal_revision: null, approval_decision: null, status: "awaiting_approval", failure: null, created_at: "2026-07-21T13:00:00.000Z", completed_at: null };

function response(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
const health = { status: "ready", appVersion: "0.1.0", apiSchemaVersion: API_SCHEMA_VERSION, buildId: "development", processId: 42, startedAt: "2026-07-21T13:00:00.000Z", bindHost: "127.0.0.1", port: 4173 };
function healthResponse(url: string): Response | null { return url.endsWith("/api/health") ? response(health) : null; }
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("HTTP client service", () => {
  it("uses the shared semantic validation for summary-only packets", () => {
    expect(ContextPacketSchema.parse({ summary: "  My suit freezes.  ", reproductionSteps: [""] })).toEqual({ summary: "My suit freezes." });
    expect(hasMeaningfulContext({ summary: "My suit freezes." })).toBe(true);
    expect(ContextPacketSchema.safeParse({ summary: "   ", constraints: [" "] }).success).toBe(false);
  });
  it("performs no constructor requests and shares one initialization across repeated calls", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    const projectResponse = deferred<Response>();
    const fetchMock = vi.fn(async (url: string) => {
      if (healthResponse(url)) return healthResponse(url)!;
      if (url.endsWith("/api/setup/providers")) return response({ providers: [{ provider: "codex", installed: true, authenticated: true, version: "1", detail: "Ready" }] });
      if (url.endsWith("/api/projects")) return projectResponse.promise;
      return response({ project, activeRun: { run, revisions: [proposal] } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new HttpJarvisClientService();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.getSnapshot().hydrationStatus).toBe("not_initialized");
    const first = service.initialize();
    const second = service.initialize();
    expect(first).toBe(second);
    expect(service.getSnapshot()).toMatchObject({ hydrationStatus: "hydrating", activeRun: null });
    projectResponse.resolve(response({ projects: [project] }));
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(service.getSnapshot()).toMatchObject({ projects: [{ id: "mk-42" }], activeRun: { state: "awaiting approval", run: { id: "run-1" } }, error: null });
    expect(service.getSnapshot()).toMatchObject({ hydrationStatus: "ready", projectLoading: false, selectedProjectId: "mk-42" });
  });

  it("does not expose a ready project until its active run response is applied", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    const selected = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/api/projects/mk-42") ? selected.promise : response(url.endsWith("providers") ? { providers: [] } : { projects: [] })));
    const service = new HttpJarvisClientService();
    const loading = service.selectProject("mk-42");
    expect(service.getSnapshot()).toMatchObject({ projectLoading: true, activeRun: null, selectedProjectId: null, hydrationStatus: "not_initialized" });
    selected.resolve(response({ project, activeRun: { run, revisions: [proposal] } }));
    await loading;
    expect(service.getSnapshot()).toMatchObject({ projectLoading: false, selectedProjectId: "mk-42", activeRun: { run: { proposal_revision: 1 } } });
  });

  it("distinguishes hydrated projects with no run from unfinished hydration", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (healthResponse(url)) return healthResponse(url)!;
      if (url.endsWith("providers")) return response({ providers: [] });
      if (url.endsWith("/api/projects")) return response({ projects: [project] });
      return response({ project, activeRun: null });
    }));
    const service = new HttpJarvisClientService();
    expect(service.getSnapshot()).toMatchObject({ hydrationStatus: "not_initialized", activeRun: null });
    await service.initialize();
    expect(service.getSnapshot()).toMatchObject({ hydrationStatus: "ready", activeRun: null, selectedProjectId: "mk-42" });
  });

  it("hydrates a fresh installation into a valid zero-project onboarding state", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => healthResponse(url) ?? response(url.endsWith("providers") ? { providers: [] } : { projects: [] })));
    const service = new HttpJarvisClientService();
    await service.initialize();
    expect(service.getSnapshot()).toMatchObject({ hydrationStatus: "ready", projects: [], selectedProjectId: null, activeRun: null, projectLoading: false });
  });

  it("blocks hydration when the health endpoint is missing", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    vi.stubGlobal("fetch", vi.fn(async () => response({ error: { message: "Not found" } }, 404)));
    const service = new HttpJarvisClientService();
    await expect(service.initialize()).rejects.toThrow("A different JARVIS version is currently running");
    expect(service.getSnapshot()).toMatchObject({ projects: [], providers: [], activeRun: null, hydrationStatus: "failed", error: expect.stringContaining("restart JARVIS") });
  });

  it("blocks hydration when API schema versions differ", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...health, apiSchemaVersion: API_SCHEMA_VERSION + 1 })));
    const service = new HttpJarvisClientService();
    await expect(service.initialize()).rejects.toMatchObject({ category: "incompatible_api" });
  });

  it("shows startup instructions when the API is unavailable", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const service = new HttpJarvisClientService();
    await expect(service.initialize()).rejects.toThrow("Start it with npm run jarvis");
  });

  it("turns Proceed into one server-controlled asynchronous transition", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    const approved = { ...run, status: "approved", approval_decision: "proceed", approved_proposal_revision: 1 };
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/proceed") || url.endsWith("/execute") ? response({ run: approved, revisions: [proposal] }) : response(url.endsWith("providers") ? { providers: [] } : { projects: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new HttpJarvisClientService();
    const presentation = await service.proceed("run-1", 1);
    expect(presentation).toMatchObject({ state: "approved", events: [], changedFiles: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/runs/run-1/proceed", expect.objectContaining({ method: "POST", body: JSON.stringify({ revision: 1 }) }));
  });

  it("closes the live event stream after a terminal run is restored", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    const approved = { ...run, status: "approved", approval_decision: "proceed", approved_proposal_revision: 1 };
    const completed = { ...approved, status: "completed", completed_at: "2026-07-21T13:01:00.000Z", verification: { repositoryValid: true, message: "Tests passed.", checks: [], validation: null } };
    class FakeEventSource {
      static latest: FakeEventSource; closed = false; listeners = new Map<string, () => void>();
      constructor(readonly url: string) { FakeEventSource.latest = this; }
      addEventListener(type: string, listener: () => void): void { this.listeners.set(type, listener); }
      close(): void { this.closed = true; }
    }
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => response(url.endsWith("/proceed") ? { run: approved, revisions: [proposal], events: [] } : { run: completed, revisions: [proposal], events: [] })));
    const service = new HttpJarvisClientService(); await service.proceed("run-1", 1);
    FakeEventSource.latest.listeners.get("execution_completed")?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(FakeEventSource.latest.closed).toBe(true);
    expect(service.getSnapshot().activeRun?.state).toBe("completed");
  });

  it("maps context submission and restores its revised proposal", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "mk-42", setItem: () => undefined } });
    const contextPacket = { problem: "Shoulder icing", constraints: ["Keep flight controls unchanged"] };
    const revisedProposal = { ...proposal, revision: 2 };
    const revisedRun = { ...run, context_packet: contextPacket, proposal: revisedProposal, proposal_revision: 2 };
    const fetchMock = vi.fn(async (url: string) => {
      if (healthResponse(url)) return healthResponse(url)!;
      if (url.endsWith("/context")) return response({ run: revisedRun, revisions: [proposal, revisedProposal], contextPacket, currentProposal: revisedProposal });
      if (url.endsWith("providers")) return response({ providers: [] });
      if (url.endsWith("/api/projects")) return response({ projects: [project] });
      return response({ project, activeRun: { run: revisedRun, revisions: [proposal, revisedProposal] } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new HttpJarvisClientService();
    await service.initialize();
    expect(service.getSnapshot().activeRun?.run.context_packet).toEqual(contextPacket);
    const presentation = await service.addContext("run-1", 1, contextPacket);
    expect(presentation).toMatchObject({ run: { id: "run-1", proposal_revision: 2, context_packet: contextPacket }, revisions: [{ revision: 1 }, { revision: 2 }] });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/runs/run-1/context", expect.objectContaining({ method: "POST", body: JSON.stringify({ currentRevision: 1, ...contextPacket }) }));
  });

  it("submits freeform context without manufacturing structured fields", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined } });
    const freeform = { summary: "My suit starts turning into ice at high altitudes when I fly." };
    const revisedProposal = { ...proposal, revision: 2, contextStatus: "needs_more_context", followUpQuestion: "What material surrounds the affected actuator?" };
    const revisedRun = { ...run, context_packet: freeform, proposal: revisedProposal, proposal_revision: 2 };
    const fetchMock = vi.fn(async () => response({ run: revisedRun, revisions: [proposal, revisedProposal], contextPacket: freeform, currentProposal: revisedProposal }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new HttpJarvisClientService();
    const result = await service.addContext("run-1", 1, freeform);
    expect(result.run.context_packet).toEqual(freeform);
    expect(result.run.proposal).toMatchObject({ contextStatus: "needs_more_context", followUpQuestion: "What material surrounds the affected actuator?" });
    expect(fetchMock).toHaveBeenCalledWith("/api/runs/run-1/context", expect.objectContaining({ body: JSON.stringify({ currentRevision: 1, summary: freeform.summary }) }));
  });
});
