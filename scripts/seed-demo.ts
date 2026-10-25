import "./load-env";
import {
  seedCatalogTranslations,
  type AttributeSeed,
} from "./seed-catalog-translations";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, inArray } from "drizzle-orm";
import { db, queryClient } from "../apps/backend/src/infrastructure/db/index";
import { auth } from "../apps/backend/src/infrastructure/auth/index";
import { demoSeedPassword } from "./demo-seed-config";
import {
  user,
  staffMemberships,
  storeSettings,
  paymentAccounts,
  shippingZones,
  pickupLocation,
  products,
  categories,
  productImages,
  productCollections,
  collectionTranslations,
  collectionMemberships,
} from "../apps/backend/src/infrastructure/db/schema/index";
import { putCatalogAsset } from "../apps/backend/src/infrastructure/storage";
import { createProduct } from "../apps/backend/src/application/use-cases/catalog/create-product";

// ============================================================================
// Types (mirroring YAML structure)
// ============================================================================

interface StoreData {
  // Identity
  storeName: string;
  supportEmail: string;
  ownerEmail: string;
  ownerName: string;
  // Localisation
  currency?: string;
  precision?: number;
  defaultLocale?: string;
  timezone?: string;
  // Tax
  taxRateBasisPoints?: number;
  isTaxInclusive?: boolean;
  // Ordering
  isOrderingEnabled?: boolean;
  isPaused?: boolean;
  pauseMessage?: string;
}

interface ConfigData {
  paymentAccounts: Array<{
    accountName: string;
    accountIdentifier: string;
    accountType?: typeof paymentAccounts.$inferInsert.accountType;
    isActive?: boolean;
  }>;
  shippingZones: Array<{
    name: string;
    rateCents: number;
    freeThresholdCents?: number;
    countryCodes?: string[] | null;
    sortOrder?: number;
  }>;
  pickupLocations: Array<{
    name: string;
    address: string;
    weeklySchedule: Record<string, [string, string][]>;
    blackoutDates?: string[];
    prepMinutes?: number;
  }>;
}

interface CategoryEntry {
  translations?: Array<{ locale: string; name: string }>;
  slug: string;
  name: string;
  parentSlug?: string;
  sortOrder?: number;
}

interface ProductEntry {
  handle: string;
  title: string;
  description?: string;
  isPublished?: boolean;
  categories?: string[]; // slugs defined in categories.yaml
  specifications?: Record<string, string>;
  variants: Array<{
    sku: string;
    title: string;
    priceCents: number;
    attributes?: Record<string, string>;
    attributeValues?: Record<string, string>;
    translations?: Array<{ locale: string; title: string }>;
    isAvailable?: boolean;
    sortOrder?: number;
  }>;
  translations?: Array<{
    locale: string;
    title: string;
    description?: string;
  }>;
}

// ============================================================================
// Guards & Configuration Precheck
// ============================================================================

const password = demoSeedPassword(process.env);

// ============================================================================
// Load YAML seed data
// ============================================================================

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "seed-data");
const yaml = <T>(file: string) =>
  load(readFileSync(join(dataDir, file), "utf8")) as T;

const storeData = yaml<StoreData>("store.yaml");
const configData = yaml<ConfigData>("config.yaml");
const categoryEntries = yaml<CategoryEntry[]>("categories.yaml");
const productEntries = yaml<ProductEntry[]>("products.yaml");
const attributeEntries = yaml<AttributeSeed[]>("attributes.yaml");

// ============================================================================
// Helper — strip undefined values so Drizzle doesn't receive them
// ============================================================================

function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

// ============================================================================
// 1. Migrations
// ============================================================================

console.log("▶ Running migrations…");
await migrate(db, {
  migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
});

// ============================================================================
// 2. Owner account + staff membership
// ============================================================================

console.log("▶ Seeding owner account…");
let [owner] = await db
  .select()
  .from(user)
  .where(eq(user.email, storeData.ownerEmail));

if (!owner) {
  const result = await auth.api.signUpEmail({
    body: { email: storeData.ownerEmail, name: storeData.ownerName, password },
  });
  owner = result.user as typeof user.$inferSelect;
}

await db
  .update(user)
  .set({ emailVerified: true, updatedAt: new Date() })
  .where(eq(user.id, owner.id));

