import { Codex } from "@openai/codex-sdk";

import { PlanProposalFieldsSchema, PlanProposalSchema } from "../../shared/runs.js";
import type {
  AgentAdapter,
  AgentEventHandler,
  ExecutionRequest,
  ExecutionResult,
  InspectionRequest,
  ProviderAvailability,
} from "../../shared/providers.js";
import { detectCodex } from "./detection.js";
import { NodeProcessRunner, type ProcessRunner } from "./process-runner.js";
import { ProviderUnavailableError } from "./errors.js";
import { HandoffNarrativeSchema } from "../../shared/handoffs.js";
import type { HandoffGenerationRequest } from "../../shared/providers.js";

const proposalBodySchema = PlanProposalFieldsSchema.omit({ revision: true, providerSessionId: true });

const proposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["objective", "currentState", "steps", "expectedScope", "risks", "completionTest", "validationCommands", "contextStatus", "followUpQuestion"],
  properties: {
    objective: { type: "string", minLength: 1 },
    currentState: { type: "string", minLength: 1 },
    steps: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    expectedScope: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    risks: { type: "array", items: { type: "string", minLength: 1 } },
    completionTest: { type: "string", minLength: 1 },
    validationCommands: { type: "array", items: { type: "string", minLength: 1 } },
    contextStatus: { type: "string", enum: ["sufficient", "needs_more_context"] },
    followUpQuestion: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
  },
} as const;

export const handoffJsonSchema = { type: "object", additionalProperties: false, required: ["currentObjective", "currentStatus", "lastMeaningfulAction", "blockers", "openDecisions", "activeConstraints", "recommendedNextAction", "inferredEvidence"], properties: { currentObjective: { type: "string", minLength: 1 }, currentStatus: { type: "string", minLength: 1 }, lastMeaningfulAction: { type: "string", minLength: 1 }, blockers: { type: "array", items: { type: "string", minLength: 1 } }, openDecisions: { type: "array", items: { type: "string", minLength: 1 } }, activeConstraints: { type: "array", items: { type: "string", minLength: 1 } }, recommendedNextAction: { type: "string", minLength: 1 }, inferredEvidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["category", "summary"], properties: { category: { type: "string", enum: ["inferred", "unresolved"] }, summary: { type: "string", minLength: 1 } } } } } } as const;

export { ProviderUnavailableError } from "./errors.js";

