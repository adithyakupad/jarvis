import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { ValidationResult } from "../../shared/runs.js";
import { NodeProcessRunner, type ProcessRunner } from "../providers/process-runner.js";

const manifestSchema = z.object({ scripts: z.record(z.string(), z.string()).optional() });
const OUTPUT_LIMIT = 12_000;

export interface DetectedTestCommand { packageManager: "npm" | "pnpm" | "yarn" | "bun"; executable: string; args: ["test"]; commandDisplay: string; }

export function detectTestCommand(repositoryPath: string): DetectedTestCommand | null {
  const manifestPath = join(repositoryPath, "package.json");
  if (!existsSync(manifestPath)) return null;
  let manifest: z.infer<typeof manifestSchema>;
  try { manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8"))); } catch { return null; }
  const testScript = manifest.scripts?.test?.trim();
  if (!testScript || /Error:\s*no test specified/i.test(testScript)) return null;
  const packageManager = existsSync(join(repositoryPath, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(repositoryPath, "yarn.lock")) ? "yarn" : existsSync(join(repositoryPath, "bun.lock")) || existsSync(join(repositoryPath, "bun.lockb")) ? "bun" : "npm";
  return { packageManager, executable: packageManager, args: ["test"], commandDisplay: `${packageManager} test` };
}

function cleanEnvironment(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "USER", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "CI", "SystemRoot"];
  return Object.fromEntries(allowed.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
}

export function unsupportedValidation(): ValidationResult {
  return { status: "not_supported", packageManager: null, executable: null, args: [], commandDisplay: null, startedAt: null, completedAt: null, exitCode: null, signal: null, stdout: "", stderr: "", durationMs: null, failureCategory: "no_supported_test_script" };
}

export class ValidationService {
  constructor(private readonly runner: ProcessRunner = new NodeProcessRunner(), private readonly timeoutMs = 120_000) {}

  async validate(repositoryPath: string, onState: (result: ValidationResult) => void = () => undefined): Promise<ValidationResult> {
    const detected = detectTestCommand(repositoryPath);
    if (!detected) { const unsupported = unsupportedValidation(); onState(unsupported); return unsupported; }
    const pending: ValidationResult = { status: "pending", ...detected, startedAt: null, completedAt: null, exitCode: null, signal: null, stdout: "", stderr: "", durationMs: null, failureCategory: null };
    onState(pending);
    const startedAt = new Date(); const running = { ...pending, status: "running" as const, startedAt: startedAt.toISOString() }; onState(running);
    const result = await this.runner.run(detected.executable, detected.args, { cwd: repositoryPath, timeoutMs: this.timeoutMs, env: cleanEnvironment(), maxOutputBytes: OUTPUT_LIMIT, shell: false });
    const completedAt = new Date();
    const status = result.timedOut ? "timed_out" : result.spawnError || result.exitCode === null ? "invocation_failed" : result.exitCode === 0 ? "passed" : "failed";
    const final: ValidationResult = { ...running, status, completedAt: completedAt.toISOString(), exitCode: result.exitCode, signal: result.signal ?? null, stdout: result.stdout.slice(0, OUTPUT_LIMIT), stderr: result.stderr.slice(0, OUTPUT_LIMIT), durationMs: completedAt.getTime() - startedAt.getTime(), failureCategory: status === "timed_out" ? "timeout" : status === "invocation_failed" ? "executable_unavailable" : status === "failed" ? "nonzero_exit" : null };
    onState(final); return final;
  }
}
