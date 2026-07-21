import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z, ZodError } from "zod";

import type { JarvisDatabase } from "../database/connection.js";
import { detectProviders } from "../providers/detection.js";
import { ProviderUnavailableError } from "../providers/codex-planning-adapter.js";
import { NodeProcessRunner, type ProcessRunner } from "../providers/process-runner.js";
import { ProviderNotRegisteredError, AgentAdapterRegistry } from "../providers/registry.js";
import { ProjectAlreadyExistsError, ProjectRepository } from "../repositories/projects.js";
import { InvalidRunTransitionError, RunNotFoundError, RunRepository, StaleProposalRevisionError } from "../repositories/runs.js";
import { PlanningInspectionError, PlanningService, ProjectNotFoundError } from "../services/planning.js";
import { ExecutionFailedError, ExecutionService, RepositoryIdentityError } from "../services/execution.js";
import { ProviderIdSchema, ProjectProfileSchema } from "../../shared/projects.js";
import { inspectRepositoryPath, InvalidRepositoryPathError } from "../security/repository-path.js";
import { ContextPacketFieldsSchema, ContextPacketSchema } from "../../shared/context.js";
import type { PlanProposal, Run } from "../../shared/runs.js";

const idParams = z.object({ projectId: z.string().trim().min(1) });
const runParams = z.object({ runId: z.string().trim().min(1) });
const createProjectBody = z.object({
  id: z.string().trim().min(1).optional(), name: z.string().trim().min(1), objective: z.string().trim().min(1),
  repository_path: z.string().trim().min(1), provider: ProviderIdSchema, notes: z.string().default(""),
});
const validatePathBody = z.object({ repository_path: z.string().trim().min(1) });
const updateProjectBody = z.object({ name: z.string().trim().min(1).optional(), objective: z.string().trim().min(1).optional(), repository_path: z.string().trim().min(1).optional(), provider: ProviderIdSchema.optional(), notes: z.string().optional() }).refine((value) => Object.keys(value).length > 0, "At least one setting is required.");
const instructionBody = z.object({ instruction: z.string().trim().min(1) });
const modifyBody = z.object({ currentRevision: z.number().int().positive(), modification: z.string().trim().min(1) });
const proceedBody = z.object({ revision: z.number().int().positive() });
const contextBody = ContextPacketFieldsSchema.extend({ currentRevision: z.number().int().positive() });
const streamQuery = z.object({ replayOnly: z.enum(["true", "false"]).optional() });

export interface ApiDependencies {
  database: JarvisDatabase;
  adapters: AgentAdapterRegistry;
  processRunner?: ProcessRunner;
}

function runResponse(runs: RunRepository, runId: string): { run: Run; revisions: PlanProposal[]; events: ReturnType<RunRepository["events"]> } {
  return { run: runs.require(runId), revisions: runs.proposalRevisions(runId), events: runs.events(runId) };
}

