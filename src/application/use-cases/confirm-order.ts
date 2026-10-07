import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { settleOrderCredit } from "./store-credit/credit-operations";
import {
  orders,
  paymentReceipts,
  paymentReceiptCorrections,
  payoutAllocations,
  payoutAttempts,
  payoutDiscrepancies,
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
  return db.transaction(async tx => {
    const staff = await verifyStaffInTransaction(tx, input.staffUserId);
    return confirmOrderInTransaction(tx, input.orderId, staff.userId);
  });
}
/** Trusted application entry point: caller authorizes staff or verified provider settlement. */
export async function confirmOrderInTransaction(tx: import("@/application/common/transaction").Transaction, orderId: string, actorId: string) {
  const input = { orderId };
  const staff = { userId: actorId };
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

    // Capture under the credit lock before acquiring later-ranked receipt locks.
    // Any failed funding check rolls this transaction back, including the debit.
    if (order.creditAppliedCents)
      await settleOrderCredit(tx, order.id, "captured", staff.userId);
    // Fetch receipts and lock them
    const receipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, order.id));

    await acquireTransactionLocks(tx, {
      receiptIds: receipts.map((r) => r.id),
    });

    const receiptIds = receipts.map((receipt) => receipt.id);
    const corrections = receiptIds.length
      ? await tx
          .select()
          .from(paymentReceiptCorrections)
          .where(inArray(paymentReceiptCorrections.receiptId, receiptIds))
      : [];
    const allocations = receiptIds.length
      ? await tx
          .select()
          .from(payoutAllocations)
          .where(inArray(payoutAllocations.receiptId, receiptIds))
      : [];
    const attempts = allocations.length
      ? await tx
          .select()
          .from(payoutAttempts)
          .where(
            inArray(
              payoutAttempts.allocationId,
              allocations.map((allocation) => allocation.id),
            ),
          )
      : [];
    const discrepancies = attempts.length
      ? await tx
          .select()
          .from(payoutDiscrepancies)
          .where(
            inArray(
              payoutDiscrepancies.payoutAttemptId,
              attempts.map((attempt) => attempt.id),
            ),
          )
      : [];
    if (
      attempts.some(
        (attempt) =>
          attempt.status === "sending" ||
          attempt.status === "reconciliation_required",
      ) ||
      discrepancies.some((discrepancy) => discrepancy.status === "open")
    ) {
      throw new InvariantViolationError(
        "Cannot confirm order while a payout hold remains unresolved.",
      );
    }
    const financialReceipts = receipts.map((receipt) => {
      const dispositions = allocations.filter(
        (allocation) => allocation.receiptId === receipt.id,
      );
      return {
        id: receipt.id,
        originalAmountCents: receipt.amountCents,
        appliedCorrectionsCents: corrections
          .filter((correction) => correction.receiptId === receipt.id)
          .reduce((sum, correction) => sum + correction.deltaAmountCents, 0),
        effectivePurchaseRefundAuthorizationsCents: dispositions
          .filter((allocation) => allocation.refundAuthorizationId)
          .reduce(
            (sum, allocation) => sum + allocation.authorizedAmountCents,
            0,
          ),
        effectiveNonPurchaseReturnAuthorizationsCents: dispositions
          .filter((allocation) => allocation.paymentReturnId)
          .reduce(
            (sum, allocation) => sum + allocation.authorizedAmountCents,
            0,
          ),
        settledPurchaseRefundsCents: dispositions
          .filter((allocation) => allocation.refundAuthorizationId)
          .reduce((sum, allocation) => sum + allocation.settledAmountCents, 0),
        settledNonPurchaseReturnsCents: dispositions
          .filter((allocation) => allocation.paymentReturnId)
          .reduce((sum, allocation) => sum + allocation.settledAmountCents, 0),
      };
    });
    const projection = computeOrderFinancialProjection({
      purchaseTotalCents: order.purchaseTotalCents,
      committedCreditCents: order.creditAppliedCents ?? 0,
      isConfirmed: false,
      isCancelled: false,
      receipts: financialReceipts,
    });

    const externalDue =
      order.purchaseTotalCents - (order.creditAppliedCents ?? 0);
    if (projection.netReceivedCents !== externalDue) {
      throw new InvariantViolationError(
        projection.netReceivedCents > externalDue
          ? "Order is overfunded. Return the surplus before confirmation."
          : `Order is underfunded. External required: ${externalDue} cents, Net Received: ${projection.netReceivedCents} cents.`,
      );
    }

    if (projection.totalUnsentRemainderCents > 0) {
      throw new InvariantViolationError(
        "Cannot confirm order while open excess returns remain unsettled.",
      );
    }

    // Freeze confirmation funding (Fi)
    let remainingToFund = externalDue;
    for (const r of financialReceipts) {
      const fundAmount = Math.min(
        Math.max(
          0,
          r.originalAmountCents +
            r.appliedCorrectionsCents -
            r.settledNonPurchaseReturnsCents,
        ),
        remainingToFund,
      );
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

}
