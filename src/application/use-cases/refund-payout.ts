import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import {
  orders,
  paymentReceipts,
  refundAuthorizations,
  payoutAllocations,
  payoutDestinationVerifications,
  payoutAttempts,
  outgoingTransfers,
  payoutDiscrepancies,
  outboxEvents,
  eventDeliveries,
  auditRecords,
} from '@/infrastructure/db/schema';
import { acquireTransactionLocks } from '@/domain/locking/lock-order';
import { computeOrderFinancialProjection } from '@/domain/financial-projection/projection';
import { classifyPayoutTransfer, type Destination } from '@/domain/financial-projection/discrepancies';
import { verifyStaffInTransaction } from '@/infrastructure/auth/session';
import { NotFoundError, InvariantViolationError } from '@/application/common/errors';

export interface AuthorizeRefundInput {
  orderId: string;
  receiptId: string;
  amountCents: number;
  reason: string;
  ownerUserId: string;
}

export async function authorizeRefund(input: AuthorizeRefundInput) {
  return await db.transaction(async (tx) => {
    const owner = await verifyStaffInTransaction(tx, input.ownerUserId, 'owner');

    await acquireTransactionLocks(tx, {
      orderIds: [input.orderId],
      receiptIds: [input.receiptId],
    });

    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) throw new NotFoundError(`Order '${input.orderId}' not found.`);

    const [receipt] = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.id, input.receiptId))
      .limit(1);
    if (!receipt) throw new NotFoundError(`Receipt '${input.receiptId}' not found.`);

    // Check existing allocations for receipt
    const allocations = await tx
      .select()
      .from(payoutAllocations)
      .where(eq(payoutAllocations.receiptId, receipt.id));

    const totalAuthorized = allocations.reduce((sum, a) => sum + a.authorizedAmountCents, 0);
    const availableCapacity = Math.max(0, receipt.amountCents - totalAuthorized);

    if (input.amountCents > availableCapacity) {
      throw new InvariantViolationError(
        `Requested refund (${input.amountCents} cents) exceeds available receipt capacity (${availableCapacity} cents).`
      );
    }

    const [authorization] = await tx
      .insert(refundAuthorizations)
      .values({
        orderId: order.id,
        kind: 'purchase_refund',
        amountCents: input.amountCents,
        reason: input.reason,
        authorizedByUserId: owner.userId,
      })
      .returning();

    const [allocation] = await tx
      .insert(payoutAllocations)
      .values({
        refundAuthorizationId: authorization!.id,
        receiptId: receipt.id,
        authorizedAmountCents: input.amountCents,
        settledAmountCents: 0,
      })
      .returning();

    await tx.insert(auditRecords).values({
      entityType: 'refund_authorization',
      entityId: authorization!.id,
      actorId: owner.userId,
      action: 'refund.authorized',
      reason: input.reason,
      details: { amountCents: input.amountCents, receiptId: receipt.id },
    });

    return {
      authorizationId: authorization!.id,
      allocationId: allocation!.id,
      amountCents: input.amountCents,
    };
  });
}

export interface ClaimPayoutInput {
  allocationId: string;
  destination: Destination;
  claimedAmountCents: number;
  ownerUserId: string;
}

