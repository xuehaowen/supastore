import { emitOrderEvent } from "@/application/common/events";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderProposals,
  paymentAccounts,
  paymentReceipts,
  cashReceiptSequences,
  cashReceiptDetails,
  auditRecords,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { computeOrderFinancialProjection } from "@/domain/financial-projection/projection";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface RecordCashReceiptInput {
  orderId: string;
  paymentAccountId: string;
  amountCents: number;
  tenderedAmountCents: number;
  payerName?: string;
  drawerName?: string;
  cashDrawerSessionId?: string;
  staffUserId: string;
}

export async function recordCashReceipt(input: RecordCashReceiptInput) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new InvariantViolationError(
      `Receipt amount must be greater than 0. Received: ${input.amountCents}`
    );
  }

  if (
    !Number.isSafeInteger(input.tenderedAmountCents) ||
    input.tenderedAmountCents < input.amountCents
  ) {
    throw new InvariantViolationError(
      `Tendered amount (${input.tenderedAmountCents}) cannot be less than receipt amount (${input.amountCents}).`
    );
  }

  const changeDueCents = input.tenderedAmountCents - input.amountCents;
  const currentYear = new Date().getFullYear();

  return await db.transaction(async (tx) => {
    // 1. In-transaction staff verification
    const staff = await verifyStaffInTransaction(tx, input.staffUserId);

    // 2. Lock order and payment account in canonical order
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
        `Payment account '${input.paymentAccountId}' not found.`
      );
    }
    if (!account.isActive) {
      throw new InvariantViolationError(
        `Payment account '${account.accountName}' is currently inactive.`
      );
    }

    // 3. Monotonic sequential cash receipt number generation under row lock
    const [seqRow] = await tx
      .insert(cashReceiptSequences)
      .values({
        year: currentYear,
        lastSequenceNumber: 1,
      })
      .onConflictDoUpdate({
        target: cashReceiptSequences.year,
        set: {
          lastSequenceNumber: sql`${cashReceiptSequences.lastSequenceNumber} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    const sequenceNumber = seqRow!.lastSequenceNumber;
    const formattedSeq = String(sequenceNumber).padStart(4, "0");
    const sequentialReference = `CASH-${currentYear}-${formattedSeq}`;

    // 4. Insert canonical payment receipt
    const [receipt] = await tx
      .insert(paymentReceipts)
      .values({
        orderId: order.id,
        paymentAccountId: account.id,
        amountCents: input.amountCents,
        rawReference: sequentialReference,
        normalizedReference: sequentialReference,
        recordedByUserId: staff.userId,
      })
      .returning();

    // 5. Insert cash receipt details
    const [cashDetails] = await tx
      .insert(cashReceiptDetails)
      .values({
        receiptId: receipt!.id,
        cashDrawerSessionId: input.cashDrawerSessionId || null,
        sequentialNumber: sequentialReference,
        drawerName: input.drawerName || "Main Register",
        payerName: input.payerName || null,
        tenderedAmountCents: input.tenderedAmountCents,
        changeDueCents,
      })
      .returning();

    // 6. Invalidate pending proposals
    const voided = await tx
      .update(orderProposals)
      .set({ status: "voided", resolvedAt: new Date() })
      .where(
        and(
          eq(orderProposals.orderId, order.id),
          eq(orderProposals.status, "pending")
        )
      )
      .returning();

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

    if (voided.length) {
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
        }
      );
    }

    // 7. Audit logging
    await tx.insert(auditRecords).values({
      entityType: "payment_receipt",
      entityId: receipt!.id,
      actorId: staff.userId,
      action: "payment.cash_receipt_recorded",
      reason: `Recorded cash receipt ${sequentialReference} for ${input.amountCents} cents`,
      details: {
        orderId: order.id,
        amountCents: input.amountCents,
        tenderedAmountCents: input.tenderedAmountCents,
        changeDueCents,
        sequentialNumber: sequentialReference,
        drawerName: input.drawerName || "Main Register",
      },
    });

    return {
      receiptId: receipt!.id,
      orderId: order.id,
      amountCents: receipt!.amountCents,
      tenderedAmountCents: input.tenderedAmountCents,
      changeDueCents,
      sequentialNumber: sequentialReference,
      projection,
    };
  });
}
