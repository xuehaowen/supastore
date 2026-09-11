import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import {
  products,
  productVariants,
  productTranslations,
  productImages,
  productCategories,
  categories,
} from '@/infrastructure/db/schema';
import { NotFoundError } from '@/application/common/errors';

export interface GetProductInput {
  handle?: string;
  id?: string;
  locale?: string;

}

export interface ProductDetailVariant {
  id: string;
  sku: string;
  title: string;
  priceCents: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface ProductDetailImage {
  id: string;
  variantId: string | null;
  s3Key: string;
  altText: string;
  sortOrder: number;
}

export interface ProductDetailCategory {
  id: string;
  slug: string;
  name: string;
}

export interface ProductDetail {
  id: string;
  handle: string;
  title: string;
  description: string;
  isPublished: boolean;
  quoteVersion: number;
  variants: ProductDetailVariant[];
  images: ProductDetailImage[];
  categories: ProductDetailCategory[];
}

export async function getProduct(input: GetProductInput): Promise<ProductDetail> {
  const { handle, id, locale = 'en',  } = input;

  if (!handle && !id) {
    throw new Error('Either handle or id must be provided');
  }

  const conditions = [];
  if (handle) {
    conditions.push(eq(products.handle, handle));
  } else if (id) {
    conditions.push(eq(products.id, id));
  }

  {
    conditions.push(eq(products.isPublished, true));
  }

  const [product] = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .limit(1);

  if (!product) {
    throw new NotFoundError(`Product not found: ${handle ?? id}`);
  }

  // Fetch translation, variants, images, categories in parallel
  const [translationRows, variantRows, imageRows, categoryRows] = await Promise.all([
    db
      .select()
      .from(productTranslations)
      .where(
        and(
          eq(productTranslations.productId, product.id),
          eq(productTranslations.locale, locale),
        ),
      )
      .limit(1),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        title: productVariants.title,
        priceCents: productVariants.priceCents,
        isAvailable: productVariants.isAvailable,
        sortOrder: productVariants.sortOrder,
      })
      .from(productVariants)
      .where(eq(productVariants.productId, product.id))
      .orderBy(productVariants.sortOrder),
    db
      .select({
        id: productImages.id,
        variantId: productImages.variantId,
        s3Key: productImages.s3Key,
        altText: productImages.altText,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(productImages.sortOrder),
    db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
      })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(eq(productCategories.productId, product.id))
      .orderBy(categories.sortOrder),
  ]);

  const translation = translationRows[0];

  return {
    id: product.id,
    handle: product.handle,
    title: translation?.title ?? product.title,
    description: translation?.description ?? product.description,
    isPublished: product.isPublished,
    quoteVersion: product.quoteVersion,
    variants: variantRows,
    images: imageRows,
    categories: categoryRows,
  };
}
