import { eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  orders,
  orderFulfillments,
  paymentReceipts,
  refundAuthorizations,
  payoutAllocations,
  outboxEvents,
  eventDeliveries,
  auditRecords,
} from "@/infrastructure/db/schema";
import { acquireTransactionLocks } from "@/domain/locking/lock-order";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  NotFoundError,
  InvariantViolationError,
} from "@/application/common/errors";

export interface CancelOrderInput {
  orderId: string;
  actorUserId: string;
  reason: string;
  isCustomerRequest?: boolean;
}

export interface CancelOrderOutput {
  orderId: string;
  previousLifecycleStatus: string;
  lifecycleStatus: "cancelled";
  refundAuthorizedCents: number;
  authorizationIds: string[];
}

/**
 * Cancels an unpaid or confirmed order.
 * - For unpaid orders (A10): updates status to cancelled with zero refund obligations.
 * - For confirmed orders (C11, C12): halts fulfillment and creates refund authorizations
 *   for all received funds across original receipts.
 */
export async function cancelOrder(
  input: CancelOrderInput
): Promise<CancelOrderOutput> {
  if (!input.reason?.trim()) {
    throw new InvariantViolationError("Cancellation reason is required.");
  }

  return await db.transaction(async (tx) => {
    // 1. Staff verification
    const staff = await verifyStaffInTransaction(tx, input.actorUserId);

    // 2. Fetch and lock order
    await acquireTransactionLocks(tx, { orderIds: [input.orderId] });

    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);

    if (!order) {
      throw new NotFoundError(`Order '${input.orderId}' not found.`);
    }

    if (order.lifecycleStatus === "cancelled") {
      throw new InvariantViolationError(
        `Order '${order.referenceCode}' is already cancelled.`
      );
    }

    const [fulfillment] = await tx
      .select()
      .from(orderFulfillments)
      .where(eq(orderFulfillments.orderId, order.id))
      .limit(1);

    if (
      order.lifecycleStatus === "completed" ||
      (fulfillment && fulfillment.status === "fulfilled")
    ) {
      throw new InvariantViolationError(
        `Cannot cancel order '${order.referenceCode}' because fulfillment has already completed.`
      );
    }

    const previousLifecycleStatus = order.lifecycleStatus;

    // Fetch and lock all receipts for this order
    const receipts = await tx
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.orderId, order.id));

    if (receipts.length > 0) {
      await acquireTransactionLocks(tx, {
        receiptIds: receipts.map((r) => r.id),
      });
    }

    // 3. Update order status to cancelled
    await tx
      .update(orders)
      .set({
        lifecycleStatus: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    let refundAuthorizedCents = 0;
    const authorizationIds: string[] = [];

    // 4. If funds were previously received on this order, authorize refund
    if (receipts.length > 0) {
      for (const receipt of receipts) {
        // Query existing allocations for this receipt
        const existingAllocations = await tx
          .select()
          .from(payoutAllocations)
          .where(eq(payoutAllocations.receiptId, receipt.id));

        const totalAlreadyAuthorized = existingAllocations.reduce(
          (sum, a) => sum + a.authorizedAmountCents,
          0
        );
        const availableCapacity = Math.max(
          0,
          receipt.amountCents - totalAlreadyAuthorized
        );

        if (availableCapacity > 0) {
          const [auth] = await tx
            .insert(refundAuthorizations)
            .values({
              orderId: order.id,
              kind: "cancellation_refund",
              amountCents: availableCapacity,
              reason: `Order cancelled (${input.reason})`,
              authorizedByUserId: staff.userId,
            })
            .returning();

          await tx.insert(payoutAllocations).values({
            refundAuthorizationId: auth!.id,
            receiptId: receipt.id,
            authorizedAmountCents: availableCapacity,
          });

          authorizationIds.push(auth!.id);
          refundAuthorizedCents += availableCapacity;
        }
      }
    }

    // 5. Emit order.cancelled outbox event
    const [event] = await tx
      .insert(outboxEvents)
      .values({
        eventType: "order.cancelled",
        aggregateType: "order",
        aggregateId: order.id,
        sequence: Number(
          (
            await tx
              .select({
                value: sql`coalesce(max(${outboxEvents.sequence}),0)+1`,
              })
              .from(outboxEvents)
              .where(eq(outboxEvents.aggregateId, order.id))
          )[0]!.value
        ),
        payload: {
          orderId: order.id,
          referenceCode: order.referenceCode,
          previousLifecycleStatus,
          refundAuthorizedCents,
          reason: input.reason,
          isCustomerRequest: Boolean(input.isCustomerRequest),
          guestEmail: order.guestEmail,
          cancelledAt: new Date().toISOString(),
        },
      })
      .returning();

    await tx.insert(eventDeliveries).values({
      eventId: event!.id,
      recipient: order.guestEmail,
      channel: "email",
      status: "pending",
      retryAfter: new Date(),
    });

    // 6. Audit record
    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: order.id,
      actorId: staff.userId,
      action: "order.cancelled",
      reason: input.reason,
      details: {
        orderId: order.id,
        referenceCode: order.referenceCode,
        previousLifecycleStatus,
        refundAuthorizedCents,
        authorizationIds,
        isCustomerRequest: Boolean(input.isCustomerRequest),
      },
    });

    return {
      orderId: order.id,
      previousLifecycleStatus,
      lifecycleStatus: "cancelled",
      refundAuthorizedCents,
      authorizationIds,
    };
  });
}
