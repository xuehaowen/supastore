import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  confirmationFunding,
  paymentReceipts,
  paymentReceiptCorrections,
  payoutAllocations,
  refundAuthorizations,
  storeCreditReservations,
  storeCreditEntries,
  storeCreditAccounts,
  storeCreditRefundSettlements,
  auditRecords,
} from "@/infrastructure/db/schema";
import type { Transaction } from "@/application/common/transaction";
import { allocateCumulativeRefund } from "@/domain/store-credit/refund-allocation";
import { computeReceiptProjection } from "@/domain/financial-projection/projection";
import { lockCreditAccount, creditHash } from "./credit-operations";
import { refundCreditSources } from "./credit-sources";
import { reconcileOrderReward } from "./reward-operations";
import {
  accumulateRewardComponentRefunds,
  type RewardComponentRefund,
} from "@/domain/rewards";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  DomainError,
  ConflictError,
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";

function normalizeComponentRefunds(value?: readonly RewardComponentRefund[]) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 1000)
    throw new DomainError("Refund component allocations are required.");
  return value
    .map((item) => {
      const componentId = parseActionRequiredText(
        item.componentId,
        "Refund component",
        200,
      );
      const externalCents = parseActionInteger(
        item.externalCents,
        "Component external refund",
        0,
        2147483647,
      );
      const creditCents = parseActionInteger(
        item.creditCents,
        "Component credit refund",
        0,
        2147483647,
      );
      if (!externalCents && !creditCents)
        throw new DomainError("Refund components must have a positive amount.");
      return { componentId, externalCents, creditCents };
    })
    .sort((a, b) =>
      a.componentId < b.componentId
        ? -1
        : a.componentId > b.componentId
          ? 1
          : 0,
    );
}

