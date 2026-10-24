import { translatedField } from "./localize";
import { catalogAvailability } from "@/domain/catalog/catalog-availability";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  productTranslations,
  productImages,
  storeSettings,
  variantStock,
} from "@/infrastructure/db/schema";
export interface ListProductsInput {
  locale?: string;
  categorySlug?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  collectionHandle?: string;
  sort?: "recommended" | "newest" | "price-low" | "price-high";
  optionValues?: { attribute: string; value: string }[];
  featuredFirst?: boolean;
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
    const recommended = !input.sort || input.sort === "recommended";
    const featured =
      input.featuredFirst && recommended
        ? (settings?.storefrontHero?.featuredProductIds ?? [])
        : [];
    const editorialOrder = featured.length
      ? [
          sql`array_position(ARRAY[${sql.join(
            featured.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}], ${products.id}) asc nulls last`,
        ]
      : [];
    const search = input.search?.trim().slice(0, 200);
    if (search) {
      const normalized = sql`public.storefront_search_text(${search})`;
      const pattern = sql`'%' || replace(replace(replace(${normalized}, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%'`;
      conditions.push(
        sql`(to_tsvector('simple', public.storefront_search_text(coalesce(${products.title}, '') || ' ' || coalesce(${products.description}, ''))) @@ plainto_tsquery('simple', ${normalized})
          OR public.storefront_search_text(${products.title}) % ${normalized}
          OR public.storefront_search_text(${products.title}) like ${pattern}
          OR exists (select 1 from product_translations t where t.product_id=${products.id}
            and t.locale in (${input.locale || settings?.defaultLocale || "en"}, ${settings?.defaultLocale || "en"})
            and public.storefront_search_text(t.title) like ${pattern}))`,
      );
    }
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
    const placement = input.collectionHandle
      ? {
          pinned: sql`(select m.is_pinned from product_collection_memberships m join product_collections c on c.id=m.collection_id where m.product_id=${products.id} and c.handle=${input.collectionHandle})`,
          position: sql`(select m.sort_order from product_collection_memberships m join product_collections c on c.id=m.collection_id where m.product_id=${products.id} and c.handle=${input.collectionHandle})`,
        }
      : input.categorySlug
        ? {
            pinned: sql`(select pc.is_pinned from product_categories pc join categories c on c.id=pc.category_id where pc.product_id=${products.id} and c.slug=${input.categorySlug})`,
            position: sql`(select pc.sort_order from product_categories pc join categories c on c.id=pc.category_id where pc.product_id=${products.id} and c.slug=${input.categorySlug})`,
          }
        : { pinned: products.isPinned, position: products.sortOrder };
    const rows = await tx
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(
        ...editorialOrder,
        ...(recommended
          ? [
              sql`${placement.pinned} desc`,
              sql`${placement.position} asc nulls last`,
            ]
          : []),
        input.sort === "price-low"
          ? sql`(select min(v.price_cents) from product_variants v left join variant_stock s on s.variant_id=v.id where v.product_id=${products.id} and v.is_available and (s.tracking_enabled is not true or s.on_hand > s.reserved)) asc nulls last`
          : input.sort === "price-high"
            ? sql`(select min(v.price_cents) from product_variants v left join variant_stock s on s.variant_id=v.id where v.product_id=${products.id} and v.is_available and (s.tracking_enabled is not true or s.on_hand > s.reserved)) desc nulls last`
            : input.collectionHandle && recommended
              ? products.id
              : sql`${products.createdAt} desc`,
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
          .select({
            productId: productVariants.productId,
            priceCents: productVariants.priceCents,
            isAvailable: productVariants.isAvailable,
            trackingEnabled: variantStock.trackingEnabled,
            onHand: variantStock.onHand,
            reserved: variantStock.reserved,
          })
          .from(productVariants)
          .leftJoin(
            variantStock,
            eq(variantStock.variantId, productVariants.id),
          )
          .where(inArray(productVariants.productId, ids))
      : [];
    const images = ids.length
      ? await tx
          .select()
          .from(productImages)
          .where(inArray(productImages.productId, ids))
          .orderBy(productImages.sortOrder, productImages.id)
      : [];
    const translationsByProduct = new Map<string, typeof translations>();
    for (const translation of translations) {
      const group = translationsByProduct.get(translation.productId) ?? [];
      group.push(translation);
      translationsByProduct.set(translation.productId, group);
    }
    const variantsByProduct = new Map<string, typeof variants>();
    for (const variant of variants) {
      const group = variantsByProduct.get(variant.productId) ?? [];
      group.push(variant);
      variantsByProduct.set(variant.productId, group);
    }
    const coverByProduct = new Map<string, string>();
    const previewByProduct = new Map<string, string>();
    for (const image of images)
      if (!coverByProduct.has(image.productId))
        coverByProduct.set(image.productId, image.s3Key);
      else if (
        coverByProduct.get(image.productId) !== image.s3Key &&
        !previewByProduct.has(image.productId)
      )
        previewByProduct.set(image.productId, image.s3Key);
    return {
      page,
      pageSize,
      total: count!.total,
      items: rows.map((p) => {
        const productTranslations = translationsByProduct.get(p.id) ?? [];
        const defaultLocale = settings?.defaultLocale ?? "en";
        const locale = input.locale ?? defaultLocale;
        const productVariants = variantsByProduct.get(p.id) ?? [];
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
          previewImageKey: previewByProduct.get(p.id) ?? null,
          ...catalogAvailability(productVariants),
          variantCount: productVariants.length,
        };
      }),
    };
  });
}
