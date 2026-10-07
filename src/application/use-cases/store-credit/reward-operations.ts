import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import { orders, storeCreditAccounts, storeCreditEntries, creditSourceLots, rewardReconciliations, refundAuthorizations, payoutAllocations, storeCreditRefundSettlements, auditRecords } from "@/infrastructure/db/schema";
import { DomainError } from "@/application/common/errors";
import { creditHash } from "./credit-operations";
import { createCreditSourceLot, offsetRewardDebts, reclaimRewardSource } from "./credit-sources";
import { allocateRewardFunding, calculateRewardRefundTarget, accumulateRewardComponentRefunds, type RewardSnapshot } from "@/domain/rewards";

export function proportionalRewardTarget(snapshot: RewardSnapshot, externalRefundCents: number) {
  const refunds = allocateRewardFunding(snapshot.allocations.map(item => ({ id: item.id, type: item.type, amount: item.externalAmount, eligible: false })), externalRefundCents);
  return calculateRewardRefundTarget(snapshot, Object.fromEntries(refunds.map(item => [item.id, item.externalAmount]))).targetEntitlement;
}
export async function rewardRefundTarget(tx: Transaction, orderId: string, snapshot: RewardSnapshot) {
  const authorizations = await tx.select().from(refundAuthorizations).where(and(eq(refundAuthorizations.orderId, orderId), eq(refundAuthorizations.kind, "purchase_refund")));
  const history = [];
  for (const authorization of authorizations.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))) {
    const external = await tx.select().from(payoutAllocations).where(eq(payoutAllocations.refundAuthorizationId, authorization.id));
    const credit = await tx.select().from(storeCreditRefundSettlements).where(eq(storeCreditRefundSettlements.refundAuthorizationId, authorization.id));
    history.push({externalCents: external.reduce((sum, item) => sum + item.authorizedAmountCents, 0),
      creditCents: credit.reduce((sum, item) => sum + item.amountCents, 0), componentRefunds: authorization.componentRefunds});
  }
  return calculateRewardRefundTarget(snapshot, accumulateRewardComponentRefunds(snapshot, history).external).targetEntitlement;
}

/** The accepted order snapshot is immutable; hold the order lock before calling. */
export async function releaseOrderReward(tx: Transaction, orderId: string, actorId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order?.customerId || !order.rewardSnapshot || !order.rewardSnapshot.entitlement || order.lifecycleStatus !== "completed") return;
  if (order.rewardFundingReview) return; // Preserve pending earning until audited source repair.
  const [existing] = await tx.select().from(creditSourceLots).where(eq(creditSourceLots.rewardOrderId, order.id));
  if (existing) return;
  const terms = order.termsSnapshot as { currency: string; precision: number };
  await tx.insert(storeCreditAccounts).values({ customerId: order.customerId, currency: terms.currency, precision: terms.precision }).onConflictDoNothing();
  const [account] = await tx.select().from(storeCreditAccounts).where(and(eq(storeCreditAccounts.customerId, order.customerId), eq(storeCreditAccounts.currency, terms.currency))).for("update");
  if (!account || account.precision !== terms.precision) throw new DomainError("Reward credit precision mismatch.");
  // Refunds before fulfillment reduce pending earning rather than issue/reverse it.
  const entitlement = await rewardRefundTarget(tx, order.id, order.rewardSnapshot);
  const { netCents, recoveredCents } = await offsetRewardDebts(tx, account.id, entitlement);
  if (account.balanceCents + netCents > 2147483647) throw new DomainError("Reward exceeds supported credit balance.");
  let sourceEntryId: string | undefined;
  if (netCents) {
    const [entry] = await tx.insert(storeCreditEntries).values({ accountId: account.id, amountCents: netCents, kind: "issue", orderId, reason: "Purchase reward", actorId, requestKey: `reward:${orderId}`, payloadHash: creditHash(order.rewardSnapshot) }).returning();
    sourceEntryId = entry!.id;
    await tx.update(storeCreditAccounts).set({ balanceCents: account.balanceCents + netCents, revision: account.revision + 1 }).where(eq(storeCreditAccounts.id, account.id));
  }
  await createCreditSourceLot(tx, { accountId: account.id, ...(sourceEntryId ? { sourceEntryId } : {}), kind: "reward", rewardOrderId: orderId, amountCents: netCents });
  await tx.insert(rewardReconciliations).values({ orderId, requestKey: `reward:release:${orderId}`, targetCents: entitlement, reversedCents: 0 });
  await tx.insert(auditRecords).values({ entityType: "order", entityId: orderId, actorId, action: "reward.earned", details: { entitlement, recoveredCents, netCents } });
}

/** Detailed refunds retain original component/source identity; amount-only
 * legacy authorizations use an explicit capped proportional fallback. */
export async function reconcileOrderReward(tx: Transaction, orderId: string, requestKey: string, actorId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order?.rewardSnapshot || !order.rewardSnapshot.entitlement) return;
  const [lot] = await tx.select().from(creditSourceLots).where(eq(creditSourceLots.rewardOrderId, order.id));
  if (!lot) return;
  const [account] = await tx.select().from(storeCreditAccounts).where(eq(storeCreditAccounts.id, lot.accountId)).for("update");
  const [retry] = await tx.select().from(rewardReconciliations).where(eq(rewardReconciliations.requestKey, requestKey));
  if (retry) return;
  const [release] = await tx.select().from(rewardReconciliations).where(eq(rewardReconciliations.requestKey, `reward:release:${orderId}`));
  const [previous] = await tx.select({ total: sql<number>`coalesce(sum(${rewardReconciliations.reversedCents} - ${rewardReconciliations.restoredCents}),0)::bigint` }).from(rewardReconciliations).where(eq(rewardReconciliations.orderId, orderId));
  // Uncertain funding is conservatively suspended, never shifted to another source.
  const target = order.rewardFundingReview ? 0 : await rewardRefundTarget(tx, order.id, order.rewardSnapshot);
  const reverse = Math.max(0, (release?.targetCents ?? order.rewardSnapshot.entitlement) - target - Number(previous?.total ?? 0));
  const { reclaimedCents, debtCents } = await reclaimRewardSource(tx, lot.id, reverse);
  if (reclaimedCents) {
    await tx.insert(storeCreditEntries).values({ accountId: lot.accountId, amountCents: -reclaimedCents, kind: "reversal", orderId, reason: "Purchase reward adjusted after refund", actorId, requestKey: `reward:reverse:${requestKey}`, payloadHash: creditHash([orderId, target, reverse]) });
    await tx.update(storeCreditAccounts).set({ balanceCents: account!.balanceCents - reclaimedCents, revision: account!.revision + 1 }).where(eq(storeCreditAccounts.id, lot.accountId));
  }
  await tx.insert(rewardReconciliations).values({ orderId, requestKey, targetCents: target, reversedCents: reverse });
  await tx.insert(auditRecords).values({ entityType: "order", entityId: orderId, actorId, action: "reward.reversed", details: { reverse, reclaimedCents, debtCents } });
}
