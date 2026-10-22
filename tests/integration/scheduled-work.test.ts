import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db, queryClient } from "@/infrastructure/db";
import * as schema from "@/infrastructure/db/schema";
import {
  queueProducer,
  closeQueueProducer,
  enqueueWork,
} from "@/infrastructure/queue/client";
import { startQueueWorker } from "@/infrastructure/queue/worker";
import { provisionRuntimeRole } from "../../scripts/runtime-role.mjs";
import {
  scheduleAction,
  schedulePickupReminder,
  runPickupReminder,
  cancelPickupReminder,
  reconcilePickupReminders,
} from "@/application/scheduling/scheduled-actions";
import { expireUpload } from "@/application/scheduling/expire-upload";
import { processOutboxBatch } from "@/infrastructure/worker/outbox";
import { persistNotificationEvent } from "@/application/notifications/notification-inbox";
import { queueWorkerHealth } from "@/infrastructure/queue/health";

const storage = vi.hoisted(() => ({
  deleteCatalogAsset: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock("@/infrastructure/storage", () => storage);
const enabled = Boolean(process.env.DATABASE_URL?.includes("supastore_test"));

describe.skipIf(!enabled)("durable scheduled work", () => {
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await queryClient.unsafe(
      "TRUNCATE pgboss.job, scheduled_actions, worker_heartbeats",
    );
  }, 30000);
  afterAll(async () => {
    await closeQueueProducer();
    await queryClient.end();
  });

  it("commits job and action together and rolls both back on failure", async () => {
    const id = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await scheduleAction(tx, {
          key: id,
          kind: "catalog-upload",
          entityId: id,
          scheduledFor: new Date(Date.now() + 3600000),
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      await db
        .select()
        .from(schema.scheduledActions)
        .where(eq(schema.scheduledActions.key, id)),
    ).toHaveLength(0);
    expect(
      await queryClient`select id from pgboss.job where data->>'key'=${id}`,
    ).toHaveLength(0);
  });

  it("starts a producer while a transaction holds the only application connection", async () => {
    await closeQueueProducer();
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const id = randomUUID();
      await drizzle(client, { schema }).transaction((tx) =>
        scheduleAction(tx, {
          key: id,
          kind: "catalog-upload",
          entityId: id,
          scheduledFor: new Date(Date.now() + 3600000),
        }),
      );
      expect(
        await queryClient`select id from pgboss.job where data->>'key'=${id}`,
      ).toHaveLength(1);
    } finally {
      await client.end({ timeout: 1 });
    }
  }, 5000);

  it("does not claim future jobs, and allows only one claim across consumers", async () => {
    const boss = await queueProducer();
    const id = randomUUID();
    await db.transaction((tx) =>
      enqueueWork(
        tx,
        "pickup-reminder",
        { key: id, jobId: id },
        { id, startAfter: new Date(Date.now() + 3600000) },
      ),
    );
    expect(
      (await boss.fetch("pickup-reminder")).some((job) => job.id === id),
    ).toBe(false);
    await queryClient`update pgboss.job set start_after=now()-interval '1 second' where id=${id}`;
    const claims = await Promise.all([
      boss.fetch("pickup-reminder"),
      boss.fetch("pickup-reminder"),
    ]);
    expect(claims.flat().filter((job) => job.id === id)).toHaveLength(1);
    await boss.complete("pickup-reminder", id);
  });

  it("rescheduling cancels the prior queue job and ignores its stale payload", async () => {
    const id = randomUUID();
    const schedule = (time: Date) =>
      db.transaction((tx) =>
        scheduleAction(tx, {
          key: id,
          kind: "catalog-upload",
          entityId: id,
          scheduledFor: time,
        }),
      );
    await schedule(new Date(Date.now() + 3600000));
    const [old] = await db
      .select()
      .from(schema.scheduledActions)
      .where(eq(schema.scheduledActions.key, id));
    await schedule(new Date(Date.now() + 7200000));
    const [current] = await db
      .select()
      .from(schema.scheduledActions)
      .where(eq(schema.scheduledActions.key, id));
    expect(current!.jobId).not.toBe(old!.jobId);
    expect(
      (
        await queryClient`select state from pgboss.job where id=${old!.jobId}`
      )[0]!.state,
    ).toBe("cancelled");
    await expireUpload({ key: id, jobId: old!.jobId });
    expect(storage.deleteCatalogAsset).not.toHaveBeenCalled();
  });

  it("retries storage failures and never deletes attached catalog media", async () => {
    const id = randomUUID();
    await db.insert(schema.catalogMediaUploads).values({
      id,
      entityId: randomUUID(),
      entityType: "product",
      actorId: "test",
      s3Key: `catalog/${id}`,
      expiresAt: new Date(Date.now() - 1000),
    });
    await db.transaction((tx) =>
      scheduleAction(tx, {
        key: id,
        kind: "catalog-upload",
        entityId: id,
        scheduledFor: new Date(Date.now() - 1000),
      }),
    );
    const [action] = await db
      .select()
      .from(schema.scheduledActions)
      .where(eq(schema.scheduledActions.key, id));
    const data = { key: id, jobId: action!.jobId };
    storage.deleteCatalogAsset.mockRejectedValueOnce(new Error("offline"));
    await expect(expireUpload(data)).rejects.toThrow("offline");
    expect(
      (
        await db
          .select()
          .from(schema.scheduledActions)
          .where(eq(schema.scheduledActions.key, id))
      )[0]!.status,
    ).toBe("pending");
    await expireUpload(data);
    expect(
      (
        await db
          .select()
          .from(schema.catalogMediaUploads)
          .where(eq(schema.catalogMediaUploads.id, id))
      )[0]!.status,
    ).toBe("deleted");
    storage.deleteCatalogAsset.mockClear();
    await db
      .update(schema.catalogMediaUploads)
      .set({ status: "attached" })
      .where(eq(schema.catalogMediaUploads.id, id));
    await expireUpload(data);
    expect(storage.deleteCatalogAsset).not.toHaveBeenCalled();
  });

  async function booking() {
    const [cart] = await db
      .insert(schema.carts)
      .values({ guestSessionId: randomUUID() })
      .returning();
    const [quote] = await db
      .insert(schema.quotes)
      .values({
        cartId: cart!.id,
        cartRevision: 1,
        merchandiseSubtotalCents: 0,
        shippingCents: 0,
        exclusiveTaxCents: 0,
        inclusiveTaxCents: 0,
        totalPayableCents: 0,
        itemsSnapshot: [],
        shippingSnapshot: {},
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();
    const [location] = await db
      .insert(schema.pickupLocation)
      .values({ name: "Test", address: "Test street", weeklySchedule: {} })
      .returning();
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const [pickup] = await db
      .insert(schema.pickupTimeSlots)
      .values({
        locationId: location!.id,
        date,
        startTime: "15:00",
        endTime: "16:00",
      })
      .returning();
    const [slot] = await db
      .insert(schema.fulfillmentSlots)
      .values({
        pickupSlotId: pickup!.id,
        date,
        startTime: "15:00",
        endTime: "16:00",
        timezone: "UTC",
      })
      .returning();
    const [order] = await db
      .insert(schema.orders)
      .values({
        sourceCartId: cart!.id,
        quoteId: quote!.id,
        referenceCode: randomUUID(),
        purchaseTotalCents: 0,
        guestEmail: "pickup@example.test",
        guestName: "Pickup",
        lifecycleStatus: "confirmed",
        fulfillmentType: "pickup",
        shippingAddressSnapshot: {},
        termsSnapshot: {
          pickup: {
            date,
            startTime: "15:00",
            endTime: "16:00",
            address: location!.address,
          },
        },
      })
      .returning();
    await db.insert(schema.orderFulfillments).values({
      orderId: order!.id,
      fulfillmentSlotId: slot!.id,
      pickupSlotId: pickup!.id,
    });
    return order!;
  }

  it("keeps future reminders outside ordered deliveries and emits once when due", async () => {
    const order = await booking();
    await db.transaction((tx) => schedulePickupReminder(tx, order.id));
    const [action] = await db
      .select()
      .from(schema.scheduledActions)
      .where(eq(schema.scheduledActions.key, `pickup:${order.id}`));
    expect(action!.status).toBe("pending");
    expect(
      await db
        .select()
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.aggregateId, order.id)),
    ).toHaveLength(0);
    await db
      .update(schema.scheduledActions)
      .set({ scheduledFor: new Date(Date.now() - 1000) })
      .where(eq(schema.scheduledActions.key, action!.key));
    await runPickupReminder({ key: action!.key, jobId: action!.jobId });
    await runPickupReminder({ key: action!.key, jobId: action!.jobId });
    const events = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, order.id));
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("fulfillment.pickup_reminder");
    const [delivery] = await db
      .select()
      .from(schema.eventDeliveries)
      .where(eq(schema.eventDeliveries.eventId, events[0]!.id));
    expect(delivery!.expiresAt).toEqual(action!.expiresAt);
    // Changes after materialization must also suppress the delivery before transport submission.
    await db
      .update(schema.orders)
      .set({ lifecycleStatus: "cancelled" })
      .where(eq(schema.orders.id, order.id));
    const send = vi
      .fn()
      .mockResolvedValue({ status: "accepted", providerMessageId: "fixture" });
    await processOutboxBatch({
      providers: {
        email: {
          identity: { provider: "fixture", profile: "test" },
          capabilities: { deliveryTracking: false },
          send,
        },
      },
    });
    expect(send).not.toHaveBeenCalled();
    expect(
      (
        await db
          .select()
          .from(schema.eventDeliveries)
          .where(eq(schema.eventDeliveries.id, delivery!.id))
      )[0]!.status,
    ).toBe("suppressed");
  });

  it("cancels scheduled reminders and suppresses expired reminders after downtime", async () => {
    const order = await booking();
    await db.transaction((tx) => schedulePickupReminder(tx, order.id));
    const key = `pickup:${order.id}`;
    const [action] = await db
      .select()
      .from(schema.scheduledActions)
      .where(eq(schema.scheduledActions.key, key));
    await db.transaction((tx) => cancelPickupReminder(tx, order.id));
    await runPickupReminder({ key, jobId: action!.jobId });
    expect(
      await db
        .select()
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.aggregateId, order.id)),
    ).toHaveLength(0);
    await db.transaction((tx) => schedulePickupReminder(tx, order.id));
    const [latest] = await db
      .select()
      .from(schema.scheduledActions)
      .where(eq(schema.scheduledActions.key, key));
    await db
      .update(schema.scheduledActions)
      .set({ scheduledFor: new Date(0), expiresAt: new Date(1) })
      .where(eq(schema.scheduledActions.key, key));
    await runPickupReminder({ key, jobId: latest!.jobId });
    expect(
      (
        await db
          .select()
          .from(schema.scheduledActions)
          .where(eq(schema.scheduledActions.key, key))
      )[0]!.status,
    ).toBe("cancelled");
  });

  it("backfills existing pickup bookings without duplicating schedules", async () => {
    const order = await booking();
    await reconcilePickupReminders();
    const key = `pickup:${order.id}`;
    const [action] = await db
      .select()
      .from(schema.scheduledActions)
      .where(eq(schema.scheduledActions.key, key));
    await reconcilePickupReminders();
    expect(
      (
        await db
          .select()
          .from(schema.scheduledActions)
          .where(eq(schema.scheduledActions.key, key))
      )[0]!.jobId,
    ).toBe(action!.jobId);
  });

  it("rejects an old reminder even if the booking returns to the original slot", async () => {
    const order = await booking();
    await db.transaction((tx) => schedulePickupReminder(tx, order.id));
    const key = `pickup:${order.id}`;
    const [action] = await db
      .select()
      .from(schema.scheduledActions)
      .where(eq(schema.scheduledActions.key, key));
    await db
      .update(schema.scheduledActions)
      .set({ scheduledFor: new Date(0) })
      .where(eq(schema.scheduledActions.key, key));
    await runPickupReminder({ key, jobId: action!.jobId });
    // The slot has returned to A, but the intervening reschedule replaced its generation.
    await db
      .update(schema.scheduledActions)
      .set({ jobId: randomUUID(), status: "pending" })
      .where(eq(schema.scheduledActions.key, key));
    const send = vi.fn();
    await processOutboxBatch({
      providers: {
        email: {
          identity: { provider: "fixture", profile: "test" },
          capabilities: { deliveryTracking: false },
          send,
        },
      },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("runs and drains a standalone worker using a DML-only database role", async () => {
    const eventId = randomUUID(),
      deliveryId = randomUUID();
    await db.insert(schema.outboxEvents).values({
      id: eventId,
      eventType: "order.confirmed",
      aggregateType: "order",
      aggregateId: randomUUID(),
      payload: {},
    });
    await db.insert(schema.eventDeliveries).values({
      id: deliveryId,
      eventId,
      recipient: "receipt@example.test",
      providerName: "fixture",
      providerProfile: "test",
      providerMessageId: deliveryId,
      status: "awaiting",
    });
    const occurredAt = new Date();
    await persistNotificationEvent({
      provider: "fixture",
      profile: "test",
      eventId: randomUUID(),
      providerMessageId: deliveryId,
      occurredAt,
      state: "delivered",
      code: "delivered",
    });
    const user = `queue_test_${randomUUID().replaceAll("-", "")}`;
    await provisionRuntimeRole(queryClient, {
      user,
      password: "queue-test-only",
    });
    const url = new URL(process.env.DATABASE_URL!);
    url.username = user;
    url.password = "queue-test-only";
    vi.stubEnv("DATABASE_URL", url.toString());
    vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "true");
    let worker: Awaited<ReturnType<typeof startQueueWorker>> | undefined;
    try {
      worker = await startQueueWorker();
      expect(await db.select().from(schema.workerHeartbeats)).not.toHaveLength(
        0,
      );
      const boss = await queueProducer();
      const jobId = await boss.send("maintenance", { task: "reminders" });
      let state = "";
      for (let attempt = 0; attempt < 100 && state !== "completed"; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        state = String(
          (await queryClient`select state from pgboss.job where id=${jobId}`)[0]
            ?.state,
        );
      }
      expect(state).toBe("completed");
      const health = await queueWorkerHealth();
      expect(health.enabled).toBe(true);
      let delivery = (
        await db
          .select()
          .from(schema.eventDeliveries)
          .where(eq(schema.eventDeliveries.id, deliveryId))
      )[0]!;
      for (
        let attempt = 0;
        attempt < 100 && delivery.status !== "delivered";
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        delivery = (
          await db
            .select()
            .from(schema.eventDeliveries)
            .where(eq(schema.eventDeliveries.id, deliveryId))
        )[0]!;
      }
      expect(delivery.status).toBe("delivered");
      expect(delivery.deliveredAt).toEqual(occurredAt);
    } finally {
      await worker?.stop();
      vi.unstubAllEnvs();
    }
    expect(await db.select().from(schema.workerHeartbeats)).toHaveLength(0);
    await queryClient.unsafe(`DROP OWNED BY "${user}"`);
    await queryClient.unsafe(`DROP ROLE "${user}"`);
  });

  it("starts the packaged worker entry point independently of Next.js", async () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/worker.ts"],
      {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ENABLE_OUTBOX_WORKER: "true",
          DISABLE_OUTBOUND_DELIVERY: "true",
        },
      },
    );
    let output = "";
    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Worker startup timed out: ${output}`)),
          10000,
        );
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(new Error(`Worker exited with ${code}: ${output}`));
        });
        child.stdout.on("data", (chunk) => {
          output += String(chunk);
          if (output.includes("Background queue worker ready.")) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.stderr.on("data", (chunk) => {
          output += String(chunk);
        });
      });
    } finally {
      child.kill("SIGTERM");
      await exited;
      // Windows terminates the child rather than delivering POSIX signals; remove its test-only heartbeat.
      await queryClient.unsafe("DELETE FROM worker_heartbeats");
    }
  });
});
