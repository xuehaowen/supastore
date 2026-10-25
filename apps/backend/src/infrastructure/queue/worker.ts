import { randomUUID } from "node:crypto";
import { PgBoss } from "pg-boss";
import { and, eq, lt, sql } from "drizzle-orm";
import { db, queryClient } from "@/infrastructure/db";
import { workerHeartbeats } from "@/infrastructure/db/schema";
import { processOutboxBatch } from "@/infrastructure/worker/outbox";
import { processSmsBatch } from "@/infrastructure/worker/sms";
import { processNotificationInboxBatch } from "@/application/notifications/notification-inbox";
import {
  getNotificationProviders,
  closeNotificationProviders,
} from "@/infrastructure/bootstrap/notification-providers";
import {
  runPickupReminder,
  reconcilePickupReminders,
} from "@/application/scheduling/scheduled-actions";
import { expireUpload } from "@/application/scheduling/expire-upload";
import { cleanupUploads } from "@/application/use-cases/uploads/cleanup-uploads";
import { cleanupCatalogMedia } from "@/application/use-cases/catalog/cleanup-catalog-media";
import { runDailyHousekeeping } from "@/infrastructure/worker/housekeeping";
import { reconcileStripeInbox } from "@/application/use-cases/payments/stripe-checkout";
import { checkSalesThreshold } from "@/application/use-cases/reports/sales-report";
import { logFailure, safeFailureCode } from "@/infrastructure/http/failure";
import { closeQueueProducer } from "./client";

