import { and,eq } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import { orders,orderItems,orderFulfillments,orderProposals,paymentReceipts,paymentUploadIntents } from '@/infrastructure/db/schema';
import { verifyOrderAccess } from '@/application/common/guest-access';
export async function trackOrder(orderId:string,sessionToken:string) {
  return db.transaction(async tx=>{
    await verifyOrderAccess(tx,orderId,sessionToken);
    const [order]=await tx.select().from(orders).where(eq(orders.id,orderId));
    const items=await tx.select().from(orderItems).where(eq(orderItems.orderId,orderId));
    const [fulfillment]=await tx.select().from(orderFulfillments).where(eq(orderFulfillments.orderId,orderId));
    const [proposal]=await tx.select().from(orderProposals).where(and(eq(orderProposals.orderId,orderId),eq(orderProposals.status,'pending')));
    const receipts=await tx.select().from(paymentReceipts).where(eq(paymentReceipts.orderId,orderId));
    const evidence=await tx.select({id:paymentUploadIntents.id,finalizedAt:paymentUploadIntents.finalizedAt}).from(paymentUploadIntents).where(and(eq(paymentUploadIntents.orderId,orderId),eq(paymentUploadIntents.status,'finalized')));
    return {order:order!,items,fulfillment,proposal,receivedCents:receipts.reduce((n,r)=>n+r.amountCents,0),evidence};
  });
}

