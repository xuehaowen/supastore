import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { products } from "./catalog";

export const productCollections = pgTable("product_collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: text("handle").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  imageKey: text("image_key"),
  imageAlt: text("image_alt").notNull().default(""),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const collectionMemberships = pgTable(
  "product_collection_memberships",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => productCollections.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isPinned: boolean("is_pinned").notNull().default(false),
  },
  (t) => [
    uniqueIndex("uq_collection_product").on(t.collectionId, t.productId),
    index("idx_collection_product").on(t.productId),
  ],
);
export const collectionTranslations = pgTable(
  "collection_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => productCollections.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
  },
  (t) => [uniqueIndex("uq_collection_locale").on(t.collectionId, t.locale)],
);
