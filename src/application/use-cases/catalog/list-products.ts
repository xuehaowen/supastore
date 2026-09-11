import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  productTranslations,
  productImages,
  categories,
  storeSettings,
} from "@/infrastructure/db/schema";
export interface ListProductsInput {
  locale?: string;
  categorySlug?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}
export async function listProducts(input: ListProductsInput = {}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local pg_trgm.similarity_threshold = 0.15`);
    const page = Math.max(1, Math.floor(input.page || 1));
    const pageSize = Math.max(
      1,
      Math.min(100, Math.floor(input.pageSize || 24)),
    );
    const conditions = [eq(products.isPublished, true)];
    const search = input.search?.trim().slice(0, 200);
    if (search)
      conditions.push(
        sql`(${products.searchVector} @@ plainto_tsquery('simple',${search}) OR ${products.title} % ${search})`,
      );
    if (input.categorySlug)
      conditions.push(
        sql`exists(select 1 from product_categories pc join categories c on c.id=pc.category_id where pc.product_id=${products.id} and c.slug=${input.categorySlug})`,
      );
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(and(...conditions));
    const rows = await tx
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(products.createdAt, products.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [settings] = await tx.select().from(storeSettings).limit(1);
    const ids = rows.map((p) => p.id);
    const translations = ids.length
      ? await tx
          .select()
          .from(productTranslations)
          .where(inArray(productTranslations.productId, ids))
      : [];
    const variants = ids.length
      ? await tx
          .select()
          .from(productVariants)
          .where(inArray(productVariants.productId, ids))
      : [];
    const images = ids.length
      ? await tx
          .select()
          .from(productImages)
          .where(inArray(productImages.productId, ids))
          .orderBy(productImages.sortOrder)
      : [];
    return {
      page,
      pageSize,
      total: count!.total,
      items: rows.map((p) => {
        const translated =
          translations.find(
            (t) =>
              t.productId === p.id &&
              t.locale === (input.locale ?? settings?.defaultLocale ?? "en"),
          ) ??
          translations.find(
            (t) => t.productId === p.id && t.locale === settings?.defaultLocale,
          );
        const prices = variants
          .filter((v) => v.productId === p.id)
          .map((v) => v.priceCents);
        return {
          id: p.id,
          handle: p.handle,
          title: translated?.title ?? p.title,
          description: translated?.description ?? p.description,
          isPublished: p.isPublished,
          coverImageKey:
            images.find((i) => i.productId === p.id)?.s3Key ?? null,
          lowestPriceCents: prices.length ? Math.min(...prices) : null,
          variantCount: prices.length,
        };
      }),
    };
  });
}
