import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { settleOrderStock } from "./inventory/stock-operations";
import { settleSlot } from "./inventory/slot-operations";
import { releaseOrderReward } from "./store-credit/reward-operations";
import {
  orders,
  orderFulfillments,
  outboxEvents,
  eventDeliveries,
  auditRecords,
  orderShipments,
  orderItems,
  shipmentItems,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";
import { shipmentCoverageComplete } from "@/domain/shipment";
import { shipmentLines } from "./fulfillment/shipments";

export interface FulfillOrderInput {
  orderId: string;
  staffUserId: string;
  carrier?: string;
  trackingNumber?: string;
}

export async function fulfillOrder(input: FulfillOrderInput) {
  if (!input.carrier?.trim()) {
    throw new InvariantViolationError(
      "Carrier or manual delivery method is required.",
    );
  }
  const carrier = input.carrier.trim();
  return await db.transaction(async (tx) => {
    // 1. Staff verification
    const staff = await verifyStaffInTransaction(tx, input.staffUserId);

    // 2. Lock order
    await acquireTransactionLocks(tx, { orderIds: [input.orderId] });

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    if (!order) {
      throw new NotFoundError(`Order with ID '${input.orderId}' not found.`);
    }
    if (order.fulfillmentType === "pickup")
      throw new InvariantViolationError(
        "Complete verified pickup handoff to deliver this order.",
      );

    if (order.lifecycleStatus !== "confirmed") {
      throw new InvariantViolationError(
        `Cannot fulfill order in '${order.lifecycleStatus}' status. Must be 'confirmed'.`,
      );
    }

    // Update fulfillment record
    const shipments = await tx
      .select()
      .from(orderShipments)
      .where(eq(orderShipments.orderId, order.id));
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    if (!shipments.length) {
      const [manual] = await tx
        .insert(orderShipments)
        .values({
          orderId: order.id,
          requestKey: "manual-completed-delivery",
          carrier,
          trackingNumber: input.trackingNumber?.trim() || null,
          status: "delivered",
          deliveredAt: new Date(),
        })
        .returning();
      await tx
        .insert(shipmentItems)
        .values(
          items.map((item) => ({
            shipmentId: manual!.id,
            orderItemId: item.id,
            quantity: item.quantity,
          })),
        );
    } else if (
      !shipmentCoverageComplete(items, await shipmentLines(tx, order.id))
    )
      throw new InvariantViolationError(
        "Dispatch every ordered unit before recording completed delivery.",
      );
    await tx
      .update(orderShipments)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(eq(orderShipments.orderId, order.id));
    await settleSlot(tx, order.id, "consumed");
    await settleOrderStock(tx, order.id, "consumed", staff.userId);
    await tx
      .update(orderFulfillments)
      .set({
        status: "fulfilled",
        carrier,
        trackingNumber: input.trackingNumber?.trim() || null,
        fulfilledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orderFulfillments.orderId, order.id));

    // Update order lifecycle status to completed
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        lifecycleStatus: "completed",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // Outbox event
    await releaseOrderReward(tx, order.id, staff.userId);
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
          )[0]!.value,
        ),
        payload: {
          orderId: order.id,
          referenceCode: order.referenceCode,
          carrier,
          trackingNumber: input.trackingNumber?.trim() || null,
          completedAt: new Date().toISOString(),
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
      action: "order.fulfilled",
      reason: "Order fulfilled and completed",
    });

    return {
      orderId: updatedOrder!.id,
      lifecycleStatus: updatedOrder!.lifecycleStatus,
      fulfillmentStatus: "fulfilled",
    };
  });
}
