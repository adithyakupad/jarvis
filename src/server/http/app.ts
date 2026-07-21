import Fastify, { type FastifyInstance } from "fastify";
import { z, ZodError } from "zod";

import type { JarvisDatabase } from "../database/connection.js";
import { detectProviders } from "../providers/detection.js";
import { ProviderUnavailableError } from "../providers/codex-planning-adapter.js";
import { NodeProcessRunner, type ProcessRunner } from "../providers/process-runner.js";
import { ProviderNotRegisteredError, AgentAdapterRegistry } from "../providers/registry.js";
import { ProjectAlreadyExistsError, ProjectRepository } from "../repositories/projects.js";
import { InvalidRunTransitionError, RunNotFoundError, RunRepository, StaleProposalRevisionError } from "../repositories/runs.js";
import { PlanningInspectionError, PlanningService, ProjectNotFoundError } from "../services/planning.js";
import { ProviderIdSchema } from "../../shared/projects.js";

const idParams = z.object({ projectId: z.string().trim().min(1) });
const runParams = z.object({ runId: z.string().trim().min(1) });
const createProjectBody = z.object({
  id: z.string().trim().min(1), name: z.string().trim().min(1), objective: z.string().trim().min(1),
  repository_path: z.string().trim().min(1), provider: ProviderIdSchema,
});
const instructionBody = z.object({ instruction: z.string().trim().min(1) });
const modifyBody = z.object({ currentRevision: z.number().int().positive(), modification: z.string().trim().min(1) });
const proceedBody = z.object({ revision: z.number().int().positive() });

export interface ApiDependencies {
  database: JarvisDatabase;
  adapters: AgentAdapterRegistry;
  processRunner?: ProcessRunner;
}

function runResponse(runs: RunRepository, runId: string): object {
  return { run: runs.require(runId), revisions: runs.proposalRevisions(runId) };
}

export function buildApi({ database, adapters, processRunner = new NodeProcessRunner() }: ApiDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const projects = new ProjectRepository(database);
  const runs = new RunRepository(database);
  const planning = new PlanningService(projects, runs, adapters);

  app.get("/api/setup/providers", async () => ({ providers: await detectProviders(processRunner) }));
  app.get("/api/projects", async () => ({ projects: projects.list() }));
  app.post("/api/projects", async (request, reply) => {
    const input = createProjectBody.parse(request.body);
    return reply.code(201).send({ project: projects.create(input) });
  });
  app.get("/api/projects/:projectId", async (request) => {
    const { projectId } = idParams.parse(request.params);
    const project = projects.get(projectId);
    if (!project) throw new ProjectNotFoundError(`Project '${projectId}' was not found.`);
    const latestRun = runs.latestForProject(projectId);
    return { project, activeRun: latestRun ? runResponse(runs, latestRun.id) : null };
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
  app.post("/api/runs/:runId/cancel", async (request) => {
    const { runId } = runParams.parse(request.params);
    planning.cancel(runId);
    return runResponse(runs, runId);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: "validation_error", message: "Request validation failed.", issues: error.issues } });
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
