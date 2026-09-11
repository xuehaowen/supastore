import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import { db, queryClient } from "../src/infrastructure/db";
import { auth } from "../src/infrastructure/auth";
import {
  user,
  staffMemberships,
  storeSettings,
  paymentAccounts,
  shippingZones,
  pickupLocation,
  products,
  categories,
} from "../src/infrastructure/db/schema";
import { createProduct } from "../src/application/use-cases/catalog/create-product";

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
    accountType?: "bank_transfer" | "cash" | "other";
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
  variants: Array<{
    sku: string;
    title: string;
    priceCents: number;
    attributes?: Record<string, string>;
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
// Guards
// ============================================================================

if (process.env.M1_DEMO !== "true" && process.env.DEMO_SEED !== "true")
  throw new Error(
    "Set DEMO_SEED=true (or M1_DEMO=true) only against an isolated synthetic demo database.",
  );

const password = process.env.DEMO_OWNER_PASSWORD ?? "AdminSetupSecret123!";
if (password.length < 12)
  throw new Error("DEMO_OWNER_PASSWORD must be 12+ characters.");

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
await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" });

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
  .insert(staffMemberships)
  .values({ userId: owner.id, email: owner.email, role: "owner" })
  .onConflictDoUpdate({ target: staffMemberships.userId, set: { isActive: true } });

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
  (await db.select({ id: paymentAccounts.accountIdentifier }).from(paymentAccounts))
    .map((r) => r.id),
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
  (await db.select({ name: shippingZones.name }).from(shippingZones))
    .map((r) => r.name),
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
  (await db.select({ name: pickupLocation.name }).from(pickupLocation))
    .map((r) => r.name),
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
  (await db.select({ slug: categories.slug, id: categories.id }).from(categories))
    .map((r) => [r.slug, r.id]),
);
for (const cat of categoryEntries) {
  if (categorySlugToId.has(cat.slug)) continue;
  const parentId = cat.parentSlug ? categorySlugToId.get(cat.parentSlug) : undefined;
  const [inserted] = await db
    .insert(categories)
    .values({ slug: cat.slug, name: cat.name, sortOrder: cat.sortOrder ?? 0, parentId })
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
    description: entry.description,
    isPublished: entry.isPublished,
    categoryIds,
    variants: entry.variants,
    translations: entry.translations,
  });
  console.log(`  · created '${entry.handle}' (${entry.variants.length} variant(s))`);
}

// ============================================================================
// Done
// ============================================================================

console.log(
  `\n✓ Synthetic demo seeded. Owner: ${storeData.ownerEmail}` +
  `\n  No real payments or email verification are implied.`,
);
await queryClient.end();