export async function claimPayout(input: ClaimPayoutInput) {
  return await db.transaction(async (tx) => {
    const owner = await verifyStaffInTransaction(tx, input.ownerUserId, 'owner');

    await acquireTransactionLocks(tx, { allocationIds: [input.allocationId] });

    const [allocation] = await tx
      .select()
      .from(payoutAllocations)
      .where(eq(payoutAllocations.id, input.allocationId))
      .limit(1);

    if (!allocation) throw new NotFoundError(`Allocation '${input.allocationId}' not found.`);

    // Check for unresolved attempts
    const existingAttempts = await tx
      .select()
      .from(payoutAttempts)
      .where(eq(payoutAttempts.allocationId, allocation.id));

    const unresolved = existingAttempts.find(
      (a) => a.status === 'sending' || a.status === 'reconciliation_required'
    );
    if (unresolved) {
      throw new InvariantViolationError('An unresolved payout claim attempt already exists for this allocation.');
    }

    // Save destination verification
    const [verification] = await tx
      .insert(payoutDestinationVerifications)
      .values({
        receiptId: allocation.receiptId,
        destinationRevision: 1,
        destinationData: input.destination,
        verifiedByUserId: owner.userId,
      })
      .returning();

    // Create payout attempt
    const [attempt] = await tx
      .insert(payoutAttempts)
      .values({
        allocationId: allocation.id,
        destinationVerificationId: verification!.id,
        claimedAmountCents: input.claimedAmountCents,
        status: 'sending',
        claimedByUserId: owner.userId,
      })
      .returning();

    return {
      attemptId: attempt!.id,
      claimedAmountCents: attempt!.claimedAmountCents,
      status: attempt!.status,
    };
  });
}

export interface ReconcilePayoutInput {
  attemptId: string;
  actualAmountCents: number;
  transferReference: string;
  actualDestination: Destination;
  ownerUserId: string;
}

export async function reconcilePayout(input: ReconcilePayoutInput) {
  return await db.transaction(async (tx) => {
    const owner = await verifyStaffInTransaction(tx, input.ownerUserId, 'owner');

    await acquireTransactionLocks(tx, { payoutAttemptIds: [input.attemptId] });

    const [attempt] = await tx
      .select()
      .from(payoutAttempts)
      .where(eq(payoutAttempts.id, input.attemptId))
      .limit(1);
    if (!attempt) throw new NotFoundError(`Payout attempt '${input.attemptId}' not found.`);

    const [allocation] = await tx
      .select()
      .from(payoutAllocations)
      .where(eq(payoutAllocations.id, attempt.allocationId))
      .limit(1);

    const [verification] = await tx
      .select()
      .from(payoutDestinationVerifications)
      .where(eq(payoutDestinationVerifications.id, attempt.destinationVerificationId))
      .limit(1);

    const claimedDestination = verification!.destinationData as Destination;

    // Classify transfer
    const classification = classifyPayoutTransfer({
      actualAmountCents: input.actualAmountCents,
      allocationAuthorizedCents: allocation!.authorizedAmountCents,
      priorSettledCentsAcrossAttempts: allocation!.settledAmountCents,
      claimedDestination,
      actualDestination: input.actualDestination,
      attemptClaimedAmountCents: attempt.claimedAmountCents,
      priorActualTransfersForAttemptCents: 0,
    });

    // Save outgoing transfer
    const [transfer] = await tx
      .insert(outgoingTransfers)
      .values({
        payoutAttemptId: attempt.id,
        actualAmountCents: input.actualAmountCents,
        transferReference: input.transferReference,
        customerSettlementCents: classification.customerSettlementCents,
        erroneousDisbursementCents: classification.erroneousDisbursementCents,
        destinationDataSnapshot: input.actualDestination,
        reconciledByUserId: owner.userId,
      })
      .returning();

    // Update allocation settled amount by C
    if (classification.customerSettlementCents > 0) {
      await tx
        .update(payoutAllocations)
        .set({
          settledAmountCents: allocation!.settledAmountCents + classification.customerSettlementCents,
          updatedAt: new Date(),
        })
        .where(eq(payoutAllocations.id, allocation!.id));
    }

    // Determine attempt status & handle discrepancies
    let attemptStatus: 'reconciled' | 'reconciliation_required' = 'reconciled';

    if (classification.erroneousDisbursementCents > 0 || classification.isClaimLimitBreached) {
      attemptStatus = 'reconciliation_required';
      await tx.insert(payoutDiscrepancies).values({
        payoutAttemptId: attempt.id,
        status: 'open',
        reason: classification.erroneousDisbursementCents > 0
          ? `Erroneous disbursement of ${classification.erroneousDisbursementCents} cents`
          : 'Claim limit breached',
      });
    }

    await tx
      .update(payoutAttempts)
      .set({
        status: attemptStatus,
        updatedAt: new Date(),
      })
      .where(eq(payoutAttempts.id, attempt.id));

    return {
      transferId: transfer!.id,
      customerSettlementCents: classification.customerSettlementCents,
      erroneousDisbursementCents: classification.erroneousDisbursementCents,
      attemptStatus,
    };
  });
}

