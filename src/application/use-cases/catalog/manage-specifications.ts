import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  attributes,
  attributeValues,
  productSpecifications,
  storeSettings,
  auditRecords,
  attributeTranslations,
  attributeValueTranslations,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionUuid,
  parseActionInteger,
} from "@/application/common/request-validation";

export async function changeSpecification(input: {
  staffUserId: string;
  productId: string;
  valueId: string;
  revision: number;
  remove: boolean;
  sortOrder: number;
}) {
  const productId = parseActionUuid(input.productId, "Product"),
    valueId = parseActionUuid(input.valueId, "Value");
  const sortOrder = parseActionInteger(input.sortOrder, "Position", 0, 1000000);
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!product) throw new NotFoundError("Product not found.");
    if (product.quoteVersion !== input.revision)
      throw new ConflictError("Product changed. Reload before saving.");
    const [value] = await tx
      .select({ value: attributeValues, archived: attributes.isArchived })
      .from(attributeValues)
      .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
      .where(eq(attributeValues.id, valueId));
    if (!value) throw new NotFoundError("Value not found.");
    if (input.remove)
      await tx
        .delete(productSpecifications)
        .where(
          and(
            eq(productSpecifications.productId, productId),
            eq(productSpecifications.attributeValueId, valueId),
          ),
        );
    else {
      if (value.value.isArchived || value.archived)
        throw new DomainError("Choose an active attribute value.");
      const count = await tx
        .select()
        .from(productSpecifications)
        .where(eq(productSpecifications.productId, productId));
      if (
        count.length >= 50 &&
        !count.some((s) => s.attributeValueId === valueId)
      )
        throw new DomainError(
          "A product supports up to 50 specification values.",
        );
      await tx
        .insert(productSpecifications)
        .values({
          productId,
          attributeId: value.value.attributeId,
          attributeValueId: valueId,
          sortOrder,
        })
        .onConflictDoUpdate({
          target: [
            productSpecifications.productId,
            productSpecifications.attributeId,
            productSpecifications.attributeValueId,
          ],
          set: { sortOrder },
        });
    }
    await tx
      .update(products)
      .set({ quoteVersion: product.quoteVersion + 1, updatedAt: new Date() })
      .where(eq(products.id, productId));
    await tx
      .insert(auditRecords)
      .values({
        entityType: "product",
        entityId: productId,
        actorId: input.staffUserId,
        action: input.remove ? "specification.removed" : "specification.saved",
        details: { valueId, sortOrder },
      });
  });
}
export async function listSpecifications(
  productId: string,
  locale: string,
  defaultLocale: string,
) {
  return db
    .select({
      valueId: attributeValues.id,
      name: sql<string>`coalesce((select name from attribute_translations where attribute_id=${attributes.id} and locale=${locale}), (select name from attribute_translations where attribute_id=${attributes.id} and locale=${defaultLocale}), ${attributes.name})`,
      label: sql<string>`coalesce((select label from attribute_value_translations where attribute_value_id=${attributeValues.id} and locale=${locale}), (select label from attribute_value_translations where attribute_value_id=${attributeValues.id} and locale=${defaultLocale}), ${attributeValues.label})`,
      sortOrder: productSpecifications.sortOrder,
    })
    .from(productSpecifications)
    .innerJoin(attributes, eq(attributes.id, productSpecifications.attributeId))
    .innerJoin(
      attributeValues,
      eq(attributeValues.id, productSpecifications.attributeValueId),
    )
    .where(eq(productSpecifications.productId, productId))
    .orderBy(
      asc(productSpecifications.sortOrder),
      asc(attributes.code),
      asc(attributeValues.code),
    );
}
