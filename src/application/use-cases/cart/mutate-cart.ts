import { and, eq, isNull, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from '@/infrastructure/db';
import { carts, cartItems, productVariants, products } from '@/infrastructure/db/schema';
import { InvariantViolationError, NotFoundError } from '@/application/common/errors';
import { getCart } from './get-cart';
export async function mutateCart(input: { guestSessionId: string; variantId?: string; itemId?: string; quantity: number; locale?: string }, mode: 'add' | 'set') {
  v.parse(v.pipe(v.number(), v.integer(), v.minValue(mode === 'add' ? 1 : 0), v.maxValue(999)), input.quantity);
  if (!input.guestSessionId) throw new InvariantViolationError('Cart session required.');
  const cartId = await db.transaction(async tx => {
    // Serialize creation too, before an active cart row exists.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.guestSessionId}, 0))`);
    let [cart] = await tx.select().from(carts).where(and(eq(carts.guestSessionId, input.guestSessionId), isNull(carts.convertedOrderId))).for('update').limit(1);
    if (!cart && mode === 'add') [cart] = await tx.insert(carts).values({ guestSessionId: input.guestSessionId }).returning();
    if (!cart) throw new NotFoundError('Active cart not found.');
    const [item] = await tx.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id),
      input.itemId ? eq(cartItems.id, input.itemId) : eq(cartItems.variantId, input.variantId!))).limit(1);
    if (mode === 'set' && !item) throw new NotFoundError('Cart item not found.');
    const quantity = mode === 'add' ? (item?.quantity ?? 0) + input.quantity : input.quantity;
    if (quantity > 999) throw new InvariantViolationError('Maximum quantity is 999.');
    if (quantity > 0) {
      const [variant] = await tx.select().from(productVariants).innerJoin(products, eq(products.id, productVariants.productId))
        .where(eq(productVariants.id, item?.variantId ?? input.variantId!)).limit(1);
      if (!variant?.product_variants.isAvailable || !variant.products.isPublished) throw new InvariantViolationError('This item is unavailable. You can remove it from your cart.');
    }
    if (quantity === 0) await tx.delete(cartItems).where(eq(cartItems.id, item!.id));
    else if (item) await tx.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, item.id));
    else await tx.insert(cartItems).values({ cartId: cart.id, variantId: input.variantId!, quantity });
    await tx.update(carts).set({ revision: sql`${carts.revision} + 1`, updatedAt: new Date() }).where(eq(carts.id, cart.id));
    return cart.id;
  });
  const cart = await getCart({ cartId, guestSessionId: input.guestSessionId, locale: input.locale ?? 'en' });
  if (!cart) throw new InvariantViolationError('Cart was checked out. Refresh to view your order.');
  return cart;
}

