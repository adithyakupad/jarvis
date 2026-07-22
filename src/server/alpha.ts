import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { z } from "zod";

import { openDatabase } from "./database/connection.js";
import { buildApi } from "./http/app.js";
import { ClaudeCodeAdapter } from "./providers/claude-code-adapter.js";
import { CodexPlanningAdapter } from "./providers/codex-planning-adapter.js";
import { AgentAdapterRegistry } from "./providers/registry.js";
import { RunRepository } from "./repositories/runs.js";
import { acquireInstance, probeLocalHealth, releaseInstance, RuntimeConflictError, type IntegrityDependencies, type IntegrityResult } from "./runtime-integrity.js";
import { API_SCHEMA_VERSION, DEVELOPMENT_BUILD_ID } from "../shared/runtime.js";

export interface AlphaOptions {
  rootDirectory?: string;
  dataDirectory?: string;
  port?: number;
  appVersion?: string;
  buildId?: string;
  integrityDependencies?: IntegrityDependencies;
  acquiredInstance?: IntegrityResult;
  registerSignals?: boolean;
}

export interface AlphaRuntime { url: string; instance: IntegrityResult; close(): Promise<void>; }

export async function startAlpha(options: AlphaOptions = {}): Promise<AlphaRuntime | null> {
  const root = resolve(options.rootDirectory ?? process.cwd());
  const dataDirectory = resolve(options.dataDirectory ?? process.env.JARVIS_DATA_DIR ?? resolve(root, "data"));
  const port = options.port ?? Number(process.env.JARVIS_PORT ?? 4173);
  const packageVersion = z.object({ version: z.string().min(1) }).parse(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))).version;
  const appVersion = options.appVersion ?? process.env.JARVIS_APP_VERSION ?? packageVersion;
  const buildId = options.buildId ?? process.env.JARVIS_BUILD_ID ?? DEVELOPMENT_BUILD_ID;
  const instance = options.acquiredInstance ?? await acquireInstance(dataDirectory, { port, appVersion, apiSchemaVersion: API_SCHEMA_VERSION, buildId }, options.integrityDependencies);
  if (!instance.owned) { process.stdout.write(`JARVIS is already running at ${instance.existingUrl}.\n`); return null; }
  const database = openDatabase(process.env.JARVIS_DATABASE_PATH ?? resolve(dataDirectory, "jarvis.db"));
  new RunRepository(database).interruptActiveRuns();
  const app = buildApi({ database, adapters: new AgentAdapterRegistry([new CodexPlanningAdapter(), new ClaudeCodeAdapter()]), publicDirectory: resolve(root, "dist/client"), runtime: { appVersion, apiSchemaVersion: API_SCHEMA_VERSION, buildId, processId: process.pid, startedAt: instance.metadata.startedAt, bindHost: "127.0.0.1", port } });
  try { await app.listen({ host: "127.0.0.1", port }); }
  catch (error) {
    await app.close().catch(() => undefined); database.close(); releaseInstance(instance);
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      const found = await probeLocalHealth(port);
      if (found.kind === "jarvis") throw new RuntimeConflictError("incompatible", `A different JARVIS version is already running on port ${port}.\nStop PID ${found.health.processId}, then run npm run jarvis again.`);
      if (found.kind === "missing_health") throw new RuntimeConflictError("missing_health", `Port ${port} is serving an older or incompatible application without /api/health. Stop it, then run npm run jarvis again.`);
      throw new RuntimeConflictError("unknown_process", `Port ${port} is occupied by another application. Stop the owning application before running JARVIS.`);
    }
    throw error;
  }
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) return; closing = true;
    releaseInstance(instance);
    const timeout = setTimeout(() => { process.exitCode = 1; }, 3_000); timeout.unref();
    try { await app.close(); database.close(); } finally { clearTimeout(timeout); }
  };
  if (options.registerSignals !== false) {
    process.once("SIGINT", () => void close()); process.once("SIGTERM", () => void close()); process.once("exit", () => releaseInstance(instance));
  }
  const url = `http://127.0.0.1:${port}`;
  process.stdout.write(`JARVIS ${appVersion}\nAPI schema: ${API_SCHEMA_VERSION}\nData directory: ${dataDirectory}\nListening: ${url}\nPress Ctrl+C to stop JARVIS.\n`);
  return { url, instance, close };
}
