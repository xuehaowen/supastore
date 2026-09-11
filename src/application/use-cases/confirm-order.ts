import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentReceipts,
  confirmationFunding,
  outboxEvents,
  eventDeliveries,
  auditRecords,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { computeOrderFinancialProjection } from "@/domain/financial-projection/projection";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface ConfirmOrderInput {
  orderId: string;
  staffUserId: string;
}

export async function confirmOrder(input: ConfirmOrderInput) {
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

    if (order.lifecycleStatus !== "unpaid") {
      throw new InvariantViolationError(
        `Cannot confirm order in '${order.lifecycleStatus}' status.`,
      );
    }

    // Fetch receipts and lock them
    const receipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, order.id));

    await acquireTransactionLocks(tx, {
      receiptIds: receipts.map((r) => r.id),
    });

    const projection = computeOrderFinancialProjection({
      purchaseTotalCents: order.purchaseTotalCents,
      isConfirmed: false,
      isCancelled: false,
      receipts: receipts.map((r) => ({
        id: r.id,
        originalAmountCents: r.amountCents,
      })),
    });

    if (projection.netReceivedCents !== order.purchaseTotalCents) {
      throw new InvariantViolationError(
        `Order is underfunded. Required: ${order.purchaseTotalCents} cents, Net Received: ${projection.netReceivedCents} cents.`,
      );
    }

    if (projection.totalUnsentRemainderCents > 0) {
      throw new InvariantViolationError(
        "Cannot confirm order while open excess returns remain unsettled.",
      );
    }

    // Freeze confirmation funding (Fi)
    let remainingToFund = order.purchaseTotalCents;
    for (const r of receipts) {
      const fundAmount = Math.min(r.amountCents, remainingToFund);
      if (fundAmount > 0) {
        await tx.insert(confirmationFunding).values({
          orderId: order.id,
          receiptId: r.id,
          fundedAmountCents: fundAmount,
        });
        remainingToFund -= fundAmount;
      }
    }

    // Update lifecycle status to confirmed
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        lifecycleStatus: "confirmed",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // Emit order.confirmed outbox event
    const [event] = await tx
      .insert(outboxEvents)
      .values({
        eventType: "order.confirmed",
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
          purchaseTotalCents: order.purchaseTotalCents,
          guestEmail: order.guestEmail,
          confirmedAt: new Date().toISOString(),
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
      action: "order.confirmed",
      reason: "Order payment verified and confirmed",
    });

    return {
      orderId: updatedOrder!.id,
      lifecycleStatus: updatedOrder!.lifecycleStatus,
      isConfirmed: true,
    };
  });
}
