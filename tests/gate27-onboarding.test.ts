import { closeSync, mkdtempSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type JarvisDatabase } from "../src/server/database/connection.js";
import { buildApi } from "../src/server/http/app.js";
import { AgentAdapterRegistry } from "../src/server/providers/registry.js";
import type { ProcessRunner } from "../src/server/providers/process-runner.js";

const databases: JarvisDatabase[] = [];
const apps: Array<ReturnType<typeof buildApi>> = [];
const runner: ProcessRunner = { async run() { return { exitCode: 1, stdout: "", stderr: "not installed" }; } };

function fixture(databasePath?: string) {
  const root = mkdtempSync(join(tmpdir(), "jarvis-onboarding-"));
  const repo = join(root, "sample-repo");
  mkdirSync(repo);
  mkdirSync(join(repo, ".git"));
  writeFileSync(join(repo, ".git", "HEAD"), "ref: refs/heads/feature/onboarding\n");
  writeFileSync(join(repo, "README.md"), "# Sample\n");
  writeFileSync(join(repo, "package.json"), '{"scripts":{"test":"vitest"}}\n');
  const path = databasePath ?? join(root, "jarvis.db");
  const database = openDatabase(path); databases.push(database);
  const app = buildApi({ database, adapters: new AgentAdapterRegistry([]), processRunner: runner }); apps.push(app);
  return { root, repo, path, database, app };
}

afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const database of databases.splice(0)) if (database.open) database.close(); });

describe("Gate 2.7 local project onboarding", () => {
  it("starts with no fictional projects and reports a valid setup state", async () => {
    const context = fixture();
    expect((await context.app.inject({ method: "GET", url: "/api/projects" })).json()).toEqual({ projects: [] });
    expect((await context.app.inject({ method: "GET", url: "/api/setup" })).json()).toMatchObject({ projectCount: 0 });
  });

  it("validates directories and rejects missing paths and files", async () => {
    const context = fixture();
    const valid = await context.app.inject({ method: "POST", url: "/api/projects/validate-path", payload: { repository_path: context.repo } });
    expect(valid.json().repository).toMatchObject({ canonicalPath: realpathSync.native(context.repo), directoryName: "sample-repo", isGitRepository: true, currentBranch: "feature/onboarding", commonFiles: ["README.md", "package.json"] });
    const missing = await context.app.inject({ method: "POST", url: "/api/projects/validate-path", payload: { repository_path: join(context.root, "missing") } });
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toMatchObject({ error: { code: "filesystem_error", message: expect.stringContaining("does not exist") } });
    expect((await context.app.inject({ method: "POST", url: "/api/projects/validate-path", payload: { repository_path: join(context.repo, "README.md") } })).statusCode).toBe(422);
  });

  it("requires creation fields, generates IDs, stores canonical paths, providers, and profiles", async () => {
    const context = fixture();
    expect((await context.app.inject({ method: "POST", url: "/api/projects", payload: { name: "Sample" } })).statusCode).toBe(400);
    const created = await context.app.inject({ method: "POST", url: "/api/projects", payload: { name: "Sample", objective: "Improve onboarding", repository_path: `${context.repo}/.`, provider: "codex", notes: "Keep changes focused." } });
    expect(created.statusCode).toBe(201);
    expect(created.json().project).toMatchObject({ name: "Sample", repository_path: realpathSync.native(context.repo), provider: "codex", notes: "Keep changes focused.", profile: { inferredTechnologies: ["Node.js / JavaScript"] } });
    expect(created.json().project.id).toMatch(/^project-/);
    const second = await context.app.inject({ method: "POST", url: "/api/projects", payload: { name: "Second", objective: "Plan safely", repository_path: context.repo, provider: "claude-code" } });
    expect(second.json().project.id).not.toBe(created.json().project.id);
    expect((await context.app.inject({ method: "GET", url: "/api/projects" })).json().projects).toHaveLength(2);
  });

  it("persists across restart and removal never touches repository files", async () => {
    const context = fixture();
    const marker = join(context.repo, "uncommitted.txt"); writeFileSync(marker, "local work\n");
    const created = await context.app.inject({ method: "POST", url: "/api/projects", payload: { name: "Persistent", objective: "Preserve local work", repository_path: context.repo, provider: "codex" } });
    const id = created.json().project.id as string;
    expect(readFileSync(marker, "utf8")).toBe("local work\n");
    await context.app.close(); apps.splice(apps.indexOf(context.app), 1); context.database.close();
    const database = openDatabase(context.path); databases.push(database);
    const app = buildApi({ database, adapters: new AgentAdapterRegistry([]), processRunner: runner }); apps.push(app);
    expect((await app.inject({ method: "GET", url: `/api/projects/${id}` })).json().project.name).toBe("Persistent");
    expect((await app.inject({ method: "DELETE", url: `/api/projects/${id}` })).statusCode).toBe(204);
    expect(readFileSync(marker, "utf8")).toBe("local work\n");
  });

  it("rejects a file even when it is inaccessible", async () => {
    const context = fixture();
    const file = join(context.root, "plain-file"); closeSync(openSync(file, "w"));
    expect((await context.app.inject({ method: "POST", url: "/api/projects/validate-path", payload: { repository_path: file } })).statusCode).toBe(422);
  });
});