export async function refundPurchaseInTransaction(
  tx: Transaction,
  input: {
    orderId: string;
    amountCents: number;
    reason: string;
    ownerUserId: string;
    requestKey: string;
    componentRefunds?: RewardComponentRefund[];
  },
) {
  const componentRefunds = normalizeComponentRefunds(input.componentRefunds);
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId));
  if (!order || !["confirmed", "completed"].includes(order.lifecycleStatus))
    throw new DomainError(
      "Only confirmed purchases can be refunded. Unpaid orders must be cancelled.",
    );
  const [retry] = await tx
    .select()
    .from(refundAuthorizations)
    .where(eq(refundAuthorizations.id, input.requestKey));
  if (retry) {
    if (
      retry.orderId !== order.id ||
      retry.amountCents !== input.amountCents ||
      retry.authorizedByUserId !== input.ownerUserId ||
      retry.reason !== input.reason ||
      retry.kind !== "purchase_refund" ||
      creditHash(retry.componentRefunds ?? null) !==
        creditHash(componentRefunds ?? null)
    )
      throw new ConflictError(
        "Refund request key was already used with different input.",
      );
    return retry.id;
  }
  const funding = await tx
    .select()
    .from(confirmationFunding)
    .where(eq(confirmationFunding.orderId, order.id));
  if (
    !funding.length ||
    funding.reduce((sum, f) => sum + f.fundedAmountCents, 0) !==
      order.purchaseTotalCents
  )
    throw new InvariantViolationError(
      "Original funding does not reconcile. Owner review is required.",
    );
  const previous = await tx
    .select()
    .from(refundAuthorizations)
    .where(
      and(
        eq(refundAuthorizations.orderId, order.id),
        eq(refundAuthorizations.kind, "purchase_refund"),
      ),
    );
  const priorTotal = previous.reduce((sum, a) => sum + a.amountCents, 0);
  if (priorTotal + input.amountCents > order.purchaseTotalCents)
    throw new DomainError("Refund exceeds the remaining purchase entitlement.");
  const sources = funding.map((f) => ({
    id: f.id,
    fundedCents: f.fundedAmountCents,
  }));
  const before = allocateCumulativeRefund(priorTotal, sources);
  const after = allocateCumulativeRefund(
    priorTotal + input.amountCents,
    sources,
  );
  // Existing receipt-specific refunds may not follow the cumulative allocation.
  // Continue from their actual source usage, preserving every original source cap.
  const previousIds = previous.map((a) => a.id);
  const oldAllocations = previousIds.length
    ? await tx
        .select()
        .from(payoutAllocations)
        .where(inArray(payoutAllocations.refundAuthorizationId, previousIds))
    : [];
  const oldCredit = previousIds.length
    ? await tx
        .select()
        .from(storeCreditRefundSettlements)
        .where(
          inArray(
            storeCreditRefundSettlements.refundAuthorizationId,
            previousIds,
          ),
        )
    : [];
  const used = new Map(
    funding.map((f) => [
      f.id,
      f.receiptId
        ? oldAllocations
            .filter((a) => a.receiptId === f.receiptId)
            .reduce((sum, a) => sum + a.authorizedAmountCents, 0)
        : oldCredit.reduce((sum, a) => sum + a.amountCents, 0),
    ]),
  );
  if (
    [...used.values()].reduce((sum, value) => sum + value, 0) !== priorTotal ||
    funding.some((f) => used.get(f.id)! > f.fundedAmountCents)
  )
    throw new InvariantViolationError(
      "Historical refund sources do not reconcile. Owner review is required.",
    );
  const divergent = funding.some((f) => used.get(f.id) !== before.get(f.id));
  const remaining = funding
    .map((f) => ({
      id: f.id,
      fundedCents: f.fundedAmountCents - used.get(f.id)!,
    }))
    .filter((f) => f.fundedCents > 0);
  const continuation = divergent
    ? allocateCumulativeRefund(input.amountCents, remaining)
    : null;
  let splits = funding
    .map((f) => ({
      funding: f,
      amount: continuation
        ? (continuation.get(f.id) ?? 0)
        : after.get(f.id)! - before.get(f.id)!,
    }))
    .filter((s) => s.amount > 0);
  if (componentRefunds) {
    if (!order.rewardSnapshot)
      throw new DomainError(
        "This order has no component funding snapshot. Use the legacy amount-only refund.",
      );
    const desiredExternal = componentRefunds.reduce(
      (sum, item) => sum + item.externalCents,
      0,
    );
    const desiredCredit = componentRefunds.reduce(
      (sum, item) => sum + item.creditCents,
      0,
    );
    if (desiredExternal + desiredCredit !== input.amountCents)
      throw new DomainError(
        "Component refunds must equal the authorized amount.",
      );
    const history = [...previous]
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          (a.id < b.id ? -1 : 1),
      )
      .map((a) => ({
        externalCents: oldAllocations
          .filter((item) => item.refundAuthorizationId === a.id)
          .reduce((sum, item) => sum + item.authorizedAmountCents, 0),
        creditCents: oldCredit
          .filter((item) => item.refundAuthorizationId === a.id)
          .reduce((sum, item) => sum + item.amountCents, 0),
        componentRefunds: a.componentRefunds,
      }));
    try {
      accumulateRewardComponentRefunds(order.rewardSnapshot, [
        ...history,
        {
          externalCents: desiredExternal,
          creditCents: desiredCredit,
          componentRefunds,
        },
      ]);
    } catch (error) {
      throw new DomainError(
        error instanceof Error ? error.message : "Invalid component refund.",
      );
    }
    splits = [];
    for (const [isCredit, desired] of [
      [false, desiredExternal],
      [true, desiredCredit],
    ] as const) {
      if (!desired) continue;
      const available = funding
        .filter((item) => Boolean(item.creditEntryId) === isCredit)
        .map((item) => ({
          id: item.id,
          fundedCents: item.fundedAmountCents - used.get(item.id)!,
        }))
        .filter((item) => item.fundedCents > 0);
      if (available.reduce((sum, item) => sum + item.fundedCents, 0) < desired)
        throw new DomainError(
          "Component refund exceeds remaining original funding.",
        );
      const allocated = allocateCumulativeRefund(desired, available);
      for (const source of available) {
        const amount = allocated.get(source.id)!;
        if (amount)
          splits.push({
            funding: funding.find((item) => item.id === source.id)!,
            amount,
          });
      }
    }
  }
  const [hold] = await tx
    .select()
    .from(storeCreditReservations)
    .where(eq(storeCreditReservations.orderId, order.id));
  const creditAmount = splits
    .filter((s) => s.funding.creditEntryId)
    .reduce((sum, s) => sum + s.amount, 0);
  const account =
    creditAmount && hold?.status === "captured"
      ? await lockCreditAccount(tx, hold.accountId)
      : null;
  // Reward reversal uses the customer credit account even for cash-only refunds.
  // Acquire it before receipt locks to preserve the financial lock hierarchy.
  if (!account && order.customerId && order.rewardSnapshot) {
    const [rewardAccount] = await tx
      .select()
      .from(storeCreditAccounts)
      .where(
        and(
          eq(storeCreditAccounts.customerId, order.customerId),
          eq(
            storeCreditAccounts.currency,
            (order.termsSnapshot as { currency: string }).currency,
          ),
        ),
      );
    if (rewardAccount) await lockCreditAccount(tx, rewardAccount.id);
  }
  if (creditAmount && !account)
    throw new InvariantViolationError("Credit funding has no captured debit.");
  const receiptIds = splits.flatMap((s) =>
    s.funding.receiptId ? [s.funding.receiptId] : [],
  );
  await acquireTransactionLocks(tx, { receiptIds });
  for (const split of splits.filter((s) => s.funding.receiptId)) {
    const receiptId = split.funding.receiptId!;
    const [receipt] = await tx
      .select()
      .from(paymentReceipts)
      .where(
        and(
          eq(paymentReceipts.id, receiptId),
          eq(paymentReceipts.orderId, order.id),
        ),
      );
    if (!receipt) throw new NotFoundError("Original receipt not found.");
    const corrections = await tx
      .select()
      .from(paymentReceiptCorrections)
      .where(eq(paymentReceiptCorrections.receiptId, receiptId));
    const allocations = await tx
      .select()
      .from(payoutAllocations)
      .where(eq(payoutAllocations.receiptId, receiptId));
    const projected = computeReceiptProjection(
      {
        id: receiptId,
        originalAmountCents: receipt.amountCents,
        appliedCorrectionsCents: corrections.reduce(
          (sum, c) => sum + c.deltaAmountCents,
          0,
        ),
        frozenPurchaseFundingCents: split.funding.fundedAmountCents,
        effectivePurchaseRefundAuthorizationsCents: allocations
          .filter((a) => a.refundAuthorizationId)
          .reduce((sum, a) => sum + a.authorizedAmountCents, 0),
        effectiveNonPurchaseReturnAuthorizationsCents: allocations
          .filter((a) => a.paymentReturnId)
          .reduce((sum, a) => sum + a.authorizedAmountCents, 0),
        settledPurchaseRefundsCents: allocations
          .filter((a) => a.refundAuthorizationId)
          .reduce((sum, a) => sum + a.settledAmountCents, 0),
        settledNonPurchaseReturnsCents: allocations
          .filter((a) => a.paymentReturnId)
          .reduce((sum, a) => sum + a.settledAmountCents, 0),
      },
      true,
    );
    if (split.amount > projected.remainingPurchaseRefundCapacityCents)
      throw new InvariantViolationError(
        "Original-source refund capacity changed after a receipt correction. Investigate the funding shortfall before refunding; other sources will not be charged.",
      );
  }
  const [authorization] = await tx
    .insert(refundAuthorizations)
    .values({
      id: input.requestKey,
      orderId: order.id,
      kind: "purchase_refund",
      amountCents: input.amountCents,
      componentRefunds: componentRefunds ?? null,
      reason: input.reason,
      authorizedByUserId: input.ownerUserId,
    })
    .returning();
  for (const split of splits.filter((s) => s.funding.receiptId))
    await tx.insert(payoutAllocations).values({
      refundAuthorizationId: authorization!.id,
      receiptId: split.funding.receiptId!,
      authorizedAmountCents: split.amount,
      settledAmountCents: 0,
    });
  if (account && creditAmount) {
    if (account.balanceCents + creditAmount > 2147483647)
      throw new DomainError("Credit balance exceeds the supported limit.");
    const [entry] = await tx
      .insert(storeCreditEntries)
      .values({
        accountId: account.id,
        amountCents: creditAmount,
        kind: "refund",
        orderId: order.id,
        reason: input.reason,
        actorId: input.ownerUserId,
        requestKey: authorization!.id,
        payloadHash: creditHash([order.id, input.amountCents, input.reason]),
      })
      .returning();
    const recoveredCents = await refundCreditSources(tx, {
      accountId: account.id,
      reservationId: hold!.id,
      capturedCents: hold!.amountCents,
      amountCents: creditAmount,
      refundEntryId: entry!.id,
    });
    if (recoveredCents > 0) {
      await tx.insert(storeCreditEntries).values({
        accountId: account.id,
        amountCents: -recoveredCents,
        kind: "reversal",
        orderId: order.id,
        reason: "Restored revoked reward credit recovered",
        actorId: input.ownerUserId,
        requestKey: `source-refund:${authorization!.id}`,
        payloadHash: creditHash([authorization!.id, recoveredCents]),
      });
    }
    await tx
      .update(storeCreditAccounts)
      .set({
        balanceCents: account.balanceCents + creditAmount - recoveredCents,
        revision: account.revision + 1,
      })
      .where(eq(storeCreditAccounts.id, account.id));
    await tx.insert(storeCreditRefundSettlements).values({
      refundAuthorizationId: authorization!.id,
      creditEntryId: entry!.id,
      amountCents: creditAmount,
    });
  }
  await tx.insert(auditRecords).values({
    entityType: "refund_authorization",
    entityId: authorization!.id,
    actorId: input.ownerUserId,
    action: "refund.sources_allocated",
    reason: input.reason,
    details: {
      amountCents: input.amountCents,
      creditCents: creditAmount,
      sources: splits.map((s) => ({
        fundingId: s.funding.id,
        amountCents: s.amount,
      })),
    },
  });
  await reconcileOrderReward(
    tx,
    order.id,
    `reward:refund:${authorization!.id}`,
    input.ownerUserId,
  );
  return authorization!.id;
}
export async function refundPurchase(input: {
  orderId: string;
  amountCents: number;
  reason: string;
  ownerUserId: string;
  requestKey: string;
  componentRefunds?: RewardComponentRefund[];
}) {
  parseActionUuid(input.orderId, "Order");
  parseActionUuid(input.requestKey, "Refund request");
  const amountCents = parseActionInteger(
    input.amountCents,
    "Refund amount",
    1,
    2147483647,
  );
  const reason = parseActionRequiredText(input.reason, "Refund reason", 500);
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.ownerUserId, "owner");
    await acquireTransactionLocks(tx, { orderIds: [input.orderId] });
    return refundPurchaseInTransaction(tx, { ...input, amountCents, reason });
  });
}
