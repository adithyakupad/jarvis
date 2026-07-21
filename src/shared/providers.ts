import { z } from "zod";

import type { ProviderId } from "./projects.js";

export const ProviderAvailabilitySchema = z.object({
  provider: z.enum(["codex", "claude-code"]),
  installed: z.boolean(),
  authenticated: z.boolean().nullable(),
  version: z.string().nullable(),
  detail: z.string(),
});

export type ProviderAvailability = z.infer<typeof ProviderAvailabilitySchema>;

export interface InspectionRequest {
  projectId: string;
  repositoryPath: string;
  instruction: string;
}

export interface PlanProposal {
  objective: string;
  currentState: string;
  steps: string[];
  expectedScope: string[];
  risks: string[];
  completionTest: string;
  providerSessionId: string | null;
}

export interface ExecutionRequest extends InspectionRequest {
  proposal: PlanProposal;
  providerSessionId: string | null;
}

export interface ExecutionResult {
  summary: string;
  providerSessionId: string | null;
  succeeded: boolean;
}

export interface AgentEvent {
  type: string;
  message: string;
  occurredAt: string;
}

export type AgentEventHandler = (event: AgentEvent) => void;

export interface AgentAdapter {
  readonly id: ProviderId;
  detect(): Promise<ProviderAvailability>;
  inspect(input: InspectionRequest): Promise<PlanProposal>;
  execute(
    input: ExecutionRequest,
    onEvent: AgentEventHandler,
  ): Promise<ExecutionResult>;
  resume(
    sessionId: string,
    prompt: string,
    onEvent: AgentEventHandler,
  ): Promise<ExecutionResult>;
  cancel(runId: string): Promise<void>;
}
