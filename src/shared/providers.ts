import { z } from "zod";

import type { ProviderId } from "./projects.js";
import type { PlanProposal } from "./runs.js";
import type { ProjectProfile } from "./projects.js";
import type { ContextPacket } from "./context.js";
import type { HandoffNarrative, ProjectHandoff, StoredHandoffCorrections } from "./handoffs.js";

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
  readOnly: true;
  proposalRevision: number;
  providerSessionId: string | null;
  previousProposal: PlanProposal | null;
  modification: string | null;
  contextPacket: ContextPacket | null;
  repositoryCacheHit?: boolean;
  providerReadinessVerified?: true;
  projectHandoff?: ProjectHandoff | null;
}

export interface HandoffGenerationRequest {
  projectId: string;
  repositoryPath: string;
  providerSessionId: string | null;
  priorHandoff: ProjectHandoff | null;
  currentRun: import("./runs.js").Run;
  currentProjectProfile: ProjectProfile | null;
  userCorrections: StoredHandoffCorrections | null;
  deterministicEvidence: Record<string, unknown>;
  readOnly: true;
  providerReadinessVerified?: true;
}

export interface ExecutionRequest {
  projectId: string;
  repositoryPath: string;
  instruction: string;
  proposal: PlanProposal;
  providerSessionId: string | null;
  approvedRevision: number;
  contextPacket: ContextPacket | null;
  projectProfile: ProjectProfile | null;
  allowedScope: string[];
  providerReadinessVerified?: true;
}

export interface ExecutionResult {
  summary: string;
  providerSessionId: string | null;
  succeeded: boolean;
}

export interface AgentEvent {
  type: "provider_message" | "file_change" | "command_started" | "command_completed" | "warning";
  message: string;
  occurredAt: string;
  data?: Record<string, unknown>;
}

export type AgentEventHandler = (event: AgentEvent) => void;

export interface AgentAdapter {
  readonly id: ProviderId;
  detect(): Promise<ProviderAvailability>;
  inspect(input: InspectionRequest): Promise<unknown>;
  generateHandoff?(input: HandoffGenerationRequest): Promise<HandoffNarrative | unknown>;
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
