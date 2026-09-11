import { storeSettings } from '@/infrastructure/db/schema';
import { verifyStaffInTransaction } from '@/infrastructure/auth/session';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import { products, productVariants } from '@/infrastructure/db/schema';
import { NotFoundError } from '@/application/common/errors';

export interface UpdateProductAvailabilityInput {
  staffUserId: string;
  productId?: string;
  isPublished?: boolean;
  variantId?: string;
  isAvailable?: boolean;
}

export async function updateProductAvailability(input: UpdateProductAvailabilityInput) {
  return db.transaction(async tx => {
  await verifyStaffInTransaction(tx, input.staffUserId, 'owner');
  await tx.select().from(storeSettings).for('update');
  const { productId, isPublished, variantId, isAvailable } = input;

  if (productId && isPublished !== undefined) {
    const [updated] = await tx
      .update(products)
      .set({ isPublished, quoteVersion: sql`${products.quoteVersion} + 1`, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning();

    if (!updated) {
      throw new NotFoundError(`Product not found: ${productId}`);
    }
    return { type: 'product', item: updated };
  }

  if (variantId && isAvailable !== undefined) {
    const [updated] = await tx
      .update(productVariants)
      .set({ isAvailable, updatedAt: new Date() })
      .where(eq(productVariants.id, variantId))
      .returning();

    if (!updated) {
      throw new NotFoundError(`Variant not found: ${variantId}`);
    }
    await tx.update(products).set({ quoteVersion: sql`${products.quoteVersion} + 1` }).where(eq(products.id, updated.productId));
    return { type: 'variant', item: updated };
  }

  throw new Error('Invalid input: provide productId+isPublished or variantId+isAvailable');
  });
}
