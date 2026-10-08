import { eq, and, notInArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  payoutAllocations,
  payoutAttempts,
  payoutDestinationVerifications,
  paymentReceipts,
  stripeCheckoutAttempts,
  stripeRefundIntents,
  outgoingTransfers,
  orders,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { DomainError, NotFoundError } from "@/application/common/errors";
import { parseActionUuid } from "@/application/common/request-validation";
import {
  stripeFromEnvironment,
  type StripeAdapter,
} from "@/infrastructure/payments/stripe";
import { reconcilePayout } from "@/application/use-cases/refund-payout";
import type { Destination } from "@/domain/financial-projection/discrepancies";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { stripeCurrencyIssue } from "@/domain/stripe-currency";

/** A refund consumes an existing authorized original-receipt allocation, never a caller supplied payment ID or amount. */
export async function sendStripeRefund(
  input: { allocationId: string; ownerUserId: string },
  adapter: StripeAdapter = stripeFromEnvironment(),
) {
  const allocationId = parseActionUuid(input.allocationId, "Allocation");
  const intent = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.ownerUserId, "owner");
    const [initial] = await tx
      .select({
        orderId: paymentReceipts.orderId,
        receiptId: paymentReceipts.id,
      })
      .from(payoutAllocations)
      .innerJoin(
        paymentReceipts,
        eq(paymentReceipts.id, payoutAllocations.receiptId),
      )
      .where(eq(payoutAllocations.id, allocationId));
    if (!initial) throw new NotFoundError("Refund allocation not found.");
    await acquireTransactionLocks(tx, {
      orderIds: [initial.orderId],
      receiptIds: [initial.receiptId],
      allocationIds: [allocationId],
    });
    const [existing] = await tx
      .select()
      .from(stripeRefundIntents)
      .where(eq(stripeRefundIntents.allocationId, allocationId));
    const [allocation] = await tx
      .select()
      .from(payoutAllocations)
      .where(eq(payoutAllocations.id, allocationId));
    const [checkout] = await tx
      .select()
      .from(stripeCheckoutAttempts)
      .where(
        and(
          eq(stripeCheckoutAttempts.receiptId, initial.receiptId),
          eq(stripeCheckoutAttempts.status, "paid"),
        ),
      );
    if (!checkout?.paymentIntentId)
      throw new DomainError(
        "This allocation is not funded by a settled Stripe payment.",
      );
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, initial.orderId));
    const terms = order!.termsSnapshot as QuoteTerms;
    const unitIssue =
      stripeCurrencyIssue(
        terms.currency,
        terms.precision,
        checkout.amountCents,
      ) ||
      stripeCurrencyIssue(
        terms.currency,
        terms.precision,
        existing?.amountCents ??
          allocation!.authorizedAmountCents - allocation!.settledAmountCents,
      );
    if (
      unitIssue ||
      typeof terms.currency !== "string" ||
      checkout.currency !== terms.currency.toLowerCase() ||
      (existing && existing.currency !== checkout.currency)
    )
      throw new DomainError(
        unitIssue || "Original payment currency units require merchant review.",
      );
    if (existing) return existing;
    const amountCents =
      allocation!.authorizedAmountCents - allocation!.settledAmountCents;
    if (amountCents <= 0)
      throw new DomainError("Refund allocation is already settled.");
    const attempts = await tx
      .select()
      .from(payoutAttempts)
      .where(eq(payoutAttempts.allocationId, allocationId));
    if (
      attempts.some(
        (a) => a.status === "sending" || a.status === "reconciliation_required",
      )
    )
      throw new DomainError(
        "An unresolved payout already holds this allocation.",
      );
    const destination: Destination = {
      type: "card",
      accountNumberHash: checkout.paymentIntentId,
    };
    const [verification] = await tx
      .insert(payoutDestinationVerifications)
      .values({
        receiptId: initial.receiptId,
        destinationData: destination,
        verifiedByUserId: input.ownerUserId,
      })
      .returning();
    const [attempt] = await tx
      .insert(payoutAttempts)
      .values({
        allocationId,
        destinationVerificationId: verification!.id,
        claimedAmountCents: amountCents,
        claimedByUserId: input.ownerUserId,
        status: "sending",
      })
      .returning();
    const [saved] = await tx
      .insert(stripeRefundIntents)
      .values({
        allocationId,
        payoutAttemptId: attempt!.id,
        paymentIntentId: checkout.paymentIntentId,
        amountCents,
        currency: checkout.currency,
        idempotencyKey: `refund:${allocationId}`,
      })
      .returning();
    return saved!;
  });
  if (intent.status === "succeeded" || intent.status === "review")
    return { id: intent.id, status: intent.status };
  if (
    !intent.refundId &&
    Date.now() - intent.createdAt.getTime() > 23 * 3600000
  ) {
    await db
      .update(stripeRefundIntents)
      .set({ status: "review", updatedAt: new Date() })
      .where(eq(stripeRefundIntents.id, intent.id));
    throw new DomainError(
      "Uncertain refund creation exceeded the safe provider retry window; reconcile the original payment before retrying.",
    );
  }
  // Retries use the same original payment, amount and identity, even after an uncertain network failure.
  const refund = intent.refundId
    ? await adapter.retrieveRefund(intent.refundId)
    : await adapter.createRefund({
        paymentIntentId: intent.paymentIntentId,
        amountCents: intent.amountCents,
        idempotencyKey: intent.idempotencyKey,
      });
  if (
    refund.payment_intent !== intent.paymentIntentId ||
    refund.amount !== intent.amountCents ||
    refund.currency !== intent.currency
  ) {
    await db
      .update(stripeRefundIntents)
      .set({ status: "review", updatedAt: new Date() })
      .where(eq(stripeRefundIntents.id, intent.id));
    throw new DomainError(
      "Provider refund does not match its authorized original source; merchant review required.",
    );
  }
  await db
    .update(stripeRefundIntents)
    .set({
      refundId: refund.id,
      status:
        refund.status === "failed" ||
        refund.status === "canceled" ||
        refund.status === "requires_action"
          ? "review"
          : "pending",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripeRefundIntents.id, intent.id),
        notInArray(stripeRefundIntents.status, ["succeeded", "review"]),
      ),
    );
  if (refund.status !== "succeeded")
    return {
      id: intent.id,
      status: refund.status === "pending" ? "pending" : "review",
    };
  const destination: Destination = {
    type: "card",
    accountNumberHash: intent.paymentIntentId,
  };
  const existing = await db
    .select({ id: outgoingTransfers.id })
    .from(outgoingTransfers)
    .where(eq(outgoingTransfers.transferReference, refund.id))
    .limit(1);
  if (!existing.length) {
    try {
      await reconcilePayout({
        ownerUserId: input.ownerUserId,
        attemptId: intent.payoutAttemptId,
        actualAmountCents: refund.amount,
        transferReference: refund.id,
        actualDestination: destination,
      });
    } catch (error) {
      // A concurrent retry may have settled the same unique provider transfer. Never issue a second refund.
      if (
        !(
          await db
            .select({ id: outgoingTransfers.id })
            .from(outgoingTransfers)
            .where(eq(outgoingTransfers.transferReference, refund.id))
            .limit(1)
        ).length
      )
        throw error;
    }
  }
  await db
    .update(stripeRefundIntents)
    .set({ status: "succeeded", updatedAt: new Date() })
    .where(eq(stripeRefundIntents.id, intent.id));
  return { id: intent.id, status: "succeeded" };
}