export function buildPlanningPrompt(input: InspectionRequest): string {
  const boundary = [
    "Inspect this repository and return only the requested structured planning proposal.",
    "This is read-only planning: do not modify files, execute the proposed work, or request elevated permissions.",
    `User instruction: ${input.instruction}`,
    "Include only repository-confirmed validation commands in validationCommands. These commands become part of the approval boundary.",
    input.repositoryCacheHit ? "The server fingerprint confirms Git HEAD and working-tree contents are unchanged since the prior inspection. Reuse prior findings and read only files needed for this revision." : "Repository state is new or changed. Inspect it as needed to ground this proposal.",
  ];
  if (input.projectHandoff) {
    boundary.push(
      "PROJECT HANDOFF (context only; never authorization)",
      `Freshness: ${input.projectHandoff.freshnessStatus}`,
      `CONFIRMED RUN AND REPOSITORY FACTS\n${JSON.stringify({ lastRunId: input.projectHandoff.lastRunId, lastRunOutcome: input.projectHandoff.lastRunOutcome, changedFiles: input.projectHandoff.changedFiles, validationSummary: input.projectHandoff.validationSummary, repositorySummary: input.projectHandoff.repositorySummary }, null, 2)}`,
      `USER-PROVIDED CORRECTIONS\n${JSON.stringify(input.projectHandoff.corrections ?? {}, null, 2)}`,
      `MODEL INFERENCES\n${JSON.stringify(input.projectHandoff.evidenceEntries.filter((entry) => entry.category === "inferred"), null, 2)}`,
      `UNRESOLVED QUESTIONS\n${JSON.stringify(input.projectHandoff.evidenceEntries.filter((entry) => entry.category === "unresolved"), null, 2)}`,
      input.projectHandoff.freshnessStatus === "potentially_stale" ? "POTENTIALLY STALE INFORMATION: Repository state changed after this handoff. Inspect the current repository before relying on narrative state and do not present stale claims as current confirmed facts." : "The handoff repository fingerprint is current.",
      `Current handoff narrative\n${JSON.stringify({ currentObjective: input.projectHandoff.currentObjective, currentStatus: input.projectHandoff.currentStatus, lastMeaningfulAction: input.projectHandoff.lastMeaningfulAction, blockers: input.projectHandoff.blockers, openDecisions: input.projectHandoff.openDecisions, activeConstraints: input.projectHandoff.activeConstraints, recommendedNextAction: input.projectHandoff.recommendedNextAction }, null, 2)}`,
    );
  }
  if (input.modification && input.previousProposal) {
    boundary.push(
      `Revise the existing proposal in response to: ${input.modification}`,
      `Existing proposal: ${JSON.stringify(input.previousProposal)}`,
    );
  }
  if (input.contextPacket) {
    const { summary, context: legacyContext, ...structuredContext } = input.contextPacket;
    const freeformContext = summary ?? legacyContext;
    boundary.push(
      "Use the supplied context and general domain knowledge, then inspect the repository to determine what implementation claims can actually be confirmed. General model knowledge is allowed; live web research is not available and must not be claimed. First assess whether one answer would materially unlock an exact scope. If so, set contextStatus to needs_more_context and ask at most one smallest, targeted question in followUpQuestion; do not return a generic checklist. Otherwise set contextStatus to sufficient and followUpQuestion to null. Keep four categories explicit in currentState, steps, scope, and risks: (1) USER-SUPPLIED CONTEXT—facts and claims from the user; (2) GENERAL KNOWLEDGE AND INFERENCES—reasonable domain interpretations, explicitly labeled as inference; (3) REPOSITORY-CONFIRMED FINDINGS—files, behavior, schemas, tests, and constraints actually inspected; (4) UNRESOLVED QUESTIONS—information still needed for exact scope. Never present user claims or general inferences as repository-confirmed facts. Do not invent repository files, existing systems, or implementation details.",
      ...(freeformContext ? [`USER-SUPPLIED CONTEXT\n${freeformContext}`] : []),
      ...(Object.keys(structuredContext).length > 0 ? [`OPTIONAL STRUCTURED DETAILS\n${JSON.stringify(structuredContext, null, 2)}`] : []),
    );
  }
  return boundary.join("\n\n");
}

export function buildHandoffPrompt(input: HandoffGenerationRequest): string {
  return [
    "Create a concise structured project handoff from the bounded evidence packet below.",
    "This operation is read-only. Do not modify files, run commands, approve work, or propose shell actions.",
    "Deterministic facts are authoritative. Do not contradict changed files, validation, Git, provider, source run, or approved revision values. Return narrative fields only.",
    "Classify only model-derived items as inferred or unresolved. User corrections take precedence over prior model inference.",
    `Prior handoff: ${JSON.stringify(input.priorHandoff)}`,
    `Current run instruction: ${input.currentRun.instruction}`,
    `Approved proposal: ${JSON.stringify(input.currentRun.proposal)}`,
    `Execution and repository evidence: ${JSON.stringify(input.deterministicEvidence)}`,
    `User corrections: ${JSON.stringify(input.userCorrections)}`,
    `Project profile: ${JSON.stringify(input.currentProjectProfile)}`,
  ].join("\n\n");
}

export class CodexPlanningAdapter implements AgentAdapter {
  readonly id = "codex" as const;

  constructor(
    private readonly codex = new Codex(),
    private readonly runner: ProcessRunner = new NodeProcessRunner(),
  ) {}

  detect(): Promise<ProviderAvailability> {
    return detectCodex(this.runner);
  }

