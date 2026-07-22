import {
  ProviderAvailabilitySchema,
  type ProviderAvailability,
} from "../../shared/providers.js";
import { z } from "zod";
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
  if (!installed) {
    return ProviderAvailabilitySchema.parse({ provider: "claude-code", installed: false, authenticated: null, version: null, detail: result.exitCode === null ? "Claude Code executable is unavailable." : `Claude Code invocation failed: ${firstNonEmptyLine(result.stderr) ?? `exit ${result.exitCode}`}` });
  }
  const auth = await runner.run("claude", ["auth", "status", "--json"], { timeoutMs: 15_000 });
  let authenticated = false;
  if (auth.exitCode === 0) {
    try { const parsed = z.object({ loggedIn: z.boolean().optional(), authenticated: z.boolean().optional() }).passthrough().parse(JSON.parse(auth.stdout)); authenticated = parsed.loggedIn ?? parsed.authenticated ?? true; }
    catch { authenticated = /logged\s*in|authenticated/i.test(`${auth.stdout}\n${auth.stderr}`); }
  }
  return ProviderAvailabilitySchema.parse({
    provider: "claude-code",
    installed,
    authenticated,
    version: installed ? firstNonEmptyLine(result.stdout || result.stderr) : null,
    detail: authenticated ? "Claude Code is installed and authenticated." : `Claude Code is installed but authentication is unavailable${auth.stderr.trim() ? `: ${firstNonEmptyLine(auth.stderr)}` : "."}`,
  });
}

export async function detectProviders(
  runner: ProcessRunner,
): Promise<ProviderAvailability[]> {
  return Promise.all([detectCodex(runner), detectClaudeCode(runner)]);
}
