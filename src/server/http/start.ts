import { openDatabase } from "../database/connection.js";
import { CodexPlanningAdapter } from "../providers/codex-planning-adapter.js";
import { ClaudeCodeAdapter } from "../providers/claude-code-adapter.js";
import { AgentAdapterRegistry } from "../providers/registry.js";
import { buildApi } from "./app.js";

const database = openDatabase(process.env.JARVIS_DATABASE_PATH ?? "data/jarvis.db");
const app = buildApi({ database, adapters: new AgentAdapterRegistry([new CodexPlanningAdapter(), new ClaudeCodeAdapter()]) });

const close = async (): Promise<void> => { await app.close(); database.close(); };
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

app.listen({ host: "127.0.0.1", port: Number(process.env.JARVIS_API_PORT ?? 3000) })
  .then((address) => process.stdout.write(`JARVIS API listening at ${address}\n`))
  .catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Server failed to start."}\n`); process.exitCode = 1; database.close(); });
