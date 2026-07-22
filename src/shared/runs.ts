import { z } from "zod";

import { ProviderIdSchema } from "./projects.js";
import { ContextPacketSchema } from "./context.js";

const nonEmptyText = z.string().trim().min(1);

export const PlanProposalFieldsSchema = z.object({
  objective: nonEmptyText,
  currentState: nonEmptyText,
  steps: z.array(nonEmptyText).min(1),
  expectedScope: z.array(nonEmptyText).min(1),
  risks: z.array(nonEmptyText),
  completionTest: nonEmptyText,
  validationCommands: z.array(nonEmptyText).default([]),
  revision: z.number().int().positive(),
  providerSessionId: z.string().trim().min(1).nullable(),
  contextStatus: z.enum(["sufficient", "needs_more_context"]).optional(),
  followUpQuestion: nonEmptyText.nullable().optional(),
});

export const PlanProposalSchema = PlanProposalFieldsSchema.superRefine((proposal, context) => {
  if (proposal.contextStatus === "needs_more_context" && !proposal.followUpQuestion) {
    context.addIssue({ code: "custom", path: ["followUpQuestion"], message: "A focused follow-up question is required when more context is needed." });
  }
});

export const RunStatusSchema = z.enum([
  "inspecting",
  "awaiting_approval",
  "approved",
  "preparing_execution",
  "executing",
  "verifying",
  "completed",
  "cancelled_before_execution",
  "cancelled",
  "failed",
]);

export const RepositorySnapshotSchema = z.object({
  canonicalPath: nonEmptyText,
  isGitRepository: z.boolean(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  files: z.record(z.string(), z.object({ status: z.string(), fingerprint: z.string().nullable() })),
  capturedAt: z.string().datetime({ offset: true }),
});

export const ExecutionResultSchema = z.object({ summary: z.string(), providerSessionId: z.string().nullable(), succeeded: z.boolean(), changedFiles: z.array(z.string()), createdFiles: z.array(z.string()), deletedFiles: z.array(z.string()), preExistingFiles: z.array(z.string()), ambiguousFiles: z.array(z.string()) });
export const VerificationSchema = z.object({ repositoryValid: z.boolean(), message: z.string(), checks: z.array(z.object({ command: z.string(), exitCode: z.number().nullable(), durationMs: z.number().nonnegative(), output: z.string(), passed: z.boolean() })) });
export const RunEventSchema = z.object({ sequence: z.number().int().positive(), type: z.string(), payload: z.unknown(), occurredAt: z.string().datetime({ offset: true }) });

export const ApprovalDecisionSchema = z.enum(["proceed", "cancel"]);

export const RunSchema = z.object({
  id: nonEmptyText,
  project_id: nonEmptyText,
  provider: ProviderIdSchema,
  provider_session_id: z.string().nullable(),
  instruction: nonEmptyText,
  proposal: PlanProposalSchema.nullable(),
  proposal_revision: z.number().int().nonnegative(),
  approved_proposal_revision: z.number().int().positive().nullable(),
  approval_decision: ApprovalDecisionSchema.nullable(),
  status: RunStatusSchema,
  failure: z.object({ message: z.string() }).passthrough().nullable(),
  execution_result: ExecutionResultSchema.nullable().default(null),
  verification: VerificationSchema.nullable().default(null),
  pre_execution_snapshot: RepositorySnapshotSchema.nullable().default(null),
  post_execution_snapshot: RepositorySnapshotSchema.nullable().default(null),
  context_packet: ContextPacketSchema.nullable().default(null),
  created_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
});

export type PlanProposal = z.infer<typeof PlanProposalSchema>;
export type Run = z.infer<typeof RunSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RepositorySnapshot = z.infer<typeof RepositorySnapshotSchema>;
export type ExecutionResultRecord = z.infer<typeof ExecutionResultSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
