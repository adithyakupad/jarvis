import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const dataDirectory = resolve(process.env.JARVIS_DATA_DIR ?? "data");
const environment = { ...process.env, JARVIS_DATABASE_PATH: process.env.JARVIS_DATABASE_PATH ?? resolve(dataDirectory, "jarvis.db") };
const children = [
  spawn(process.execPath, [resolve(root, "dist/src/server/http/start.js")], { cwd: root, env: environment, stdio: "inherit" }),
  spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", process.env.JARVIS_WEB_PORT ?? "4173"], { cwd: root, env: environment, stdio: "inherit" }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = exitCode;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
for (const child of children) child.once("exit", (code) => { if (!stopping) stop(code ?? 1); });
