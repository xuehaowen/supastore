import { and, asc, eq } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import { ConflictError, InvariantViolationError } from "@/application/common/errors";
import { creditSourceAllocations, creditSourceLots } from "@/infrastructure/db/schema";
import { allocateCreditLots, calculateRewardRevocation, recoverRevokedCreditRestore } from "@/domain/rewards";
import { allocateCumulativeRefund } from "@/domain/store-credit/refund-allocation";

/** Every helper requires the caller to hold the owning credit-account lock. */
export async function createCreditSourceLot(tx: Transaction, input: {
  accountId: string; sourceEntryId?: string; kind: "reward" | "merchant" | "legacy";
  rewardOrderId?: string; amountCents: number;
}) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0 || input.amountCents > 2147483647 ||
    (input.kind !== "reward" && (input.amountCents === 0 || !input.sourceEntryId)))
    throw new InvariantViolationError("Invalid credit source amount.");
  const [lot] = await tx.insert(creditSourceLots).values({
    accountId: input.accountId, sourceEntryId: input.sourceEntryId,
    kind: input.kind, rewardOrderId: input.rewardOrderId,
    remainingCents: input.amountCents,
  }).returning();
  return lot!;
}

export async function reclaimRewardSource(tx: Transaction, lotId: string, amountCents: number) {
  const [lot] = await tx.select().from(creditSourceLots).where(eq(creditSourceLots.id, lotId));
  if (!lot || lot.kind !== "reward") throw new InvariantViolationError("Reward source not found.");
  const result = calculateRewardRevocation(amountCents, lot.remainingCents - lot.reservedCents);
  await tx.update(creditSourceLots).set({
    remainingCents: lot.remainingCents - result.revokedAvailable,
    debtCents: lot.debtCents + result.newDebt,
    revokedPendingCents: lot.revokedPendingCents + result.newDebt,
  }).where(eq(creditSourceLots.id, lot.id));
  return { reclaimedCents: result.revokedAvailable, debtCents: result.newDebt };
}

export async function offsetRewardDebts(tx: Transaction, accountId: string, grossCents: number) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new InvariantViolationError("Invalid reward earning.");
  const lots = await tx.select().from(creditSourceLots).where(eq(creditSourceLots.accountId, accountId))
    .orderBy(asc(creditSourceLots.createdAt), asc(creditSourceLots.id));
  let netCents = grossCents;
  for (const lot of lots) {
    const recovered = Math.min(netCents, lot.debtCents);
    if (!recovered) continue;
    await tx.update(creditSourceLots).set({ debtCents: lot.debtCents - recovered }).where(eq(creditSourceLots.id, lot.id));
    netCents -= recovered;
  }
  return { recoveredCents: grossCents - netCents, netCents };
}

export async function reserveCreditSources(tx: Transaction, accountId: string, reservationId: string, amountCents: number) {
  const lots = await tx.select().from(creditSourceLots).where(eq(creditSourceLots.accountId, accountId));
  let allocations;
  try {
    allocations = allocateCreditLots(lots.map(lot => ({ id: lot.id, sourceKind: lot.kind,
      createdAt: lot.createdAt.toISOString(), availableAmount: lot.remainingCents - lot.reservedCents })), amountCents);
  } catch {
    throw new ConflictError("Credit sources do not have enough available value. Owner review is required.");
  }
  for (const allocation of allocations) {
    const lot = lots.find(item => item.id === allocation.lotId)!;
    await tx.insert(creditSourceAllocations).values({reservationId, lotId: lot.id, amountCents: allocation.amount});
    await tx.update(creditSourceLots).set({reservedCents: lot.reservedCents + allocation.amount}).where(eq(creditSourceLots.id, lot.id));
  }
}

async function heldSources(tx: Transaction, accountId: string, reservationId: string, expectedCents: number) {
  const allocations = await tx.select().from(creditSourceAllocations).where(eq(creditSourceAllocations.reservationId, reservationId));
  if (allocations.reduce((sum, item) => sum + item.amountCents, 0) !== expectedCents)
    throw new InvariantViolationError("Credit source reservation drift requires owner review.");
  const result = [];
  for (const allocation of allocations) {
    const [lot] = await tx.select().from(creditSourceLots).where(and(eq(creditSourceLots.id, allocation.lotId), eq(creditSourceLots.accountId, accountId)));
    if (!lot) throw new InvariantViolationError("Credit source ownership drift requires owner review.");
    result.push({allocation, lot});
  }
  return result;
}

/** Returns aggregate value to remove from balance on release (capture already debits). */
export async function settleCreditSources(tx: Transaction, accountId: string, reservationId: string, expectedCents: number, status: "captured" | "released") {
  const sources = await heldSources(tx, accountId, reservationId, expectedCents);
  let recoveredCents = 0;
  for (const {allocation, lot} of sources) {
    if (lot.reservedCents < allocation.amountCents || lot.remainingCents < allocation.amountCents)
      throw new InvariantViolationError("Credit source balance drift requires owner review.");
    const revokedRestored = status === "released" ? Math.min(allocation.amountCents, lot.revokedPendingCents) : 0;
    const recovery = recoverRevokedCreditRestore(allocation.amountCents, revokedRestored, lot.debtCents);
    recoveredCents += recovery.debtRecovery;
    await tx.update(creditSourceLots).set({
      reservedCents: lot.reservedCents - allocation.amountCents,
      remainingCents: lot.remainingCents - (status === "captured" ? allocation.amountCents : recovery.debtRecovery),
      debtCents: status === "released" ? recovery.remainingAssociatedDebt : lot.debtCents,
      revokedPendingCents: lot.revokedPendingCents - revokedRestored,
    }).where(eq(creditSourceLots.id, lot.id));
  }
  return recoveredCents;
}

/** Restores original captured lineage using monotonic cumulative source targets. */
export async function refundCreditSources(tx: Transaction, input: {
  accountId: string; reservationId: string; capturedCents: number; amountCents: number; refundEntryId: string;
}) {
  const existing = await tx.select().from(creditSourceAllocations).where(eq(creditSourceAllocations.reservationId, input.reservationId));
  if (!existing.length) {
    // Pre-migration captures lack reliable source history. Never invent rewards.
    await createCreditSourceLot(tx, {accountId: input.accountId, sourceEntryId: input.refundEntryId, kind: "legacy", amountCents: input.amountCents});
    return 0;
  }
  const sources = await heldSources(tx, input.accountId, input.reservationId, input.capturedCents);
  const prior = sources.reduce((sum, item) => sum + item.allocation.refundedCents, 0);
  const targets = allocateCumulativeRefund(prior + input.amountCents,
    sources.map(({allocation}) => ({id: allocation.id, fundedCents: allocation.amountCents})));
  let recoveredCents = 0;
  for (const {allocation, lot} of sources) {
    const amount = targets.get(allocation.id)! - allocation.refundedCents;
    if (amount < 0) throw new InvariantViolationError("Credit refund source target decreased.");
    const revokedRestored = Math.min(amount, lot.revokedPendingCents);
    const recovery = recoverRevokedCreditRestore(amount, revokedRestored, lot.debtCents);
    recoveredCents += recovery.debtRecovery;
    await tx.update(creditSourceLots).set({remainingCents: lot.remainingCents + recovery.spendableAmount,
      debtCents: recovery.remainingAssociatedDebt, revokedPendingCents: lot.revokedPendingCents - revokedRestored}).where(eq(creditSourceLots.id, lot.id));
    await tx.update(creditSourceAllocations).set({refundedCents: targets.get(allocation.id)!}).where(eq(creditSourceAllocations.id, allocation.id));
  }
  return recoveredCents;
}
