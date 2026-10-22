import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function startWorker(command = "dev") {
  return spawn(process.execPath, ["--import", "tsx", "scripts/worker.ts"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ...(command === "start" ? { NODE_ENV: "production" } : {}),
      SERVICE_ROLE: "worker",
    },
  });
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const child = startWorker(process.argv[2]);
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
}
