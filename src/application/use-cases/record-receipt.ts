import { emitOrderEvent } from "@/application/common/events";
import { eq, and } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderProposals,
  paymentAccounts,
  paymentReceipts,
  auditRecords,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { computeOrderFinancialProjection } from "@/domain/financial-projection/projection";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface RecordReceiptInput {
  orderId: string;
  paymentAccountId: string;
  amountCents: number;
  rawReference: string;
  staffUserId: string;
}

export async function recordReceipt(input: RecordReceiptInput) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new InvariantViolationError(
      `Receipt amount must be greater than 0. Received: ${input.amountCents}`,
    );
  }

  const normalizedReference = input.rawReference
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!normalizedReference) {
    throw new InvariantViolationError("Receipt reference cannot be empty.");
  }

  return await db.transaction(async (tx) => {
    // 1. In-transaction staff verification
    const staff = await verifyStaffInTransaction(tx, input.staffUserId);

    // 2. Acquire transaction locks in canonical order: Order then Payment Account
    await acquireTransactionLocks(tx, {
      orderIds: [input.orderId],
      paymentAccountIds: [input.paymentAccountId],
    });

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    if (!order) {
      throw new NotFoundError(`Order with ID '${input.orderId}' not found.`);
    }

    const [account] = await tx
      .select()
      .from(paymentAccounts)
      .where(eq(paymentAccounts.id, input.paymentAccountId))
      .limit(1);
    if (!account) {
      throw new NotFoundError(
        `Payment account '${input.paymentAccountId}' not found.`,
      );
    }
    if (!account.isActive) {
      throw new InvariantViolationError(
        `Payment account '${account.accountName}' is currently inactive.`,
      );
    }

    // Insert payment receipt
    const [receipt] = await tx
      .insert(paymentReceipts)
      .values({
        orderId: order.id,
        paymentAccountId: account.id,
        amountCents: input.amountCents,
        rawReference: input.rawReference,
        normalizedReference,
        recordedByUserId: staff.userId,
      })
      .returning();

    const voided = await tx
      .update(orderProposals)
      .set({ status: "voided", resolvedAt: new Date() })
      .where(
        and(
          eq(orderProposals.orderId, order.id),
          eq(orderProposals.status, "pending"),
        ),
      )
      .returning();
    // Query all receipts for this order to recompute projection
    const allReceipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, order.id));

    const projection = computeOrderFinancialProjection({
      purchaseTotalCents: order.purchaseTotalCents,
      isConfirmed:
        order.lifecycleStatus === "confirmed" ||
        order.lifecycleStatus === "completed",
      isCancelled: order.lifecycleStatus === "cancelled",
      receipts: allReceipts.map((r) => ({
        id: r.id,
        originalAmountCents: r.amountCents,
      })),
    });

    if (voided.length)
      await emitOrderEvent(
        tx,
        order.id,
        "order.change_invalidated",
        order.guestEmail,
        {
          orderId: order.id,
          receivedCents: projection.netReceivedCents,
          purchaseTotalCents: order.purchaseTotalCents,
          balanceCents: order.purchaseTotalCents - projection.netReceivedCents,
        },
      );
    // Record audit record
    await tx.insert(auditRecords).values({
      entityType: "payment_receipt",
      entityId: receipt!.id,
      actorId: staff.userId,
      action: "payment.receipt_recorded",
      reason: `Recorded payment receipt of ${input.amountCents} cents`,
      details: {
        orderId: order.id,
        amountCents: input.amountCents,
        reference: normalizedReference,
      },
    });

    return {
      receiptId: receipt!.id,
      orderId: order.id,
      amountCents: receipt!.amountCents,
      projection,
    };
  });
}
