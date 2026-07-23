import { z } from "zod";

const text = z.string().trim().min(1);

export const HandoffFreshnessSchema = z.enum(["current", "potentially_stale", "updating", "unavailable"]);
export const HandoffGenerationStatusSchema = z.enum(["pending", "ready", "failed", "deterministic_fallback"]);
export const HandoffEvidenceCategorySchema = z.enum(["confirmed", "user_provided", "inferred", "unresolved", "stale"]);

export const HandoffEvidenceEntrySchema = z.object({
  category: HandoffEvidenceCategorySchema,
  summary: text,
  sourceRunId: z.string().nullable(),
  eventType: z.string().nullable(),
  proposalRevision: z.number().int().positive().nullable(),
  repositoryEvidence: z.string().nullable(),
  validationReference: z.string().nullable(),
  timestamp: z.string().datetime({ offset: true }),
});

export const HandoffCorrectionsSchema = z.object({
  currentObjective: text.optional(),
  currentStatus: text.optional(),
  blockers: z.array(text).optional(),
  openDecisions: z.array(text).optional(),
  activeConstraints: z.array(text).optional(),
  recommendedNextAction: text.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one correction is required.");

export const StoredHandoffCorrectionsSchema = HandoffCorrectionsSchema.extend({ correctedAt: z.string().datetime({ offset: true }) });

export const HandoffNarrativeSchema = z.object({
  currentObjective: text,
  currentStatus: text,
  lastMeaningfulAction: text,
  blockers: z.array(text),
  openDecisions: z.array(text),
  activeConstraints: z.array(text),
  recommendedNextAction: text,
  inferredEvidence: z.array(z.object({ category: z.enum(["inferred", "unresolved"]), summary: text })).default([]),
});

export const ProjectHandoffSchema = z.object({
  projectId: text,
  revision: z.number().int().positive(),
  freshnessStatus: HandoffFreshnessSchema,
  currentObjective: text,
  currentStatus: text,
  lastMeaningfulAction: text,
  lastRunId: text,
  lastRunOutcome: text,
  selectedProvider: z.enum(["codex", "claude-code"]),
  approvedProposalRevision: z.number().int().positive().nullable(),
  changedFiles: z.array(z.string()),
  createdFiles: z.array(z.string()),
  deletedFiles: z.array(z.string()),
  preExistingFiles: z.array(z.string()),
  ambiguousFiles: z.array(z.string()),
  validationSummary: z.object({ status: z.string(), command: z.string().nullable(), exitCode: z.number().int().nullable(), durationMs: z.number().nonnegative().nullable() }),
  repositorySummary: z.object({ head: z.string().nullable(), dirtyPaths: z.array(z.string()), isGitRepository: z.boolean(), capturedAt: z.string().datetime({ offset: true }).nullable() }),
  blockers: z.array(z.string()),
  openDecisions: z.array(z.string()),
  activeConstraints: z.array(z.string()),
  recommendedNextAction: text,
  evidenceEntries: z.array(HandoffEvidenceEntrySchema),
  repositoryFingerprint: z.string().nullable(),
  generatedAt: z.string().datetime({ offset: true }),
  correctedAt: z.string().datetime({ offset: true }).nullable(),
  generationStatus: HandoffGenerationStatusSchema,
  generationError: z.string().nullable(),
  generationDurationMs: z.number().nonnegative().nullable(),
  corrections: StoredHandoffCorrectionsSchema.nullable(),
  diagnostics: z.array(z.string()),
});

export type ProjectHandoff = z.infer<typeof ProjectHandoffSchema>;
export type HandoffNarrative = z.infer<typeof HandoffNarrativeSchema>;
export type HandoffCorrections = z.input<typeof HandoffCorrectionsSchema>;
export type StoredHandoffCorrections = z.infer<typeof StoredHandoffCorrectionsSchema>;
