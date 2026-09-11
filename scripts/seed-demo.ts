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

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------
if (process.env.M1_DEMO !== "true" && process.env.DEMO_SEED !== "true")
  throw new Error(
    "Set DEMO_SEED=true (or M1_DEMO=true) only against an isolated synthetic demo database.",
  );
const password = process.env.DEMO_OWNER_PASSWORD || "AdminSetupSecret123!";
if (password.length < 12)
  throw new Error("DEMO_OWNER_PASSWORD must be 12+ characters.");

// ---------------------------------------------------------------------------
// Load seed data from YAML files
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "seed-data");

const storeData = load(readFileSync(join(dataDir, "store.yaml"), "utf8")) as {
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
};

const configData = load(readFileSync(join(dataDir, "config.yaml"), "utf8")) as {
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
};

const categoryEntries = load(
  readFileSync(join(dataDir, "categories.yaml"), "utf8"),
) as Array<{
  slug: string;
  name: string;
  parentSlug?: string;
  sortOrder?: number;
}>;

const productEntries = load(
  readFileSync(join(dataDir, "products.yaml"), "utf8"),
) as Array<{
  handle: string;
  title: string;
  description?: string;
  isPublished?: boolean;
  categories?: string[]; // category slugs
  variants: Array<{
    sku: string;
    title: string;
    priceCents: number;
    attributes?: Record<string, string>;
    isAvailable?: boolean;
    sortOrder?: number;
  }>;
  translations?: Array<{ locale: string; title: string; description?: string }>;
}>;

// ---------------------------------------------------------------------------
// Run migrations
// ---------------------------------------------------------------------------
await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" });

// ---------------------------------------------------------------------------
// Owner account
// ---------------------------------------------------------------------------
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
  .onConflictDoUpdate({
    target: staffMemberships.userId,
    set: { isActive: true },
  });

// ---------------------------------------------------------------------------
// Store settings (singleton)
// ---------------------------------------------------------------------------
const [settings] = await db.select().from(storeSettings);
if (!settings)
  await db.insert(storeSettings).values({
    storeName: storeData.storeName,
    supportEmail: storeData.supportEmail,
    isBootstrapCompleted: true,
    setupCompleted: true,
    emailVerifiedAt: new Date(),
    ...(storeData.currency && { currency: storeData.currency }),
    ...(storeData.precision !== undefined && { precision: storeData.precision }),
    ...(storeData.defaultLocale && { defaultLocale: storeData.defaultLocale }),
    ...(storeData.timezone && { timezone: storeData.timezone }),
    ...(storeData.taxRateBasisPoints !== undefined && {
      taxRateBasisPoints: storeData.taxRateBasisPoints,
    }),
    ...(storeData.isTaxInclusive !== undefined && {
      isTaxInclusive: storeData.isTaxInclusive,
    }),
    ...(storeData.isOrderingEnabled !== undefined && {
      isOrderingEnabled: storeData.isOrderingEnabled,
    }),
    ...(storeData.isPaused !== undefined && { isPaused: storeData.isPaused }),
    ...(storeData.pauseMessage && { pauseMessage: storeData.pauseMessage }),
  });

// ---------------------------------------------------------------------------
// Payment accounts
// ---------------------------------------------------------------------------
const existingAccounts = await db.select().from(paymentAccounts);
const existingAccountIds = new Set(
  existingAccounts.map((a) => a.accountIdentifier),
);
for (const account of configData.paymentAccounts) {
  if (!existingAccountIds.has(account.accountIdentifier))
    await db.insert(paymentAccounts).values(account);
}

// ---------------------------------------------------------------------------
// Shipping zones
// ---------------------------------------------------------------------------
const existingZones = await db.select().from(shippingZones);
const existingZoneNames = new Set(existingZones.map((z) => z.name));
for (const zone of configData.shippingZones) {
  if (!existingZoneNames.has(zone.name))
    await db.insert(shippingZones).values(zone);
}

// ---------------------------------------------------------------------------
// Pickup locations
// ---------------------------------------------------------------------------
const existingLocations = await db.select().from(pickupLocation);
const existingLocationNames = new Set(existingLocations.map((l) => l.name));
for (const location of configData.pickupLocations) {
  if (!existingLocationNames.has(location.name))
    await db.insert(pickupLocation).values(location);
}

// ---------------------------------------------------------------------------
// Categories
// Build a slug → id map for use when seeding products.
// Parent categories must appear before their children in the YAML.
// ---------------------------------------------------------------------------
const existingCategories = await db.select().from(categories);
const categorySlugToId = new Map(existingCategories.map((c) => [c.slug, c.id]));

for (const cat of categoryEntries) {
  if (categorySlugToId.has(cat.slug)) continue;
  const parentId = cat.parentSlug
    ? (categorySlugToId.get(cat.parentSlug) ?? null)
    : null;
  const [inserted] = await db
    .insert(categories)
    .values({
      slug: cat.slug,
      name: cat.name,
      sortOrder: cat.sortOrder ?? 0,
      ...(parentId && { parentId }),
    })
    .returning({ id: categories.id });
  categorySlugToId.set(cat.slug, inserted.id);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
for (const entry of productEntries) {
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.handle, entry.handle));
  if (existing) continue;

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
}

console.log(
  `Synthetic demo seeded. Owner: ${storeData.ownerEmail}. No real payments or email verification are implied.`,
);
await queryClient.end();
