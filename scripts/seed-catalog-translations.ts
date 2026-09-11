import { eq, and } from "drizzle-orm";
import type { db as database } from "../src/infrastructure/db";
import {
  attributes,
  attributeValues,
  attributeTranslations,
  attributeValueTranslations,
  categories,
  categoryTranslations,
  products,
  productVariants,
  variantTranslations,
  variantAttributeValues,
} from "../src/infrastructure/db/schema";

type NamedTranslation = { locale: string; name: string };
export interface AttributeSeed {
  code: string;
  name: string;
  sortOrder?: number;
  translations?: NamedTranslation[];
  values: Array<{
    code: string;
    label: string;
    sortOrder?: number;
    translations?: Array<{ locale: string; label: string }>;
  }>;
}
export interface TranslationSeed {
  attributes: AttributeSeed[];
  categories: Array<{ slug: string; translations?: NamedTranslation[] }>;
  products: Array<{
    handle: string;
    variants: Array<{
      sku: string;
      attributeValues?: Record<string, string>;
      translations?: Array<{ locale: string; title: string }>;
    }>;
  }>;
}

// Refresh declared demo translations on reruns, including already seeded products.
export async function seedCatalogTranslations(
  db: typeof database,
  seed: TranslationSeed,
) {
  await db.transaction(async (tx) => {
    const valueIds = new Map<
      string,
      { attributeId: string; attributeValueId: string }
    >();
    for (const entry of seed.attributes) {
      const [attribute] = await tx
        .insert(attributes)
        .values({
          code: entry.code,
          name: entry.name,
          sortOrder: entry.sortOrder ?? 0,
        })
        .onConflictDoUpdate({
          target: attributes.code,
          set: {
            name: entry.name,
            sortOrder: entry.sortOrder ?? 0,
            updatedAt: new Date(),
          },
        })
        .returning();
      for (const translation of entry.translations ?? []) {
        await tx
          .insert(attributeTranslations)
          .values({ attributeId: attribute.id, ...translation })
          .onConflictDoUpdate({
            target: [
              attributeTranslations.attributeId,
              attributeTranslations.locale,
            ],
            set: { name: translation.name, updatedAt: new Date() },
          });
      }
      for (const value of entry.values) {
        const [saved] = await tx
          .insert(attributeValues)
          .values({
            attributeId: attribute.id,
            code: value.code,
            label: value.label,
            sortOrder: value.sortOrder ?? 0,
          })
          .onConflictDoUpdate({
            target: [attributeValues.attributeId, attributeValues.code],
            set: {
              label: value.label,
              sortOrder: value.sortOrder ?? 0,
              updatedAt: new Date(),
            },
          })
          .returning();
        valueIds.set(JSON.stringify([entry.code, value.code]), {
          attributeId: attribute.id,
          attributeValueId: saved.id,
        });
        for (const translation of value.translations ?? []) {
          await tx
            .insert(attributeValueTranslations)
            .values({ attributeValueId: saved.id, ...translation })
            .onConflictDoUpdate({
              target: [
                attributeValueTranslations.attributeValueId,
                attributeValueTranslations.locale,
              ],
              set: { label: translation.label, updatedAt: new Date() },
            });
        }
      }
    }
    for (const entry of seed.categories) {
      const [category] = await tx
        .select()
        .from(categories)
        .where(eq(categories.slug, entry.slug));
      if (!category) throw new Error(`Missing seed category: ${entry.slug}`);
      for (const translation of entry.translations ?? []) {
        await tx
          .insert(categoryTranslations)
          .values({ categoryId: category.id, ...translation })
          .onConflictDoUpdate({
            target: [
              categoryTranslations.categoryId,
              categoryTranslations.locale,
            ],
            set: { name: translation.name, updatedAt: new Date() },
          });
      }
    }
    for (const entry of seed.products) {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.handle, entry.handle));
      if (!product) throw new Error(`Missing seed product: ${entry.handle}`);
      for (const item of entry.variants) {
        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.sku, item.sku),
              eq(productVariants.productId, product.id),
            ),
          );
        if (!variant)
          throw new Error(`Missing seed variant: ${entry.handle}/${item.sku}`);
        for (const [code, value] of Object.entries(
          item.attributeValues ?? {},
        )) {
          const ids = valueIds.get(JSON.stringify([code, value]));
          if (!ids)
            throw new Error(`Unknown seed attribute value: ${code}/${value}`);
          await tx
            .insert(variantAttributeValues)
            .values({ variantId: variant.id, ...ids })
            .onConflictDoUpdate({
              target: [
                variantAttributeValues.variantId,
                variantAttributeValues.attributeId,
              ],
              set: { attributeValueId: ids.attributeValueId },
            });
        }
        for (const translation of item.translations ?? []) {
          await tx
            .insert(variantTranslations)
            .values({ variantId: variant.id, ...translation })
            .onConflictDoUpdate({
              target: [
                variantTranslations.variantId,
                variantTranslations.locale,
              ],
              set: { title: translation.title, updatedAt: new Date() },
            });
        }
      }
    }
  });
}
