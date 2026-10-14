import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  attributes,
  attributeValues,
  attributeTranslations,
  attributeValueTranslations,
  auditRecords,
  storeSettings,
  productOptions,
  productOptionValues,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";

export async function saveAttribute(input: {
  staffUserId: string;
  id?: string;
  attributeId?: string;
  code: string;
  label: string;
  archived: boolean;
}) {
  const label = parseActionRequiredText(input.label, "Name", 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.code) || input.code.length > 40)
    throw new DomainError(
      "Code must use lowercase letters, numbers, and hyphens (up to 40 characters).",
    );
  const id = input.id
    ? parseActionUuid(input.id, "Attribute or value")
    : undefined;
  const attributeId = input.attributeId
    ? parseActionUuid(input.attributeId, "Attribute")
    : undefined;
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    if (id && input.archived) {
      const used = attributeId
        ? await tx
            .select({ id: productOptionValues.optionId })
            .from(productOptionValues)
            .where(eq(productOptionValues.attributeValueId, id))
            .limit(1)
        : await tx
            .select({ id: productOptions.id })
            .from(productOptions)
            .where(eq(productOptions.attributeId, id))
            .limit(1);
      if (used.length)
        throw new ConflictError(
          "This item is assigned to product options. Mark the affected variants unavailable before changing their options; an assigned option cannot be archived.",
        );
    }
    let savedId: string;
    if (attributeId) {
      const [owner] = await tx
        .select()
        .from(attributes)
        .where(eq(attributes.id, attributeId));
      if (!owner) throw new NotFoundError("Attribute not found.");
      const [duplicate] = await tx
        .select()
        .from(attributeValues)
        .where(
          and(
            eq(attributeValues.attributeId, attributeId),
            eq(attributeValues.code, input.code),
          ),
        );
      if (duplicate && duplicate.id !== id)
        throw new ConflictError("That value code is already in use.");
      if (id) {
        const [current] = await tx
          .select()
          .from(attributeValues)
          .where(
            and(
              eq(attributeValues.id, id),
              eq(attributeValues.attributeId, attributeId),
            ),
          );
        if (!current) throw new NotFoundError("Attribute value not found.");
        if (current.code !== input.code)
          throw new DomainError(
            "Value codes are permanent. Archive the old value and create a new one.",
          );
        await tx
          .update(attributeValues)
          .set({ label, isArchived: input.archived, updatedAt: new Date() })
          .where(eq(attributeValues.id, id));
        savedId = id;
      } else {
        const [value] = await tx
          .insert(attributeValues)
          .values({
            attributeId,
            code: input.code,
            label,
            isArchived: input.archived,
          })
          .returning();
        savedId = value!.id;
      }
    } else {
      const [duplicate] = await tx
        .select()
        .from(attributes)
        .where(eq(attributes.code, input.code));
      if (duplicate && duplicate.id !== id)
        throw new ConflictError("That attribute code is already in use.");
      if (id) {
        const [current] = await tx
          .select()
          .from(attributes)
          .where(eq(attributes.id, id));
        if (!current) throw new NotFoundError("Attribute not found.");
        if (current.code !== input.code)
          throw new DomainError(
            "Attribute codes are permanent. Archive the old attribute and create a new one.",
          );
        await tx
          .update(attributes)
          .set({
            name: label,
            isArchived: input.archived,
            updatedAt: new Date(),
          })
          .where(eq(attributes.id, id));
        savedId = id;
      } else {
        const [attribute] = await tx
          .insert(attributes)
          .values({ code: input.code, name: label, isArchived: input.archived })
          .returning();
        savedId = attribute!.id;
      }
    }
    await tx.insert(auditRecords).values({
      entityType: attributeId ? "attribute_value" : "attribute",
      entityId: savedId,
      actorId: input.staffUserId,
      action: id ? "updated" : "created",
    });
    return attributeId || savedId;
  });
}

export async function saveAttributeTranslation(input: {
  staffUserId: string;
  attributeId: string;
  valueId?: string;
  locale: string;
  label: string;
}) {
  const attributeId = parseActionUuid(input.attributeId, "Attribute");
  const valueId = input.valueId
    ? parseActionUuid(input.valueId, "Value")
    : undefined;
  const label = parseActionRequiredText(input.label, "Translated label", 100);
  if (!["en", "zh"].includes(input.locale))
    throw new DomainError("Invalid locale.");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [attribute] = await tx
      .select()
      .from(attributes)
      .where(eq(attributes.id, attributeId));
    if (!attribute) throw new NotFoundError("Attribute not found.");
    if (valueId) {
      const [value] = await tx
        .select()
        .from(attributeValues)
        .where(
          and(
            eq(attributeValues.id, valueId),
            eq(attributeValues.attributeId, attributeId),
          ),
        );
      if (!value) throw new NotFoundError("Attribute value not found.");
      await tx
        .insert(attributeValueTranslations)
        .values({ attributeValueId: valueId, locale: input.locale, label })
        .onConflictDoUpdate({
          target: [
            attributeValueTranslations.attributeValueId,
            attributeValueTranslations.locale,
          ],
          set: { label, updatedAt: new Date() },
        });
    } else
      await tx
        .insert(attributeTranslations)
        .values({ attributeId, locale: input.locale, name: label })
        .onConflictDoUpdate({
          target: [
            attributeTranslations.attributeId,
            attributeTranslations.locale,
          ],
          set: { name: label, updatedAt: new Date() },
        });
    await tx.insert(auditRecords).values({
      entityType: "attribute_translation",
      entityId: valueId || attributeId,
      actorId: input.staffUserId,
      action: "updated",
      details: { locale: input.locale },
    });
  });
}

export async function getAttributeAdmin(
  staffUserId: string,
  id: string,
  page = 1,
) {
  parseActionUuid(id, "Attribute");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staffUserId, "owner");
    const [attribute] = await tx
      .select()
      .from(attributes)
      .where(eq(attributes.id, id));
    if (!attribute) return null;
    const values = await tx
      .select()
      .from(attributeValues)
      .where(eq(attributeValues.attributeId, id))
      .orderBy(asc(attributeValues.sortOrder), asc(attributeValues.code))
      .limit(26)
      .offset((page - 1) * 25);
    const translations = await tx
      .select()
      .from(attributeTranslations)
      .where(eq(attributeTranslations.attributeId, id));
    const valueTranslations = values.length
      ? await tx
          .select()
          .from(attributeValueTranslations)
          .where(
            inArray(
              attributeValueTranslations.attributeValueId,
              values.map((v) => v.id),
            ),
          )
      : [];
    return {
      attribute,
      values: values.slice(0, 25),
      hasNext: values.length > 25,
      translations,
      valueTranslations,
    };
  });
}
