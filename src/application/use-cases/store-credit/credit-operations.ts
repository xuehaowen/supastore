import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  customers,
  orders,
  storeSettings,
  storeCreditAccounts,
  storeCreditEntries,
  storeCreditReservations,
  confirmationFunding,
  auditRecords,
  creditSourceLots,
} from "@/infrastructure/db/schema";
import {
  createCreditSourceLot,
  reserveCreditSources,
  settleCreditSources,
} from "./credit-sources";
import type { Transaction } from "@/application/common/transaction";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
export const creditHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function lockCreditAccount(tx: Transaction, accountId: string) {
  const [account] = await tx
    .select()
    .from(storeCreditAccounts)
    .where(eq(storeCreditAccounts.id, accountId))
    .for("update");
  if (!account) throw new NotFoundError("Credit account not found.");
  return account;
}
export async function issueStoreCredit(input: {
  staffUserId: string;
  customerId: string;
  amountCents: number;
  reason: string;
  requestKey: string;
  reversalOfId?: string;
}) {
  const customerId = parseActionUuid(input.customerId, "Customer");
  const amount = parseActionInteger(
    input.amountCents,
    "Credit amount",
    1,
    2147483647,
  );
  const reason = parseActionRequiredText(input.reason, "Credit reason", 500);
  const requestKey = parseActionUuid(input.requestKey, "Request key");
  const reversalOfId = input.reversalOfId
    ? parseActionUuid(input.reversalOfId, "Original entry")
    : undefined;
  const payloadHash = creditHash([
    input.staffUserId,
    customerId,
    amount,
    reason,
    reversalOfId || null,
  ]);
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [store] = await tx.select().from(storeSettings).for("update");
    if (!store) throw new DomainError("Set up the store first.");
    const [retry] = await tx
      .select()
      .from(storeCreditEntries)
      .where(eq(storeCreditEntries.requestKey, requestKey));
    if (retry) {
      if (retry.payloadHash !== payloadHash)
        throw new ConflictError(
          "Request key was already used with different input.",
        );
      return retry.accountId;
    }
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, customerId));
    if (!customer) throw new NotFoundError("Customer not found.");
    await tx
      .insert(storeCreditAccounts)
      .values({
        customerId,
        currency: store.currency,
        precision: store.precision,
      })
      .onConflictDoNothing();
    const [account] = await tx
      .select()
      .from(storeCreditAccounts)
      .where(
        and(
          eq(storeCreditAccounts.customerId, customerId),
          eq(storeCreditAccounts.currency, store.currency),
        ),
      )
      .for("update");
    if (account!.precision !== store.precision)
      throw new InvariantViolationError(
        "Credit precision mismatch requires owner review.",
      );
    let delta = amount;
    let reversedLotId: string | undefined;
    if (reversalOfId) {
      const [original] = await tx
        .select()
        .from(storeCreditEntries)
        .where(
          and(
            eq(storeCreditEntries.id, reversalOfId),
            eq(storeCreditEntries.accountId, account!.id),
          ),
        );
      if (
        !original ||
        original.kind !== "issue" ||
        original.amountCents !== amount
      )
        throw new DomainError(
          "Only an original issuance can be reversed, for its full amount.",
        );
      const [reversed] = await tx
        .select()
        .from(storeCreditEntries)
        .where(eq(storeCreditEntries.reversalOfId, reversalOfId));
      if (reversed)
        throw new ConflictError("This issuance is already reversed.");
      delta = -amount;
      const [source] = await tx
        .select()
        .from(creditSourceLots)
        .where(
          and(
            eq(creditSourceLots.sourceEntryId, original.id),
            eq(creditSourceLots.accountId, account!.id),
          ),
        );
      if (
        !source ||
        source.kind !== "merchant" ||
        source.remainingCents - source.reservedCents < amount
      )
        throw new ConflictError(
          "This credit has been spent or reserved. Investigate the issuance instead of reducing the balance.",
        );
      reversedLotId = source.id;
    }
    if (account!.balanceCents + delta > 2147483647)
      throw new DomainError(
        "Credit account balance exceeds the supported limit.",
      );
    const [entry] = await tx
      .insert(storeCreditEntries)
      .values({
        accountId: account!.id,
        amountCents: delta,
        kind: reversalOfId ? "reversal" : "issue",
        reversalOfId: reversalOfId || null,
        reason,
        actorId: input.staffUserId,
        requestKey,
        payloadHash,
      })
      .returning();
    if (reversedLotId) {
      await tx
        .update(creditSourceLots)
        .set({ remainingCents: 0 })
        .where(eq(creditSourceLots.id, reversedLotId));
    } else {
      await createCreditSourceLot(tx, {
        accountId: account!.id,
        sourceEntryId: entry!.id,
        kind: "merchant",
        amountCents: amount,
      });
    }
    await tx
      .update(storeCreditAccounts)
      .set({
        balanceCents: account!.balanceCents + delta,
        revision: account!.revision + 1,
      })
      .where(eq(storeCreditAccounts.id, account!.id));
    await tx.insert(auditRecords).values({
      entityType: "store_credit",
      entityId: account!.id,
      actorId: input.staffUserId,
      action: reversalOfId ? "credit.reversed" : "credit.issued",
      reason,
      details: { amountCents: delta, customerId },
    });
    return account!.id;
  });
}
export async function reserveOrderCredit(
  tx: Transaction,
  orderId: string,
  customerId: string,
  amountCents: number,
  currency: string,
  precision: number,
) {
  const [account] = await tx
    .select()
    .from(storeCreditAccounts)
    .where(
      and(
        eq(storeCreditAccounts.customerId, customerId),
        eq(storeCreditAccounts.currency, currency),
      ),
    )
    .for("update");
  if (
    !account ||
    account.precision !== precision ||
    account.balanceCents - account.reservedCents < amountCents
  )
    throw new ConflictError(
      "Not enough available store credit. Review checkout before ordering.",
    );
  const [retry] = await tx
    .select()
    .from(storeCreditReservations)
    .where(eq(storeCreditReservations.orderId, orderId));
  if (retry) {
    if (retry.accountId !== account.id || retry.amountCents !== amountCents)
      throw new ConflictError("Order credit changed.");
    return;
  }
  const [reservation] = await tx
    .insert(storeCreditReservations)
    .values({ orderId, accountId: account.id, amountCents })
    .returning();
  await reserveCreditSources(tx, account.id, reservation!.id, amountCents);
  await tx
    .update(storeCreditAccounts)
    .set({
      reservedCents: account.reservedCents + amountCents,
      revision: account.revision + 1,
    })
    .where(eq(storeCreditAccounts.id, account.id));
}
export async function settleOrderCredit(
  tx: Transaction,
  orderId: string,
  status: "captured" | "released",
  actorId: string,
) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new NotFoundError("Order not found.");
  const [hold] = await tx
    .select()
    .from(storeCreditReservations)
    .where(eq(storeCreditReservations.orderId, orderId));
  if (
    status === "captured" &&
    order.creditAppliedCents > 0 &&
    (!hold ||
      hold.amountCents !== order.creditAppliedCents ||
      hold.status === "released")
  )
    throw new InvariantViolationError(
      "Order credit funding requires owner review.",
    );
  if (!hold || hold.status !== "active") return hold;
  const account = await lockCreditAccount(tx, hold.accountId);
  if (
    account.reservedCents < hold.amountCents ||
    account.balanceCents < hold.amountCents
  )
    throw new InvariantViolationError(
      "Credit reservation drift requires owner review.",
    );
  let debitEntryId: string | null = null;
  const recoveredCents = await settleCreditSources(
    tx,
    account.id,
    hold.id,
    hold.amountCents,
    status,
  );
  if (status === "captured") {
    const [debit] = await tx
      .insert(storeCreditEntries)
      .values({
        accountId: account.id,
        amountCents: -hold.amountCents,
        kind: "debit",
        orderId,
        reason: "Order confirmed",
        actorId,
        requestKey: hold.id,
        payloadHash: creditHash([orderId, hold.amountCents]),
      })
      .returning();
    debitEntryId = debit!.id;
    await tx.insert(confirmationFunding).values({
      orderId,
      creditEntryId: debitEntryId,
      fundedAmountCents: hold.amountCents,
    });
  }
  if (status === "released" && recoveredCents > 0) {
    await tx.insert(storeCreditEntries).values({
      accountId: account.id,
      amountCents: -recoveredCents,
      kind: "reversal",
      orderId,
      reason: "Revoked reward hold released",
      actorId,
      requestKey: `source-release:${hold.id}`,
      payloadHash: creditHash([hold.id, recoveredCents]),
    });
  }
  await tx
    .update(storeCreditAccounts)
    .set({
      reservedCents: account.reservedCents - hold.amountCents,
      balanceCents:
        account.balanceCents -
        (status === "captured" ? hold.amountCents : recoveredCents),
      revision: account.revision + 1,
    })
    .where(eq(storeCreditAccounts.id, account.id));
  await tx
    .update(storeCreditReservations)
    .set({ status, debitEntryId })
    .where(eq(storeCreditReservations.id, hold.id));
  return { ...hold, status, debitEntryId };
}
export async function customerCredit(tx: Transaction, customerId: string) {
  const [store] = await tx.select().from(storeSettings).limit(1);
  if (!store) return null;
  const [account] = await tx
    .select()
    .from(storeCreditAccounts)
    .where(
      and(
        eq(storeCreditAccounts.customerId, customerId),
        eq(storeCreditAccounts.currency, store.currency),
      ),
    );
  if (!account) return null;
  const entries = await tx
    .select()
    .from(storeCreditEntries)
    .where(eq(storeCreditEntries.accountId, account.id))
    .orderBy(desc(storeCreditEntries.createdAt), desc(storeCreditEntries.id))
    .limit(25);
  const [ledger] = await tx
    .select({
      total: sql<number>`coalesce(sum(${storeCreditEntries.amountCents}),0)::bigint`,
    })
    .from(storeCreditEntries)
    .where(eq(storeCreditEntries.accountId, account.id));
  const [holds] = await tx
    .select({
      total: sql<number>`coalesce(sum(${storeCreditReservations.amountCents}),0)::bigint`,
    })
    .from(storeCreditReservations)
    .where(
      and(
        eq(storeCreditReservations.accountId, account.id),
        eq(storeCreditReservations.status, "active"),
      ),
    );
  const [sources] = await tx
    .select({
      balance: sql<number>`coalesce(sum(${creditSourceLots.remainingCents}),0)::bigint`,
      reserved: sql<number>`coalesce(sum(${creditSourceLots.reservedCents}),0)::bigint`,
    })
    .from(creditSourceLots)
    .where(eq(creditSourceLots.accountId, account.id));
  return {
    account,
    entries,
    reconciled:
      Number(ledger!.total) === account.balanceCents &&
      Number(holds!.total) === account.reservedCents &&
      Number(sources!.balance) === account.balanceCents &&
      Number(sources!.reserved) === account.reservedCents,
  };
}
