import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/infrastructure/db";
import {
  attributes,
  attributeValues,
  attributeTranslations,
  attributeValueTranslations,
  categoryTranslations,
  variantTranslations,
  variantAttributeValues,
} from "@/infrastructure/db/schema";

type Reader = Pick<typeof db, "select">;
export function translatedField<K extends string>(
  rows: Array<{ locale: string } & Partial<Record<K, string | null>>>,
  field: K,
  locale: string,
  defaultLocale: string,
  original: string,
): string {
  return (
    rows.find((row) => row.locale === locale)?.[field] ??
    rows.find((row) => row.locale === defaultLocale)?.[field] ??
    original
  );
}

export async function localizeCategories<
  T extends { id: string; name: string },
>(
  rows: T[],
  locale: string,
  defaultLocale: string,
  reader: Reader = db,
): Promise<T[]> {
  if (!rows.length) return rows;
  const translations = await reader
    .select()
    .from(categoryTranslations)
    .where(
      and(
        inArray(
          categoryTranslations.categoryId,
          rows.map((row) => row.id),
        ),
        inArray(categoryTranslations.locale, [
          ...new Set([locale, defaultLocale]),
        ]),
      ),
    );
  return rows.map((row) => ({
    ...row,
    name: translatedField(
      translations.filter((t) => t.categoryId === row.id),
      "name",
      locale,
      defaultLocale,
      row.name,
    ),
  }));
}

export interface LocalizedAttribute {
  code: string;
  name: string;
  valueCode: string;
  label: string;
}

export async function localizeVariants<T extends { id: string; title: string }>(
  rows: T[],
  locale: string,
  defaultLocale: string,
  reader: Reader = db,
): Promise<Array<T & { localizedAttributes: LocalizedAttribute[] }>> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const requestedName = alias(
    attributeTranslations,
    "requested_attribute_name",
  );
  const defaultName = alias(attributeTranslations, "default_attribute_name");
  const requestedValue = alias(
    attributeValueTranslations,
    "requested_attribute_value",
  );
  const defaultValue = alias(
    attributeValueTranslations,
    "default_attribute_value",
  );
  const [translations, assignments] = await Promise.all([
    reader
      .select()
      .from(variantTranslations)
      .where(
        and(
          inArray(variantTranslations.variantId, ids),
          inArray(variantTranslations.locale, [
            ...new Set([locale, defaultLocale]),
          ]),
        ),
      ),
    reader
      .select({
        variantId: variantAttributeValues.variantId,
        code: attributes.code,
        name: attributes.name,
        valueCode: attributeValues.code,
        label: attributeValues.label,
        requestedName: requestedName.name,
        defaultName: defaultName.name,
        requestedLabel: requestedValue.label,
        defaultLabel: defaultValue.label,
      })
      .from(variantAttributeValues)
      .innerJoin(
        attributes,
        eq(attributes.id, variantAttributeValues.attributeId),
      )
      .innerJoin(
        attributeValues,
        eq(attributeValues.id, variantAttributeValues.attributeValueId),
      )
      .leftJoin(
        requestedName,
        and(
          eq(requestedName.attributeId, attributes.id),
          eq(requestedName.locale, locale),
        ),
      )
      .leftJoin(
        defaultName,
        and(
          eq(defaultName.attributeId, attributes.id),
          eq(defaultName.locale, defaultLocale),
        ),
      )
      .leftJoin(
        requestedValue,
        and(
          eq(requestedValue.attributeValueId, attributeValues.id),
          eq(requestedValue.locale, locale),
        ),
      )
      .leftJoin(
        defaultValue,
        and(
          eq(defaultValue.attributeValueId, attributeValues.id),
          eq(defaultValue.locale, defaultLocale),
        ),
      )
      .where(inArray(variantAttributeValues.variantId, ids))
      .orderBy(attributes.sortOrder, attributes.code),
  ]);
  const grouped = new Map<string, LocalizedAttribute[]>();
  for (const row of assignments) {
    const values = grouped.get(row.variantId) ?? [];
    values.push({
      code: row.code,
      name: row.requestedName ?? row.defaultName ?? row.name,
      valueCode: row.valueCode,
      label: row.requestedLabel ?? row.defaultLabel ?? row.label,
    });
    grouped.set(row.variantId, values);
  }
  return rows.map((row) => {
    const localizedAttributes = grouped.get(row.id) ?? [];
    return {
      ...row,
      localizedAttributes,
      title: translatedField(
        translations.filter((t) => t.variantId === row.id),
        "title",
        locale,
        defaultLocale,
        localizedAttributes.length
          ? localizedAttributes.map((a) => a.label).join(" / ")
          : row.title,
      ),
    };
  });
}
