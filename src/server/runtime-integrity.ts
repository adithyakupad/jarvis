import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { API_SCHEMA_VERSION, HealthResponseSchema, buildsCompatible, type HealthResponse } from "../shared/runtime.js";

export const INSTANCE_LOCK_NAME = "jarvis.instance.lock";
export const InstanceLockSchema = z.object({ pid: z.number().int().positive(), port: z.number().int().min(1).max(65535), startedAt: z.string().datetime({ offset: true }), appVersion: z.string().min(1), apiSchemaVersion: z.number().int().positive(), buildId: z.string().min(1) });
export type InstanceLock = z.infer<typeof InstanceLockSchema>;
export type HealthProbe = { kind: "jarvis"; health: HealthResponse } | { kind: "missing_health" } | { kind: "unknown" } | { kind: "unavailable" };

export class RuntimeConflictError extends Error {
  constructor(readonly category: "incompatible" | "unknown_process" | "missing_health", message: string) { super(message); }
}

export interface IntegrityDependencies {
  isProcessAlive?: (pid: number) => boolean;
  probe?: (port: number) => Promise<HealthProbe>;
  now?: () => Date;
  pid?: number;
}

export interface IntegrityResult { owned: boolean; lockPath: string; metadata: InstanceLock; existingUrl?: string; }

export function processIsAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

export async function probeLocalHealth(port: number): Promise<HealthProbe> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(750) });
    if (response.status === 404) return { kind: "missing_health" };
    if (!response.ok) return { kind: "unknown" };
    const parsed = HealthResponseSchema.safeParse(await response.json());
    return parsed.success ? { kind: "jarvis", health: parsed.data } : { kind: "unknown" };
  } catch { return { kind: "unavailable" }; }
}

function compatible(expected: InstanceLock, health: HealthResponse): boolean {
  return health.apiSchemaVersion === expected.apiSchemaVersion && health.appVersion === expected.appVersion && buildsCompatible(expected.buildId, health.buildId);
}

function conflict(probe: HealthProbe, expected: InstanceLock, recordedPid?: number): never {
  const pid = probe.kind === "jarvis" ? probe.health.processId : recordedPid;
  if (probe.kind === "jarvis") throw new RuntimeConflictError("incompatible", `A different JARVIS version is already running on port ${probe.health.port}.\nStop PID ${pid}, then run npm run jarvis again.`);
  if (probe.kind === "missing_health") throw new RuntimeConflictError("missing_health", `Port ${expected.port} is serving an older or incompatible application without JARVIS health metadata.${pid ? ` Stop PID ${pid}, then run npm run jarvis again.` : " Stop the existing application, then retry."}`);
  throw new RuntimeConflictError("unknown_process", `Port ${expected.port} is occupied by another application${pid ? ` (PID ${pid})` : ""}. Stop the owning application before running JARVIS; do not kill unrelated processes blindly.`);
}

export async function acquireInstance(dataDirectory: string, desired: Omit<InstanceLock, "pid" | "startedAt">, dependencies: IntegrityDependencies = {}): Promise<IntegrityResult> {
  mkdirSync(dataDirectory, { recursive: true });
  const lockPath = join(dataDirectory, INSTANCE_LOCK_NAME);
  const pid = dependencies.pid ?? process.pid; const now = dependencies.now ?? (() => new Date()); const alive = dependencies.isProcessAlive ?? processIsAlive; const probe = dependencies.probe ?? probeLocalHealth;
  const metadata = InstanceLockSchema.parse({ ...desired, pid, startedAt: now().toISOString() });
  let prior: InstanceLock | null = null;
  try {
    const raw = readFileSync(lockPath, "utf8");
    try { const parsed = InstanceLockSchema.safeParse(JSON.parse(raw)); if (parsed.success) prior = parsed.data; else renameSync(lockPath, `${lockPath}.malformed-${now().getTime()}`); }
    catch { renameSync(lockPath, `${lockPath}.malformed-${now().getTime()}`); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (prior) {
    if (!alive(prior.pid)) unlinkSync(lockPath);
    else {
      const result = await probe(prior.port);
      if (result.kind === "jarvis" && compatible(metadata, result.health)) return { owned: false, lockPath, metadata: prior, existingUrl: `http://127.0.0.1:${prior.port}` };
      conflict(result, metadata, prior.pid);
    }
  }
  const occupied = await probe(desired.port);
  if (occupied.kind !== "unavailable") {
    if (occupied.kind === "jarvis" && compatible(metadata, occupied.health)) return { owned: false, lockPath, metadata: { ...metadata, pid: occupied.health.processId, startedAt: occupied.health.startedAt }, existingUrl: `http://127.0.0.1:${desired.port}` };
    conflict(occupied, metadata);
  }
  let descriptor: number;
  try { descriptor = openSync(lockPath, "wx", 0o600); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RuntimeConflictError("unknown_process", "Another JARVIS launcher acquired the instance lock. Run npm run jarvis again."); throw error; }
  try { writeFileSync(descriptor, `${JSON.stringify(metadata)}\n`, "utf8"); } finally { closeSync(descriptor); }
  return { owned: true, lockPath, metadata };
}

export function releaseInstance(result: IntegrityResult): void {
  if (!result.owned) return;
  try {
    const current = InstanceLockSchema.parse(JSON.parse(readFileSync(result.lockPath, "utf8")));
    if (
      current.pid === result.metadata.pid
      && current.startedAt === result.metadata.startedAt
      && current.port === result.metadata.port
      && current.appVersion === result.metadata.appVersion
      && current.apiSchemaVersion === result.metadata.apiSchemaVersion
      && current.buildId === result.metadata.buildId
    ) unlinkSync(result.lockPath);
  } catch { /* Never remove a lock that cannot be proven to be ours. */ }
}

export const DEFAULT_API_SCHEMA_VERSION = API_SCHEMA_VERSION;
