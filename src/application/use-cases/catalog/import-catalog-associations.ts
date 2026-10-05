import { and, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import { productVariants, attributes, attributeValues, productOptions, productOptionValues, variantAttributeValues, productCollections, collectionMemberships } from "@/infrastructure/db/schema";
import type { ProductCsvRow } from "@/domain/catalog/product-csv";
import { DomainError } from "@/application/common/errors";
export async function importCatalogAssociations(tx: Transaction, productId: string, variantId: string, row: ProductCsvRow, isNew: boolean) {
  const options = await tx.select().from(productOptions).where(eq(productOptions.productId, productId));
  if (!row.optionValues && isNew && options.length) throw new DomainError(`SKU ${row.sku} needs option_values for every configured product option.`);
  if (row.optionValues) {
    const pairs = Object.entries(row.optionValues);
    if (pairs.length < 1 || pairs.length > 4 || pairs.some(([attribute, value]) => !/^[a-z0-9-]{1,40}$/.test(attribute) || !/^[a-z0-9-]{1,40}$/.test(value))) throw new DomainError("Import option values must use one to four stable attribute:value codes.");
    const dictionary = await tx.select({ attribute: attributes, value: attributeValues }).from(attributes).innerJoin(attributeValues, eq(attributeValues.attributeId, attributes.id)).where(and(inArray(attributes.code, pairs.map(([code]) => code)), inArray(attributeValues.code, pairs.map(([, code]) => code))));
    const resolved = pairs.map(([attribute, value]) => { const found = dictionary.find(d => d.attribute.code === attribute && d.value.code === value); if (!found) throw new DomainError(`Unknown option ${attribute}:${value}. Create its reusable attribute value first.`); return found; });
    const axisIds = resolved.map(d => d.attribute.id).sort();
    if (options.length && (options.length !== axisIds.length || options.some(o => !axisIds.includes(o.attributeId)))) throw new DomainError(`CSV options for ${row.handle} differ from its configured axes. Use the option editor to reconfigure.`);
    const [variant] = await tx.select().from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)));
    const key = resolved.map(d => `${d.attribute.id}:${d.value.id}`).sort().join("|");
    if (!variant || (variant.combinationKey && variant.combinationKey !== key)) throw new DomainError(`CSV cannot change the existing combination for SKU ${row.sku}.`);
    if (resolved.some(d => d.attribute.isArchived || d.value.isArchived) && variant.combinationKey !== key) throw new DomainError("Archived option values cannot be assigned to new combinations.");
    for (const [position, d] of resolved.sort((a, b) => a.attribute.code.localeCompare(b.attribute.code)).entries()) {
      const [option] = await tx.insert(productOptions).values({ productId, attributeId: d.attribute.id, sortOrder: position }).onConflictDoUpdate({ target: [productOptions.productId, productOptions.attributeId], set: { attributeId: d.attribute.id } }).returning();
      await tx.insert(productOptionValues).values({ optionId: option!.id, attributeId: d.attribute.id, attributeValueId: d.value.id }).onConflictDoNothing();
      await tx.insert(variantAttributeValues).values({ variantId, attributeId: d.attribute.id, attributeValueId: d.value.id }).onConflictDoUpdate({ target: [variantAttributeValues.variantId, variantAttributeValues.attributeId], set: { attributeValueId: d.value.id } });
    }
    await tx.update(productVariants).set({ combinationKey: key, attributes: Object.fromEntries(resolved.map(d => [d.attribute.code, d.value.code])), ...(variant.combinationKey ? {} : { legacyAttributes: variant.attributes }) }).where(eq(productVariants.id, variantId));
  }
  if (row.collectionHandles) {
    if (row.collectionHandles.length > 20) throw new DomainError("A CSV row supports up to 20 collection handles.");
    const collections = await tx.select({ id: productCollections.id, handle: productCollections.handle }).from(productCollections).where(inArray(productCollections.handle, row.collectionHandles));
    if (collections.length !== new Set(row.collectionHandles).size) throw new DomainError(`Unknown collection in SKU ${row.sku}. Create the collection first.`);
    for (const collection of collections) {
      const added = await tx.insert(collectionMemberships).values({ productId, collectionId: collection.id }).onConflictDoNothing().returning();
      if (added.length) await tx.update(productCollections).set({ revision: sql`${productCollections.revision} + 1`, updatedAt: new Date() }).where(eq(productCollections.id, collection.id));
    }
    if ((await tx.select().from(collectionMemberships).where(eq(collectionMemberships.productId, productId)).limit(21)).length > 20) throw new DomainError("A product can belong to up to 20 collections.");
  }
}
