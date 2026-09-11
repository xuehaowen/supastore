import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderFulfillments,
  outboxEvents,
  eventDeliveries,
  auditRecords,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface CorrectFulfillmentInput {
  orderId: string;
  carrier?: string;
  trackingNumber?: string;
  shippingAddressSnapshot?: Record<string, unknown>;
  staffUserId: string;
  reason: string;
}

export interface MarkReadyForPickupInput {
  orderId: string;
  staffUserId: string;
}

export interface CompletePickupHandoffInput {
  orderId: string;
  handoffActor: string;
  verificationMethod: "scoped_order_page" | "owner_assisted";
  staffUserId: string;
}

/**
 * Audited fulfillment correction use case (A4).
 * Allows staff to correct address typos, carrier, or tracking info without altering financial totals.
 */
export async function correctFulfillment(input: CorrectFulfillmentInput) {
  if (!input.reason?.trim()) {
    throw new InvariantViolationError("Correction reason is required.");
  }

  return await db.transaction(async (tx) => {
    const staff = await verifyStaffInTransaction(tx, input.staffUserId);

    await acquireTransactionLocks(tx, { orderIds: [input.orderId] });

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundError(`Order '${input.orderId}' not found.`);
    }

    if (order.lifecycleStatus === "cancelled") {
      throw new InvariantViolationError("Cannot correct fulfillment on a cancelled order.");
    }

    const [fulfillment] = await tx
      .select()
      .from(orderFulfillments)
      .where(eq(orderFulfillments.orderId, order.id))
      .limit(1);

    if (!fulfillment) {
      throw new NotFoundError(`Fulfillment record not found for order '${order.id}'.`);
    }

    // Update shipping address if provided
    if (input.shippingAddressSnapshot) {
      await tx
        .update(orders)
        .set({
          shippingAddressSnapshot: input.shippingAddressSnapshot,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    }

    // Update fulfillment tracking / carrier
    const fulfillmentUpdates: Partial<typeof orderFulfillments.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.carrier !== undefined) fulfillmentUpdates.carrier = input.carrier;
    if (input.trackingNumber !== undefined)
      fulfillmentUpdates.trackingNumber = input.trackingNumber;

    const [updatedFulfillment] = await tx
      .update(orderFulfillments)
      .set(fulfillmentUpdates)
      .where(eq(orderFulfillments.id, fulfillment.id))
      .returning();

    // Emit tracking update event
    const [event] = await tx
      .insert(outboxEvents)
      .values({
        eventType: "fulfillment.updated",
        aggregateType: "order",
        aggregateId: order.id,
        sequence: Number(
          (
            await tx
              .select({
                value: sql`coalesce(max(${outboxEvents.sequence}),0)+1`,
              })
              .from(outboxEvents)
              .where(eq(outboxEvents.aggregateId, order.id))
          )[0]!.value
        ),
        payload: {
          orderId: order.id,
          referenceCode: order.referenceCode,
          carrier: updatedFulfillment!.carrier,
          trackingNumber: updatedFulfillment!.trackingNumber,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    await tx.insert(eventDeliveries).values({
      eventId: event!.id,
      recipient: order.guestEmail,
      channel: "email",
      status: "pending",
      retryAfter: new Date(),
    });

    await tx.insert(auditRecords).values({
      entityType: "order_fulfillment",
      entityId: fulfillment.id,
      actorId: staff.userId,
      action: "fulfillment.corrected",
      reason: input.reason,
      details: {
        orderId: order.id,
        carrier: updatedFulfillment!.carrier,
        trackingNumber: updatedFulfillment!.trackingNumber,
        addressUpdated: Boolean(input.shippingAddressSnapshot),
      },
    });

    return updatedFulfillment!;
  });
}

/**
 * Marks pickup order as Ready for Pickup (A3) and notifies customer.
 */
export async function markReadyForPickup(input: MarkReadyForPickupInput) {
  return await db.transaction(async (tx) => {
    const staff = await verifyStaffInTransaction(tx, input.staffUserId);

    await acquireTransactionLocks(tx, { orderIds: [input.orderId] });

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);

    if (!order) throw new NotFoundError(`Order '${input.orderId}' not found.`);

    if (order.lifecycleStatus !== "confirmed") {
      throw new InvariantViolationError(
        `Order must be confirmed before marking ready for pickup. Status: ${order.lifecycleStatus}`
      );
    }

    const [updated] = await tx
      .update(orderFulfillments)
      .set({
        status: "ready_for_pickup",
        updatedAt: new Date(),
      })
      .where(eq(orderFulfillments.orderId, order.id))
      .returning();

    // Emit notification event
    const [event] = await tx
      .insert(outboxEvents)
      .values({
        eventType: "fulfillment.ready_for_pickup",
        aggregateType: "order",
        aggregateId: order.id,
        sequence: Number(
          (
            await tx
              .select({
                value: sql`coalesce(max(${outboxEvents.sequence}),0)+1`,
              })
              .from(outboxEvents)
              .where(eq(outboxEvents.aggregateId, order.id))
          )[0]!.value
        ),
        payload: {
          orderId: order.id,
          referenceCode: order.referenceCode,
          readyAt: new Date().toISOString(),
        },
      })
      .returning();

    await tx.insert(eventDeliveries).values({
      eventId: event!.id,
      recipient: order.guestEmail,
      channel: "email",
      status: "pending",
      retryAfter: new Date(),
    });

    await tx.insert(auditRecords).values({
      entityType: "order_fulfillment",
      entityId: updated!.id,
      actorId: staff.userId,
      action: "fulfillment.ready_for_pickup",
      reason: "Order marked ready for pickup",
      details: { orderId: order.id },
    });

    return updated!;
  });
}

/**
 * Completes pickup handoff with recipient verification (A3).
 * Transitions fulfillment to fulfilled and order lifecycle to completed.
 */
export async function completePickupHandoff(input: CompletePickupHandoffInput) {
  if (!input.handoffActor?.trim()) {
    throw new InvariantViolationError("Handoff actor identity is required.");
  }

  return await db.transaction(async (tx) => {
    const staff = await verifyStaffInTransaction(tx, input.staffUserId);

    await acquireTransactionLocks(tx, { orderIds: [input.orderId] });

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);

    if (!order) throw new NotFoundError(`Order '${input.orderId}' not found.`);

    if (order.lifecycleStatus !== "confirmed") {
      throw new InvariantViolationError(
        `Order must be in confirmed status for pickup handoff. Current: ${order.lifecycleStatus}`
      );
    }

    const handoffAt = new Date();

    const [updatedFulfillment] = await tx
      .update(orderFulfillments)
      .set({
        status: "fulfilled",
        handoffActor: input.handoffActor,
        handoffAt,
        fulfilledAt: handoffAt,
        updatedAt: handoffAt,
      })
      .where(eq(orderFulfillments.orderId, order.id))
      .returning();

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        lifecycleStatus: "completed",
        updatedAt: handoffAt,
      })
      .where(eq(orders.id, order.id))
      .returning();

    const [event] = await tx
      .insert(outboxEvents)
      .values({
        eventType: "order.completed",
        aggregateType: "order",
        aggregateId: order.id,
        sequence: Number(
          (
            await tx
              .select({
                value: sql`coalesce(max(${outboxEvents.sequence}),0)+1`,
              })
              .from(outboxEvents)
              .where(eq(outboxEvents.aggregateId, order.id))
          )[0]!.value
        ),
        payload: {
          orderId: order.id,
          referenceCode: order.referenceCode,
          handoffActor: input.handoffActor,
          verificationMethod: input.verificationMethod,
          completedAt: handoffAt.toISOString(),
        },
      })
      .returning();

    await tx.insert(eventDeliveries).values({
      eventId: event!.id,
      recipient: order.guestEmail,
      channel: "email",
      status: "pending",
      retryAfter: new Date(),
    });

    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: order.id,
      actorId: staff.userId,
      action: "fulfillment.pickup_handoff_completed",
      reason: "Pickup handoff verified and completed",
      details: {
        orderId: order.id,
        handoffActor: input.handoffActor,
        verificationMethod: input.verificationMethod,
      },
    });

    return {
      orderId: updatedOrder!.id,
      lifecycleStatus: updatedOrder!.lifecycleStatus,
      fulfillmentStatus: updatedFulfillment!.status,
      handoffActor: input.handoffActor,
    };
  });
}
