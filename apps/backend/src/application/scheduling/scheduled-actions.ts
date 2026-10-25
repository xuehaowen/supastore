import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderFulfillments,
  fulfillmentSlots,
  scheduledActions,
  eventDeliveries,
  outboxEvents,
} from "@/infrastructure/db/schema";
import type { Transaction } from "@/application/common/transaction";
import {
  enqueueWork,
  queueDatabase,
  queueProducer,
} from "@/infrastructure/queue/client";
import { pickupReminderTime, reminderIsCurrent } from "@/domain/scheduled-work";
import { emitOrderEvent } from "@/application/common/events";

export async function scheduleAction(
  tx: Transaction,
  input: {
    key: string;
    kind:
      | "pickup-reminder"
      | "payment-upload"
      | "catalog-upload"
      | "upload-candidate";
    entityId: string;
    slotId?: string;
    scheduledFor: Date;
    expiresAt?: Date;
  },
) {
  const [previous] = await tx
    .select()
    .from(scheduledActions)
    .where(eq(scheduledActions.key, input.key))
    .for("update");
  if (
    previous?.status === "pending" &&
    previous.slotId === (input.slotId ?? null) &&
    previous.scheduledFor.getTime() === input.scheduledFor.getTime()
  )
    return;
  const boss = await queueProducer();
  if (previous?.status === "pending")
    await boss.cancel(
      previous.kind === "pickup-reminder"
        ? "pickup-reminder"
        : "upload-expiration",
      previous.jobId,
      { db: queueDatabase(tx) },
    );
  const jobId = randomUUID();
  await tx
    .insert(scheduledActions)
    .values({ ...input, jobId })
    .onConflictDoUpdate({
      target: scheduledActions.key,
      set: {
        ...input,
        jobId,
        slotId: input.slotId ?? null,
        expiresAt: input.expiresAt ?? null,
        status: "pending",
        updatedAt: new Date(),
      },
    });
  await enqueueWork(
    tx,
    input.kind === "pickup-reminder" ? "pickup-reminder" : "upload-expiration",
    { key: input.key, jobId },
    { id: jobId, startAfter: input.scheduledFor },
  );
}

export async function cancelPickupReminder(tx: Transaction, orderId: string) {
  const [action] = await tx
    .update(scheduledActions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledActions.key, `pickup:${orderId}`),
        eq(scheduledActions.status, "pending"),
      ),
    )
    .returning();
  if (action)
    await (
      await queueProducer()
    ).cancel("pickup-reminder", action.jobId, { db: queueDatabase(tx) });
}

export async function schedulePickupReminder(tx: Transaction, orderId: string) {
  const [booking] = await tx
    .select({
      order: orders,
      fulfillment: orderFulfillments,
      slot: fulfillmentSlots,
    })
    .from(orders)
    .innerJoin(orderFulfillments, eq(orderFulfillments.orderId, orders.id))
    .innerJoin(
      fulfillmentSlots,
      eq(orderFulfillments.fulfillmentSlotId, fulfillmentSlots.id),
    )
    .where(eq(orders.id, orderId));
  if (
    !booking ||
    booking.order.fulfillmentType !== "pickup" ||
    booking.order.lifecycleStatus !== "confirmed" ||
    booking.fulfillment.status === "fulfilled"
  ) {
    await cancelPickupReminder(tx, orderId);
    return;
  }
  const minutes = Number(process.env.PICKUP_REMINDER_LEAD_MINUTES ?? 180);
  const time = pickupReminderTime(
    booking.slot.date,
    booking.slot.startTime,
    booking.slot.timezone,
    minutes,
  );
  if (time.expiresAt <= new Date()) {
    await cancelPickupReminder(tx, orderId);
    return;
  }
  await scheduleAction(tx, {
    key: `pickup:${orderId}`,
    kind: "pickup-reminder",
    entityId: orderId,
    slotId: booking.slot.id,
    ...time,
  });
}

export async function runPickupReminder(data: { key: string; jobId: string }) {
  return db.transaction(async (tx) => {
    // Match the order -> action lock order used by booking changes.
    const [candidate] = await tx
      .select()
      .from(scheduledActions)
      .where(eq(scheduledActions.key, data.key));
    if (!candidate) return;
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, candidate.entityId))
      .for("update");
    const [action] = await tx
      .select()
      .from(scheduledActions)
      .where(eq(scheduledActions.key, data.key))
      .for("update");
    if (!action || action.jobId !== data.jobId || action.status !== "pending")
      return;
    if (action.scheduledFor > new Date())
      throw new Error("Reminder is not due.");
    const [fulfillment] = await tx
      .select()
      .from(orderFulfillments)
      .where(eq(orderFulfillments.orderId, action.entityId));
    const valid =
      order &&
      fulfillment &&
      reminderIsCurrent({
        lifecycleStatus: order.lifecycleStatus,
        fulfillmentStatus: fulfillment.status,
        currentSlotId: fulfillment.fulfillmentSlotId,
        expectedSlotId: action.slotId!,
        expiresAt: action.expiresAt!,
        now: new Date(),
      });
    if (valid) {
      await emitOrderEvent(
        tx,
        order.id,
        "fulfillment.pickup_reminder",
        order.guestEmail,
        {
          orderId: order.id,
          referenceCode: order.referenceCode,
          reminderSlotId: action.slotId,
          reminderExpiresAt: action.expiresAt!.toISOString(),
          scheduledFor: action.scheduledFor.toISOString(),
          reminderJobId: action.jobId,
        },
      );
      // The reminder becomes an ordered delivery only when due, and cannot be sent after pickup.
      await tx
        .update(eventDeliveries)
        .set({ expiresAt: action.expiresAt, scheduledFor: action.scheduledFor })
        .where(
          sql`${eventDeliveries.eventId} IN (SELECT id FROM ${outboxEvents} WHERE aggregate_id=${order.id} AND event_type='fulfillment.pickup_reminder' AND payload->>'reminderJobId'=${action.jobId})`,
        );
    }
    await tx
      .update(scheduledActions)
      .set({ status: valid ? "completed" : "cancelled", updatedAt: new Date() })
      .where(eq(scheduledActions.key, data.key));
  });
}

/** Bounded rollout/recovery repair; future schedules remain durable across worker restarts. */
export async function reconcilePickupReminders() {
  const candidates = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderFulfillments, eq(orderFulfillments.orderId, orders.id))
    .innerJoin(
      fulfillmentSlots,
      eq(fulfillmentSlots.id, orderFulfillments.fulfillmentSlotId),
    )
    .where(
      sql`${orders.lifecycleStatus}='confirmed' AND ${orders.fulfillmentType}='pickup'
      AND ${orderFulfillments.status} IN ('unfulfilled','preparing','ready_for_pickup')
      AND (${fulfillmentSlots.date} || ' ' || ${fulfillmentSlots.startTime})::timestamp AT TIME ZONE ${fulfillmentSlots.timezone} > now()
      AND NOT EXISTS(SELECT 1 FROM ${scheduledActions} WHERE key='pickup:' || ${orders.id}::text)`,
    )
    .orderBy(orders.id)
    .limit(100);
  for (const candidate of candidates)
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(orders)
        .where(eq(orders.id, candidate.id))
        .for("update");
      await schedulePickupReminder(tx, candidate.id);
    });
  return candidates.length;
}
