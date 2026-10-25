import { desc, gt, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { workerHeartbeats } from "@/infrastructure/db/schema";

export async function queueWorkerHealth() {
  const workers = await db
    .select()
    .from(workerHeartbeats)
    .where(gt(workerHeartbeats.lastSeenAt, new Date(Date.now() - 60000)))
    .orderBy(desc(workerHeartbeats.lastSeenAt));
  const [queue] =
    await db.execute(sql`SELECT count(*) FILTER (WHERE state='failed')::int AS failed,
    count(*) FILTER (WHERE state IN ('created','retry') AND start_after <= now())::int AS ready,
    coalesce(extract(epoch FROM now()-min(start_after) FILTER (WHERE state IN ('created','retry') AND start_after <= now())),0)::float8 AS oldest_due_seconds
    FROM pgboss.job WHERE state IN ('created','retry','failed') AND name IN ('notifications','pickup-reminder','upload-expiration','maintenance','payments','sales-threshold')`);
  const degraded =
    Number(queue?.failed) > 0 ||
    Number(queue?.oldest_due_seconds) > 60 ||
    workers.some((worker) =>
      Object.values(
        worker.jobs as Record<string, { consecutiveFailures?: number }>,
      ).some((job) => Number(job.consecutiveFailures) > 0),
    );
  return {
    status: !workers.length ? "stalled" : degraded ? "degraded" : "ok",
    enabled: workers.length > 0,
    workers: workers.map((worker) => ({
      id: worker.id,
      lastSeenAt: worker.lastSeenAt,
      jobs: worker.jobs,
    })),
    ready: Number(queue?.ready ?? 0),
    failed: Number(queue?.failed ?? 0),
    oldestDueSeconds: Math.max(0, Number(queue?.oldest_due_seconds ?? 0)),
  };
}
