import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "active",
  "blocked",
  "paused",
  "completed",
  "archived",
]);

export const ProviderIdSchema = z.enum(["codex", "claude-code"]);

const nonEmptyText = z.string().trim().min(1);

export const ProjectProfileSchema = z.object({
  summary: z.string(),
  repositoryFindings: z.array(z.string()),
  inferredTechnologies: z.array(z.string()),
  likelyEntryPoints: z.array(z.string()),
  validationCommands: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
});

export const CreateProjectSchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
  objective: nonEmptyText,
  status: ProjectStatusSchema.default("active"),
  repository_path: nonEmptyText,
  provider: ProviderIdSchema.default("codex"),
  provider_session_id: z.string().nullable().default(null),
  current_phase: z.string().default(""),
  latest_result: z.string().default(""),
  current_blocker: z.string().default(""),
  next_action: z.string().default(""),
  notes: z.string().default(""),
  profile: ProjectProfileSchema.nullable().default(null),
});

export const ProjectSchema = CreateProjectSchema.extend({
  // Legacy Python records did not have a repository path. New records require one.
  repository_path: z.string(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;
export type CreateProject = z.input<typeof CreateProjectSchema>;
export type Project = z.infer<typeof ProjectSchema>;
