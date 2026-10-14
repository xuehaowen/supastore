import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  attributes,
  attributeValues,
  productOptions,
  productOptionValues,
  variantAttributeValues,
  auditRecords,
  storeSettings,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";
import {
  buildVariantCombinations,
  type GenerationOption,
} from "@/domain/catalog/variant-combinations";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function loadGenerationOptions(
  tx: Tx,
  valueIds: string[],
): Promise<GenerationOption[]> {
  if (valueIds.length > 50 || new Set(valueIds).size !== valueIds.length)
    throw new DomainError("Choose at most 50 distinct values.");
  for (const id of valueIds) parseActionUuid(id, "Option value");
  if (!valueIds.length) return [];
  const rows = await tx
    .select({ attribute: attributes, value: attributeValues })
    .from(attributeValues)
    .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
    .where(
      and(
        inArray(attributeValues.id, valueIds),
        eq(attributes.isArchived, false),
        eq(attributeValues.isArchived, false),
      ),
    )
    .orderBy(
      asc(attributes.sortOrder),
      asc(attributes.code),
      asc(attributeValues.sortOrder),
      asc(attributeValues.code),
    );
  if (rows.length !== valueIds.length)
    throw new DomainError(
      "Some selected values are missing or archived. Reload the options.",
    );
  const groups = new Map<string, GenerationOption>();
  for (const row of rows) {
    const group = groups.get(row.attribute.id) || {
      id: row.attribute.id,
      code: row.attribute.code,
      name: row.attribute.name,
      values: [],
    };
    group.values.push({
      id: row.value.id,
      code: row.value.code,
      label: row.value.label,
    });
    groups.set(group.id, group);
  }
  return [...groups.values()];
}

export async function generateProductVariants(input: {
  staffUserId: string;
  productId: string;
  quoteVersion: number;
  prefix: string;
  valueIds: string[];
  selectedKeys: string[];
  priceCents: number;
  mappings: { variantId: string; key: string }[];
}) {
  const productId = parseActionUuid(input.productId, "Product");
  const priceCents = parseActionInteger(
    input.priceCents,
    "Default price",
    0,
    2147483647,
  );
  parseActionInteger(input.quoteVersion, "Revision", 1, 2147483647);
  if (input.selectedKeys.length > 50 || input.mappings.length > 50)
    throw new DomainError("Too many variants.");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!product) throw new NotFoundError("Product not found.");
    if (product.quoteVersion !== input.quoteVersion)
      throw new ConflictError("The product changed. Reload before generating.");
    const options = await loadGenerationOptions(tx, input.valueIds);
    let combinations;
    try {
      combinations = buildVariantCombinations(options, input.prefix);
    } catch (error) {
      throw new DomainError((error as Error).message);
    }
    const byKey = new Map(combinations.map((c) => [c.key, c]));
    if (
      new Set(input.selectedKeys).size !== input.selectedKeys.length ||
      input.selectedKeys.some((k) => !byKey.has(k))
    )
      throw new DomainError("Invalid combination selection.");
    const existing = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .for("update");
    const mappings = new Map(input.mappings.map((m) => [m.variantId, m.key]));
    if (
      mappings.size !== input.mappings.length ||
      input.mappings.some(
        (m) => !existing.some((v) => v.id === m.variantId && !v.combinationKey),
      )
    )
      throw new DomainError("Invalid legacy variant mapping.");
    const occupied = new Set(
      existing.flatMap((v) => (v.combinationKey ? [v.combinationKey] : [])),
    );
    for (const variant of existing.filter((v) => !v.combinationKey)) {
      const key = mappings.get(variant.id);
      const combination = key ? byKey.get(key) : undefined;
      if (!combination)
        throw new DomainError(
          `Map the existing variant “${variant.title}” to an exact combination before generating. Its ID, SKU, title, and price will be preserved.`,
        );
      if (occupied.has(combination.key))
        throw new ConflictError(
          "Two existing variants cannot use the same combination.",
        );
      occupied.add(combination.key);
      await tx
        .update(productVariants)
        .set({
          combinationKey: combination.key,
          legacyAttributes: variant.legacyAttributes ?? variant.attributes,
          attributes: combination.attributes,
          updatedAt: new Date(),
        })
        .where(eq(productVariants.id, variant.id));
      await tx
        .delete(variantAttributeValues)
        .where(eq(variantAttributeValues.variantId, variant.id));
      await tx.insert(variantAttributeValues).values(
        combination.assignments.map((a) => ({
          variantId: variant.id,
          attributeId: a.attributeId,
          attributeValueId: a.valueId,
        })),
      );
    }
    // Options already assigned to retained variants cannot silently disappear.
    if (existing.some((v) => v.combinationKey && !byKey.has(v.combinationKey)))
      throw new DomainError(
        "The selected values exclude an existing variant. Keep its values and mark the variant unavailable instead.",
      );
    const additions = input.selectedKeys
      .filter((k) => !occupied.has(k))
      .map((k) => byKey.get(k)!);
    if (existing.length + additions.length > 50)
      throw new DomainError("A product cannot have more than 50 variants.");
    if (additions.length) {
      const collisions = await tx
        .select({ sku: productVariants.sku })
        .from(productVariants)
        .where(
          inArray(
            productVariants.sku,
            additions.map((c) => c.sku),
          ),
        );
      if (collisions.length)
        throw new ConflictError(
          `SKU already in use: ${collisions[0]!.sku}. Choose another prefix.`,
        );
    }
    await tx
      .delete(productOptions)
      .where(eq(productOptions.productId, productId));
    for (let i = 0; i < options.length; i++) {
      const option = options[i]!;
      const [saved] = await tx
        .insert(productOptions)
        .values({ productId, attributeId: option.id, sortOrder: i })
        .returning();
      await tx.insert(productOptionValues).values(
        option.values.map((v) => ({
          optionId: saved!.id,
          attributeId: option.id,
          attributeValueId: v.id,
        })),
      );
    }
    for (let i = 0; i < additions.length; i++) {
      const combination = additions[i]!;
      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId,
          combinationKey: combination.key,
          sku: combination.sku,
          title: combination.title,
          attributes: combination.attributes,
          priceCents,
          sortOrder: existing.length + i,
        })
        .returning();
      await tx.insert(variantAttributeValues).values(
        combination.assignments.map((a) => ({
          variantId: variant!.id,
          attributeId: a.attributeId,
          attributeValueId: a.valueId,
        })),
      );
    }
    await tx
      .update(products)
      .set({
        skuPrefix: input.prefix,
        quoteVersion: sql`${products.quoteVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
    await tx.insert(auditRecords).values({
      entityType: "product",
      entityId: productId,
      actorId: input.staffUserId,
      action: "variants.generated",
      details: {
        created: additions.length,
        mapped: mappings.size,
        optionIds: options.map((o) => o.id),
      },
    });
    return additions.length;
  });
}
