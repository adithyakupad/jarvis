import { parseArgs } from "node:util";

import { openDatabase } from "./server/database/connection.js";
import { detectProviders } from "./server/providers/detection.js";
import { NodeProcessRunner } from "./server/providers/process-runner.js";
import {
  ProjectAlreadyExistsError,
  ProjectRepository,
} from "./server/repositories/projects.js";

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function takeDatabaseArgument(args: string[]): { databasePath: string; rest: string[] } {
  const index = args.indexOf("--database");
  if (index === -1) {
    return { databasePath: "data/jarvis.db", rest: args };
  }
  const databasePath = args[index + 1];
  if (databasePath === undefined) {
    throw new Error("--database requires a path.");
  }
  return {
    databasePath,
    rest: [...args.slice(0, index), ...args.slice(index + 2)],
  };
}

async function main(): Promise<void> {
  const { databasePath, rest } = takeDatabaseArgument(process.argv.slice(2));
  const [resource, action, ...commandArgs] = rest;

  if (resource === "provider" && action === "detect") {
    printJson(await detectProviders(new NodeProcessRunner()));
    return;
  }

  if (resource !== "project" || (action !== "create" && action !== "get")) {
    throw new Error(
      "Usage: jarvis [--database PATH] project <create|get> ... | provider detect",
    );
  }

  const database = openDatabase(databasePath);
  try {
    const projects = new ProjectRepository(database);
    if (action === "get") {
      const projectId = commandArgs[0];
      if (!projectId) {
        throw new Error("project get requires an ID.");
      }
      const project = projects.get(projectId);
      if (project === null) {
        throw new Error(`Project '${projectId}' was not found.`);
      }
      printJson(project);
      return;
    }

    const { values } = parseArgs({
      args: commandArgs,
      options: {
        id: { type: "string" },
        name: { type: "string" },
        objective: { type: "string" },
        "repository-path": { type: "string" },
        provider: { type: "string", default: "codex" },
        status: { type: "string", default: "active" },
        "current-phase": { type: "string", default: "" },
        "latest-result": { type: "string", default: "" },
        "current-blocker": { type: "string", default: "" },
        "next-action": { type: "string", default: "" },
      },
      strict: true,
    });
    const project = projects.create({
      id: values.id ?? "",
      name: values.name ?? "",
      objective: values.objective ?? "",
      repository_path: values["repository-path"] ?? "",
      provider: values.provider as "codex" | "claude-code",
      status: values.status as "active" | "blocked" | "paused" | "completed" | "archived",
      current_phase: values["current-phase"],
      latest_result: values["latest-result"],
      current_blocker: values["current-blocker"],
      next_action: values["next-action"],
    });
    printJson(project);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ProjectAlreadyExistsError || error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Unknown error.\n");
  }
  process.exitCode = 1;
});
