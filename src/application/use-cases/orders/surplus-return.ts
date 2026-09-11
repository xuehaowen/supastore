import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  paymentReceipts,
  paymentReturns,
  payoutAllocations,
  auditRecords,
} from "@/infrastructure/db/schema";
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
  input: AuthorizeSurplusReturnInput
): Promise<AuthorizeSurplusReturnOutput> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new InvariantViolationError(
      `Surplus return amount must be > 0. Received: ${input.amountCents}`
    );
  }

  return await db.transaction(async (tx) => {
    // 1. Owner verification
    const owner = await verifyStaffInTransaction(tx, input.ownerUserId, "owner");

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

    const [receipt] = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.id, input.receiptId))
      .limit(1);
    if (!receipt) throw new NotFoundError(`Receipt '${input.receiptId}' not found.`);

    // Check receipt allocation capacity
    const existingAllocations = await tx
      .select()
      .from(payoutAllocations)
      .where(eq(payoutAllocations.receiptId, receipt.id));

    const totalAuthorized = existingAllocations.reduce(
      (sum, a) => sum + a.authorizedAmountCents,
      0
    );
    const availableReceiptCapacity = Math.max(
      0,
      receipt.amountCents - totalAuthorized
    );

    if (input.amountCents > availableReceiptCapacity) {
      throw new InvariantViolationError(
        `Surplus return amount (${input.amountCents} cents) exceeds available receipt capacity (${availableReceiptCapacity} cents).`
      );
    }

    const kind: "excess_return" | "late_return" =
      order.lifecycleStatus === "cancelled"
        ? "late_return"
        : "excess_return";

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
