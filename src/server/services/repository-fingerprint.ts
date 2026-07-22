import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ProcessRunner } from "../providers/process-runner.js";

export async function repositoryFingerprint(repositoryPath: string, runner: ProcessRunner): Promise<string | null> {
  const head = await runner.run("git", ["rev-parse", "HEAD"], { cwd: repositoryPath, timeoutMs: 10_000 });
  if (head.exitCode !== 0) return null;
  const status = await runner.run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: repositoryPath, timeoutMs: 15_000 });
  if (status.exitCode !== 0) return null;
  const digest = createHash("sha256").update(repositoryPath).update("\0").update(head.stdout.trim()).update("\0").update(status.stdout);
  for (const entry of status.stdout.split("\0").filter(Boolean).sort()) {
    const relative = entry.slice(3).split(" -> ").at(-1) ?? "";
    const absolute = resolve(repositoryPath, relative);
    if ((!absolute.startsWith(`${repositoryPath}/`) && absolute !== repositoryPath) || !existsSync(absolute)) continue;
    try { if (statSync(absolute).isFile()) digest.update("\0").update(relative).update("\0").update(readFileSync(absolute)); } catch { return null; }
  }
  return digest.digest("hex");
}
