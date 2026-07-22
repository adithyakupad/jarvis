import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packageMetadata = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const revision = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
const environment = { ...process.env, JARVIS_APP_VERSION: packageMetadata.version, JARVIS_BUILD_ID: revision.status === 0 ? revision.stdout.trim() : "development" };
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

let activeBuild = null;
let acquiredInstance = null;
let releaseInstance = null;
const stopBuild = (signal) => {
  if (acquiredInstance && releaseInstance) releaseInstance(acquiredInstance);
  activeBuild?.kill(signal);
};
const onSigint = () => stopBuild("SIGINT");
const onSigterm = () => stopBuild("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);

async function build(script) {
  activeBuild = spawn(npmExecutable, ["run", script], { cwd: root, env: environment, stdio: "inherit", shell: false });
  const code = await new Promise((resolveCode) => activeBuild.once("exit", (exitCode) => resolveCode(exitCode ?? 1)));
  activeBuild = null;
  return code;
}

try {
  if (await build("build:server") !== 0) process.exitCode = 1;
  else {
    const integrity = await import("../dist/src/server/runtime-integrity.js");
    const runtime = await import("../dist/src/shared/runtime.js");
    releaseInstance = integrity.releaseInstance;
    const dataDirectory = resolve(process.env.JARVIS_DATA_DIR ?? resolve(root, "data"));
    const port = Number(process.env.JARVIS_PORT ?? 4173);
    acquiredInstance = await integrity.acquireInstance(dataDirectory, { port, appVersion: packageMetadata.version, apiSchemaVersion: runtime.API_SCHEMA_VERSION, buildId: environment.JARVIS_BUILD_ID });
    if (!acquiredInstance.owned) process.stdout.write(`JARVIS is already running at ${acquiredInstance.existingUrl}.\n`);
    else if (await build("build:client") !== 0) { releaseInstance(acquiredInstance); process.exitCode = 1; }
    else {
      process.env.JARVIS_APP_VERSION = environment.JARVIS_APP_VERSION;
      process.env.JARVIS_BUILD_ID = environment.JARVIS_BUILD_ID;
      const { startAlpha } = await import("../dist/src/server/alpha.js");
      await startAlpha({ rootDirectory: root, dataDirectory, port, acquiredInstance });
    }
  }
} catch (error) {
  if (acquiredInstance?.owned && releaseInstance) releaseInstance(acquiredInstance);
  process.stderr.write(`${error instanceof Error ? error.message : "JARVIS failed to start."}\n`);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", onSigint);
  process.removeListener("SIGTERM", onSigterm);
}
