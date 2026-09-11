import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import {
  products,
  productVariants,
  productTranslations,
  productImages,
  productCategories,
  categories,
} from '@/infrastructure/db/schema';

export interface ListProductsInput {
  /** Locale for translation fallback (e.g. 'en', 'zh') */
  locale?: string;
  categorySlug?: string;
  /** Raw search text — applied against search_vector using plainto_tsquery */
  search?: string;
  publishedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductSummary {
  id: string;
  handle: string;
  title: string;
  description: string;
  isPublished: boolean;
  coverImageKey: string | null;
  lowestPriceCents: number | null;
  variantCount: number;
}

export interface ListProductsResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listProducts(input: ListProductsInput = {}): Promise<ListProductsResult> {
  const {
    locale = 'en',
    categorySlug,
    search,
    publishedOnly = true,
    page: requestedPage = 1,
    pageSize: requestedSize = 24,
  } = input;

  const page = Math.max(1, Math.floor(requestedPage));
  const pageSize = Math.min(100, Math.max(1, Math.floor(requestedSize)));
  const offset = (page - 1) * pageSize;

  // Build WHERE conditions
  const conditions = [];
  if (publishedOnly) {
    conditions.push(eq(products.isPublished, true));
  }

  // Full-text search using the stored search_vector column
  if (search && search.trim().length > 0) {
    conditions.push(
      sql`(${products.searchVector} @@ plainto_tsquery('simple', ${search.trim()}) OR similarity(${products.title}, ${search.trim()}) > 0.15)`,
    );
  }

  // Category filter via join
  let categoryId: string | undefined;
  if (categorySlug) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, categorySlug))
      .limit(1);
    categoryId = cat?.id;
    if (!categoryId) return { items: [], total: 0, page, pageSize };
  }

  if (categoryId) conditions.push(sql`exists (select 1 from product_categories pc where pc.product_id = ${products.id} and pc.category_id = ${categoryId})`);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch products (with optional category filter)
  const baseQuery = db
    .select({
      id: products.id,
      handle: products.handle,
      title: products.title,
      description: products.description,
      isPublished: products.isPublished,
      createdAt: products.createdAt,
    })
    .from(products)
    .$dynamic();

  const filteredQuery = categoryId
    ? baseQuery
        .innerJoin(productCategories, eq(productCategories.productId, products.id))
        .where(and(whereClause, eq(productCategories.categoryId, categoryId)))
    : baseQuery.where(whereClause);

  const rows = await filteredQuery
    .orderBy(products.createdAt)
    .limit(pageSize)
    .offset(offset);

  if (rows.length === 0) return { items: [], total: 0, page, pageSize };

  const productIds = rows.map((r) => r.id);

  // Batch fetch translations, variants, cover images
  const [translationsRows, variantsRows, imagesRows] = await Promise.all([
    db
      .select()
      .from(productTranslations)
      .where(
        and(
          inArray(productTranslations.productId, productIds),
          eq(productTranslations.locale, locale),
        ),
      ),
    db
      .select({
        productId: productVariants.productId,
        priceCents: productVariants.priceCents,
      })
      .from(productVariants)
      .where(sql`${productVariants.productId} = ANY(${sql`ARRAY[${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)}]`})`),
    db
      .select({
        productId: productImages.productId,
        s3Key: productImages.s3Key,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(sql`${productImages.productId} = ANY(${sql`ARRAY[${sql.join(productIds.map((id) => sql`${id}::uuid`), sql`, `)}]`})`)
      .orderBy(productImages.sortOrder),
  ]);

  const translationMap = new Map(translationsRows.map((t) => [t.productId, t]));
  const variantsByProduct = new Map<string, number[]>();
  for (const v of variantsRows) {
    const arr = variantsByProduct.get(v.productId) ?? [];
    arr.push(v.priceCents);
    variantsByProduct.set(v.productId, arr);
  }
  const coverImageMap = new Map<string, string>();
  for (const img of imagesRows) {
    if (!coverImageMap.has(img.productId)) {
      coverImageMap.set(img.productId, img.s3Key);
    }
  }

  const items: ProductSummary[] = rows.map((p) => {
    const translation = translationMap.get(p.id);
    const prices = variantsByProduct.get(p.id) ?? [];
    return {
      id: p.id,
      handle: p.handle,
      title: translation?.title ?? p.title,
      description: translation?.description ?? p.description,
      isPublished: p.isPublished,
      coverImageKey: coverImageMap.get(p.id) ?? null,
      lowestPriceCents: prices.length > 0 ? Math.min(...prices) : null,
      variantCount: prices.length,
    };
  });

  // Count query (separate for pagination)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(whereClause);

  return { items, total: count, page, pageSize };
}