await db
  .insert(staffMemberships)
  .values({ userId: owner.id, email: owner.email, role: "owner" })
  .onConflictDoUpdate({
    target: staffMemberships.userId,
    set: { isActive: true },
  });

// ============================================================================
// 3. Store settings (singleton — skip if already bootstrapped)
// ============================================================================

console.log("▶ Seeding store settings…");
const [existingSettings] = await db.select().from(storeSettings);
if (!existingSettings)
  await db.insert(storeSettings).values({
    storeName: storeData.storeName,
    supportEmail: storeData.supportEmail,
    isBootstrapCompleted: true,
    setupCompleted: true,
    emailVerifiedAt: new Date(),
    ...defined({
      currency: storeData.currency,
      precision: storeData.precision,
      defaultLocale: storeData.defaultLocale,
      timezone: storeData.timezone,
      taxRateBasisPoints: storeData.taxRateBasisPoints,
      isTaxInclusive: storeData.isTaxInclusive,
      isOrderingEnabled: storeData.isOrderingEnabled,
      isPaused: storeData.isPaused,
      pauseMessage: storeData.pauseMessage,
    }),
  });

// ============================================================================
// 4. Payment accounts (deduplicated by accountIdentifier)
// ============================================================================

console.log("▶ Seeding payment accounts…");
const existingAccountIds = new Set(
  (
    await db
      .select({ id: paymentAccounts.accountIdentifier })
      .from(paymentAccounts)
  ).map((r) => r.id),
);
for (const account of configData.paymentAccounts) {
  if (!existingAccountIds.has(account.accountIdentifier))
    await db.insert(paymentAccounts).values(account);
}

// ============================================================================
// 5. Shipping zones (deduplicated by name)
// ============================================================================

console.log("▶ Seeding shipping zones…");
const existingZoneNames = new Set(
  (await db.select({ name: shippingZones.name }).from(shippingZones)).map(
    (r) => r.name,
  ),
);
for (const zone of configData.shippingZones) {
  if (!existingZoneNames.has(zone.name))
    await db.insert(shippingZones).values(zone);
}

// ============================================================================
// 6. Pickup locations (deduplicated by name)
// ============================================================================

console.log("▶ Seeding pickup locations…");
const existingLocationNames = new Set(
  (await db.select({ name: pickupLocation.name }).from(pickupLocation)).map(
    (r) => r.name,
  ),
);
for (const location of configData.pickupLocations) {
  if (!existingLocationNames.has(location.name))
    await db.insert(pickupLocation).values(location);
}

// ============================================================================
// 7. Categories (deduplicated by slug; parents must precede children in YAML)
// ============================================================================

console.log("▶ Seeding categories…");
const categorySlugToId = new Map(
  (
    await db
      .select({ slug: categories.slug, id: categories.id })
      .from(categories)
  ).map((r) => [r.slug, r.id]),
);
for (const cat of categoryEntries) {
  if (categorySlugToId.has(cat.slug)) continue;
  const parentId = cat.parentSlug
    ? categorySlugToId.get(cat.parentSlug)
    : undefined;
  const [inserted] = await db
    .insert(categories)
    .values({
      slug: cat.slug,
      name: cat.name,
      sortOrder: cat.sortOrder ?? 0,
      parentId,
    })
    .returning({ id: categories.id });
  categorySlugToId.set(cat.slug, inserted.id);
}

// ============================================================================
// 8. Products (deduplicated by handle)
// ============================================================================

console.log("▶ Seeding products…");
for (const entry of productEntries) {
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.handle, entry.handle));
  if (existing) {
    console.log(`  · skipping '${entry.handle}' (already exists)`);
    continue;
  }

  const categoryIds = (entry.categories ?? [])
    .map((slug) => categorySlugToId.get(slug))
    .filter((id): id is string => id !== undefined);

  await createProduct({
    staffUserId: owner.id,
    handle: entry.handle,
    title: entry.title,
    categoryIds,
    variants: entry.variants,
    ...defined({
      description: entry.description,
      isPublished: entry.isPublished,
      translations: entry.translations,
    }),
  });
  console.log(
    `  · created '${entry.handle}' (${entry.variants.length} variant(s))`,
  );
}

// ============================================================================
// Catalog translations and normalized attribute assignments
// ============================================================================

console.log("▶ Seeding catalog translations…");
await seedCatalogTranslations(db, {
  attributes: attributeEntries,
  categories: categoryEntries,
  products: productEntries,
});

