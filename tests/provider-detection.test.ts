import { describe, expect, it } from "vitest";

import {
  detectClaudeCode,
  detectCodex,
  detectProviders,
} from "../src/server/providers/detection.js";
import type {
  ProcessResult,
  ProcessRunner,
} from "../src/server/providers/process-runner.js";

class FakeRunner implements ProcessRunner {
  readonly calls: Array<{ executable: string; args: readonly string[] }> = [];

  constructor(
    private readonly results: Record<string, ProcessResult>,
  ) {}

  async run(executable: string, args: readonly string[]): Promise<ProcessResult> {
    this.calls.push({ executable, args });
    return (
      this.results[`${executable} ${args.join(" ")}`] ?? {
        exitCode: null,
        stdout: "",
        stderr: "not found",
      }
    );
  }
}

describe("provider detection", () => {
  it("detects an installed and authenticated Codex CLI", async () => {
    const runner = new FakeRunner({
      "codex --version": {
        exitCode: 0,
        stdout: "codex-cli 0.144.6\n",
        stderr: "",
      },
      "codex login status": {
        exitCode: 0,
        stdout: "Logged in using ChatGPT\n",
        stderr: "WARNING: unable to create PATH alias\n",
      },
    });

    await expect(detectCodex(runner)).resolves.toEqual({
      provider: "codex",
      installed: true,
      authenticated: true,
      version: "codex-cli 0.144.6",
      detail: "Logged in using ChatGPT",
    });
    expect(runner.calls).toEqual([
      { executable: "codex", args: ["--version"] },
      { executable: "codex", args: ["login", "status"] },
    ]);
  });

  it("reports Codex as installed but unauthenticated", async () => {
    const runner = new FakeRunner({
      "codex --version": { exitCode: 0, stdout: "codex-cli 1.0\n", stderr: "" },
      "codex login status": { exitCode: 1, stdout: "", stderr: "Not logged in" },
    });

    await expect(detectCodex(runner)).resolves.toMatchObject({
      installed: true,
      authenticated: false,
    });
  });

  it("reports an unavailable Claude Code binary", async () => {
    const runner = new FakeRunner({});

    await expect(detectClaudeCode(runner)).resolves.toEqual({
      provider: "claude-code",
      installed: false,
      authenticated: null,
      version: null,
      detail: "Claude Code executable is unavailable.",
    });
  });

  it("detects both providers through the shared detection service", async () => {
    const runner = new FakeRunner({
      "codex --version": { exitCode: 0, stdout: "codex-cli 1.0", stderr: "" },
      "codex login status": { exitCode: 0, stdout: "Logged in", stderr: "" },
      "claude --version": { exitCode: 0, stdout: "2.1.0", stderr: "" },
      "claude auth status --json": { exitCode: 0, stdout: '{"loggedIn":true}', stderr: "" },
    });

    const detected = await detectProviders(runner);
    expect(detected.map(({ provider }) => provider)).toEqual([
      "codex",
      "claude-code",
    ]);
    expect(detected[1]).toMatchObject({ installed: true, authenticated: true, version: "2.1.0" });
  });

  it("does not mark an installed but unauthenticated Claude executable ready", async () => {
    const runner = new FakeRunner({ "claude --version": { exitCode: 0, stdout: "2.1.0", stderr: "" }, "claude auth status --json": { exitCode: 1, stdout: "", stderr: "Not logged in" } });
    await expect(detectClaudeCode(runner)).resolves.toMatchObject({ installed: true, authenticated: false, detail: expect.stringContaining("authentication is unavailable") });
  });
});
