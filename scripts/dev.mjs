import { startBackend } from "./backend.mjs";
import { startStorefront } from "./storefront.mjs";
import { startWorker } from "./worker.mjs";
const command = process.argv[2] || "dev";
if (!["dev", "start"].includes(command))
  throw new Error("Expected dev or start");
const children = [startBackend(command), startStorefront(command)];
if (process.env.ENABLE_OUTBOX_WORKER === "true")
  children.push(startWorker(command));
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
}
for (const child of children) {
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  child.once("exit", (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
