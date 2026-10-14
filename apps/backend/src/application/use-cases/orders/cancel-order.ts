import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { settleOrderStock } from "../inventory/stock-operations";
import { settleOrderCredit } from "../store-credit/credit-operations";
import { refundPurchaseInTransaction } from "../store-credit/purchase-refund";
import { randomUUID } from "node:crypto";
import { settleSlot } from "../inventory/slot-operations";
import {
  orders,
  orderFulfillments,
  paymentReceipts,
  refundAuthorizations,
  payoutAllocations,
  outboxEvents,
  eventDeliveries,
  auditRecords,
  paymentReceiptCorrections,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface CancelOrderInput {
  orderId: string;
  actorUserId: string;
  reason: string;
  isCustomerRequest?: boolean;
}

export interface CancelOrderOutput {
  orderId: string;
  previousLifecycleStatus: string;
  lifecycleStatus: "cancelled";
  refundAuthorizedCents: number;
  authorizationIds: string[];
}

/**
 * Cancels an unpaid or confirmed order.
 * - For unpaid orders (A10): updates status to cancelled with zero refund obligations.
 * - For confirmed orders (C11, C12): halts fulfillment and creates refund authorizations
 *   for all received funds across original receipts.
 */
export async function cancelOrder(
  input: CancelOrderInput,
): Promise<CancelOrderOutput> {
  if (!input.reason?.trim()) {
    throw new InvariantViolationError("Cancellation reason is required.");
  }

  return await db.transaction(async (tx) => {
    // 1. Staff verification
    const staff = await verifyStaffInTransaction(
      tx,
      input.actorUserId,
      "owner",
    );

    // 2. Fetch and lock order
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
      throw new InvariantViolationError(
        `Order '${order.referenceCode}' is already cancelled.`,
      );
    }

    const [fulfillment] = await tx
      .select()
      .from(orderFulfillments)
      .where(eq(orderFulfillments.orderId, order.id))
      .limit(1);

    if (
      order.lifecycleStatus === "completed" ||
      (fulfillment && ["fulfilled", "shipped"].includes(fulfillment.status))
    ) {
      throw new InvariantViolationError(
        `Cannot cancel order '${order.referenceCode}' because fulfillment has already completed.`,
      );
    }

    const previousLifecycleStatus = order.lifecycleStatus;
    await settleSlot(tx, order.id, "released");
    await settleOrderStock(tx, order.id, "released", staff.userId);
    let creditRefundAuthorization: string | undefined;
    let mixedRefundAmount = 0;
    if (order.creditAppliedCents) {
      if (previousLifecycleStatus === "unpaid")
        await settleOrderCredit(tx, order.id, "released", staff.userId);
      else {
        const previousRefunds = await tx
          .select()
          .from(refundAuthorizations)
          .where(eq(refundAuthorizations.orderId, order.id));
        mixedRefundAmount =
          order.purchaseTotalCents -
          previousRefunds
            .filter((a) => a.kind === "purchase_refund")
            .reduce((sum, a) => sum + a.amountCents, 0);
        if (mixedRefundAmount > 0)
          creditRefundAuthorization = await refundPurchaseInTransaction(tx, {
            orderId: order.id,
            amountCents: mixedRefundAmount,
            reason: input.reason,
            ownerUserId: staff.userId,
            requestKey: randomUUID(),
          });
      }
    }

    // Fetch and lock all receipts for this order
    const receipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, order.id));

    if (receipts.length > 0) {
      await acquireTransactionLocks(tx, {
        receiptIds: receipts.map((r) => r.id),
      });
    }

    // 3. Update order status to cancelled
    await tx
      .update(orders)
      .set({
        lifecycleStatus: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    let refundAuthorizedCents = mixedRefundAmount;
    const authorizationIds: string[] = creditRefundAuthorization
      ? [creditRefundAuthorization]
      : [];

    // 4. If funds were previously received on this order, authorize refund
    if (receipts.length > 0) {
      for (const receipt of receipts) {
        // Query existing allocations for this receipt
        const existingAllocations = await tx
          .select()
          .from(payoutAllocations)
          .where(eq(payoutAllocations.receiptId, receipt.id));

        const totalAlreadyAuthorized = existingAllocations.reduce(
          (sum, a) => sum + a.authorizedAmountCents,
          0,
        );
        const corrections = await tx
          .select()
          .from(paymentReceiptCorrections)
          .where(eq(paymentReceiptCorrections.receiptId, receipt.id));
        const availableCapacity = Math.max(
          0,
          receipt.amountCents +
            corrections.reduce((sum, c) => sum + c.deltaAmountCents, 0) -
            totalAlreadyAuthorized,
        );

        if (availableCapacity > 0) {
          const [auth] = await tx
            .insert(refundAuthorizations)
            .values({
              orderId: order.id,
              kind: "cancellation_refund",
              amountCents: availableCapacity,
              reason: `Order cancelled (${input.reason})`,
              authorizedByUserId: staff.userId,
            })
            .returning();

          await tx.insert(payoutAllocations).values({
            refundAuthorizationId: auth!.id,
            receiptId: receipt.id,
            authorizedAmountCents: availableCapacity,
          });

          authorizationIds.push(auth!.id);
          refundAuthorizedCents += availableCapacity;
        }
      }
    }

    // 5. Emit order.cancelled outbox event
    const [event] = await tx
      .insert(outboxEvents)
      .values({
        eventType: "order.cancelled",
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
          previousLifecycleStatus,
          refundAuthorizedCents,
          reason: input.reason,
          isCustomerRequest: Boolean(input.isCustomerRequest),
          guestEmail: order.guestEmail,
          cancelledAt: new Date().toISOString(),
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

    // 6. Audit record
    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: order.id,
      actorId: staff.userId,
      action: "order.cancelled",
      reason: input.reason,
      details: {
        orderId: order.id,
        referenceCode: order.referenceCode,
        previousLifecycleStatus,
        refundAuthorizedCents,
        authorizationIds,
        isCustomerRequest: Boolean(input.isCustomerRequest),
      },
    });

    return {
      orderId: order.id,
      previousLifecycleStatus,
      lifecycleStatus: "cancelled",
      refundAuthorizedCents,
      authorizationIds,
    };
  });
}
