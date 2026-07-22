import { describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../src/server/providers/claude-code-adapter.js";
import type { ProcessRunOptions, ProcessRunner, ProcessResult } from "../src/server/providers/process-runner.js";
import type { ExecutionRequest, InspectionRequest } from "../src/shared/providers.js";
import type { PlanProposal } from "../src/shared/runs.js";

class FakeRunner implements ProcessRunner {
  readonly calls: Array<{ executable: string; args: readonly string[]; options?: ProcessRunOptions }> = [];
  constructor(private readonly results: ProcessResult[]) {}
  async run(executable: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult> { this.calls.push({ executable, args, options }); return this.results.shift() ?? { exitCode: 1, stdout: "", stderr: "missing fixture" }; }
}

const availability: ProcessResult[] = [
  { exitCode: 0, stdout: "2.1.0", stderr: "" },
  { exitCode: 0, stdout: '{"loggedIn":true}', stderr: "" },
];
const proposal: Omit<PlanProposal, "revision" | "providerSessionId"> = { objective: "Add multiply", currentState: "math.js has add.", steps: ["Add multiply"], expectedScope: ["math.js"], risks: [], completionTest: "The function exists.", validationCommands: [], contextStatus: "sufficient", followUpQuestion: null };

function inspection(): InspectionRequest { return { projectId: "p", repositoryPath: "/tmp/repo", instruction: "Add multiply", readOnly: true, proposalRevision: 1, providerSessionId: null, previousProposal: null, modification: null, contextPacket: null }; }

describe("Claude Code adapter", () => {
  it("plans read-only and returns a normalized proposal and session", async () => {
    const runner = new FakeRunner([...availability, { exitCode: 0, stdout: JSON.stringify({ session_id: "claude-session", structured_output: proposal }), stderr: "" }]);
    const result = await new ClaudeCodeAdapter(runner).inspect(inspection());
    expect(result).toMatchObject({ objective: "Add multiply", revision: 1, providerSessionId: "claude-session" });
    const invocation = runner.calls[2];
    expect(invocation).toMatchObject({ executable: "claude", options: { cwd: "/tmp/repo", timeoutMs: 120000 } });
    expect(invocation.args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--permission-mode", "plan", "--allowedTools", "Read", "Glob", "Grep"]));
    expect(invocation.args).not.toContain("--dangerously-skip-permissions");
  });

  it("executes with repository-scoped edit tools, resumes the session, and normalizes output", async () => {
    const runner = new FakeRunner([...availability, { exitCode: 0, stdout: `${JSON.stringify({ type: "system", session_id: "claude-session" })}\n${JSON.stringify({ type: "result", subtype: "success", session_id: "claude-session", result: "Added multiply.", is_error: false })}\n`, stderr: "" }]);
    const events: string[] = [];
    const request: ExecutionRequest = { projectId: "p", repositoryPath: "/tmp/repo", instruction: "Add multiply", proposal: { ...proposal, revision: 1, providerSessionId: "claude-session" }, providerSessionId: "claude-session", approvedRevision: 1, contextPacket: null, projectProfile: null, allowedScope: ["math.js"] };
    const result = await new ClaudeCodeAdapter(runner).execute(request, (event) => events.push(event.message));
    expect(result).toEqual({ summary: "Added multiply.", providerSessionId: "claude-session", succeeded: true });
    const invocation = runner.calls[2];
    expect(invocation).toMatchObject({ executable: "claude", options: { cwd: "/tmp/repo", timeoutMs: 300000 } });
    expect(invocation.args).toEqual(expect.arrayContaining(["--output-format", "stream-json", "--permission-mode", "acceptEdits", "--allowedTools", "Read", "Edit", "Write", "Glob", "Grep", "--resume", "claude-session"]));
    expect(invocation.args.join(" ")).not.toMatch(/dangerously-skip|git commit|git push|git reset|git clean|git stash/);
    expect(events).toEqual(["Added multiply."]);
  });

  it("reports nonzero provider execution honestly", async () => {
    const runner = new FakeRunner([...availability, { exitCode: 7, stdout: "", stderr: "authentication expired" }]);
    const request: ExecutionRequest = { projectId: "p", repositoryPath: "/tmp/repo", instruction: "Add multiply", proposal: { ...proposal, revision: 1, providerSessionId: null }, providerSessionId: null, approvedRevision: 1, contextPacket: null, projectProfile: null, allowedScope: ["math.js"] };
    await expect(new ClaudeCodeAdapter(runner).execute(request, () => undefined)).rejects.toThrow("Claude Code execution failed (7): authentication expired");
  });
});
