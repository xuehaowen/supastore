import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentReceipts,
  paymentReceiptCorrections,
  confirmationFunding,
  payoutAllocations,
  auditRecords,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { computeOrderFinancialProjection } from "@/domain/financial-projection/projection";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface CorrectReceiptInput {
  receiptId: string;
  deltaAmountCents: number; // e.g. -9000 for -$90.00 correction
  reason: string;
  investigationNotes?: string;
  ownerUserId: string;
}

export interface CrossOrderTransferReceiptInput {
  sourceOrderId: string;
  targetOrderId: string;
  receiptId: string;
  reason: string;
  investigationNotes?: string;
  ownerUserId: string;
}

/**
 * Audited receipt correction use case (A9).
 * Corrects a payment receipt's effective funding while preserving historical settled payouts.
 */
export async function correctReceipt(input: CorrectReceiptInput) {
  if (
    !Number.isSafeInteger(input.deltaAmountCents) ||
    input.deltaAmountCents === 0
  ) {
    throw new InvariantViolationError(
      "Correction deltaAmountCents must be a non-zero integer.",
    );
  }

  if (!input.reason?.trim()) {
    throw new InvariantViolationError("Correction reason is required.");
  }

  return await db.transaction(async (tx) => {
    // 1. Owner verification
    const owner = await verifyStaffInTransaction(
      tx,
      input.ownerUserId,
      "owner",
    );

    // Resolve ownership before acquiring locks in order → receipt sequence.
    const [reference] = await tx.select({ orderId: paymentReceipts.orderId })
      .from(paymentReceipts).where(eq(paymentReceipts.id, input.receiptId)).limit(1);
    if (!reference) throw new NotFoundError(`Receipt '${input.receiptId}' not found.`);
    await acquireTransactionLocks(tx, { orderIds: [reference.orderId], receiptIds: [input.receiptId] });

    const [receipt] = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.id, input.receiptId))
      .limit(1);

    if (!receipt) {
      throw new NotFoundError(`Receipt '${input.receiptId}' not found.`);
    }

    if (receipt.orderId !== reference.orderId)
      throw new InvariantViolationError("Receipt ownership changed during correction.");

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, receipt.orderId))
      .limit(1);

    // Sum existing corrections
    const existingCorrections = await tx
      .select()
      .from(paymentReceiptCorrections)
      .where(eq(paymentReceiptCorrections.receiptId, receipt.id));

    const totalPriorCorrections = existingCorrections.reduce(
      (sum, c) => sum + c.deltaAmountCents,
      0,
    );
    const newEffectiveAmount =
      receipt.amountCents + totalPriorCorrections + input.deltaAmountCents;

    if (newEffectiveAmount < 0) {
      throw new InvariantViolationError(
        `Correction would result in negative effective receipt amount (${newEffectiveAmount} cents).`,
      );
    }

    // Insert audited correction
    const [correction] = await tx
      .insert(paymentReceiptCorrections)
      .values({
        receiptId: receipt.id,
        deltaAmountCents: input.deltaAmountCents,
        reason: input.reason,
        investigationNotes: input.investigationNotes || null,
        correctedByUserId: owner.userId,
      })
      .returning();

    // Query all receipts and allocations to recompute projection
    const allReceipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, order!.id));

    const allFunding = await tx
      .select()
      .from(confirmationFunding)
      .where(eq(confirmationFunding.orderId, order!.id));

    const allAllocations = await tx
      .select()
      .from(payoutAllocations)
      .where(inArray(payoutAllocations.receiptId, allReceipts.map((r) => r.id)));
    const allCorrections = await tx.select().from(paymentReceiptCorrections)
      .where(inArray(paymentReceiptCorrections.receiptId, allReceipts.map((r) => r.id)));

    const projection = computeOrderFinancialProjection({
      purchaseTotalCents: order!.purchaseTotalCents,
      committedCreditCents: order!.creditAppliedCents ?? 0,
      isConfirmed:
        order!.lifecycleStatus === "confirmed" ||
        order!.lifecycleStatus === "completed",
      isCancelled: order!.lifecycleStatus === "cancelled",
      wasConfirmedBeforeCancellation: order!.lifecycleStatus === "cancelled" && allFunding.length > 0,
      receipts: allReceipts.map((r) => {
        const dispositions = allAllocations.filter((a) => a.receiptId === r.id);
        const sum = (kind: "purchase" | "return", settled: boolean) => dispositions
          .filter((a) => kind === "purchase" ? a.refundAuthorizationId : a.paymentReturnId)
          .reduce((total, a) => total + (settled ? a.settledAmountCents : a.authorizedAmountCents), 0);
        return {
          id: r.id,
          originalAmountCents: r.amountCents,
          appliedCorrectionsCents: allCorrections.filter((c) => c.receiptId === r.id)
            .reduce((total, c) => total + c.deltaAmountCents, 0),
          frozenPurchaseFundingCents: allFunding.filter((f) => f.receiptId === r.id)
            .reduce((total, f) => total + f.fundedAmountCents, 0),
          effectivePurchaseRefundAuthorizationsCents: sum("purchase", false),
          effectiveNonPurchaseReturnAuthorizationsCents: sum("return", false),
          settledPurchaseRefundsCents: sum("purchase", true),
          settledNonPurchaseReturnsCents: sum("return", true),
        };
      }),
    });

    await tx.insert(auditRecords).values({
      entityType: "payment_receipt",
      entityId: receipt.id,
      actorId: owner.userId,
      action: "payment.receipt_corrected",
      reason: input.reason,
      details: {
        orderId: order!.id,
        deltaAmountCents: input.deltaAmountCents,
        newEffectiveAmountCents: newEffectiveAmount,
        operationalFundingShortfallCents:
          projection.operationalFundingShortfallCents,
      },
    });

    return {
      correctionId: correction!.id,
      receiptId: receipt.id,
      orderId: order!.id,
      deltaAmountCents: input.deltaAmountCents,
      newEffectiveAmountCents: newEffectiveAmount,
      projection,
    };
  });
}

