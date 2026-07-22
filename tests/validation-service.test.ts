import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { ProcessRunOptions, ProcessRunner, ProcessResult } from "../src/server/providers/process-runner.js";
import { detectTestCommand, ValidationService } from "../src/server/services/validation.js";

function repository(testScript = "node --test"): string {
  const path = mkdtempSync(join(tmpdir(), "jarvis-validation-"));
  writeFileSync(join(path, "package.json"), JSON.stringify({ scripts: { test: testScript } }));
  return path;
}

class FakeRunner implements ProcessRunner {
  calls: Array<{ executable: string; args: readonly string[]; options?: ProcessRunOptions }> = [];
  constructor(private readonly result: ProcessResult) {}
  async run(executable: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult> { this.calls.push({ executable, args, options }); return this.result; }
}

describe("independent JavaScript validation", () => {
  it("detects npm test from a real package script", () => { expect(detectTestCommand(repository())).toEqual({ packageManager: "npm", executable: "npm", args: ["test"], commandDisplay: "npm test" }); });

  it.each([["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["bun.lock", "bun"], ["bun.lockb", "bun"]] as const)("selects %s", (lockfile, manager) => {
    const path = repository(); writeFileSync(join(path, lockfile), ""); expect(detectTestCommand(path)?.packageManager).toBe(manager);
  });

  it("rejects the npm placeholder and missing test scripts", () => {
    expect(detectTestCommand(repository('echo "Error: no test specified" && exit 1'))).toBeNull();
    const path = mkdtempSync(join(tmpdir(), "jarvis-validation-")); writeFileSync(join(path, "package.json"), JSON.stringify({ scripts: { build: "tsc" } })); expect(detectTestCommand(path)).toBeNull();
  });

  it("runs a fixed command without a shell in the canonical cwd and persists success", async () => {
    const path = repository(); const runner = new FakeRunner({ exitCode: 0, stdout: "passed", stderr: "", signal: null }); const states: string[] = [];
    const result = await new ValidationService(runner).validate(path, (state) => states.push(state.status));
    expect(result).toMatchObject({ status: "passed", packageManager: "npm", executable: "npm", args: ["test"], exitCode: 0, stdout: "passed" });
    expect(states).toEqual(["pending", "running", "passed"]);
    expect(runner.calls[0]).toMatchObject({ executable: "npm", args: ["test"], options: { cwd: path, shell: false, timeoutMs: 120000, maxOutputBytes: 12000 } });
    expect(runner.calls[0].options?.env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it.each([
    [{ exitCode: 2, stdout: "", stderr: "assertion failed", signal: null }, "failed", "nonzero_exit"],
    [{ exitCode: null, stdout: "", stderr: "terminated", signal: "SIGTERM", timedOut: true }, "timed_out", "timeout"],
    [{ exitCode: null, stdout: "", stderr: "spawn ENOENT", signal: null, spawnError: "spawn ENOENT" }, "invocation_failed", "executable_unavailable"],
  ] as const)("persists process outcome %#", async (processResult, status, category) => {
    const result = await new ValidationService(new FakeRunner(processResult)).validate(repository()); expect(result).toMatchObject({ status, failureCategory: category, stderr: processResult.stderr });
  });

  it("bounds captured stdout and stderr", async () => {
    const result = await new ValidationService(new FakeRunner({ exitCode: 1, stdout: "o".repeat(20_000), stderr: "e".repeat(20_000) })).validate(repository());
    expect(result.stdout).toHaveLength(12_000); expect(result.stderr).toHaveLength(12_000);
  });

  it("returns not_supported without spawning a process", async () => {
    const path = repository('echo "Error: no test specified"'); const runner = new FakeRunner({ exitCode: 0, stdout: "", stderr: "" });
    expect(await new ValidationService(runner).validate(path)).toMatchObject({ status: "not_supported", failureCategory: "no_supported_test_script" }); expect(runner.calls).toHaveLength(0);
  });
});
