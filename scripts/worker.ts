import { queryClient } from "../apps/backend/src/infrastructure/db/index";
import { startQueueWorker } from "../apps/backend/src/infrastructure/queue/worker";
import { logFailure } from "../apps/backend/src/infrastructure/http/failure";

if (process.env.ENABLE_OUTBOX_WORKER === "false") {
  console.log("Background worker disabled by ENABLE_OUTBOX_WORKER=false.");
  await queryClient.end();
  // Stay idle under container supervision; exiting would cause a restart loop.
  const timer = setInterval(() => {}, 60000);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => clearInterval(timer));
} else {
  try {
    const worker = await startQueueWorker();
    console.log("Background queue worker ready.");
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 40000);
      deadline.unref();
      let clean = true;
      try {
        await worker.stop();
      } catch (error) {
        clean = false;
        logFailure(error, "worker.shutdown");
        process.exitCode = 1;
      }
      try {
        await queryClient.end({ timeout: 2 });
      } catch (error) {
        clean = false;
        logFailure(error, "worker.database.shutdown");
        process.exitCode = 1;
      }
      if (clean) clearTimeout(deadline);
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  } catch (error) {
    logFailure(error, "worker.startup");
    await queryClient.end({ timeout: 2 });
    process.exitCode = 1;
  }
}
