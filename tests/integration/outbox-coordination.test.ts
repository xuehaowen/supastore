import { beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, queryClient } from "@/infrastructure/db";
import {
  outboxEvents,
  eventDeliveries,
  notificationAttempts,
  notificationAttemptResults,
} from "@/infrastructure/db/schema";
import { processOutboxBatch } from "@/infrastructure/worker/outbox";
import {
  persistNotificationEvent,
  persistUnmatchedNotificationEvent,
  processNotificationInboxBatch,
} from "@/application/notifications/notification-inbox";
import type { EmailSender } from "@/application/ports/notifications";
const enabled = !!process.env.DATABASE_URL?.includes("supastore");
const acceptedSender = (
  send?: EmailSender["send"],
  tracking = false,
): EmailSender => ({
  identity: { provider: "fixture", profile: "email-v1" },
  capabilities: { deliveryTracking: tracking },
  send:
    send ??
    (async (message) => ({
      status: "accepted",
      providerMessageId: `message-${message.deliveryId}`,
    })),
});
async function seeded(recipient = "delivery@example.test") {
  const eventId = randomUUID(),
    id = randomUUID();
  await db.insert(outboxEvents).values({
    id: eventId,
    eventType: "order.confirmed",
    aggregateType: "order",
    aggregateId: randomUUID(),
    payload: { referenceCode: "FIXTURE" },
  });
  await db.insert(eventDeliveries).values({ id, eventId, recipient });
  return id;
}
async function clear() {
  await queryClient.unsafe("TRUNCATE outbox_events,event_deliveries CASCADE");
}
describe.skipIf(!enabled)("durable notification leases and callbacks", () => {
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await clear();
  });
  it("coordinates concurrent replicas without duplicate submissions and retains acceptance separately", async () => {
    await clear();
    for (let index = 0; index < 6; index++)
      await seeded(`user${index}@example.test`);
    const sent: string[] = [];
    const sender = acceptedSender(async (message) => {
      sent.push(message.deliveryId);
      return {
        status: "accepted",
        providerMessageId: `message-${message.deliveryId}`,
      };
    });
    const results = await Promise.all([
      processOutboxBatch({ providers: { email: sender }, batchSize: 5 }),
      processOutboxBatch({ providers: { email: sender }, batchSize: 5 }),
    ]);
    expect(results[0] + results[1]).toBe(6);
    expect(new Set(sent).size).toBe(6);
    expect(
      (await db.select().from(eventDeliveries)).every(
        (row) => row.status === "accepted",
      ),
    ).toBe(true);
  });
  it("recovers a pre-dispatch legacy pending lease without inventing a successful delivery", async () => {
    await clear();
    const id = await seeded();
    await db
      .update(eventDeliveries)
      .set({ leaseToken: "dead", leaseExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(eventDeliveries.id, id));
    expect(
      await processOutboxBatch({ providers: { email: acceptedSender() } }),
    ).toBe(1);
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0]!.status,
    ).toBe("accepted");
  });
  it("starts each send lease immediately before IO rather than preclaiming waiting batch rows", async () => {
    await clear();
    const first = await seeded("first@example.test"),
      second = await seeded("second@example.test");
    const submitted: string[] = [];
    const sender = acceptedSender(async (message) => {
      if (!submitted.length) {
        const [waiting] = await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, second));
        expect(message.deliveryId).toBe(first);
        expect(waiting!.status).toBe("pending");
        expect(waiting!.leaseToken).toBeNull();
        expect(
          await db
            .select()
            .from(notificationAttempts)
            .where(eq(notificationAttempts.deliveryId, second)),
        ).toHaveLength(0);
      }
      submitted.push(message.deliveryId);
      return {
        status: "accepted",
        providerMessageId: `message-${message.deliveryId}`,
      };
    });
    expect(
      await processOutboxBatch({
        providers: { email: sender },
        batchSize: 2,
        leaseDurationMs: 1000,
      }),
    ).toBe(2);
    expect(submitted).toEqual([first, second]);
  });
  it("safely reclaims an expired dispatch claim when no IO-start attempt was recorded", async () => {
    await clear();
    const id = await seeded();
    await db
      .update(eventDeliveries)
      .set({
        status: "dispatching",
        leaseToken: "unstarted",
        leaseExpiresAt: new Date(Date.now() - 1000),
      })
      .where(eq(eventDeliveries.id, id));
    expect(
      await processOutboxBatch({ providers: { email: acceptedSender() } }),
    ).toBe(1);
    const [delivery] = await db
      .select()
      .from(eventDeliveries)
      .where(eq(eventDeliveries.id, id));
    expect(delivery).toMatchObject({ status: "accepted", attempts: 1 });
    expect(
      await db
        .select()
        .from(notificationAttempts)
        .where(eq(notificationAttempts.deliveryId, id)),
    ).toHaveLength(1);
  });
  it("fences a stale completion and never blindly replays an expired in-flight send", async () => {
    await clear();
    const id = await seeded();
    let release!: () => void, entered!: () => void;
    const sending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    const old = processOutboxBatch({
      providers: {
        email: acceptedSender(async (message) => {
          entered();
          await stalled;
          return {
            status: "accepted",
            providerMessageId: `late-${message.deliveryId}`,
          };
        }),
      },
    });
    await sending;
    await db
      .update(eventDeliveries)
      .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(eventDeliveries.id, id));
    const replay = vi.fn(acceptedSender().send);
    expect(
      await processOutboxBatch({
        providers: { email: acceptedSender(replay) },
      }),
    ).toBe(0);
    release();
    await old;
    expect(replay).not.toHaveBeenCalled();
    const [delivery] = await db
      .select()
      .from(eventDeliveries)
      .where(eq(eventDeliveries.id, id));
    expect(delivery!.status).toBe("review");
    expect(delivery!.attempts).toBe(1);
    const results = await db.select().from(notificationAttemptResults);
    expect(results.map((row) => row.outcome).sort()).toEqual([
      "accepted",
      "unknown",
    ]);
  });
  it("retains early callbacks then reconciles them when provider message identity commits", async () => {
    await clear();
    const id = await seeded();
    const event = {
      provider: "fixture",
      profile: "email-v1",
      eventId: randomUUID(),
      providerMessageId: `message-${id}`,
      occurredAt: new Date(),
      state: "delivered" as const,
    };
    const inboxId = await persistNotificationEvent(
      event,
      "verified fixture body",
    );
    expect(await persistNotificationEvent(event, "verified fixture body")).toBe(
      inboxId,
    );
    await processNotificationInboxBatch();
    const sender = acceptedSender(
      async (message) => ({
        status: "accepted",
        providerMessageId: `message-${message.deliveryId}`,
      }),
      true,
    );
    await processOutboxBatch({ providers: { email: sender } });
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0],
    ).toMatchObject({ status: "delivered", providerStatus: "delivered" });
    await persistNotificationEvent({
      ...event,
      eventId: randomUUID(),
      occurredAt: new Date(Date.now() + 1000),
      state: "failed",
    });
    await processNotificationInboxBatch();
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0]!.status,
    ).toBe("delivered");
    await expect(
      persistNotificationEvent({ ...event, state: "failed" }),
    ).rejects.toThrow("different contents");
  });
  it("pins the configured profile and preserves unmatched verified callbacks", async () => {
    await clear();
    const id = await seeded();
    await processOutboxBatch({
      providers: {
        email: acceptedSender(async () => ({
          status: "rejected",
          code: "outage",
          retryable: true,
        })),
      },
    });
    await db
      .update(eventDeliveries)
      .set({ retryAfter: new Date(0) })
      .where(eq(eventDeliveries.id, id));
    const send = vi.fn(acceptedSender().send);
    const changed = {
      ...acceptedSender(send),
      identity: { provider: "fixture", profile: "different-account" },
    };
    await processOutboxBatch({ providers: { email: changed } });
    expect(send).not.toHaveBeenCalled();
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0]!.status,
    ).toBe("review");
    const retained = await persistUnmatchedNotificationEvent(
      {
        provider: "fixture",
        profile: "email-v1",
        eventId: randomUUID(),
        occurredAt: new Date(),
      },
      "unrecognized verified event",
    );
    expect(retained).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("replays ambiguity only within an explicit guarantee using identical request identity and content", async () => {
    await clear();
    const id = await seeded();
    const submitted: { deliveryId: string; text: string }[] = [];
    const sender: EmailSender = {
      ...acceptedSender(),
      capabilities: { deliveryTracking: true, idempotencyWindowMs: 300000 },
      send: async (message) => {
        submitted.push({ deliveryId: message.deliveryId, text: message.text });
        return submitted.length === 1
          ? { status: "unknown", code: "fixture_timeout" }
          : {
              status: "accepted",
              providerMessageId: `message-${message.deliveryId}`,
            };
      },
    };
    await processOutboxBatch({ providers: { email: sender } });
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0]!.status,
    ).toBe("retrying");
    await queryClient`update outbox_events set payload='{"referenceCode":"CHANGED"}' where id=(select event_id from event_deliveries where id=${id})`;
    await db
      .update(eventDeliveries)
      .set({ retryAfter: new Date(0) })
      .where(eq(eventDeliveries.id, id));
    await processOutboxBatch({ providers: { email: sender } });
    expect(submitted).toHaveLength(2);
    expect(submitted[1]).toEqual(submitted[0]);
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0]!.status,
    ).toBe("awaiting");
  });
  it("retains uncertainty through a later 429 and never retries past the original guarantee", async () => {
    await clear();
    const id = await seeded();
    let calls = 0;
    const sender: EmailSender = {
      ...acceptedSender(),
      capabilities: { deliveryTracking: true, idempotencyWindowMs: 600000 },
      send: async (message) => {
        calls++;
        if (calls === 1) return { status: "unknown", code: "fixture_timeout" };
        if (calls === 2)
          return {
            status: "rejected",
            code: "rate_limit",
            retryable: true,
            retryAfterMs: 3600000,
          };
        return {
          status: "accepted",
          providerMessageId: `unexpected-${message.deliveryId}`,
        };
      },
    };
    await processOutboxBatch({ providers: { email: sender } });
    await db
      .update(eventDeliveries)
      .set({ retryAfter: new Date(0) })
      .where(eq(eventDeliveries.id, id));
    const before = Date.now();
    await processOutboxBatch({ providers: { email: sender } });
    const [review] = await db
      .select()
      .from(eventDeliveries)
      .where(eq(eventDeliveries.id, id));
    expect(review).toMatchObject({
      status: "review",
      providerStatus: "unknown:rate_limit",
      attempts: 2,
    });
    expect(review!.retryAfter.getTime()).toBeGreaterThanOrEqual(
      before + 3600000,
    );
    const outcomes =
      await queryClient`select r.outcome from notification_attempt_results r join notification_attempts a on a.id=r.attempt_id where a.delivery_id=${id} order by a.attempt_number`;
    expect(outcomes.map((row) => row.outcome)).toEqual(["unknown", "rejected"]);
    // Even an operator requeue cannot erase the original uncertain request guarantee.
    await db
      .update(eventDeliveries)
      .set({
        status: "retrying",
        retryAfter: new Date(0),
        firstSubmittedAt: new Date(Date.now() - 600001),
      })
      .where(eq(eventDeliveries.id, id));
    await processOutboxBatch({ providers: { email: sender } });
    expect(calls).toBe(2);
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0]!.status,
    ).toBe("review");
  });
  it("records immutable starts/outcomes and cancels pending SMS on durable STOP without erasing acceptance", async () => {
    await clear();
    const id = await seeded();
    await processOutboxBatch({ providers: { email: acceptedSender() } });
    const [attempt] = await db
      .select()
      .from(notificationAttempts)
      .where(eq(notificationAttempts.deliveryId, id));
    await expect(
      queryClient`delete from notification_attempts where id=${attempt!.id}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      queryClient`update notification_attempt_results set code='rewrite' where attempt_id=${attempt!.id}`,
    ).rejects.toMatchObject({ code: "23514" });
    const phone = "+15555550123";
    const [customer] =
      await queryClient`insert into customers(name,email) values('SMS stop fixture',${`${randomUUID()}@example.test`}) returning id`;
    await queryClient`insert into sms_preferences(customer_id,phone,opted_in,verified_at,consent_at,request_nonce,verification_sid) values(${customer!.id},${phone},true,now(),now(),${randomUUID()},'pending-verification')`;
    const eventId = randomUUID(),
      acceptedEventId = randomUUID();
    await db.insert(outboxEvents).values([
      {
        id: eventId,
        eventType: "order.confirmed",
        aggregateType: "order",
        aggregateId: randomUUID(),
        payload: { referenceCode: "STOP" },
      },
      {
        id: acceptedEventId,
        eventType: "order.confirmed",
        aggregateType: "order",
        aggregateId: randomUUID(),
        payload: { referenceCode: "ACCEPTED" },
      },
    ]);
    const pending = randomUUID(),
      accepted = randomUUID();
    await db.insert(eventDeliveries).values([
      {
        id: pending,
        eventId,
        channel: "sms",
        recipient: phone,
        status: "pending",
      },
      {
        id: accepted,
        eventId: acceptedEventId,
        channel: "sms",
        recipient: phone,
        status: "awaiting",
        providerMessageId: "accepted-before-stop",
      },
    ]);
    await persistNotificationEvent(
      {
        provider: "fixture",
        profile: "sms-v1",
        eventId: randomUUID(),
        occurredAt: new Date(),
        state: "opted_out",
        phone,
      },
      "verified STOP",
    );
    await processNotificationInboxBatch();
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, pending))
      )[0]!.status,
    ).toBe("suppressed");
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, accepted))
      )[0]!.status,
    ).toBe("awaiting");
    const [preference] =
      await queryClient`select opted_in,request_nonce,verification_sid from sms_preferences where customer_id=${customer!.id}`;
    expect(preference).toMatchObject({
      opted_in: false,
      request_nonce: null,
      verification_sid: null,
    });
  });
  it("disables outbound work without defaulting to mock success", async () => {
    await clear();
    await seeded();
    const sender = acceptedSender(vi.fn());
    process.env.DISABLE_OUTBOUND_DELIVERY = "true";
    try {
      expect(await processOutboxBatch({ providers: { email: sender } })).toBe(
        0,
      );
      expect(sender.send).not.toHaveBeenCalled();
    } finally {
      delete process.env.DISABLE_OUTBOUND_DELIVERY;
    }
    expect(await processOutboxBatch({ providers: {} })).toBe(0);
  });
  it("recovers an expired submission even after its channel is disabled", async () => {
    await clear();
    const id = await seeded();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const sending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const original = processOutboxBatch({
      providers: {
        email: acceptedSender(async (message) => {
          entered();
          await blocked;
          return {
            status: "accepted",
            providerMessageId: `message-${message.deliveryId}`,
          };
        }),
      },
    });
    await sending;
    await db
      .update(eventDeliveries)
      .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(eventDeliveries.id, id));
    expect(await processOutboxBatch({ providers: {} })).toBe(0);
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0]!.status,
    ).toBe("review");
    release();
    await original;
    expect(
      (
        await db
          .select()
          .from(eventDeliveries)
          .where(eq(eventDeliveries.id, id))
      )[0]!.status,
    ).toBe("review");
  });
});