export async function startQueueWorker() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required for the queue worker.");
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    migrate: false,
    createSchema: false,
    reindex: false,
    useListenNotify: true,
    application_name: "supastore-worker",
    connectionTimeoutMillis: 10000,
  });
  boss.on("error", (error) => logFailure(error, "queue.worker"));
  boss.on("warning", () =>
    logFailure(
      Object.assign(new Error("Queue warning"), { code: "QUEUE_WARNING" }),
      "queue.warning",
    ),
  );
  const id = randomUUID();
  let stopping = false;
  const progress: Record<
    string,
    {
      lastSuccessAt?: string;
      failureCode?: string;
      consecutiveFailures: number;
    }
  > = {};
  async function heartbeat() {
    await db
      .insert(workerHeartbeats)
      .values({ id, lastSeenAt: new Date(), jobs: progress })
      .onConflictDoUpdate({
        target: workerHeartbeats.id,
        set: { lastSeenAt: new Date(), jobs: progress },
      });
  }
  async function execute(name: string, run: () => Promise<unknown>) {
    try {
      const result = await run();
      if (
        result &&
        typeof result === "object" &&
        "failed" in result &&
        ["failed", "deferred", "reviewRequired"].some(
          (key) => Number((result as Record<string, unknown>)[key]) > 0,
        )
      )
        throw Object.assign(new Error("Batch requires recovery."), {
          code: "BATCH_INCOMPLETE",
        });
      progress[name] = {
        lastSuccessAt: new Date().toISOString(),
        consecutiveFailures: 0,
      };
    } catch (error) {
      const code = safeFailureCode(error);
      progress[name] = {
        ...progress[name],
        failureCode: code,
        consecutiveFailures: (progress[name]?.consecutiveFailures ?? 0) + 1,
      };
      logFailure(error, "worker.job", { job: name });
      // pg-boss persists thrown errors. Keep SQL, provider responses, and credentials out of job output.
      throw Object.assign(new Error(`Background operation failed (${code}).`), {
        code,
      });
    } finally {
      await heartbeat();
    }
  }
  async function wakeNotifications() {
    if (stopping) return;
    for (const channel of ["email", "sms"] as const)
      await boss.upsert(
        "notifications",
        { channel },
        {
          singletonKey: channel,
          startAfter: new Date(),
          group: { id: channel },
        },
      );
  }
  let subscription: Awaited<ReturnType<typeof queryClient.listen>> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await boss.start();
    await boss.work<{ channel?: "email" | "sms" }>(
      "notifications",
      {
        pollingIntervalSeconds: 5,
        notifyPollingIntervalSeconds: 5,
        localConcurrency: 2,
        groupConcurrency: 1,
      },
      async (jobs) => {
        for (const job of jobs)
          await execute(
            `notifications.${job.data.channel ?? "reconcile"}`,
            async () => {
              await processNotificationInboxBatch();
              if (!job.data.channel) {
                await wakeNotifications();
                return;
              }
              if (process.env.DISABLE_OUTBOUND_DELIVERY === "true") return;
              const channel = job.data.channel;
              const providers = getNotificationProviders();
              await (channel === "email"
                ? processOutboxBatch({ providers })
                : processSmsBatch({ providers }));
              await processNotificationInboxBatch();
              if (!providers[channel]) return;
              // Wake again at the next runnable attempt. Order-blocked messages must not spin.
              const [next] =
                await db.execute(sql`SELECT min(d.retry_after) AS due FROM event_deliveries d JOIN outbox_events e ON e.id=d.event_id
          WHERE d.channel=${channel} AND d.status IN ('pending','retrying')
          AND NOT EXISTS(SELECT 1 FROM event_deliveries older JOIN outbox_events old_event ON old_event.id=older.event_id
            WHERE old_event.aggregate_id=e.aggregate_id AND old_event.aggregate_type=e.aggregate_type
            AND older.recipient=d.recipient AND older.channel=d.channel AND old_event.sequence<e.sequence
            AND older.status IN ('pending','retrying','dispatching','review'))`);
              if (next?.due)
                await boss.upsert(
                  "notifications",
                  { channel },
                  {
                    singletonKey: channel,
                    startAfter: new Date(
                      Math.max(
                        Date.now() + 1000,
                        new Date(String(next.due)).getTime(),
                      ),
                    ),
                    group: { id: channel },
                  },
                );
            },
          );
      },
    );
    await boss.work<{ key: string; jobId: string }>(
      "pickup-reminder",
      {
        pollingIntervalSeconds: 5,
        notifyPollingIntervalSeconds: 5,
        localConcurrency: 2,
      },
      async (jobs) => {
        for (const job of jobs)
          await execute("pickup-reminder", () => runPickupReminder(job.data));
      },
    );
    await boss.work<{ key: string; jobId: string }>(
      "upload-expiration",
      {
        pollingIntervalSeconds: 5,
        notifyPollingIntervalSeconds: 5,
        localConcurrency: 2,
      },
      async (jobs) => {
        for (const job of jobs)
          await execute("upload-expiration", () => expireUpload(job.data));
      },
    );
    await boss.work<{ task: string }>("maintenance", async (jobs) => {
      for (const job of jobs)
        await execute(`maintenance.${job.data.task}`, async () => {
          if (job.data.task === "housekeeping") return runDailyHousekeeping();
          if (job.data.task === "reminders") return reconcilePickupReminders();
          await cleanupUploads();
          await cleanupCatalogMedia();
          await db
            .delete(workerHeartbeats)
            .where(
              and(
                lt(
                  workerHeartbeats.lastSeenAt,
                  new Date(Date.now() - 86400000),
                ),
              ),
            );
        });
    });
    await boss.work("payments", async () => {
      if (process.env.STRIPE_SECRET_KEY)
        await execute("payments", reconcileStripeInbox);
    });
    await boss.work("sales-threshold", async () =>
      execute("sales-threshold", checkSalesThreshold),
    );
    await boss.schedule("notifications", "* * * * *", {}, { key: "reconcile" });
    await boss.schedule(
      "maintenance",
      "*/5 * * * *",
      { task: "uploads" },
      { key: "uploads" },
    );
    await boss.schedule(
      "maintenance",
      "0 * * * *",
      { task: "housekeeping" },
      { key: "housekeeping" },
    );
    await boss.schedule(
      "maintenance",
      "*/5 * * * *",
      { task: "reminders" },
      { key: "reminders" },
    );
    await boss.schedule("payments", "* * * * *");
    await boss.schedule("sales-threshold", "0 * * * *");
    subscription = await queryClient.listen(
      "supastore_background",
      () => {
        void wakeNotifications().catch((error) =>
          logFailure(error, "queue.wakeup"),
        );
      },
      () => {
        void wakeNotifications().catch((error) =>
          logFailure(error, "queue.reconnect"),
        );
      },
    );
    await heartbeat();
    await boss.send(
      "maintenance",
      { task: "reminders" },
      { singletonKey: "startup-reminders", singletonSeconds: 60 },
    );
    await wakeNotifications();
    timer = setInterval(() => {
      void heartbeat().catch((error) => logFailure(error, "queue.heartbeat"));
    }, 15000);
    return {
      async stop() {
        stopping = true;
        if (timer) clearInterval(timer);
        const results: PromiseSettledResult<unknown>[] = [];
        results.push(...(await Promise.allSettled([subscription?.unlisten()])));
        results.push(
          ...(await Promise.allSettled([
            boss.stop({ graceful: true, timeout: 35000 }),
          ])),
        );
        results.push(
          ...(await Promise.allSettled([
            closeNotificationProviders(),
            closeQueueProducer(),
            db.delete(workerHeartbeats).where(eq(workerHeartbeats.id, id)),
          ])),
        );
        const failures = results.filter(
          (result) => result.status === "rejected",
        );
        if (failures.length)
          throw new AggregateError(
            failures.map((result) => result.reason),
            "Worker cleanup incomplete.",
          );
      },
    };
  } catch (error) {
    stopping = true;
    if (timer) clearInterval(timer);
    await Promise.allSettled([
      subscription?.unlisten(),
      boss.stop({ graceful: false }),
      closeNotificationProviders(),
      closeQueueProducer(),
    ]);
    throw error;
  }
}
