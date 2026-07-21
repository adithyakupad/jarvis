import { Codex } from "@openai/codex-sdk";

import { PlanProposalSchema } from "../../shared/runs.js";
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

const proposalBodySchema = PlanProposalSchema.omit({ revision: true, providerSessionId: true });

const proposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["objective", "currentState", "steps", "expectedScope", "risks", "completionTest"],
  properties: {
    objective: { type: "string", minLength: 1 },
    currentState: { type: "string", minLength: 1 },
    steps: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    expectedScope: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    risks: { type: "array", items: { type: "string", minLength: 1 } },
    completionTest: { type: "string", minLength: 1 },
  },
} as const;

export class ProviderUnavailableError extends Error {}

export function buildPlanningPrompt(input: InspectionRequest): string {
  const boundary = [
    "Inspect this repository and return only the requested structured planning proposal.",
    "This is read-only planning: do not modify files, execute the proposed work, or request elevated permissions.",
    `User instruction: ${input.instruction}`,
  ];
  if (input.modification && input.previousProposal) {
    boundary.push(
      `Revise the existing proposal in response to: ${input.modification}`,
      `Existing proposal: ${JSON.stringify(input.previousProposal)}`,
    );
  }
  if (input.contextPacket) {
    boundary.push(
      "Replan using the context below while keeping three categories explicit in currentState, steps, scope, and risks: (1) USER-SUPPLIED CONTEXT—claims and symptoms from the packet; (2) REPOSITORY-CONFIRMED FINDINGS—facts you verify in the repository; (3) UNRESOLVED ASSUMPTIONS OR QUESTIONS—anything supported by neither source. Never present user claims as repository-confirmed facts or invent files for external or fictional subsystems.",
      `--- BEGIN USER-SUPPLIED CONTEXT PACKET ---\n${JSON.stringify(input.contextPacket, null, 2)}\n--- END USER-SUPPLIED CONTEXT PACKET ---`,
    );
  }
  return boundary.join("\n\n");
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
    const availability = await this.detect();
    if (!availability.installed || availability.authenticated !== true) {
      throw new ProviderUnavailableError(availability.detail);
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

  async execute(_input: ExecutionRequest, _onEvent: AgentEventHandler): Promise<ExecutionResult> {
    throw new Error("Execution is not available until Gate 3.");
  }

  async resume(): Promise<ExecutionResult> {
    throw new Error("Execution is not available until Gate 3.");
  }

  async cancel(): Promise<void> {
    throw new Error("Provider execution cancellation is not available until Gate 3.");
  }
}