/**
 * Cross-order duplicate or misassigned receipt investigation & transfer (A9).
 * Acquires transaction locks on BOTH orders in strictly ascending canonical order
 * to prevent deadlocks and moves/re-allocates payment atomically.
 */
export async function crossOrderTransferReceipt(
  input: CrossOrderTransferReceiptInput,
) {
  if (input.sourceOrderId === input.targetOrderId) {
    throw new InvariantViolationError(
      "Source and target order IDs must be different.",
    );
  }

  return await db.transaction(async (tx) => {
    const owner = await verifyStaffInTransaction(
      tx,
      input.ownerUserId,
      "owner",
    );

    // Acquire locks on both orders in canonical ascending UUID order
    await acquireTransactionLocks(tx, {
      orderIds: [input.sourceOrderId, input.targetOrderId],
      receiptIds: [input.receiptId],
    });

    const [sourceOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.sourceOrderId))
      .limit(1);
    const [targetOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.targetOrderId))
      .limit(1);

    if (!sourceOrder)
      throw new NotFoundError(
        `Source order '${input.sourceOrderId}' not found.`,
      );
    if (!targetOrder)
      throw new NotFoundError(
        `Target order '${input.targetOrderId}' not found.`,
      );

    const [receipt] = await tx
      .select()
      .from(paymentReceipts)
      .where(
        and(
          eq(paymentReceipts.id, input.receiptId),
          eq(paymentReceipts.orderId, input.sourceOrderId),
        ),
      )
      .limit(1);

    if (!receipt) {
      throw new NotFoundError(
        `Receipt '${input.receiptId}' not found on source order.`,
      );
    }

    // 1. Correct source receipt down to 0
    await tx.insert(paymentReceiptCorrections).values({
      receiptId: receipt.id,
      deltaAmountCents: -receipt.amountCents,
      reason: `Transferred to order ${targetOrder.referenceCode}: ${input.reason}`,
      investigationNotes: input.investigationNotes || null,
      correctedByUserId: owner.userId,
    });

    // 2. Create corresponding receipt on target order
    const [transferredReceipt] = await tx
      .insert(paymentReceipts)
      .values({
        orderId: targetOrder.id,
        paymentAccountId: receipt.paymentAccountId,
        amountCents: receipt.amountCents,
        rawReference: receipt.rawReference,
        normalizedReference: `${receipt.normalizedReference}_XFER_${targetOrder.referenceCode.replace(/[^A-Z0-9]/g, "")}`,
        recordedByUserId: owner.userId,
      })
      .returning();

    // 3. Audit records for both orders
    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: sourceOrder.id,
      actorId: owner.userId,
      action: "payment.cross_order_transferred_out",
      reason: input.reason,
      details: {
        receiptId: receipt.id,
        targetOrderId: targetOrder.id,
        targetOrderReference: targetOrder.referenceCode,
        amountCents: receipt.amountCents,
      },
    });

    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: targetOrder.id,
      actorId: owner.userId,
      action: "payment.cross_order_transferred_in",
      reason: input.reason,
      details: {
        sourceOrderId: sourceOrder.id,
        sourceOrderReference: sourceOrder.referenceCode,
        newReceiptId: transferredReceipt!.id,
        amountCents: receipt.amountCents,
      },
    });

    return {
      success: true,
      sourceOrderId: sourceOrder.id,
      targetOrderId: targetOrder.id,
      transferredAmountCents: receipt.amountCents,
      newReceiptId: transferredReceipt!.id,
    };
  });
}
