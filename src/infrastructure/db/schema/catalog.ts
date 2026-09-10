import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  index,
  customType,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// tsvector custom type — used for full-text search on products
// ---------------------------------------------------------------------------
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

// ---------------------------------------------------------------------------
// categories — single-level or hierarchical product groupings
// ---------------------------------------------------------------------------
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'), // self-referencing; FK added in migration
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handle: text('handle').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    isPublished: boolean('is_published').notNull().default(true),
    quoteVersion: integer('quote_version').notNull().default(1),
    // Stored generated tsvector for native full-text search (GIN-indexed).
    // The expression is set in the migration: to_tsvector('simple', title || ' ' || description)
    // Drizzle does not yet support GENERATED ALWAYS AS for tsvector, so we
    // declare the column type here and manage the generation expression in SQL.
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // GIN index for fast tsvector lookups
    index('idx_products_search_vector').using('gin', t.searchVector),
  ],
);

// ---------------------------------------------------------------------------
// product_variants
// ---------------------------------------------------------------------------
export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  sku: text('sku').notNull().unique(),
  attributes: jsonb('attributes').$type<Record<string, string>>().notNull().default({}),
  title: text('title').notNull(),
  priceCents: integer('price_cents').notNull(), // CHECK (price_cents >= 0)
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// product_categories — many-to-many join
// ---------------------------------------------------------------------------
export const productCategories = pgTable(
  'product_categories',
  {
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('uq_product_category').on(t.productId, t.categoryId),
  ],
);

// ---------------------------------------------------------------------------
// product_translations — per-locale title / description overrides
// ---------------------------------------------------------------------------
export const productTranslations = pgTable(
  'product_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(), // e.g. 'en', 'zh'
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_product_translation_locale').on(t.productId, t.locale),
  ],
);

// ---------------------------------------------------------------------------
// product_images — ordered image asset keys per product
// ---------------------------------------------------------------------------
export const productImages = pgTable('product_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  // variantId is nullable — null means it applies to all variants / the product
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
  s3Key: text('s3_key').notNull(),
  altText: text('alt_text').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
