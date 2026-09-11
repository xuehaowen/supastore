import { and, eq, sql } from 'drizzle-orm';
import { outboxEvents, eventDeliveries, staffMemberships } from '@/infrastructure/db/schema';
import type { Transaction } from './transaction';
// Callers hold the aggregate order lock for sequence allocation.
export async function emitOrderEvent(tx: Transaction, orderId: string, type: string, recipient: string, payload: Record<string, unknown>) {
  const [sequence] = await tx.select({ value: sql<number>`coalesce(max(${outboxEvents.sequence}), 0)::int + 1` })
    .from(outboxEvents).where(eq(outboxEvents.aggregateId, orderId));
  const [event] = await tx.insert(outboxEvents).values({
    aggregateId: orderId, aggregateType: 'order', eventType: type, sequence: sequence!.value, payload,
  }).returning();
  const recipients = new Set([recipient]);
  if (['order.change_invalidated','payment.evidence_uploaded'].includes(type)) {
    const owners = await tx.select().from(staffMemberships).where(and(eq(staffMemberships.role,'owner'),eq(staffMemberships.isActive,true)));
    owners.forEach(owner=>recipients.add(owner.email));
  }
  await tx.insert(eventDeliveries).values([...recipients].map(recipient=>({eventId:event!.id,recipient,channel:'email' as const,status:'pending' as const,retryAfter:new Date()})));
}

