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
});

export const ProjectSchema = CreateProjectSchema.extend({
  // Legacy Python records did not have a repository path. New records require one.
  repository_path: z.string(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type CreateProject = z.input<typeof CreateProjectSchema>;
export type Project = z.infer<typeof ProjectSchema>;
