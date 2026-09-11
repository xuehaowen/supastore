import { and, eq, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from '@/infrastructure/db';
import { orders, orderProposals, paymentReceipts, refundAuthorizations, paymentReturns, auditRecords } from '@/infrastructure/db/schema';
import { verifyStaffInTransaction } from '@/infrastructure/auth/session';
import { verifyOrderAccess } from '@/application/common/guest-access';
import { InvariantViolationError } from '@/application/common/errors';
import { emitOrderEvent } from '@/application/common/events';
export async function proposeOrderChange(input: { orderId: string; staffUserId: string; totalCents: number; reason: string }) {
  v.parse(v.pipe(v.number(),v.integer(),v.minValue(0)), input.totalCents);
  v.parse(v.pipe(v.string(),v.trim(),v.minLength(1)),input.reason);
  return db.transaction(async tx => {
    await verifyStaffInTransaction(tx,input.staffUserId,'owner');
    const [order] = await tx.select().from(orders).where(eq(orders.id,input.orderId)).for('update');
    if (!order || order.lifecycleStatus !== 'unpaid') throw new InvariantViolationError('Only unpaid orders can be changed.');
    const receipts = await tx.select().from(paymentReceipts).where(eq(paymentReceipts.orderId,order.id));
    const refunds = await tx.select().from(refundAuthorizations).where(eq(refundAuthorizations.orderId,order.id));
    const returns = await tx.select().from(paymentReturns).where(eq(paymentReturns.orderId,order.id));
    if (receipts.length || refunds.length || returns.length) throw new InvariantViolationError('An order with recorded funds or returns cannot be repriced.');
    if ((await tx.select().from(orderProposals).where(and(eq(orderProposals.orderId,order.id),eq(orderProposals.status,'pending')))).length) throw new InvariantViolationError('Resolve the existing proposal first.');
    const [proposal] = await tx.insert(orderProposals).values({orderId:order.id,baseRevision:order.financialRevision,previousTotalCents:order.purchaseTotalCents,proposedTotalCents:input.totalCents,reason:input.reason,actorId:input.staffUserId}).returning();
    await tx.insert(auditRecords).values({entityType:'order',entityId:order.id,actorId:input.staffUserId,action:'order.change_proposed',reason:input.reason,details:{proposalId:proposal!.id}});
    await emitOrderEvent(tx,order.id,'order.change_proposed',order.guestEmail,{orderId:order.id,proposalId:proposal!.id});
    return proposal!;
  });
}
export async function acceptOrderChange(input: { orderId: string; proposalId: string; sessionToken: string }) {
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id,input.orderId)).for('update');
    await verifyOrderAccess(tx,input.orderId,input.sessionToken);
    const [proposal] = await tx.select().from(orderProposals).where(and(eq(orderProposals.id,input.proposalId),eq(orderProposals.orderId,input.orderId)));
    if (proposal?.status === 'accepted') return proposal;
    if (!order || !proposal || proposal.status !== 'pending' || order.lifecycleStatus !== 'unpaid' || proposal.baseRevision !== order.financialRevision) throw new InvariantViolationError('These terms are no longer available.');
    if ((await tx.select().from(paymentReceipts).where(eq(paymentReceipts.orderId,order.id))).length) throw new InvariantViolationError('A receipt arrived. The previous total still applies.');
    await tx.update(orders).set({purchaseTotalCents:proposal.proposedTotalCents,financialRevision:sql`${orders.financialRevision} + 1`,updatedAt:new Date()}).where(eq(orders.id,order.id));
    const [accepted] = await tx.update(orderProposals).set({status:'accepted',resolvedAt:new Date()}).where(eq(orderProposals.id,proposal.id)).returning();
    await tx.insert(auditRecords).values({entityType:'order',entityId:order.id,actorId:'guest:'+order.id,action:'order.change_accepted',details:{proposalId:proposal.id,previousTotalCents:proposal.previousTotalCents,totalCents:proposal.proposedTotalCents}});
    await emitOrderEvent(tx,order.id,'order.change_accepted',order.guestEmail,{orderId:order.id,totalCents:proposal.proposedTotalCents});
    return accepted!;
  });
}

