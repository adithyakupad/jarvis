import { z } from "zod";

import { PlanProposalFieldsSchema, PlanProposalSchema } from "../../shared/runs.js";
import type { AgentAdapter, AgentEventHandler, ExecutionRequest, ExecutionResult, InspectionRequest, ProviderAvailability } from "../../shared/providers.js";
import { detectClaudeCode } from "./detection.js";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.js";
import { buildPlanningPrompt } from "./codex-planning-adapter.js";
import { ProviderUnavailableError } from "./errors.js";

const proposalBodySchema = PlanProposalFieldsSchema.omit({ revision: true, providerSessionId: true });
const claudeResultSchema = z.object({ session_id: z.string().trim().min(1), result: z.string().optional(), structured_output: z.unknown().optional(), is_error: z.boolean().optional(), subtype: z.string().optional() }).passthrough();
const proposalJsonSchema = { type: "object", additionalProperties: false, required: ["objective", "currentState", "steps", "expectedScope", "risks", "completionTest", "validationCommands", "contextStatus", "followUpQuestion"], properties: { objective: { type: "string" }, currentState: { type: "string" }, steps: { type: "array", items: { type: "string" } }, expectedScope: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } }, completionTest: { type: "string" }, validationCommands: { type: "array", items: { type: "string" } }, contextStatus: { type: "string", enum: ["sufficient", "needs_more_context"] }, followUpQuestion: { anyOf: [{ type: "string" }, { type: "null" }] } } } as const;

function executionPrompt(input: ExecutionRequest): string {
  return ["Execute only the exact approved proposal below in the current repository.", "Do not access paths outside this repository. Do not commit, push, reset, clean, or stash. Do not expand the approved scope.", "Use file editing tools only; JARVIS performs approved validation independently.", `Original instruction: ${input.instruction}`, `Approved revision: ${input.approvedRevision}`, `Allowed scope: ${JSON.stringify(input.allowedScope)}`, `Approved proposal: ${JSON.stringify(input.proposal)}`, input.contextPacket ? `Persisted context: ${JSON.stringify(input.contextPacket)}` : ""].filter(Boolean).join("\n\n");
}

function parseJsonOutput(stdout: string): z.infer<typeof claudeResultSchema> {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    try { const parsed = claudeResultSchema.safeParse(JSON.parse(line)); if (parsed.success && (parsed.data.result !== undefined || parsed.data.structured_output !== undefined)) return parsed.data; } catch { /* Continue to the preceding JSON event. */ }
  }
  throw new Error("Claude Code returned no valid result object.");
}

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = "claude-code" as const;
  constructor(private readonly runner: ProcessRunner = new NodeProcessRunner()) {}

  detect(): Promise<ProviderAvailability> { return detectClaudeCode(this.runner); }

  async inspect(input: InspectionRequest): Promise<unknown> {
    const availability = await this.detect();
    if (!availability.installed || availability.authenticated !== true) throw new ProviderUnavailableError(availability.detail);
    const args = ["-p", buildPlanningPrompt(input), "--output-format", "json", "--permission-mode", "plan", "--allowedTools", "Read", "Glob", "Grep", "--json-schema", JSON.stringify(proposalJsonSchema)];
    if (input.providerSessionId) args.push("--resume", input.providerSessionId);
    const result = await this.runner.run("claude", args, { cwd: input.repositoryPath, timeoutMs: 120_000 });
    if (result.exitCode !== 0) throw new Error(`Claude Code planning failed (${result.exitCode ?? "spawn error"}): ${result.stderr.trim() || "no stderr"}`);
    const envelope = parseJsonOutput(result.stdout);
    const raw = envelope.structured_output ?? (envelope.result ? JSON.parse(envelope.result) : null);
    const body = proposalBodySchema.parse(raw);
    return PlanProposalSchema.parse({ ...body, revision: input.proposalRevision, providerSessionId: envelope.session_id });
  }

  async execute(input: ExecutionRequest, onEvent: AgentEventHandler): Promise<ExecutionResult> {
    const availability = await this.detect();
    if (!availability.installed || availability.authenticated !== true) throw new ProviderUnavailableError(availability.detail);
    const args = ["-p", executionPrompt(input), "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", "Read", "Edit", "Write", "Glob", "Grep"];
    if (input.providerSessionId) args.push("--resume", input.providerSessionId);
    const result = await this.runner.run("claude", args, { cwd: input.repositoryPath, timeoutMs: 300_000 });
    if (result.exitCode !== 0) throw new Error(`Claude Code execution failed (${result.exitCode ?? "spawn error"}): ${result.stderr.trim() || "no stderr"}`);
    const envelope = parseJsonOutput(result.stdout);
    const summary = envelope.result?.trim() || "Claude Code returned no completion summary.";
    onEvent({ type: envelope.is_error ? "warning" : "provider_message", message: summary, occurredAt: new Date().toISOString(), data: { provider: "claude-code", subtype: envelope.subtype ?? null } });
    return { summary, providerSessionId: envelope.session_id, succeeded: envelope.is_error !== true && Boolean(envelope.result?.trim()) };
  }

  async resume(sessionId: string, prompt: string, onEvent: AgentEventHandler): Promise<ExecutionResult> {
    const result = await this.runner.run("claude", ["-p", prompt, "--output-format", "json", "--resume", sessionId], { timeoutMs: 300_000 });
    if (result.exitCode !== 0) throw new Error(result.stderr || "Claude Code resume failed.");
    const envelope = parseJsonOutput(result.stdout); const summary = envelope.result ?? ""; onEvent({ type: "provider_message", message: summary, occurredAt: new Date().toISOString() });
    return { summary, providerSessionId: envelope.session_id, succeeded: envelope.is_error !== true };
  }

  async cancel(): Promise<void> { throw new Error("Claude Code execution cancellation is not available in the alpha."); }
}