export interface ResolvePayoutDiscrepancyInput {
  discrepancyId: string;
  writeOffCents: number;
  resolutionReason: string;
  ownerUserId: string;
}

/**
 * Resolves an open payout discrepancy with operator audit notes and optional write-off.
 * Unblocks subsequent payout attempts once the anomaly is investigated.
 */
export async function resolvePayoutDiscrepancy(
  input: ResolvePayoutDiscrepancyInput
) {
  return await db.transaction(async (tx) => {
    const owner = await verifyStaffInTransaction(tx, input.ownerUserId, "owner");

    const [discrepancy] = await tx
      .select()
      .from(payoutDiscrepancies)
      .where(eq(payoutDiscrepancies.id, input.discrepancyId))
      .limit(1)
      .for("update");

    if (!discrepancy) {
      throw new NotFoundError(
        `Payout discrepancy '${input.discrepancyId}' not found.`
      );
    }

    if (discrepancy.status === "resolved") {
      throw new InvariantViolationError(
        "Discrepancy has already been resolved."
      );
    }

    const [updated] = await tx
      .update(payoutDiscrepancies)
      .set({
        status: "resolved",
        writeOffCents: input.writeOffCents || 0,
        resolvedByUserId: owner.userId,
        resolvedAt: new Date(),
      })
      .where(eq(payoutDiscrepancies.id, discrepancy.id))
      .returning();

    // Update attempt status from reconciliation_required to reconciled
    await tx
      .update(payoutAttempts)
      .set({
        status: "reconciled",
        updatedAt: new Date(),
      })
      .where(eq(payoutAttempts.id, discrepancy.payoutAttemptId));

    await tx.insert(auditRecords).values({
      entityType: "payout_discrepancy",
      entityId: discrepancy.id,
      actorId: owner.userId,
      action: "payout.discrepancy_resolved",
      reason: input.resolutionReason,
      details: {
        discrepancyId: discrepancy.id,
        writeOffCents: input.writeOffCents || 0,
      },
    });

    return updated!;
  });
}

export interface ClosePayoutAttemptInput {
  attemptId: string;
  reason: string;
  ownerUserId: string;
}

/**
 * Closes an open or partial payout attempt when verified evidence confirms no further
 * remainder transfer is pending on the attempt.
 */
export async function closePayoutAttempt(input: ClosePayoutAttemptInput) {
  return await db.transaction(async (tx) => {
    const owner = await verifyStaffInTransaction(tx, input.ownerUserId, "owner");

    await acquireTransactionLocks(tx, { payoutAttemptIds: [input.attemptId] });

    const [attempt] = await tx
      .select()
      .from(payoutAttempts)
      .where(eq(payoutAttempts.id, input.attemptId))
      .limit(1);

    if (!attempt) {
      throw new NotFoundError(`Payout attempt '${input.attemptId}' not found.`);
    }

    const [updated] = await tx
      .update(payoutAttempts)
      .set({
        status: "reconciled",
        updatedAt: new Date(),
      })
      .where(eq(payoutAttempts.id, attempt.id))
      .returning();

    await tx.insert(auditRecords).values({
      entityType: "payout_attempt",
      entityId: attempt.id,
      actorId: owner.userId,
      action: "payout.attempt_closed",
      reason: input.reason,
      details: { attemptId: attempt.id },
    });

    return updated!;
  });
}