export function buildApi({ database, adapters, processRunner = new NodeProcessRunner() }: ApiDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const projects = new ProjectRepository(database);
  const runs = new RunRepository(database);
  const planning = new PlanningService(projects, runs, adapters);
  const execution = new ExecutionService(projects, runs, adapters, processRunner);

  app.get("/api/setup", async () => ({ providers: await detectProviders(processRunner), projectCount: projects.list().length }));
  app.get("/api/setup/providers", async () => ({ providers: await detectProviders(processRunner) }));
  app.post("/api/projects/validate-path", async (request) => ({ repository: inspectRepositoryPath(validatePathBody.parse(request.body).repository_path) }));
  app.get("/api/projects", async () => ({ projects: projects.list() }));
  app.post("/api/projects", async (request, reply) => {
    const input = createProjectBody.parse(request.body);
    const repository = inspectRepositoryPath(input.repository_path);
    const technologies = repository.commonFiles.flatMap((file) => file === "package.json" ? ["Node.js / JavaScript"] : file === "pyproject.toml" || file === "requirements.txt" ? ["Python"] : file === "Cargo.toml" ? ["Rust"] : file === "go.mod" ? ["Go"] : []);
    let packageEntry: string[] = [];
    let validationCommands: string[] = [];
    if (repository.commonFiles.includes("package.json")) {
      try {
        const manifest = z.object({ main: z.string().optional(), scripts: z.record(z.string(), z.string()).optional() }).parse(JSON.parse(readFileSync(join(repository.canonicalPath, "package.json"), "utf8")));
        packageEntry = manifest.main ? [manifest.main] : [];
        validationCommands = ["test", "typecheck", "build"].filter((name) => manifest.scripts?.[name]).map((name) => `npm run ${name}`);
      } catch { /* Malformed or inaccessible manifests remain an unresolved onboarding question. */ }
    }
    const profile = ProjectProfileSchema.parse({
      summary: `${repository.directoryName} is ${repository.isGitRepository ? "a Git repository" : "a local project directory"} with ${repository.commonFiles.length ? repository.commonFiles.join(", ") : "no recognized top-level manifest"}.`,
      repositoryFindings: [`Canonical directory: ${repository.directoryName}`, repository.isGitRepository ? `Git repository${repository.currentBranch ? ` on branch ${repository.currentBranch}` : ""}.` : "No Git metadata was found at the project root.", ...repository.commonFiles.map((file) => `Found ${file} at the repository root.`)],
      inferredTechnologies: [...new Set(technologies)],
      likelyEntryPoints: [...repository.commonFiles.filter((file) => ["README.md", "README", "package.json", "pyproject.toml", "Cargo.toml", "go.mod"].includes(file)), ...packageEntry],
      validationCommands,
      unresolvedQuestions: repository.commonFiles.length ? ["Confirm the repository-specific validation command during planning."] : ["Which files define the main application and validation workflow?"],
    });
    const project = projects.create({ ...input, id: input.id ?? `project-${randomUUID()}`, repository_path: repository.canonicalPath, profile, current_phase: "ready", next_action: "Create a read-only planning run" });
    return reply.code(201).send({ project });
  });
  app.get("/api/projects/:projectId", async (request) => {
    const { projectId } = idParams.parse(request.params);
    const project = projects.get(projectId);
    if (!project) throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    const latestRun = runs.latestForProject(projectId);
    return { project, activeRun: latestRun ? runResponse(runs, latestRun.id) : null };
  });
  app.patch("/api/projects/:projectId", async (request) => {
    const { projectId } = idParams.parse(request.params);
    const input = updateProjectBody.parse(request.body);
    const repository_path = input.repository_path ? inspectRepositoryPath(input.repository_path).canonicalPath : undefined;
    const project = projects.update(projectId, { ...input, ...(repository_path ? { repository_path } : {}) });
    if (!project) throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    return { project };
  });
  app.delete("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = idParams.parse(request.params);
    if (!projects.delete(projectId)) throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    return reply.code(204).send();
  });
  app.post("/api/projects/:projectId/instructions", async (request, reply) => {
    const { projectId } = idParams.parse(request.params);
    const { instruction } = instructionBody.parse(request.body);
    try {
      const run = await planning.inspect(projectId, instruction);
      return reply.code(201).send(runResponse(runs, run.id));
    } catch (error) {
      if (error instanceof PlanningInspectionError) {
        const unavailable = error.cause instanceof ProviderUnavailableError;
        return reply.code(unavailable ? 503 : 502).send({
          error: { code: unavailable ? "provider_unavailable" : "provider_failure", message: error.message, runId: error.runId },
        });
      }
      throw error;
    }
  });
  app.get("/api/runs/:runId", async (request) => {
    const { runId } = runParams.parse(request.params);
    return runResponse(runs, runId);
  });
  app.post("/api/runs/:runId/modify", async (request) => {
    const { runId } = runParams.parse(request.params);
    const input = modifyBody.parse(request.body);
    await planning.modify(runId, input.currentRevision, input.modification);
    return runResponse(runs, runId);
  });
  app.post("/api/runs/:runId/proceed", async (request) => {
    const { runId } = runParams.parse(request.params);
    const { revision } = proceedBody.parse(request.body);
    planning.proceed(runId, revision);
    return runResponse(runs, runId);
  });
  app.post("/api/runs/:runId/execute", async (request) => {
    const { runId } = runParams.parse(request.params);
    z.object({}).strict().parse(request.body ?? {});
    await execution.execute(runId);
    return runResponse(runs, runId);
  });
  app.get("/api/runs/:runId/events", async (request) => {
    const { runId } = runParams.parse(request.params);
    return { events: runs.events(runId) };
  });
  app.get("/api/runs/:runId/events/stream", async (request, reply) => {
    const { runId } = runParams.parse(request.params);
    const query = streamQuery.parse(request.query);
    const serialize = (event: ReturnType<RunRepository["events"]>[number]) => `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const replay = runs.events(runId).map(serialize).join("");
    if (query.replayOnly === "true") return reply.header("content-type", "text/event-stream").header("cache-control", "no-cache").send(replay);
    reply.hijack(); reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" }); reply.raw.write(replay);
    const unsubscribe = runs.subscribe(runId, (event) => reply.raw.write(serialize(event)));
    request.raw.on("close", unsubscribe);
  });
  app.post("/api/runs/:runId/cancel", async (request) => {
    const { runId } = runParams.parse(request.params);
    planning.cancel(runId);
    return runResponse(runs, runId);
  });
  app.post("/api/runs/:runId/context", async (request) => {
    const { runId } = runParams.parse(request.params);
    const { currentRevision, ...packet } = contextBody.parse(request.body);
    await planning.addContext(runId, currentRevision, ContextPacketSchema.parse(packet));
    const response = runResponse(runs, runId);
    return { ...response, contextPacket: response.run.context_packet, currentProposal: response.run.proposal };
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: "validation_error", message: "Request validation failed.", issues: error.issues } });
    if (error instanceof InvalidRepositoryPathError) return reply.code(422).send({ error: { code: "filesystem_error", message: error.message } });
    if (error instanceof RepositoryIdentityError) return reply.code(409).send({ error: { code: "repository_identity_error", message: error.message } });
    if (error instanceof ExecutionFailedError) return reply.code(502).send({ error: { code: "execution_failure", message: error.message } });
    if (error instanceof ProjectNotFoundError || error instanceof RunNotFoundError) return reply.code(404).send({ error: { code: "not_found", message: error.message } });
    if (error instanceof ProjectAlreadyExistsError || error instanceof InvalidRunTransitionError || error instanceof StaleProposalRevisionError) return reply.code(409).send({ error: { code: "conflict", message: error.message } });
    if (error instanceof PlanningInspectionError) {
      const unavailable = error.cause instanceof ProviderUnavailableError;
      return reply.code(unavailable ? 503 : 502).send({ error: { code: unavailable ? "provider_unavailable" : "provider_failure", message: error.message, runId: error.runId } });
    }
    if (error instanceof ProviderNotRegisteredError || error instanceof ProviderUnavailableError) return reply.code(503).send({ error: { code: "provider_unavailable", message: error.message } });
    app.log.error(error);
    return reply.code(500).send({ error: { code: "internal_error", message: "An internal server error occurred." } });
  });
  return app;
}
