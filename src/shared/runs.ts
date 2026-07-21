import { z } from "zod";

import { ProviderIdSchema } from "./projects.js";

const nonEmptyText = z.string().trim().min(1);

export const PlanProposalSchema = z.object({
  objective: nonEmptyText,
  currentState: nonEmptyText,
  steps: z.array(nonEmptyText).min(1),
  expectedScope: z.array(nonEmptyText).min(1),
  risks: z.array(nonEmptyText),
  completionTest: nonEmptyText,
  revision: z.number().int().positive(),
  providerSessionId: z.string().trim().min(1).nullable(),
});

export const RunStatusSchema = z.enum([
  "inspecting",
  "awaiting_approval",
  "approved",
  "cancelled",
  "failed",
]);

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
  failure: z.unknown().nullable(),
  created_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
});

export type PlanProposal = z.infer<typeof PlanProposalSchema>;
export type Run = z.infer<typeof RunSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
