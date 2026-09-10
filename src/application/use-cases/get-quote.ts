import { eq, inArray } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import { carts, cartItems, productVariants, quotes } from '@/infrastructure/db/schema';
import { acquireTransactionLocks } from '@/domain/locking/lock-order';
import { calculatePurchaseTotal } from '@/domain/money/calculations';
import { NotFoundError, InvariantViolationError } from '@/application/common/errors';

export interface GetQuoteInput {
  cartId: string;
  shippingAddress?: Record<string, any>;
  shippingRateBasisPoints?: number;
  shippingAmountCents?: number;
}

export async function getQuote(input: GetQuoteInput) {
  return await db.transaction(async (tx) => {
    // 1. Acquire cart lock
    await acquireTransactionLocks(tx, { cartIds: [input.cartId] });

    const [cart] = await tx.select().from(carts).where(eq(carts.id, input.cartId)).limit(1);
    if (!cart) {
      throw new NotFoundError(`Cart with ID '${input.cartId}' not found.`);
    }

    if (cart.convertedOrderId) {
      throw new InvariantViolationError('Cart has already been converted into an order.');
    }

    const items = await tx.select().from(cartItems).where(eq(cartItems.cartId, input.cartId));
    if (items.length === 0) {
      throw new InvariantViolationError('Cannot generate quote for an empty cart.');
    }

    const variantIds = items.map((i) => i.variantId);
    const variants = await tx
      .select()
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds));

    const variantMap = new Map(variants.map((v) => [v.id, v]));

    // Verify availability & current pricing
    const calculationItems = items.map((item) => {
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        throw new NotFoundError(`Product variant '${item.variantId}' no longer exists.`);
      }
      if (!variant.isAvailable) {
        throw new InvariantViolationError(`Product variant '${variant.title}' (${variant.sku}) is currently unavailable.`);
      }

      return {
        variantId: variant.id,
        sku: variant.sku,
        title: variant.title,
        unitPriceCents: variant.priceCents,
        quantity: item.quantity,
        taxRateBasisPoints: 0, // In M0 default standard 0
        isTaxInclusive: false,
      };
    });

    const shippingAmountCents = input.shippingAmountCents ?? 0;
    const calculationResult = calculatePurchaseTotal(
      calculationItems,
      { amountCents: shippingAmountCents, taxRateBasisPoints: input.shippingRateBasisPoints ?? 0, isTaxInclusive: false }
    );

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute TTL

    const [quote] = await tx
      .insert(quotes)
      .values({
        cartId: cart.id,
        cartRevision: cart.revision,
        merchandiseSubtotalCents: calculationResult.merchandiseSubtotalCents,
        shippingCents: calculationResult.shippingCents,
        exclusiveTaxCents: calculationResult.exclusiveTaxCents,
        inclusiveTaxCents: calculationResult.inclusiveTaxCents,
        totalPayableCents: calculationResult.totalPayableCents,
        itemsSnapshot: calculationItems,
        shippingSnapshot: calculationResult.shipping,
        expiresAt,
      })
      .returning();

    return quote!;
  });
}
