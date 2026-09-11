import { eq, sql } from 'drizzle-orm';
import { outboxEvents, eventDeliveries } from '@/infrastructure/db/schema';
import type { Transaction } from './transaction';
// Callers hold the aggregate order lock for sequence allocation.
export async function emitOrderEvent(tx: Transaction, orderId: string, type: string, recipient: string, payload: Record<string, unknown>) {
  const [sequence] = await tx.select({ value: sql<number>`coalesce(max(${outboxEvents.sequence}), 0)::int + 1` })
    .from(outboxEvents).where(eq(outboxEvents.aggregateId, orderId));
  const [event] = await tx.insert(outboxEvents).values({
    aggregateId: orderId, aggregateType: 'order', eventType: type, sequence: sequence!.value, payload,
  }).returning();
  await tx.insert(eventDeliveries).values({ eventId: event!.id, recipient, channel: 'email', status: 'pending', retryAfter: new Date() });
}

