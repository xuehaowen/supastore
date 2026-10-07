import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const compose = ["compose", "-p", "supastore-codex-smoke", "-f", "scripts/compose.smoke.yml"];
let activeChild;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  interrupted = true;
  activeChild?.kill();
});
async function run(binary, args, input, cleanup = false) {
  if (interrupted && !cleanup) throw new Error("Acceptance interrupted");
  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: [input ? "pipe" : "ignore", "inherit", "inherit"], windowsHide: true });
    activeChild = child;
    child.on("error", reject);
    if (input) child.stdin.end(input);
    child.on("exit", code => {
      activeChild = undefined;
      code === 0 ? resolve() : reject(new Error(`${binary} acceptance step failed (${code})`));
    });
  });
}
try {
  // Fixed project cleanup prevents stale fixture data and never targets developer volumes.
  await run("docker", [...compose, "down", "--volumes"]);
  if (process.env.CONTAINER_SKIP_BUILD !== "true")
    await run("docker", ["compose", "build", "backend", "storefront", "migrate"]);
  await run("docker", [...compose, "up", "-d", "--wait", "postgres"]);
  await run("docker", [...compose, "run", "--rm", "migrate"]);
  await run("docker", [...compose, "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "supastore_smoke", "-v", "ON_ERROR_STOP=1"], readFileSync("scripts/seed-container-smoke.sql", "utf8"));
  await run("docker", [...compose, "up", "-d", "--wait", "backend", "storefront"]);
  for (const script of ["test-container-smoke.mjs", "test-container-upgrade.mjs", "test-container-recovery.mjs", "test-store-load.mjs"])
    await run(process.execPath, [`scripts/${script}`]);
  if (interrupted) throw new Error("Acceptance interrupted");
} finally { await run("docker", [...compose, "down", "--volumes"], undefined, true); }
