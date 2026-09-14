import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentReceipts,
  paymentReceiptCorrections,
  confirmationFunding,
  paymentReturns,
  payoutAllocations,
  auditRecords,
} from "@/infrastructure/db/schema";
import { computeOrderFinancialProjection } from "@/domain/financial-projection/projection";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface AuthorizeSurplusReturnInput {
  orderId: string;
  receiptId: string;
  amountCents: number;
  reason?: string;
  ownerUserId: string;
}

export interface AuthorizeSurplusReturnOutput {
  paymentReturnId: string;
  orderId: string;
  receiptId: string;
  amountCents: number;
  kind: "excess_return" | "late_return";
}

/**
 * Authorizes return of surplus overpayment or late payment on a cancelled order (A7).
 * Caps authorized amount by receipt capacity and unassigned/surplus funds.
 */
export async function authorizeSurplusReturn(
  input: AuthorizeSurplusReturnInput,
): Promise<AuthorizeSurplusReturnOutput> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new InvariantViolationError(
      `Surplus return amount must be > 0. Received: ${input.amountCents}`,
    );
  }

  return await db.transaction(async (tx) => {
    // 1. Owner verification
    const owner = await verifyStaffInTransaction(
      tx,
      input.ownerUserId,
      "owner",
    );

    // 2. Lock order and receipt
    await acquireTransactionLocks(tx, {
      orderIds: [input.orderId],
      receiptIds: [input.receiptId],
    });

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    if (!order) throw new NotFoundError(`Order '${input.orderId}' not found.`);

    const receipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, order.id));
    const receipt = receipts.find(
      (item) => item.id === input.receiptId && item.orderId === order.id,
    );
    if (!receipt)
      throw new NotFoundError("Receipt does not belong to this order.");
    const receiptIds = receipts.map((item) => item.id);
    await acquireTransactionLocks(tx, { receiptIds });
    const corrections = await tx
      .select()
      .from(paymentReceiptCorrections)
      .where(inArray(paymentReceiptCorrections.receiptId, receiptIds));
    const allocations = await tx
      .select()
      .from(payoutAllocations)
      .where(inArray(payoutAllocations.receiptId, receiptIds));
    const funding = await tx
      .select()
      .from(confirmationFunding)
      .where(eq(confirmationFunding.orderId, order.id));
    const isConfirmed =
      order.lifecycleStatus === "confirmed" ||
      order.lifecycleStatus === "completed";
    const projection = computeOrderFinancialProjection({
      purchaseTotalCents: order.purchaseTotalCents,
      isConfirmed,
      isCancelled: order.lifecycleStatus === "cancelled",
      receipts: receipts.map((item) => {
        const dispositions = allocations.filter(
          (allocation) => allocation.receiptId === item.id,
        );
        return {
          id: item.id,
          originalAmountCents: item.amountCents,
          appliedCorrectionsCents: corrections
            .filter((correction) => correction.receiptId === item.id)
            .reduce((sum, correction) => sum + correction.deltaAmountCents, 0),
          frozenPurchaseFundingCents: funding
            .filter((entry) => entry.receiptId === item.id)
            .reduce((sum, entry) => sum + entry.fundedAmountCents, 0),
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
            .reduce(
              (sum, allocation) => sum + allocation.settledAmountCents,
              0,
            ),
          settledNonPurchaseReturnsCents: dispositions
            .filter((allocation) => allocation.paymentReturnId)
            .reduce(
              (sum, allocation) => sum + allocation.settledAmountCents,
              0,
            ),
        };
      }),
    });
    const projectedReceipt = projection.receipts.find(
      (item) => item.id === receipt.id,
    )!;
    const availableCapacity =
      order.lifecycleStatus === "cancelled"
        ? projectedReceipt.availablePayoutCapacityCents
        : Math.min(
            projectedReceipt.newExcessReturnCapacityCents,
            projection.orderWideExcessCapacityCents,
          );
    if (input.amountCents > availableCapacity) {
      throw new InvariantViolationError(
        "Surplus return exceeds the available excess payment capacity.",
      );
    }

    const kind: "excess_return" | "late_return" =
      order.lifecycleStatus === "cancelled" ? "late_return" : "excess_return";

    const [paymentReturn] = await tx
      .insert(paymentReturns)
      .values({
        orderId: order.id,
        kind,
        amountCents: input.amountCents,
        reason:
          input.reason ||
          (kind === "late_return"
            ? "Return Required - Paid After Cancellation"
            : "Surplus overpayment return"),
      })
      .returning();

    const [allocation] = await tx
      .insert(payoutAllocations)
      .values({
        paymentReturnId: paymentReturn!.id,
        receiptId: receipt.id,
        authorizedAmountCents: input.amountCents,
      })
      .returning();

    await tx.insert(auditRecords).values({
      entityType: "payment_return",
      entityId: paymentReturn!.id,
      actorId: owner.userId,
      action: "payment.surplus_return_authorized",
      reason: paymentReturn!.reason,
      details: {
        orderId: order.id,
        receiptId: receipt.id,
        amountCents: input.amountCents,
        kind,
      },
    });

    return {
      paymentReturnId: paymentReturn!.id,
      orderId: order.id,
      receiptId: receipt.id,
      amountCents: input.amountCents,
      kind,
    };
  });
}
