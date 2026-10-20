import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderItems,
  orderFulfillments,
  orderShipments,
  shipmentItems,
  carrierEvents,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import {
  parseActionUuid,
  parseActionRequiredText,
} from "@/application/common/request-validation";
import { DomainError, ConflictError } from "@/application/common/errors";
import { consumeShipmentStock } from "../inventory/stock-operations";
import { settleSlot } from "../inventory/slot-operations";
import { releaseOrderReward } from "../store-credit/reward-operations";
import { emitOrderEvent } from "@/application/common/events";
import {
  validateShipmentQuantities,
  shipmentCoverageComplete,
} from "@/domain/shipment";
import type { Transaction } from "@/application/common/transaction";
export async function shipmentLines(tx: Transaction, orderId: string) {
  return tx
    .select({
      orderItemId: shipmentItems.orderItemId,
      quantity: shipmentItems.quantity,
    })
    .from(shipmentItems)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentItems.shipmentId))
    .where(eq(orderShipments.orderId, orderId));
}
export async function dispatchShipment(input: {
  orderId: string;
  staffUserId: string;
  requestKey: string;
  carrier: string;
  provider?: string;
  trackingNumber?: string;
  items?: { orderItemId: string; quantity: number }[];
}) {
  const id = parseActionUuid(input.orderId, "Order"),
    requestKey = parseActionRequiredText(input.requestKey, "Request key", 200),
    carrier = parseActionRequiredText(input.carrier, "Carrier", 120),
    provider = input.provider || "manual",
    trackingNumber = input.trackingNumber?.trim() || null;
  if (
    provider !== "manual" &&
    provider !== process.env.CARRIER_WEBHOOK_PROVIDER
  )
    throw new DomainError("Carrier provider is not configured.");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId);
    await acquireTransactionLocks(tx, { orderIds: [id] });
    const [order] = await tx.select().from(orders).where(eq(orders.id, id));
    if (!order || order.fulfillmentType === "pickup")
      throw new DomainError(
        "Only shipping or delivery orders can dispatch shipments.",
      );
    const [existing] = await tx
      .select()
      .from(orderShipments)
      .where(
        and(
          eq(orderShipments.orderId, id),
          eq(orderShipments.requestKey, requestKey),
        ),
      );
    if (existing) {
      const prior = await tx
        .select()
        .from(shipmentItems)
        .where(eq(shipmentItems.shipmentId, existing.id));
      if (
        existing.carrier !== carrier ||
        existing.provider !== provider ||
        existing.trackingNumber !== trackingNumber ||
        (input.items &&
          JSON.stringify(
            [...prior]
              .map((i) => ({
                orderItemId: i.orderItemId,
                quantity: i.quantity,
              }))
              .sort((a, b) => a.orderItemId.localeCompare(b.orderItemId)),
          ) !==
            JSON.stringify(
              [...input.items].sort((a, b) =>
                a.orderItemId.localeCompare(b.orderItemId),
              ),
            ))
      )
        throw new ConflictError(
          "Shipment request key reused with different details.",
        );
      return existing;
    }
    if (order.lifecycleStatus !== "confirmed")
      throw new DomainError("Only confirmed orders can dispatch shipments.");
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    const shipped = await shipmentLines(tx, id);
    const requested =
      input.items ||
      items
        .map((item) => ({
          orderItemId: item.id,
          quantity:
            item.quantity -
            shipped
              .filter((line) => line.orderItemId === item.id)
              .reduce((sum, line) => sum + line.quantity, 0),
        }))
        .filter((line) => line.quantity > 0);
    validateShipmentQuantities(items, shipped, requested);
    const [shipment] = await tx
      .insert(orderShipments)
      .values({ orderId: id, requestKey, carrier, provider, trackingNumber })
      .returning();
    await consumeShipmentStock(
      tx,
      id,
      shipment!.id,
      requested,
      input.staffUserId,
    );
    await tx
      .insert(shipmentItems)
      .values(requested.map((line) => ({ ...line, shipmentId: shipment!.id })));
    await tx
      .update(orderFulfillments)
      .set({
        status: "shipped",
        carrier,
        trackingNumber,
        updatedAt: new Date(),
      })
      .where(eq(orderFulfillments.orderId, id));
    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: id,
      actorId: input.staffUserId,
      action: "shipment.dispatched",
      details: { shipmentId: shipment!.id, items: requested },
    });
    await emitOrderEvent(tx, id, "fulfillment.shipped", order.guestEmail, {
      orderId: id,
      referenceCode: order.referenceCode,
      carrier,
      trackingNumber,
      shipmentId: shipment!.id,
    });
    return shipment!;
  });
}
export async function finalizeDeliveredShipments(
  tx: Transaction,
  orderId: string,
  actorId: string,
) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.lifecycleStatus === "completed") return;
  if (order.lifecycleStatus !== "confirmed")
    throw new DomainError("Only confirmed orders can complete delivery.");
  const shipments = await tx
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId));
  const items = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  if (
    !shipments.length ||
    shipments.some((s) => s.status !== "delivered") ||
    !shipmentCoverageComplete(items, await shipmentLines(tx, orderId))
  )
    return;
  await settleSlot(tx, orderId, "consumed");
  await tx
    .update(orderFulfillments)
    .set({
      status: "fulfilled",
      fulfilledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orderFulfillments.orderId, orderId));
  await tx
    .update(orders)
    .set({ lifecycleStatus: "completed", updatedAt: new Date() })
    .where(eq(orders.id, orderId));
  await releaseOrderReward(tx, orderId, actorId);
  await emitOrderEvent(tx, orderId, "order.completed", order.guestEmail, {
    orderId,
    referenceCode: order.referenceCode,
  });
  await tx.insert(auditRecords).values({
    entityType: "order",
    entityId: orderId,
    actorId,
    action: "delivery.completed",
    details: { shipmentIds: shipments.map((s) => s.id) },
  });
}
export async function recordShipmentDelivered(input: {
  shipmentId: string;
  staffUserId: string;
}) {
  const id = parseActionUuid(input.shipmentId, "Shipment");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId);
    const [shipment] = await tx
      .select()
      .from(orderShipments)
      .where(eq(orderShipments.id, id));
    if (!shipment) throw new DomainError("Shipment not found.");
    await acquireTransactionLocks(tx, { orderIds: [shipment.orderId] });
    await tx
      .update(orderShipments)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(
        and(eq(orderShipments.id, id), eq(orderShipments.status, "dispatched")),
      );
    await finalizeDeliveredShipments(tx, shipment.orderId, input.staffUserId);
  });
}
export async function applyCarrierDelivery(input: {
  provider: string;
  eventId: string;
  shipmentId: string;
  bodyHash: string;
}) {
  return db.transaction(async (tx) => {
    const [shipment] = await tx
      .select()
      .from(orderShipments)
      .where(eq(orderShipments.id, input.shipmentId));
    if (!shipment || shipment.provider !== input.provider)
      throw new DomainError("Unknown shipment for this carrier provider.");
    await acquireTransactionLocks(tx, { orderIds: [shipment.orderId] });
    const [existing] = await tx
      .select()
      .from(carrierEvents)
      .where(
        and(
          eq(carrierEvents.provider, input.provider),
          eq(carrierEvents.eventId, input.eventId),
        ),
      );
    if (existing) {
      if (
        existing.bodyHash !== input.bodyHash ||
        existing.shipmentId !== input.shipmentId
      )
        throw new ConflictError(
          "Carrier event id reused with changed payload.",
        );
      return { duplicate: true };
    }
    const inserted = await tx
      .insert(carrierEvents)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) {
      const [retry] = await tx
        .select()
        .from(carrierEvents)
        .where(
          and(
            eq(carrierEvents.provider, input.provider),
            eq(carrierEvents.eventId, input.eventId),
          ),
        );
      if (
        retry?.bodyHash !== input.bodyHash ||
        retry.shipmentId !== input.shipmentId
      )
        throw new ConflictError(
          "Carrier event id reused with changed payload.",
        );
      return { duplicate: true };
    }
    await tx
      .update(orderShipments)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(
        and(
          eq(orderShipments.id, input.shipmentId),
          eq(orderShipments.status, "dispatched"),
        ),
      );
    await finalizeDeliveredShipments(
      tx,
      shipment.orderId,
      `carrier:${input.provider}`,
    );
    return { duplicate: false };
  });
}
