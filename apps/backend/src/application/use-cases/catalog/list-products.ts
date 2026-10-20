import { translatedField } from "./localize";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  productTranslations,
  productImages,
  storeSettings,
} from "@/infrastructure/db/schema";
export interface ListProductsInput {
  locale?: string;
  categorySlug?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  collectionHandle?: string;
  sort?: "newest" | "price-low" | "price-high";
  optionValues?: { attribute: string; value: string }[];
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
    const [settings] = await tx.select().from(storeSettings).limit(1);
    const search = input.search?.trim().slice(0, 200);
    if (search)
      conditions.push(
        sql`(${products.searchVector} @@ plainto_tsquery('simple',${search}) OR ${products.title} % ${search} OR ${products.title} ilike ${`%${search.replace(/[\\%_]/g, "\\$&")}%`} OR exists (select 1 from product_translations t where t.product_id=${products.id} and t.locale in (${input.locale || settings?.defaultLocale || "en"}, ${settings?.defaultLocale || "en"}) and t.title ilike ${`%${search.replace(/[\\%_]/g, "\\$&")}%`}))`,
      );
    if (input.categorySlug)
      conditions.push(
        sql`exists(select 1 from product_categories pc join categories c on c.id=pc.category_id where pc.product_id=${products.id} and c.slug=${input.categorySlug})`,
      );
    if (input.collectionHandle)
      conditions.push(
        sql`exists(select 1 from product_collection_memberships m join product_collections c on c.id=m.collection_id where m.product_id=${products.id} and c.handle=${input.collectionHandle} and c.is_published=true)`,
      );
    const filters = (input.optionValues || [])
      .slice(0, 4)
      .filter(
        (f) =>
          /^[a-z0-9-]{1,40}$/.test(f.attribute) &&
          /^[a-z0-9-]{1,40}$/.test(f.value),
      );
    if (filters.length) {
      const assignments = filters.map(
        (f) =>
          sql`exists (select 1 from variant_attribute_values va join attributes a on a.id=va.attribute_id join attribute_values av on av.id=va.attribute_value_id where va.variant_id=v.id and a.code=${f.attribute} and av.code=${f.value})`,
      );
      conditions.push(
        sql`exists (select 1 from product_variants v left join variant_stock s on s.variant_id=v.id where v.product_id=${products.id} and v.is_available and (s.tracking_enabled is not true or s.on_hand > s.reserved) and ${sql.join(assignments, sql` and `)})`,
      );
    }
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(and(...conditions));
    const rows = await tx
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(
        input.sort === "price-low"
          ? sql`(select min(v.price_cents) from product_variants v where v.product_id=${products.id} and v.is_available) asc nulls last`
          : input.sort === "price-high"
            ? sql`(select min(v.price_cents) from product_variants v where v.product_id=${products.id} and v.is_available) desc nulls last`
            : input.sort === "newest"
              ? sql`${products.createdAt} desc`
              : input.collectionHandle
                ? sql`(select m.sort_order from product_collection_memberships m join product_collections c on c.id=m.collection_id where m.product_id=${products.id} and c.handle=${input.collectionHandle})`
                : products.createdAt,
        products.id,
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);
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
    const translationsByProduct = new Map<string, typeof translations>();
    for (const translation of translations) {
      const group = translationsByProduct.get(translation.productId) ?? [];
      group.push(translation);
      translationsByProduct.set(translation.productId, group);
    }
    const pricesByProduct = new Map<string, number[]>();
    for (const variant of variants) {
      const prices = pricesByProduct.get(variant.productId) ?? [];
      prices.push(variant.priceCents);
      pricesByProduct.set(variant.productId, prices);
    }
    const coverByProduct = new Map<string, string>();
    for (const image of images)
      if (!coverByProduct.has(image.productId))
        coverByProduct.set(image.productId, image.s3Key);
    return {
      page,
      pageSize,
      total: count!.total,
      items: rows.map((p) => {
        const productTranslations = translationsByProduct.get(p.id) ?? [];
        const defaultLocale = settings?.defaultLocale ?? "en";
        const locale = input.locale ?? defaultLocale;
        const prices = pricesByProduct.get(p.id) ?? [];
        return {
          id: p.id,
          handle: p.handle,
          title: translatedField(
            productTranslations,
            "title",
            locale,
            defaultLocale,
            p.title,
          ),
          description: translatedField(
            productTranslations,
            "description",
            locale,
            defaultLocale,
            p.description,
          ),
          isPublished: p.isPublished,
          coverImageKey: coverByProduct.get(p.id) ?? null,
          lowestPriceCents: prices.length ? Math.min(...prices) : null,
          variantCount: prices.length,
        };
      }),
    };
  });
}
