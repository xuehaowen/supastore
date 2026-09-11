import * as v from 'valibot';
import { storeSettings } from '@/infrastructure/db/schema';
import { verifyStaffInTransaction } from '@/infrastructure/auth/session';
import { eq } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import {
  products,
  productVariants,
  productTranslations,
  productImages,
  productCategories,
} from '@/infrastructure/db/schema';
import { ConflictError, InvariantViolationError } from '@/application/common/errors';

export interface CreateProductVariantInput {
  attributes?: Record<string, string>;
  sku: string;
  title: string;
  priceCents: number;
  isAvailable?: boolean;
  sortOrder?: number;
}

export interface CreateProductTranslationInput {
  locale: string;
  title: string;
  description?: string;
}

export interface CreateProductImageInput {
  s3Key: string;
  altText?: string;
  sortOrder?: number;
}

export interface CreateProductInput {
  staffUserId: string;
  handle: string;
  title: string;
  description?: string;
  isPublished?: boolean;
  categoryIds?: string[];
  variants: CreateProductVariantInput[];
  translations?: CreateProductTranslationInput[];
  images?: CreateProductImageInput[];
}

export async function createProduct(input: CreateProductInput) {
  v.parse(v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)), input.handle);
  for (const variant of input.variants) v.parse(v.pipe(v.number(), v.integer(), v.minValue(0)), variant.priceCents);
  const {
    handle,
    title,
    description = '',
    isPublished = true,
    categoryIds = [],
    variants,
    translations = [],
    images = [],
  } = input;

  if (!variants || variants.length === 0) {
    throw new InvariantViolationError('A product must have at least one variant');
  }

  return db.transaction(async tx => {
  await verifyStaffInTransaction(tx, input.staffUserId, 'owner');
  await tx.select().from(storeSettings).for('update');
  // Check unique handle
  const [existing] = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.handle, handle))
    .limit(1);

  if (existing) {
    throw new ConflictError(`A product with handle '${handle}' already exists`);
  }


    const [product] = await tx
      .insert(products)
      .values({
        handle,
        title,
        description,
        isPublished,
      })
      .returning();

    // Insert variants
    const insertedVariants = await tx
      .insert(productVariants)
      .values(
        variants.map((v, idx) => ({
          productId: product.id,
          sku: v.sku,
          attributes: v.attributes ?? {},
          title: v.title,
          priceCents: v.priceCents,
          isAvailable: v.isAvailable ?? true,
          sortOrder: v.sortOrder ?? idx,
        })),
      )
      .returning();

    // Insert categories if any
    if (categoryIds.length > 0) {
      await tx.insert(productCategories).values(
        categoryIds.map((catId) => ({
          productId: product.id,
          categoryId: catId,
        })),
      );
    }

    // Insert translations if any
    if (translations.length > 0) {
      await tx.insert(productTranslations).values(
        translations.map((t) => ({
          productId: product.id,
          locale: t.locale,
          title: t.title,
          description: t.description ?? '',
        })),
      );
    }

    // Insert images if any
    if (images.length > 0) {
      await tx.insert(productImages).values(
        images.map((img, idx) => ({
          productId: product.id,
          s3Key: img.s3Key,
          altText: img.altText ?? '',
          sortOrder: img.sortOrder ?? idx,
        })),
      );
    }

    return {
      product,
      variants: insertedVariants,
    };
  });
}
