import { queueWorkerHealth } from "../apps/backend/src/infrastructure/queue/health";
import { queryClient } from "../apps/backend/src/infrastructure/db";

try {
  if (process.env.ENABLE_OUTBOX_WORKER !== "false") {
    const health = await queueWorkerHealth();
    process.exitCode = health.status === "ok" ? 0 : 1;
  }
} catch {
  process.exitCode = 1;
} finally {
  await queryClient.end({ timeout: 1 });
}
