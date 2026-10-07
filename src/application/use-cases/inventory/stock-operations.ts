import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  productVariants,
  variantStock,
  stockReservations,
  stockMovements,
  orderItems,
  orders,
  auditRecords,
} from "@/infrastructure/db/schema";
import type { Transaction } from "@/application/common/transaction";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  InvariantViolationError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";

async function lockStock(tx: Transaction, variantId: string) {
  const [variant] = await tx
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .for("update");
  if (!variant) throw new NotFoundError("Variant not found.");
  await tx.insert(variantStock).values({ variantId }).onConflictDoNothing();
  const [stock] = await tx
    .select()
    .from(variantStock)
    .where(eq(variantStock.variantId, variantId))
    .for("update");
  return { variant, stock: stock! };
}
export async function adjustStock(input: {
  staffUserId: string;
  variantId: string;
  onHand: number;
  tracking: boolean;
  revision?: number;
  reason: string;
  requestKey: string;
}) {
  const variantId = parseActionUuid(input.variantId, "Variant");
  const onHand = parseActionInteger(
    input.onHand,
    "Counted quantity",
    0,
    1000000,
  );
  const reason = parseActionRequiredText(input.reason, "Count reason", 500);
  const requestKey = parseActionUuid(input.requestKey, "Request key");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const { stock } = await lockStock(tx, variantId);
    const [retry] = await tx
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.variantId, variantId),
          eq(stockMovements.requestKey, requestKey),
        ),
      );
    if (retry) {
      if (
        retry.payload?.onHand !== onHand ||
        retry.payload.tracking !== input.tracking ||
        retry.reason !== reason ||
        retry.actorId !== input.staffUserId
      )
        throw new ConflictError(
          "Request key was already used with different input.",
        );
      return;
    }
    if (input.revision !== undefined && stock.revision !== input.revision)
      throw new ConflictError(
        "Stock changed. Reload and recount before saving.",
      );
    if (!input.tracking && stock.reserved > 0)
      throw new InvariantViolationError(
        "Cannot disable tracking while orders reserve stock.",
      );
    if (input.tracking && !stock.trackingEnabled) {
      const outstanding = await tx
        .select({ id: orderItems.id })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(
            eq(orderItems.variantId, variantId),
            inArray(orders.lifecycleStatus, ["unpaid", "confirmed"]),
            sql`not exists (select 1 from stock_reservations r where r.order_item_id = ${orderItems.id})`,
          ),
        )
        .limit(1);
      if (outstanding.length)
        throw new ConflictError(
          "Finish or cancel outstanding orders for this variant before enabling stock tracking.",
        );
    }
    await tx.insert(stockMovements).values({
      variantId,
      delta: onHand - stock.onHand,
      reason,
      actorId: input.staffUserId,
      requestKey,
      payload: { onHand, tracking: input.tracking },
    });
    await tx
      .update(variantStock)
      .set({
        onHand,
        trackingEnabled: input.tracking,
        revision: stock.revision + 1,
      })
      .where(eq(variantStock.variantId, variantId));
    await tx.insert(auditRecords).values({
      entityType: "variant_stock",
      entityId: variantId,
      actorId: input.staffUserId,
      action: "stock.counted",
      reason,
      details: {
        onHand,
        previous: stock.onHand,
        reserved: stock.reserved,
        shortage: onHand < stock.reserved,
      },
    });
  });
}
export async function reserveOrderStock(tx: Transaction, orderId: string) {
  const items = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.variantId));
  for (const item of items) {
    const { variant, stock } = await lockStock(tx, item.variantId);
    const [existing] = await tx
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.orderItemId, item.id));
    if (existing) continue;
    if (!variant.isAvailable)
      throw new InvariantViolationError(
        "A variant became unavailable. Review your cart.",
      );
    if (!stock.trackingEnabled) continue;
    if (stock.onHand - stock.reserved < item.quantity)
      throw new InvariantViolationError(
        `Not enough stock for ${variant.title}. Review your cart.`,
      );
    await tx.insert(stockReservations).values({
      orderId,
      orderItemId: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
    });
    await tx
      .update(variantStock)
      .set({
        reserved: stock.reserved + item.quantity,
        revision: stock.revision + 1,
      })
      .where(eq(variantStock.variantId, item.variantId));
  }
}
export async function settleOrderStock(
  tx: Transaction,
  orderId: string,
  status: "consumed" | "released",
  actorId: string,
) {
  // Caller holds the order lock. Lock variants in the same order as placement.
  const reservations = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.orderId, orderId),
        eq(stockReservations.status, "active"),
      ),
    )
    .orderBy(asc(stockReservations.variantId));
  for (const reservation of reservations) {
    const { stock } = await lockStock(tx, reservation.variantId);
    const remaining =
      reservation.quantity - (reservation.consumedQuantity ?? 0);
    if (stock.reserved < remaining)
      throw new InvariantViolationError(
        "Stock reservation drift needs owner review.",
      );
    if (status === "consumed" && stock.onHand < stock.reserved)
      throw new InvariantViolationError(
        "Stock shortage blocks handoff. Recount stock or resolve affected orders first.",
      );
    await tx
      .update(variantStock)
      .set({
        reserved: stock.reserved - remaining,
        onHand: stock.onHand - (status === "consumed" ? remaining : 0),
        revision: stock.revision + 1,
      })
      .where(eq(variantStock.variantId, reservation.variantId));
    await tx
      .update(stockReservations)
      .set({
        status,
        ...(status === "consumed"
          ? { consumedQuantity: reservation.quantity }
          : {}),
      })
      .where(eq(stockReservations.id, reservation.id));
    if (status === "consumed")
      await tx.insert(stockMovements).values({
        variantId: reservation.variantId,
        orderId,
        delta: -remaining,
        reason: "Order handed off",
        actorId,
        requestKey: reservation.id,
      });
  }
}
export async function consumeShipmentStock(
  tx: Transaction,
  orderId: string,
  shipmentId: string,
  lines: { orderItemId: string; quantity: number }[],
  actorId: string,
) {
  const holds = await tx
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.orderId, orderId))
    .orderBy(asc(stockReservations.variantId), asc(stockReservations.id));
  for (const hold of holds) {
    const quantity =
      lines.find((line) => line.orderItemId === hold.orderItemId)?.quantity ||
      0;
    if (!quantity) continue;
    const consumed = hold.consumedQuantity + quantity;
    if (hold.status !== "active" || consumed > hold.quantity)
      throw new InvariantViolationError(
        "Shipment stock reservation is no longer available.",
      );
    const { stock } = await lockStock(tx, hold.variantId);
    if (stock.reserved < quantity || stock.onHand < stock.reserved)
      throw new InvariantViolationError(
        "Stock shortage or reservation drift blocks dispatch.",
      );
    await tx
      .update(variantStock)
      .set({
        reserved: stock.reserved - quantity,
        onHand: stock.onHand - quantity,
        revision: stock.revision + 1,
      })
      .where(eq(variantStock.variantId, hold.variantId));
    await tx
      .update(stockReservations)
      .set({
        consumedQuantity: consumed,
        status: consumed === hold.quantity ? "consumed" : "active",
      })
      .where(eq(stockReservations.id, hold.id));
    await tx
      .insert(stockMovements)
      .values({
        variantId: hold.variantId,
        orderId,
        delta: -quantity,
        reason: "Shipment dispatched",
        actorId,
        requestKey: `shipment:${shipmentId}:${hold.orderItemId}`,
      });
  }
}
export async function restockReturnedGoods(
  tx: Transaction,
  input: {
    variantId: string;
    quantity: number;
    orderId: string;
    returnItemId: string;
    actorId: string;
  },
) {
  if (input.quantity === 0) return;
  const { stock } = await lockStock(tx, input.variantId);
  if (stock.onHand + input.quantity > 1000000)
    throw new InvariantViolationError(
      "Restock exceeds the supported quantity limit.",
    );
  const [existing] = await tx
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.variantId, input.variantId),
        eq(stockMovements.requestKey, input.returnItemId),
      ),
    );
  if (existing)
    throw new InvariantViolationError("Return item is already restocked.");
  await tx.insert(stockMovements).values({
    variantId: input.variantId,
    orderId: input.orderId,
    delta: input.quantity,
    reason: "Returned goods received and restockable",
    actorId: input.actorId,
    requestKey: input.returnItemId,
  });
  await tx
    .update(variantStock)
    .set({
      onHand: stock.onHand + input.quantity,
      revision: stock.revision + 1,
    })
    .where(eq(variantStock.variantId, input.variantId));
}
