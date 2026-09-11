import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { categories, productVariants } from "./catalog";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const categoryTranslations = pgTable(
  "category_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("uq_category_translation_locale").on(t.categoryId, t.locale),
  ],
);

// Stable codes identify attributes; names and labels are base-language fallbacks.
export const attributes = pgTable("attributes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
});

export const attributeValues = pgTable(
  "attribute_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attributeId: uuid("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("uq_attribute_value_code").on(t.attributeId, t.code),
    uniqueIndex("uq_attribute_value_owner").on(t.attributeId, t.id),
  ],
);

export const attributeTranslations = pgTable(
  "attribute_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attributeId: uuid("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("uq_attribute_translation_locale").on(t.attributeId, t.locale),
  ],
);

export const attributeValueTranslations = pgTable(
  "attribute_value_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attributeValueId: uuid("attribute_value_id")
      .notNull()
      .references(() => attributeValues.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("uq_attribute_value_translation_locale").on(
      t.attributeValueId,
      t.locale,
    ),
  ],
);

export const variantTranslations = pgTable(
  "variant_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("uq_variant_translation_locale").on(t.variantId, t.locale),
  ],
);

// One value per attribute per variant. The composite FK prevents mismatched ownership.
export const variantAttributeValues = pgTable(
  "variant_attribute_values",
  {
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    attributeId: uuid("attribute_id").notNull(),
    attributeValueId: uuid("attribute_value_id").notNull(),
  },
  (t) => [
    uniqueIndex("uq_variant_attribute").on(t.variantId, t.attributeId),
    index("idx_variant_attribute_value").on(t.attributeId, t.attributeValueId),
    foreignKey({
      columns: [t.attributeId, t.attributeValueId],
      foreignColumns: [attributeValues.attributeId, attributeValues.id],
    }).onDelete("restrict"),
  ],
);