// ============================================================================
// Demo photographs are never selected by the normal storefront runtime.
// The seed guard above requires an explicitly isolated synthetic database.
for (const [handle, filename, altText, sortOrder] of [
  ["studio-cup", "studio-cup.jpg", "White porcelain cup and saucer", 0],
  [
    "market-tote",
    "market-tote.jpg",
    "Cotton tote hanging on a pale brick wall",
    0,
  ],
  [
    "everyday-shirt",
    "everyday-shirt.jpg",
    "White cotton shirt on a wooden hanger",
    0,
  ],
  [
    "studio-cup",
    "morning-ritual.png",
    "Coffee in a white cup beside linen and an open book in morning light",
    1,
  ],
] as const) {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.handle, handle));
  if (!product) continue;
  const key = `catalog/demo/${filename}`;
  await putCatalogAsset(
    key,
    filename.endsWith(".png") ? "image/png" : "image/jpeg",
    readFileSync(join(dataDir, "images", filename)),
  );
  const [existing] = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.s3Key, key));
  if (!existing)
    await db
      .insert(productImages)
      .values({ productId: product.id, s3Key: key, altText, sortOrder });
}
const [demoStore] = await db.select().from(storeSettings).limit(1);
if (demoStore && !demoStore.storefrontHero) {
  const demoProducts = await db
    .select({ id: products.id, handle: products.handle })
    .from(products)
    .where(
      inArray(products.handle, ["studio-cup", "market-tote", "everyday-shirt"]),
    );
  const selectedCollections: string[] = [];
  for (const group of [
    {
      handle: "at-home",
      title: "At home",
      description: "Ceramics for quiet starts and unhurried breaks.",
      zhTitle: "居家时光",
      zhDescription: "为宁静的清晨与从容的小憩挑选瓷器。",
      members: ["studio-cup"],
    },
    {
      handle: "out-and-about",
      title: "Out & about",
      description: "Cotton essentials to wear, carry and use again.",
      zhTitle: "轻松出行",
      zhDescription: "日常穿着与随身携带，反复相伴的棉质好物。",
      members: ["market-tote", "everyday-shirt"],
    },
  ]) {
    await db
      .insert(productCollections)
      .values({
        handle: group.handle,
        title: group.title,
        description: group.description,
        isPublished: true,
      })
      .onConflictDoNothing();
    const [collection] = await db
      .select()
      .from(productCollections)
      .where(eq(productCollections.handle, group.handle));
    if (!collection) continue;
    selectedCollections.push(collection.id);
    await db
      .insert(collectionTranslations)
      .values({
        collectionId: collection.id,
        locale: "zh",
        title: group.zhTitle,
        description: group.zhDescription,
      })
      .onConflictDoNothing();
    const members = group.members.flatMap((handle, index) => {
      const product = demoProducts.find((item) => item.handle === handle);
      return product
        ? [
            {
              collectionId: collection.id,
              productId: product.id,
              sortOrder: index,
            },
          ]
        : [];
    });
    if (members.length)
      await db
        .insert(collectionMemberships)
        .values(members)
        .onConflictDoNothing();
  }
  await db
    .update(storeSettings)
    .set({
      storefrontHero: {
        imageKey: "catalog/demo/morning-ritual.png",
        imagePosition: "center",
        featuredCollectionIds: selectedCollections,
        featuredProductIds: [
          "studio-cup",
          "market-tote",
          "everyday-shirt",
        ].flatMap((handle) =>
          demoProducts
            .filter((product) => product.handle === handle)
            .map((product) => product.id),
        ),
        en: {
          heading: "Simple things.\nConsidered choices.",
          body: "Cotton to wear, ceramics to keep, and a bag for the everyday. Explore our small collection of useful objects.",
          imageAlt:
            "Coffee, linen and a book on an oak breakfast table in morning light",
        },
        zh: {
          heading: "日常之物，用心之选。",
          body: "舒适的棉质衣物、值得珍藏的瓷器，还有陪伴日常的购物袋。探索这份实用好物的小小精选。",
          imageAlt: "晨光下橡木餐桌上的咖啡、亚麻布与书籍",
        },
      },
    })
    .where(eq(storeSettings.id, demoStore.id));
}
// ============================================================================

console.log(
  `\n✓ Synthetic demo seeded. Owner: ${storeData.ownerEmail}` +
    `\n  No real payments or email verification are implied.`,
);
await queryClient.end();
