import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderItems,
  orderFulfillments,
  orderReturns,
  orderReturnItems,
  auditRecords,
} from "@/infrastructure/db/schema";
import { verifyOrderAccess } from "@/application/common/guest-access";
import { emitOrderEvent } from "@/application/common/events";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { restockReturnedGoods } from "../inventory/stock-operations";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionUuid,
  parseActionInteger,
  parseActionRequiredText,
} from "@/application/common/request-validation";
export async function requestGoodsReturn(input: {
  orderId: string;
  token: string;
  requestKey: string;
  reason: string;
  items: { orderItemId: string; quantity: number }[];
}) {
  parseActionUuid(input.orderId, "Order");
  parseActionUuid(input.requestKey, "Request key");
  const reason = parseActionRequiredText(input.reason, "Return reason", 500);
  if (
    !input.items.length ||
    input.items.length > 50 ||
    new Set(input.items.map((i) => i.orderItemId)).size !== input.items.length
  )
    throw new DomainError("Choose between one and 50 distinct order items.");
  for (const item of input.items) {
    parseActionUuid(item.orderItemId, "Order item");
    parseActionInteger(item.quantity, "Return quantity", 1, 999);
  }
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for("update");
    await verifyOrderAccess(tx, input.orderId, input.token);
    if (!order) throw new NotFoundError("Order not found.");
    const [retry] = await tx
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.requestKey, input.requestKey));
    if (retry) {
      const previous = await tx
        .select()
        .from(orderReturnItems)
        .where(eq(orderReturnItems.returnId, retry.id));
      if (
        retry.orderId !== order.id ||
        retry.reason !== reason ||
        previous.length !== input.items.length ||
        input.items.some(
          (i) =>
            !previous.some(
              (p) =>
                p.orderItemId === i.orderItemId && p.quantity === i.quantity,
            ),
        )
      )
        throw new ConflictError(
          "Return request key was already used with different input.",
        );
      return retry.id;
    }
    const [fulfillment] = await tx
      .select()
      .from(orderFulfillments)
      .where(eq(orderFulfillments.orderId, order.id));
    if (fulfillment?.status !== "fulfilled")
      throw new DomainError(
        "Returns can be requested after handoff is completed.",
      );
    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const commitments = await tx
      .select({ item: orderReturnItems })
      .from(orderReturnItems)
      .innerJoin(orderReturns, eq(orderReturns.id, orderReturnItems.returnId))
      .where(
        and(
          eq(orderReturns.orderId, order.id),
          inArray(orderReturns.status, ["requested", "approved", "received"]),
        ),
      );
    for (const item of input.items) {
      const purchased = items.find((i) => i.id === item.orderItemId);
      const reserved = commitments
        .filter((c) => c.item.orderItemId === item.orderItemId)
        .reduce((sum, c) => sum + c.item.quantity, 0);
      if (!purchased || item.quantity + reserved > purchased.quantity)
        throw new DomainError(
          "Return quantity exceeds the fulfilled quantity still available for return.",
        );
    }
    const [goodsReturn] = await tx
      .insert(orderReturns)
      .values({ orderId: order.id, requestKey: input.requestKey, reason })
      .returning();
    await tx
      .insert(orderReturnItems)
      .values(
        input.items.map((i) => ({
          returnId: goodsReturn!.id,
          orderItemId: i.orderItemId,
          quantity: i.quantity,
        })),
      );
    await tx
      .insert(auditRecords)
      .values({
        entityType: "order_return",
        entityId: goodsReturn!.id,
        actorId: `order:${order.id}`,
        action: "return.requested",
        reason,
      });
    await emitOrderEvent(tx, order.id, "return.requested", order.guestEmail, {
      referenceCode: order.referenceCode,
      message:
        "Your return request was received. The store will review it before goods are sent back.",
    });
    return goodsReturn!.id;
  });
}
export async function reviewGoodsReturn(input: {
  staffUserId: string;
  returnId: string;
  decision: "approved" | "rejected" | "cancelled";
  reason: string;
}) {
  parseActionUuid(input.returnId, "Return");
  const reason = parseActionRequiredText(input.reason, "Review reason", 500);
  if (!["approved", "rejected", "cancelled"].includes(input.decision))
    throw new DomainError("Invalid return decision.");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId);
    const [candidate] = await tx
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.id, input.returnId));
    if (!candidate) throw new NotFoundError("Return not found.");
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, candidate.orderId))
      .for("update");
    const [goodsReturn] = await tx
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.id, candidate.id))
      .for("update");
    if (goodsReturn!.status === input.decision) return;
    if (!(
      goodsReturn!.status === "requested" ||
      (goodsReturn!.status === "approved" && input.decision === "cancelled")
    ))
      throw new ConflictError(
        "Return status changed. Reload before reviewing.",
      );
    await tx
      .update(orderReturns)
      .set({ status: input.decision, reviewReason: reason })
      .where(eq(orderReturns.id, goodsReturn!.id));
    await tx
      .insert(auditRecords)
      .values({
        entityType: "order_return",
        entityId: goodsReturn!.id,
        actorId: input.staffUserId,
        action: `return.${input.decision}`,
        reason,
      });
    await emitOrderEvent(
      tx,
      candidate.orderId,
      `return.${input.decision}`,
      order!.guestEmail,
      {
        referenceCode: order!.referenceCode,
        message: `Your product return is ${input.decision}. ${reason}`,
      },
    );
  });
}
export async function receiveGoodsReturn(input: {
  staffUserId: string;
  returnId: string;
  items: { returnItemId: string; restock: number; damaged: number }[];
}) {
  parseActionUuid(input.returnId, "Return");
  if (input.items.length > 50) throw new DomainError("Too many return items.");
  for (const item of input.items) {
    parseActionUuid(item.returnItemId, "Return item");
    parseActionInteger(item.restock, "Restock quantity", 0, 999);
    parseActionInteger(item.damaged, "Damaged quantity", 0, 999);
  }
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId);
    const [candidate] = await tx
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.id, input.returnId));
    if (!candidate) throw new NotFoundError("Return not found.");
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, candidate.orderId))
      .for("update");
    const [goodsReturn] = await tx
      .select()
      .from(orderReturns)
      .where(eq(orderReturns.id, candidate.id));
    const items = await tx
      .select({ item: orderReturnItems, variantId: orderItems.variantId })
      .from(orderReturnItems)
      .innerJoin(orderItems, eq(orderItems.id, orderReturnItems.orderItemId))
      .where(eq(orderReturnItems.returnId, candidate.id))
      .orderBy(asc(orderItems.variantId));
    if (
      input.items.length !== items.length ||
      new Set(input.items.map((i) => i.returnItemId)).size !== items.length
    )
      throw new DomainError("Return items changed. Reload before receiving.");
    for (const row of items) {
      const received = input.items.find((i) => i.returnItemId === row.item.id);
      if (
        !received ||
        received.restock + received.damaged !== row.item.quantity
      )
        throw new DomainError(
          "Record every approved unit as restockable or damaged.",
        );
      if (
        goodsReturn!.status === "received" &&
        (row.item.restockedQuantity !== received.restock ||
          row.item.damagedQuantity !== received.damaged)
      )
        throw new ConflictError(
          "This receipt already recorded a different disposition.",
        );
    }
    if (goodsReturn!.status === "received") return;
    if (goodsReturn!.status !== "approved")
      throw new ConflictError("Only approved returns can be received.");
    for (const row of items) {
      const received = input.items.find((i) => i.returnItemId === row.item.id)!;
      await restockReturnedGoods(tx, {
        variantId: row.variantId,
        quantity: received.restock,
        orderId: candidate.orderId,
        returnItemId: row.item.id,
        actorId: input.staffUserId,
      });
      await tx
        .update(orderReturnItems)
        .set({
          restockedQuantity: received.restock,
          damagedQuantity: received.damaged,
        })
        .where(eq(orderReturnItems.id, row.item.id));
    }
    await tx
      .update(orderReturns)
      .set({ status: "received", receivedAt: new Date() })
      .where(eq(orderReturns.id, candidate.id));
    await tx
      .insert(auditRecords)
      .values({
        entityType: "order_return",
        entityId: candidate.id,
        actorId: input.staffUserId,
        action: "return.received",
        details: { items: input.items },
      });
    await emitOrderEvent(
      tx,
      candidate.orderId,
      "return.received",
      order!.guestEmail,
      {
        referenceCode: order!.referenceCode,
        message:
          "Your returned goods were received. Refund settlement is reviewed separately against your original payment sources.",
      },
    );
  });
}
