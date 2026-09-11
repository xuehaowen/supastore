import { isDeepStrictEqual } from 'node:util';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from '@/infrastructure/db';
import { carts, quotes, orders, orderItems, orderFulfillments, storeSettings, pickupTimeSlots } from '@/infrastructure/db/schema';
import { generateOrderReferenceCode } from '@/domain/money/reference-code';
import { InvariantViolationError, UnauthorizedError } from '@/application/common/errors';
import { emitOrderEvent } from '@/application/common/events';
import { issueOrderSession } from './guest/create-guest-session';
import { calculateQuote, type QuoteTerms } from './get-quote';
import { getLaunchReadiness } from './store/get-launch-readiness';
export interface CreateOrderInput { quoteId: string; guestSessionId: string; guestEmail: string; guestName: string; requestKey?: string }
export async function createOrder(input: CreateOrderInput) {
  const email = v.parse(v.pipe(v.string(),v.trim(),v.email()),input.guestEmail);
  const name = v.parse(v.pipe(v.string(),v.trim(),v.minLength(1),v.maxLength(120)),input.guestName);
  return db.transaction(async tx => {
    const [settings] = await tx.select().from(storeSettings).for('update').limit(1);
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id,input.quoteId)).limit(1);
    if (!quote) throw new UnauthorizedError('Quote not found.');
    const [cart] = await tx.select().from(carts).where(eq(carts.id,quote.cartId)).for('update').limit(1);
    if (!cart || cart.guestSessionId !== input.guestSessionId) throw new UnauthorizedError();
    // Authorized source-cart recovery precedes expiry and current launch gates.
    if (cart.convertedOrderId) {
      const [existing] = await tx.select().from(orders).where(eq(orders.id,cart.convertedOrderId));
      const session = await issueOrderSession(tx,existing!.id);
      return { ...existing!, orderId:existing!.id, sessionToken:session.rawToken,isExisting:true };
    }
    if (!settings || settings.isPaused || !settings.isOrderingEnabled) throw new InvariantViolationError(settings?.pauseMessage ?? 'Store is currently paused.');
    const readiness = await getLaunchReadiness(tx);
    // Free purchases do not require a manual payment method.
    if (readiness.checklist.some(c=>!c.isReady && !(c.key==='payment' && quote.totalPayableCents===0))) throw new InvariantViolationError('Store setup is incomplete. Please contact the store.');
    if (quote.expiresAt <= new Date() || quote.cartRevision !== cart.revision) throw new InvariantViolationError('Your quote changed or expired. Review a new quote before ordering.');
    const terms = quote.termsSnapshot as QuoteTerms;
    const current = await calculateQuote(tx,{cartId:cart.id,guestSessionId:input.guestSessionId,...terms.input});
    if (!isDeepStrictEqual(current.terms, terms) || !isDeepStrictEqual(current.calculationItems, quote.itemsSnapshot) || current.result.totalPayableCents !== quote.totalPayableCents) throw new InvariantViolationError('Prices or fulfillment terms changed. Review a new quote before ordering.');
    let order: typeof orders.$inferSelect | undefined;
    for (let attempt=0;attempt<10 && !order;attempt++) {
      [order] = await tx.insert(orders).values({
        sourceCartId:cart.id,referenceCode:generateOrderReferenceCode('SP'),quoteId:quote.id,
        lifecycleStatus:quote.totalPayableCents===0?'confirmed':'unpaid',purchaseTotalCents:quote.totalPayableCents,
        guestEmail:email,guestName:name,fulfillmentType:terms.fulfillmentType,shippingAddressSnapshot:terms.shippingAddress,termsSnapshot:terms,
      }).onConflictDoNothing().returning();
    }
    if (!order) throw new InvariantViolationError('Unable to allocate an order reference. Please retry.');
    await tx.insert(orderItems).values(current.calculationItems.map(i=>({orderId:order!.id,variantId:i.variantId,quantity:i.quantity,unitPriceCents:i.unitPriceCents,lineTotalCents:i.unitPriceCents*i.quantity})));
    let pickupSlotId: string | null = null;
    if (terms.pickup) {
      const { locationId,date,startTime,endTime } = terms.pickup;
      const [slot] = await tx.insert(pickupTimeSlots).values({locationId,date,startTime,endTime}).onConflictDoUpdate({target:[pickupTimeSlots.locationId,pickupTimeSlots.date,pickupTimeSlots.startTime],set:{locationId}}).returning();
      pickupSlotId=slot!.id;
    }
    await tx.insert(orderFulfillments).values({orderId:order.id,status:'unfulfilled',pickupSlotId});
    await tx.update(carts).set({convertedOrderId:order.id,updatedAt:new Date()}).where(eq(carts.id,cart.id));
    await emitOrderEvent(tx,order.id,'order.submitted',email,{orderId:order.id,referenceCode:order.referenceCode,purchaseTotalCents:order.purchaseTotalCents});
    if (quote.totalPayableCents===0) await emitOrderEvent(tx,order.id,'order.confirmed',email,{orderId:order.id,purchaseTotalCents:0});
    const session = await issueOrderSession(tx,order.id);
    return { ...order,orderId:order.id,sessionToken:session.rawToken,isExisting:false };
  });
}

