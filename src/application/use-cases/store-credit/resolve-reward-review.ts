import { and, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  storeCreditAccounts,
  storeCreditEntries,
  creditSourceLots,
  confirmationFunding,
  paymentReceipts,
  paymentReceiptCorrections,
  rewardReconciliations,
  rewardFundingReviews,
  auditRecords,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
import { creditHash, lockCreditAccount } from "./credit-operations";
import { offsetRewardDebts } from "./credit-sources";
import { releaseOrderReward, rewardRefundTarget } from "./reward-operations";

/** Resolves only repaired original funding: another receipt cannot substitute
 * for a corrected frozen source. No financial email/outbox is emitted. */
export async function resolveRewardFundingReview(input: {
  orderId: string;
  actorId: string;
  requestKey: string;
  reason: string;
}) {
  const orderId = parseActionUuid(input.orderId, "Order"),
    requestKey = parseActionUuid(input.requestKey, "Review request");
  const reason = parseActionRequiredText(
    input.reason,
    "Verified funding evidence and review reason",
    1000,
  );
  const payloadHash = creditHash([orderId, input.actorId, reason]);
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.actorId, "owner");
    await acquireTransactionLocks(tx, { orderIds: [orderId] });
    const [retry] = await tx
      .select()
      .from(rewardFundingReviews)
      .where(eq(rewardFundingReviews.requestKey, requestKey));
    if (retry) {
      if (retry.payloadHash !== payloadHash)
        throw new ConflictError(
          "Reward review request was used with different input.",
        );
      return retry.id;
    }
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!order) throw new NotFoundError("Order not found.");
    if (
      !order.rewardFundingReview ||
      !order.rewardSnapshot ||
      !order.customerId
    )
      throw new DomainError("This order has no pending reward funding review.");
    const terms = order.termsSnapshot as {
      currency: string;
      precision: number;
    };
    await tx
      .insert(storeCreditAccounts)
      .values({
        customerId: order.customerId,
        currency: terms.currency,
        precision: terms.precision,
      })
      .onConflictDoNothing();
    const [existingAccount] = await tx
      .select()
      .from(storeCreditAccounts)
      .where(
        and(
          eq(storeCreditAccounts.customerId, order.customerId),
          eq(storeCreditAccounts.currency, terms.currency),
        ),
      );
    const account = existingAccount
      ? await lockCreditAccount(tx, existingAccount.id)
      : null;
    if (account && account.precision !== terms.precision)
      throw new DomainError("Credit precision requires review.");
    const funding = await tx
      .select()
      .from(confirmationFunding)
      .where(eq(confirmationFunding.orderId, orderId));
    const expectedExternal = order.rewardSnapshot.allocations.reduce(
      (sum, item) => sum + item.externalAmount,
      0,
    );
    if (
      funding.reduce((sum, item) => sum + item.fundedAmountCents, 0) !==
        order.purchaseTotalCents ||
      funding
        .filter((item) => item.receiptId)
        .reduce((sum, item) => sum + item.fundedAmountCents, 0) !==
        expectedExternal
    )
      throw new DomainError(
        "Original accepted funding does not reconcile. Repair its source history first.",
      );
    await acquireTransactionLocks(tx, {
      receiptIds: funding.flatMap((item) =>
        item.receiptId ? [item.receiptId] : [],
      ),
    });
    for (const source of funding.filter((item) => item.receiptId)) {
      const [receipt] = await tx
        .select()
        .from(paymentReceipts)
        .where(
          and(
            eq(paymentReceipts.id, source.receiptId!),
            eq(paymentReceipts.orderId, orderId),
          ),
        );
      const corrections = await tx
        .select()
        .from(paymentReceiptCorrections)
        .where(eq(paymentReceiptCorrections.receiptId, source.receiptId!));
      if (
        !receipt ||
        receipt.amountCents +
          corrections.reduce((sum, item) => sum + item.deltaAmountCents, 0) <
          source.fundedAmountCents
      )
        throw new DomainError(
          "A frozen original receipt still has a funding shortfall. Verify and correct that receipt before clearing review.",
        );
    }
    const target = await rewardRefundTarget(tx, orderId, order.rewardSnapshot);
    const [lot] = await tx
      .select()
      .from(creditSourceLots)
      .where(eq(creditSourceLots.rewardOrderId, orderId));
    let restoredCents = 0,
      cancelledDebtCents = 0,
      creditedCents = 0,
      recoveredOtherDebtCents = 0;
    if (lot) {
      if (!account || lot.accountId !== account.id)
        throw new DomainError("Reward source ownership requires review.");
      const [released] = await tx
        .select()
        .from(rewardReconciliations)
        .where(
          eq(rewardReconciliations.requestKey, `reward:release:${orderId}`),
        );
      const [adjustments] = await tx
        .select({
          net: sql<number>`coalesce(sum(${rewardReconciliations.reversedCents} - ${rewardReconciliations.restoredCents}),0)::bigint`,
        })
        .from(rewardReconciliations)
        .where(eq(rewardReconciliations.orderId, orderId));
      const currentEntitlement =
        (released?.targetCents ?? order.rewardSnapshot.entitlement) -
        Number(adjustments?.net ?? 0);
      restoredCents = Math.max(0, target - currentEntitlement);
      cancelledDebtCents = Math.min(restoredCents, lot.debtCents);
      await tx
        .update(creditSourceLots)
        .set({
          debtCents: lot.debtCents - cancelledDebtCents,
          revokedPendingCents:
            lot.revokedPendingCents -
            Math.min(restoredCents, lot.revokedPendingCents),
        })
        .where(eq(creditSourceLots.id, lot.id));
      const offset = await offsetRewardDebts(
        tx,
        account.id,
        restoredCents - cancelledDebtCents,
      );
      creditedCents = offset.netCents;
      recoveredOtherDebtCents = offset.recoveredCents;
      if (account.balanceCents + creditedCents > 2147483647)
        throw new DomainError(
          "Restored reward exceeds supported credit balance.",
        );
      if (creditedCents) {
        await tx.insert(storeCreditEntries).values({
          accountId: account.id,
          amountCents: creditedCents,
          kind: "refund",
          orderId,
          reason: "Reward restored after verified original funding repair",
          actorId: input.actorId,
          requestKey: `reward:review:${requestKey}`,
          payloadHash,
        });
        await tx
          .update(storeCreditAccounts)
          .set({
            balanceCents: account.balanceCents + creditedCents,
            revision: account.revision + 1,
          })
          .where(eq(storeCreditAccounts.id, account.id));
        await tx
          .update(creditSourceLots)
          .set({ remainingCents: lot.remainingCents + creditedCents })
          .where(eq(creditSourceLots.id, lot.id));
      }
      await tx.insert(rewardReconciliations).values({
        orderId,
        requestKey: `reward:restore:${requestKey}`,
        targetCents: target,
        reversedCents: 0,
        restoredCents,
      });
    }
    await tx
      .update(orders)
      .set({ rewardFundingReview: false })
      .where(eq(orders.id, orderId));
    if (!lot) await releaseOrderReward(tx, orderId, input.actorId);
    const [review] = await tx
      .insert(rewardFundingReviews)
      .values({
        orderId,
        requestKey,
        actorId: input.actorId,
        reason,
        payloadHash,
      })
      .returning();
    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: orderId,
      actorId: input.actorId,
      action: "reward.funding_review_resolved",
      reason,
      details: {
        reviewId: review!.id,
        target,
        restoredCents,
        cancelledDebtCents,
        creditedCents,
        recoveredOtherDebtCents,
        verifiedReceiptIds: funding.flatMap((item) =>
          item.receiptId ? [item.receiptId] : [],
        ),
      },
    });
    return review!.id;
  });
}
