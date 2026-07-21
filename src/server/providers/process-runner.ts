import { spawn } from "node:child_process";

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}
export interface ProcessRunOptions { cwd?: string; timeoutMs?: number; }

export interface ProcessRunner {
  run(executable: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}

export class NodeProcessRunner implements ProcessRunner {
  run(executable: string, args: readonly string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const child = spawn(executable, [...args], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: options.cwd,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        resolve({ exitCode: null, stdout, stderr: error.message });
      });
      child.on("close", (exitCode) => {
        if (timer) clearTimeout(timer);
        resolve({ exitCode, stdout, stderr });
      });
      const timer = options.timeoutMs ? setTimeout(() => child.kill("SIGTERM"), options.timeoutMs) : undefined;
    });
  }
}
