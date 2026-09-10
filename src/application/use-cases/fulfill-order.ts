import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import {
  orders,
  orderFulfillments,
  outboxEvents,
  eventDeliveries,
  auditRecords,
} from '@/infrastructure/db/schema';
import { acquireTransactionLocks } from '@/domain/locking/lock-order';
import { verifyStaffInTransaction } from '@/infrastructure/auth/session';
import { NotFoundError, InvariantViolationError } from '@/application/common/errors';

export interface FulfillOrderInput {
  orderId: string;
  staffUserId: string;
  carrier?: string;
  trackingNumber?: string;
}

export async function fulfillOrder(input: FulfillOrderInput) {
  return await db.transaction(async (tx) => {
    // 1. Staff verification
    const staff = await verifyStaffInTransaction(tx, input.staffUserId);

    // 2. Lock order
    await acquireTransactionLocks(tx, { orderIds: [input.orderId] });

    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) {
      throw new NotFoundError(`Order with ID '${input.orderId}' not found.`);
    }

    if (order.lifecycleStatus !== 'confirmed') {
      throw new InvariantViolationError(`Cannot fulfill order in '${order.lifecycleStatus}' status. Must be 'confirmed'.`);
    }

    // Update fulfillment record
    await tx
      .update(orderFulfillments)
      .set({
        status: 'fulfilled',
        carrier: input.carrier ?? 'Standard',
        trackingNumber: input.trackingNumber ?? 'MOCK-TRACK-123',
        fulfilledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orderFulfillments.orderId, order.id));

    // Update order lifecycle status to completed
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        lifecycleStatus: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    // Outbox event
    const [event] = await tx
      .insert(outboxEvents)
      .values({
        eventType: 'order.completed',
        aggregateType: 'order',
        aggregateId: order.id,
        sequence: 3,
        payload: {
          orderId: order.id,
          referenceCode: order.referenceCode,
          carrier: input.carrier ?? 'Standard',
          trackingNumber: input.trackingNumber ?? 'MOCK-TRACK-123',
          completedAt: new Date().toISOString(),
        },
      })
      .returning();

    await tx.insert(eventDeliveries).values({
      eventId: event!.id,
      recipient: order.guestEmail,
      channel: 'email',
      status: 'pending',
      retryAfter: new Date(),
    });

    await tx.insert(auditRecords).values({
      entityType: 'order',
      entityId: order.id,
      actorId: staff.userId,
      action: 'order.fulfilled',
      reason: 'Order fulfilled and completed',
    });

    return {
      orderId: updatedOrder!.id,
      lifecycleStatus: updatedOrder!.lifecycleStatus,
      fulfillmentStatus: 'fulfilled',
    };
  });
}
