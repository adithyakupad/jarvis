import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type JarvisDatabase } from "../src/server/database/connection.js";
import { buildApi } from "../src/server/http/app.js";
import { AgentAdapterRegistry } from "../src/server/providers/registry.js";
import { acquireInstance, INSTANCE_LOCK_NAME, releaseInstance, RuntimeConflictError, type HealthProbe } from "../src/server/runtime-integrity.js";
import { API_SCHEMA_VERSION } from "../src/shared/runtime.js";

const databases: JarvisDatabase[] = [];
afterEach(() => { while (databases.length) databases.pop()?.close(); });

const desired = { port: 4173, appVersion: "0.1.0", apiSchemaVersion: API_SCHEMA_VERSION, buildId: "abc1234" };
const ready = { status: "ready" as const, ...desired, processId: 77, startedAt: "2026-07-22T12:00:00.000Z", bindHost: "127.0.0.1" as const };
const directory = (): string => mkdtempSync(join(tmpdir(), "jarvis-integrity-"));

describe("local runtime integrity", () => {
  it("reports safe readiness and compatibility metadata", async () => {
    const root = directory(); const database = openDatabase(join(root, "jarvis.db")); databases.push(database);
    const app = buildApi({ database, adapters: new AgentAdapterRegistry([]), runtime: ready });
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(ready);
    expect(JSON.stringify(response.json())).not.toMatch(/credential|environment|repository|prompt|secret|token/i);
    await app.close();
  });

  it("removes a dead-PID lock and replaces it atomically", async () => {
    const root = directory(); const lockPath = join(root, INSTANCE_LOCK_NAME);
    writeFileSync(lockPath, JSON.stringify({ ...desired, pid: 999, startedAt: ready.startedAt }));
    const result = await acquireInstance(root, desired, { pid: 88, isProcessAlive: () => false, probe: async () => ({ kind: "unavailable" }) });
    expect(result.owned).toBe(true); expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(88);
    releaseInstance(result); expect(existsSync(lockPath)).toBe(false);
  });

  it("reuses only a compatible live JARVIS instance", async () => {
    const root = directory(); writeFileSync(join(root, INSTANCE_LOCK_NAME), JSON.stringify({ ...desired, pid: 77, startedAt: ready.startedAt }));
    const result = await acquireInstance(root, desired, { isProcessAlive: () => true, probe: async () => ({ kind: "jarvis", health: ready }) });
    expect(result).toMatchObject({ owned: false, existingUrl: "http://127.0.0.1:4173" });
  });

  it("blocks incompatible JARVIS and unknown live processes without terminating them", async () => {
    for (const probe of [{ kind: "jarvis", health: { ...ready, apiSchemaVersion: 2 } }, { kind: "unknown" }] as HealthProbe[]) {
      const root = directory(); writeFileSync(join(root, INSTANCE_LOCK_NAME), JSON.stringify({ ...desired, pid: 77, startedAt: ready.startedAt }));
      await expect(acquireInstance(root, desired, { isProcessAlive: () => true, probe: async () => probe })).rejects.toBeInstanceOf(RuntimeConflictError);
      expect(existsSync(join(root, INSTANCE_LOCK_NAME))).toBe(true);
    }
  });

  it("does not trust PID reuse without valid health metadata", async () => {
    const root = directory(); writeFileSync(join(root, INSTANCE_LOCK_NAME), JSON.stringify({ ...desired, pid: 77, startedAt: ready.startedAt }));
    await expect(acquireInstance(root, desired, { isProcessAlive: () => true, probe: async () => ({ kind: "missing_health" }) })).rejects.toMatchObject({ category: "missing_health" });
  });

  it("preserves malformed locks for diagnostics and recovers", async () => {
    const root = directory(); writeFileSync(join(root, INSTANCE_LOCK_NAME), "not-json");
    const result = await acquireInstance(root, desired, { pid: 88, now: () => new Date("2026-07-22T12:00:01.000Z"), probe: async () => ({ kind: "unavailable" }) });
    expect(existsSync(`${join(root, INSTANCE_LOCK_NAME)}.malformed-1784721601000`)).toBe(true);
    releaseInstance(result);
  });

  it("classifies occupied ports and never removes another instance lock", async () => {
    const root = directory();
    await expect(acquireInstance(root, desired, { probe: async () => ({ kind: "unknown" }) })).rejects.toMatchObject({ category: "unknown_process", message: expect.stringContaining("occupied") });
    expect(existsSync(join(root, INSTANCE_LOCK_NAME))).toBe(false);
  });
});
