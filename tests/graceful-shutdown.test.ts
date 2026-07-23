import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createShutdownController, registerGracefulSignalHandlers, type SignalProcess } from "../src/server/graceful-shutdown.js";
import { acquireInstance, releaseInstance } from "../src/server/runtime-integrity.js";
import { API_SCHEMA_VERSION } from "../src/shared/runtime.js";

class TestSignalProcess extends EventEmitter implements SignalProcess {
  exitCode: number | string | null | undefined;
  readonly exit = vi.fn();
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
};

async function ownedShutdown(signal: "SIGINT" | "SIGTERM"): Promise<{ lockExists: boolean; process: TestSignalProcess }> {
  const root = mkdtempSync(join(tmpdir(), "jarvis-shutdown-"));
  const instance = await acquireInstance(root, {
    port: 4173,
    appVersion: "0.2.0-alpha.1",
    apiSchemaVersion: API_SCHEMA_VERSION,
    buildId: "test-build",
  }, { pid: 88, probe: async () => ({ kind: "unavailable" }) });
  const shutdown = createShutdownController({
    closeServer: async () => undefined,
    closeOwnedResources: () => undefined,
    releaseOwnedLock: () => releaseInstance(instance),
    timeoutMs: 100,
  });
  const signalProcess = new TestSignalProcess();
  registerGracefulSignalHandlers(shutdown, signalProcess);
  signalProcess.emit(signal);
  await flush();
  return { lockExists: existsSync(instance.lockPath), process: signalProcess };
}

describe("graceful shutdown", () => {
  it("closes the listener before owned resources and the owned lock", async () => {
    const order: string[] = [];
    const shutdown = createShutdownController({
      closeServer: async () => { order.push("listener"); },
      closeOwnedResources: () => { order.push("resources"); },
      releaseOwnedLock: () => { order.push("lock"); },
      timeoutMs: 100,
    });

    await expect(shutdown.close()).resolves.toEqual({ timedOut: false, closeError: undefined, cleanupError: undefined });
    expect(order).toEqual(["listener", "resources", "lock"]);
  });

  it("shares one idempotent cleanup transaction across repeated shutdown requests", async () => {
    let finishClose: (() => void) | undefined;
    const closeServer = vi.fn(() => new Promise<void>((resolve) => { finishClose = resolve; }));
    const closeOwnedResources = vi.fn();
    const releaseOwnedLock = vi.fn();
    const shutdown = createShutdownController({ closeServer, closeOwnedResources, releaseOwnedLock, timeoutMs: 100 });

    const first = shutdown.close();
    const second = shutdown.close();
    await Promise.resolve();
    finishClose?.();

    expect(await first).toEqual(await second);
    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(closeOwnedResources).toHaveBeenCalledTimes(1);
    expect(releaseOwnedLock).toHaveBeenCalledTimes(1);
  });

  it("bounds a hung listener close and still releases owned resources", async () => {
    const closeOwnedResources = vi.fn();
    const releaseOwnedLock = vi.fn();
    const shutdown = createShutdownController({
      closeServer: () => new Promise<void>(() => undefined),
      closeOwnedResources,
      releaseOwnedLock,
      timeoutMs: 10,
    });

    await expect(shutdown.close()).resolves.toMatchObject({ timedOut: true });
    expect(closeOwnedResources).toHaveBeenCalledOnce();
    expect(releaseOwnedLock).toHaveBeenCalledOnce();
  });

  it("attempts safe owned-lock cleanup when listener close fails", async () => {
    const error = new Error("close failed");
    const closeOwnedResources = vi.fn();
    const releaseOwnedLock = vi.fn();
    const shutdown = createShutdownController({
      closeServer: async () => { throw error; },
      closeOwnedResources,
      releaseOwnedLock,
      timeoutMs: 100,
    });

    await expect(shutdown.close()).resolves.toMatchObject({ timedOut: false, closeError: error });
    expect(closeOwnedResources).toHaveBeenCalledOnce();
    expect(releaseOwnedLock).toHaveBeenCalledOnce();
  });

  it("releases the owned lock even if another owned resource fails to close", async () => {
    const releaseOwnedLock = vi.fn();
    const shutdown = createShutdownController({
      closeServer: async () => undefined,
      closeOwnedResources: () => { throw new Error("database close failed"); },
      releaseOwnedLock,
      timeoutMs: 100,
    });

    await expect(shutdown.close()).resolves.toMatchObject({
      timedOut: false,
      cleanupError: expect.objectContaining({ message: "database close failed" }),
    });
    expect(releaseOwnedLock).toHaveBeenCalledOnce();
  });

  it("removes the current process's owned lock on SIGINT with signal status", async () => {
    const result = await ownedShutdown("SIGINT");
    expect(result.lockExists).toBe(false);
    expect(result.process.exitCode).toBe(130);
    expect(result.process.exit).not.toHaveBeenCalled();
  });

  it("removes the current process's owned lock on SIGTERM with signal status", async () => {
    const result = await ownedShutdown("SIGTERM");
    expect(result.lockExists).toBe(false);
    expect(result.process.exitCode).toBe(143);
    expect(result.process.exit).not.toHaveBeenCalled();
  });

  it("ignores repeated SIGINT while one shutdown transaction is in flight", async () => {
    let finishClose: (() => void) | undefined;
    const closeServer = vi.fn(() => new Promise<void>((resolve) => { finishClose = resolve; }));
    const releaseOwnedLock = vi.fn();
    const shutdown = createShutdownController({
      closeServer,
      closeOwnedResources: vi.fn(),
      releaseOwnedLock,
      timeoutMs: 100,
    });
    const signalProcess = new TestSignalProcess();
    registerGracefulSignalHandlers(shutdown, signalProcess);

    signalProcess.emit("SIGINT");
    signalProcess.emit("SIGINT");
    await Promise.resolve();
    finishClose?.();
    await flush();

    expect(closeServer).toHaveBeenCalledOnce();
    expect(releaseOwnedLock).toHaveBeenCalledOnce();
    expect(signalProcess.exit).not.toHaveBeenCalled();
  });

  it("forces a signal-related exit only after bounded cleanup completes", async () => {
    const order: string[] = [];
    const shutdown = createShutdownController({
      closeServer: () => new Promise<void>(() => undefined),
      closeOwnedResources: () => { order.push("resources"); },
      releaseOwnedLock: () => { order.push("lock"); },
      timeoutMs: 5,
    });
    const signalProcess = new TestSignalProcess();
    signalProcess.exit.mockImplementation((code?: number) => { order.push(`exit:${code}`); });
    registerGracefulSignalHandlers(shutdown, signalProcess);

    signalProcess.emit("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(order).toEqual(["resources", "lock", "exit:143"]);
    expect(signalProcess.exitCode).toBe(143);
  });
});
