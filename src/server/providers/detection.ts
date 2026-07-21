import {
  ProviderAvailabilitySchema,
  type ProviderAvailability,
} from "../../shared/providers.js";
import type { ProcessRunner } from "./process-runner.js";

function firstNonEmptyLine(value: string): string | null {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

function authenticationDetail(stdout: string, stderr: string): string | null {
  const lines = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => /^logged in\b/i.test(line)) ?? lines[0] ?? null;
}

export async function detectCodex(
  runner: ProcessRunner,
): Promise<ProviderAvailability> {
  const versionResult = await runner.run("codex", ["--version"]);
  if (versionResult.exitCode !== 0) {
    return ProviderAvailabilitySchema.parse({
      provider: "codex",
      installed: false,
      authenticated: null,
      version: null,
      detail: "Codex CLI was not found.",
    });
  }

  const loginResult = await runner.run("codex", ["login", "status"]);
  const authenticated = loginResult.exitCode === 0;
  return ProviderAvailabilitySchema.parse({
    provider: "codex",
    installed: true,
    authenticated,
    version: firstNonEmptyLine(versionResult.stdout || versionResult.stderr),
    detail: authenticated
      ? authenticationDetail(loginResult.stdout, loginResult.stderr) ?? "Codex is authenticated."
      : "Codex is installed but not authenticated.",
  });
}

export async function detectClaudeCode(
  runner: ProcessRunner,
): Promise<ProviderAvailability> {
  const result = await runner.run("claude", ["--version"]);
  const installed = result.exitCode === 0;
  return ProviderAvailabilitySchema.parse({
    provider: "claude-code",
    installed,
    authenticated: null,
    version: installed ? firstNonEmptyLine(result.stdout || result.stderr) : null,
    detail: installed
      ? "Claude Code is installed; authentication will be checked when execution is enabled."
      : "Claude Code was not found.",
  });
}

export async function detectProviders(
  runner: ProcessRunner,
): Promise<ProviderAvailability[]> {
  return Promise.all([detectCodex(runner), detectClaudeCode(runner)]);
}
