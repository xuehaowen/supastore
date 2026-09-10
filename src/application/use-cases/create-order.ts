import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import {
  carts,
  quotes,
  orders,
  orderItems,
  orderFulfillments,
  outboxEvents,
  eventDeliveries,
} from '@/infrastructure/db/schema';
import { acquireTransactionLocks } from '@/domain/locking/lock-order';
import { generateOrderReferenceCode } from '@/domain/money/reference-code';
import { NotFoundError, InvariantViolationError } from '@/application/common/errors';
import { withIdempotency } from '@/application/common/idempotency';

export interface CreateOrderInput {
  quoteId: string;
  guestEmail: string;
  guestName: string;
  shippingAddress: Record<string, any>;
  requestKey?: string;
}

export async function createOrder(input: CreateOrderInput) {
  return await db.transaction(async (tx) => {
    // 1. Fetch quote
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
    if (!quote) {
      throw new NotFoundError(`Quote with ID '${input.quoteId}' not found.`);
    }

    if (new Date() > new Date(quote.expiresAt)) {
      throw new InvariantViolationError('Quote has expired. Please refresh your cart to generate a new quote.');
    }

    // 2. Lock cart
    await acquireTransactionLocks(tx, { cartIds: [quote.cartId] });

    const [cart] = await tx.select().from(carts).where(eq(carts.id, quote.cartId)).limit(1);
    if (!cart) {
      throw new NotFoundError(`Cart '${quote.cartId}' not found.`);
    }

    // If cart was already converted, idempotently return the existing order
    if (cart.convertedOrderId) {
      const [existingOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, cart.convertedOrderId))
        .limit(1);

      if (existingOrder) {
        return {
          orderId: existingOrder.id,
          referenceCode: existingOrder.referenceCode,
          lifecycleStatus: existingOrder.lifecycleStatus,
          purchaseTotalCents: existingOrder.purchaseTotalCents,
          isExisting: true,
        };
      }
    }

    return await withIdempotency({
      tx,
      requestKey: input.requestKey,
      actorScope: `guest:${input.guestEmail}`,
      action: 'order.create',
      input,
      execute: async () => {
        // Generate unique reference code with collision retry loop
        let referenceCode = '';
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
          attempts++;
          referenceCode = generateOrderReferenceCode('SP');
          const [duplicate] = await tx
            .select({ id: orders.id })
            .from(orders)
            .where(eq(orders.referenceCode, referenceCode))
            .limit(1);

          if (!duplicate) {
            isUnique = true;
          }
        }

        if (!isUnique) {
          throw new InvariantViolationError('Failed to generate a unique order reference code after multiple attempts.');
        }

        // Insert order
        const [order] = await tx
          .insert(orders)
          .values({
            sourceCartId: cart.id,
            referenceCode,
            quoteId: quote.id,
            lifecycleStatus: 'unpaid',
            purchaseTotalCents: quote.totalPayableCents,
            guestEmail: input.guestEmail,
            guestName: input.guestName,
            shippingAddressSnapshot: input.shippingAddress,
            financialRevision: 1,
          })
          .returning();

        // Insert order items from quote snapshot
        const itemsSnapshot = quote.itemsSnapshot as Array<{
          variantId: string;
          quantity: number;
          unitPriceCents: number;
        }>;

        for (const item of itemsSnapshot) {
          await tx.insert(orderItems).values({
            orderId: order!.id,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.unitPriceCents * item.quantity,
          });
        }

        // Insert initial fulfillment record
        await tx.insert(orderFulfillments).values({
          orderId: order!.id,
          status: 'unfulfilled',
        });

        // Mark cart as converted
        await tx
          .update(carts)
          .set({
            convertedOrderId: order!.id,
            updatedAt: new Date(),
          })
          .where(eq(carts.id, cart.id));

        // Insert transactional outbox event
        const [event] = await tx
          .insert(outboxEvents)
          .values({
            eventType: 'order.submitted',
            aggregateType: 'order',
            aggregateId: order!.id,
            sequence: 1,
            payload: {
              orderId: order!.id,
              referenceCode: order!.referenceCode,
              purchaseTotalCents: order!.purchaseTotalCents,
              guestEmail: order!.guestEmail,
              guestName: order!.guestName,
            },
          })
          .returning();

        // Insert event delivery record
        await tx.insert(eventDeliveries).values({
          eventId: event!.id,
          recipient: input.guestEmail,
          channel: 'email',
          status: 'pending',
          retryAfter: new Date(),
        });

        return {
          orderId: order!.id,
          referenceCode: order!.referenceCode,
          lifecycleStatus: order!.lifecycleStatus,
          purchaseTotalCents: order!.purchaseTotalCents,
          isExisting: false,
        };
      },
    });
  });
}
