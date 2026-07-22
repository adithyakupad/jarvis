import { z } from "zod";

export const API_SCHEMA_VERSION = 1;
export const DEVELOPMENT_BUILD_ID = "development";
export const HealthStatusSchema = z.enum(["starting", "ready"]);
export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  appVersion: z.string().min(1),
  apiSchemaVersion: z.number().int().positive(),
  buildId: z.string().min(1),
  processId: z.number().int().positive(),
  startedAt: z.string().datetime({ offset: true }),
  bindHost: z.literal("127.0.0.1"),
  port: z.number().int().min(1).max(65535),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

declare const __JARVIS_BUILD_ID__: string | undefined;
export const FRONTEND_BUILD_ID = typeof __JARVIS_BUILD_ID__ === "string" ? __JARVIS_BUILD_ID__ : DEVELOPMENT_BUILD_ID;

export function buildsCompatible(expected: string, actual: string): boolean {
  return expected === DEVELOPMENT_BUILD_ID || actual === DEVELOPMENT_BUILD_ID || expected === actual;
}
