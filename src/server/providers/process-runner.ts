import { spawn } from "node:child_process";

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  signal?: string | null;
  timedOut?: boolean;
  spawnError?: string | null;
}
export interface ProcessRunOptions { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; maxOutputBytes?: number; shell?: false; }

export interface ProcessRunner {
  run(executable: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}

export class NodeProcessRunner implements ProcessRunner {
  run(executable: string, args: readonly string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const child = spawn(executable, [...args], {
        shell: options.shell ?? false,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: options.cwd,
        env: options.env,
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let closed = false;
      let spawnError: string | null = null;
      const maximum = options.maxOutputBytes ?? 256_000;
      child.stdout.on("data", (chunk: Buffer) => {
        if (stdout.length < maximum) stdout += chunk.toString("utf8").slice(0, maximum - stdout.length);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < maximum) stderr += chunk.toString("utf8").slice(0, maximum - stderr.length);
      });
      child.on("error", (error) => {
        spawnError = error.message;
      });
      child.on("close", (exitCode, signal) => {
        closed = true;
        if (timer) clearTimeout(timer);
        resolve({ exitCode, stdout, stderr: spawnError && !stderr ? spawnError : stderr, signal, timedOut, spawnError });
      });
      const timer = options.timeoutMs ? setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => { if (!closed) child.kill("SIGKILL"); }, 1_000).unref(); }, options.timeoutMs) : undefined;
    });
  }
}
