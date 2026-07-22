import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ExecutionResultRecord, RepositorySnapshot, Verification } from "../../shared/runs.js";
import { AgentAdapterRegistry } from "../providers/registry.js";
import { ProviderUnavailableError } from "../providers/errors.js";
import { NodeProcessRunner, type ProcessRunner } from "../providers/process-runner.js";
import { ProjectRepository } from "../repositories/projects.js";
import { InvalidRunTransitionError, RunRepository } from "../repositories/runs.js";
import { canonicalizeRepositoryPath, inspectRepositoryPath, InvalidRepositoryPathError } from "../security/repository-path.js";
import { ValidationService } from "./validation.js";

export class RepositoryIdentityError extends Error {}
export class ExecutionFailedError extends Error {}

function approvedPaths(scope: string[]): string[] {
  return scope.flatMap((entry) => {
    const quoted = [...entry.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    const candidates = quoted.length ? quoted : /^[A-Za-z0-9_./*?-]+$/.test(entry.trim()) ? [entry.trim()] : [];
    return candidates.map((candidate) => candidate.replace(/^\.\//, "").replace(/\*.*$/, "")).filter((candidate) => candidate && !candidate.includes(" "));
  });
}

export class ExecutionService {
  private readonly active = new Set<string>();
  private readonly validation: ValidationService;

  constructor(private readonly projects: ProjectRepository, private readonly runs: RunRepository, private readonly adapters: AgentAdapterRegistry, private readonly runner: ProcessRunner = new NodeProcessRunner(), validation?: ValidationService) { this.validation = validation ?? new ValidationService(runner); }

  async execute(runId: string): Promise<import("../../shared/runs.js").Run> {
    const initial = this.runs.require(runId);
    if (["preparing_execution", "executing", "verifying", "completed"].includes(initial.status)) return initial;
    if (this.active.has(runId)) return this.runs.require(runId);
    if (initial.status !== "approved" || !initial.proposal || initial.approved_proposal_revision !== initial.proposal_revision) throw new InvalidRunTransitionError(`Run '${runId}' does not have an executable current approval.`);
    const project = this.projects.get(initial.project_id);
    if (!project) throw new InvalidRunTransitionError(`Run '${runId}' belongs to a missing project.`);
    let canonical: string;
    try { canonical = canonicalizeRepositoryPath(project.repository_path); } catch (error) { throw new RepositoryIdentityError(error instanceof Error ? error.message : "Repository is unavailable."); }
    if (canonical !== project.repository_path) throw new RepositoryIdentityError("The repository no longer resolves to the stored canonical path.");
    const pre = await this.snapshot(canonical);
    this.runs.prepareExecution(runId, pre);
    this.active.add(runId);
    let lastVerification: Verification | undefined;
    try {
      this.runs.setExecutionState(runId, "executing");
      const adapter = this.adapters.require(initial.provider);
      const providerResult = await adapter.execute({ projectId: project.id, repositoryPath: canonical, instruction: initial.instruction, proposal: initial.proposal, providerSessionId: initial.provider_session_id, approvedRevision: initial.approved_proposal_revision, contextPacket: initial.context_packet, projectProfile: project.profile, allowedScope: initial.proposal.expectedScope }, (event) => this.runs.recordExecutionEvent(runId, event.type, { message: event.message, ...event.data }, event.occurredAt));
      if (!providerResult.succeeded) throw new ExecutionFailedError(providerResult.summary || "The provider did not report successful completion.");
      this.runs.setExecutionState(runId, "verifying");
      this.runs.recordExecutionEvent(runId, "verification_started", {});
      const post = await this.snapshot(canonical);
      if (pre.head !== post.head) throw new ExecutionFailedError("Repository HEAD changed during execution; Gate 3 does not authorize commits.");
      const attribution = this.attribute(pre, post);
      const allowedPaths = approvedPaths(initial.proposal.expectedScope);
      const outsideScope = attribution.changedFiles.filter((file) => !allowedPaths.some((normalized) => file === normalized || file.startsWith(normalized.endsWith("/") ? normalized : `${normalized}/`)));
      if (outsideScope.length) throw new ExecutionFailedError(`Execution changed files outside the approved scope: ${outsideScope.join(", ")}`);
      const verificationBase = { repositoryValid: true, checks: [] };
      const validation = await this.validation.validate(canonical, (state) => this.runs.recordVerification(runId, { ...verificationBase, message: validationMessage(state.status), validation: state }));
      const verification: Verification = { ...verificationBase, message: validationMessage(validation.status), validation };
      lastVerification = verification;
      this.runs.recordExecutionEvent(runId, "verification_result", verification);
      const result: ExecutionResultRecord = { summary: providerResult.summary, providerSessionId: providerResult.providerSessionId, succeeded: true, ...attribution };
      const completed = this.runs.completeExecution(runId, result, verification, post, providerResult.providerSessionId);
      this.projects.reconcileExecution(project.id, runId, result.summary, providerResult.providerSessionId);
      return completed;
    } catch (error) {
      const post = await this.snapshot(canonical).catch(() => undefined);
      this.runs.failExecution(runId, error, post, lastVerification);
      if (error instanceof ProviderUnavailableError) throw error;
      throw new ExecutionFailedError(error instanceof Error ? error.message : "Execution failed.");
    } finally { this.active.delete(runId); }
  }

  private async snapshot(path: string): Promise<RepositorySnapshot> {
    const metadata = inspectRepositoryPath(path);
    const files: Record<string, { status: string; fingerprint: string | null }> = {};
    let head: string | null = null;
    if (metadata.isGitRepository) {
      const status = await this.runner.run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: path, timeoutMs: 15_000 });
      if (status.exitCode !== 0) throw new InvalidRepositoryPathError("Git status could not be read safely.");
      for (const entry of status.stdout.split("\0").filter(Boolean)) {
        const relative = entry.slice(3).split(" -> ").at(-1) ?? "";
        const absolute = resolve(path, relative);
        if (!absolute.startsWith(`${path}/`) && absolute !== path) continue;
        let fingerprint: string | null = null;
        try { if (existsSync(absolute) && statSync(absolute).isFile()) fingerprint = createHash("sha256").update(readFileSync(absolute)).digest("hex"); } catch { fingerprint = null; }
        files[relative] = { status: entry.slice(0, 2), fingerprint };
      }
      const revision = await this.runner.run("git", ["rev-parse", "HEAD"], { cwd: path, timeoutMs: 10_000 });
      head = revision.exitCode === 0 ? revision.stdout.trim() : null;
    }
    return { canonicalPath: path, isGitRepository: metadata.isGitRepository, branch: metadata.currentBranch, head, files, capturedAt: new Date().toISOString() };
  }

  private attribute(pre: RepositorySnapshot, post: RepositorySnapshot): Pick<ExecutionResultRecord, "changedFiles" | "createdFiles" | "deletedFiles" | "preExistingFiles" | "ambiguousFiles"> {
    const before = new Set(Object.keys(pre.files)); const after = new Set(Object.keys(post.files));
    const ambiguousFiles = [...before].filter((file) => !after.has(file) || pre.files[file].fingerprint !== post.files[file].fingerprint);
    const introduced = [...after].filter((file) => !before.has(file));
    return { changedFiles: [...new Set([...introduced, ...ambiguousFiles])].sort(), createdFiles: introduced.filter((file) => post.files[file].status === "??" || post.files[file].status.includes("A")), deletedFiles: [...after].filter((file) => post.files[file].status.includes("D") && !before.has(file)), preExistingFiles: [...before].sort(), ambiguousFiles: ambiguousFiles.sort() };
  }

}

function validationMessage(status: import("../../shared/runs.js").ValidationResult["status"]): string {
  if (status === "passed") return "Tests passed.";
  if (status === "failed") return "Changes were applied, but tests failed.";
  if (status === "timed_out") return "Changes were applied, but tests timed out.";
  if (status === "invocation_failed") return "Changes were applied, but the test runner was unavailable.";
  if (status === "not_supported") return "No supported automated tests detected.";
  return status === "pending" ? "Tests are pending." : "Tests are running.";
}
