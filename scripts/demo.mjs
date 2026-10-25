import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { demoProject, initializeDemoSettings } from "./demo-settings.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const command = process.argv[2] ?? "up";
if (
  !["up", "down", "status", "logs"].includes(command) ||
  process.argv.length > 3
)
  throw new Error("Usage: node scripts/demo.mjs [up|down|status|logs]");
const { file, settings } = initializeDemoSettings(
  join(root, ".supastore-demo"),
);
const args = [
  "compose",
  "--env-file",
  file,
  "-p",
  settings.DEMO_PROJECT ?? demoProject,
  "-f",
  "scripts/compose.demo.yml",
];
let child;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    interrupted = true;
    child?.kill(signal);
  });
async function run(step) {
  if (interrupted)
    throw new Error(
      "Demo command interrupted; use the logs/status commands to inspect its state.",
    );
  await new Promise((resolve, reject) => {
    child = spawn("docker", [...args, ...step], {
      cwd: root,
      env: { ...process.env, ...settings },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Demo step failed (${code}). Inspect with: node scripts/demo.mjs logs`,
            ),
          ),
    );
  });
}
try {
  if (command === "up") {
    console.log(
      "Starting isolated synthetic demo. The root .env and configured store are not used.",
    );
    await run(["build", "backend", "storefront", "migrate", "demo-tools"]);
    await run(["up", "-d", "--wait", "postgres", "rustfs"]);
    await run(["run", "--rm", "migrate"]);
    await run([
      "run",
      "--rm",
      "demo-tools",
      "node",
      "scripts/demo-storage.mjs",
    ]);
    await run(["run", "--rm", "demo-tools"]);
    await run(["up", "-d", "--wait", "backend", "storefront"]);
    console.log(
      `\nDemo: http://localhost:${settings.DEMO_PORT}/en\nAdmin: http://localhost:${settings.DEMO_PORT}/admin\nSynthetic owner: owner@example.test / DemoStorePassword123!\nStop without deleting data: node scripts/demo.mjs down`,
    );
  } else
    await run([
      command === "status" ? "ps" : command,
      ...(command === "logs" ? ["--tail", "100"] : []),
    ]);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Demo startup failed.",
  );
  process.exitCode = 1;
}