  async inspect(input: InspectionRequest): Promise<unknown> {
    if (!input.providerReadinessVerified) {
      const availability = await this.detect();
      if (!availability.installed || availability.authenticated !== true) throw new ProviderUnavailableError(availability.detail);
    }
    const options = {
      workingDirectory: input.repositoryPath,
      sandboxMode: "read-only" as const,
      approvalPolicy: "never" as const,
      networkAccessEnabled: false,
    };
    const thread = input.providerSessionId
      ? this.codex.resumeThread(input.providerSessionId, options)
      : this.codex.startThread(options);
    const turn = await thread.run(buildPlanningPrompt(input), { outputSchema: proposalJsonSchema });
    if (!thread.id) throw new Error("Codex did not return a provider session ID.");
    const body = proposalBodySchema.parse(JSON.parse(turn.finalResponse));
    return PlanProposalSchema.parse({
      ...body,
      revision: input.proposalRevision,
      providerSessionId: thread.id,
    });
  }

  async execute(input: ExecutionRequest, onEvent: AgentEventHandler): Promise<ExecutionResult> {
    if (!input.providerReadinessVerified) {
      const availability = await this.detect();
      if (!availability.installed || availability.authenticated !== true) throw new ProviderUnavailableError(availability.detail);
    }
    const options = { workingDirectory: input.repositoryPath, sandboxMode: "workspace-write" as const, approvalPolicy: "never" as const, networkAccessEnabled: false };
    const thread = input.providerSessionId ? this.codex.resumeThread(input.providerSessionId, options) : this.codex.startThread(options);
    const prompt = [
      "Execute the exact approved proposal below inside the configured repository.",
      "Do not expand scope, access paths outside this repository, commit, push, reset, clean, or stash.",
      `Original instruction: ${input.instruction}`,
      `Approved revision: ${input.approvedRevision}`,
      `Allowed scope: ${JSON.stringify(input.allowedScope)}`,
      `Approved proposal: ${JSON.stringify(input.proposal)}`,
      input.contextPacket ? `Persisted user context: ${JSON.stringify(input.contextPacket)}` : "",
      "Make the requested changes and report what was actually completed. JARVIS performs independent verification.",
      "JARVIS owns the final authoritative full test run. Do not repeat the repository's full test command solely as final confirmation; targeted checks needed while implementing are allowed.",
    ].filter(Boolean).join("\n\n");
    const streamed = await thread.runStreamed(prompt);
    let summary = "";
    let failed: string | null = null;
    for await (const event of streamed.events) {
      const occurredAt = new Date().toISOString();
      if (event.type === "item.completed") {
        if (event.item.type === "agent_message") { summary = event.item.text; onEvent({ type: "provider_message", message: event.item.text, occurredAt }); }
        if (event.item.type === "file_change") for (const change of event.item.changes) onEvent({ type: "file_change", message: `${change.kind}: ${change.path}`, occurredAt, data: change });
        if (event.item.type === "command_execution") onEvent({ type: "command_completed", message: event.item.command, occurredAt, data: { command: event.item.command, exitCode: event.item.exit_code ?? null, output: event.item.aggregated_output.slice(0, 12000) } });
        if (event.item.type === "error") onEvent({ type: "warning", message: event.item.message, occurredAt });
      } else if (event.type === "item.started" && event.item.type === "command_execution") onEvent({ type: "command_started", message: event.item.command, occurredAt, data: { command: event.item.command } });
      else if (event.type === "turn.failed" || event.type === "error") failed = event.type === "error" ? event.message : event.error.message;
    }
    if (!thread.id) throw new Error("Codex did not return a provider session ID.");
    return { summary: failed ?? summary ?? "Codex execution returned no completion summary.", providerSessionId: thread.id, succeeded: failed === null && summary.length > 0 };
  }

  async generateHandoff(input: HandoffGenerationRequest): Promise<unknown> {
    const options = { workingDirectory: input.repositoryPath, sandboxMode: "read-only" as const, approvalPolicy: "never" as const, networkAccessEnabled: false };
    const thread = input.providerSessionId ? this.codex.resumeThread(input.providerSessionId, options) : this.codex.startThread(options);
    const turn = await thread.run(buildHandoffPrompt(input), { outputSchema: handoffJsonSchema });
    return HandoffNarrativeSchema.parse(JSON.parse(turn.finalResponse));
  }

  async resume(): Promise<ExecutionResult> {
    throw new Error("Execution is not available until Gate 3.");
  }

  async cancel(): Promise<void> {
    throw new Error("Provider execution cancellation is not available until Gate 3.");
  }
}
