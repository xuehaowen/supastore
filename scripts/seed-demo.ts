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
  products,
  pickupLocation,
} from "../src/infrastructure/db/schema";
import { createProduct } from "../src/application/use-cases/catalog/create-product";

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
  storeName: string;
  supportEmail: string;
  ownerEmail: string;
  ownerName: string;
};

const configData = load(readFileSync(join(dataDir, "config.yaml"), "utf8")) as {
  paymentAccount: { accountName: string; accountIdentifier: string };
  shippingZone: { name: string; rateCents: number; freeThresholdCents: number };
  pickupLocation: {
    name: string;
    address: string;
    weeklySchedule: Record<string, [string, string][]>;
  };
};

const productEntries = load(
  readFileSync(join(dataDir, "products.yaml"), "utf8"),
) as Array<{
  handle: string;
  title: string;
  description: string;
  priceCents: number;
  variantTitle: string;
  variantColor: string;
  translations: Array<{ locale: string; title: string; description: string }>;
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
// Store settings
// ---------------------------------------------------------------------------
const [settings] = await db.select().from(storeSettings);
if (!settings)
  await db.insert(storeSettings).values({
    storeName: storeData.storeName,
    supportEmail: storeData.supportEmail,
    isBootstrapCompleted: true,
    setupCompleted: true,
    emailVerifiedAt: new Date(),
  });

// ---------------------------------------------------------------------------
// Payment account
// ---------------------------------------------------------------------------
if (!(await db.select().from(paymentAccounts)).length)
  await db.insert(paymentAccounts).values(configData.paymentAccount);

// ---------------------------------------------------------------------------
// Shipping zone
// ---------------------------------------------------------------------------
if (!(await db.select().from(shippingZones)).length)
  await db.insert(shippingZones).values(configData.shippingZone);

// ---------------------------------------------------------------------------
// Pickup location
// ---------------------------------------------------------------------------
if (!(await db.select().from(pickupLocation)).length)
  await db.insert(pickupLocation).values(configData.pickupLocation);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
for (const entry of productEntries) {
  if (
    (await db.select().from(products).where(eq(products.handle, entry.handle)))
      .length
  )
    continue;
  await createProduct({
    staffUserId: owner.id,
    handle: entry.handle,
    title: entry.title,
    description: entry.description,
    variants: [
      {
        sku: entry.handle + "-01",
        title: entry.variantTitle,
        priceCents: entry.priceCents,
        attributes: { color: entry.variantColor },
      },
    ],
    translations: entry.translations,
  });
}

console.log(
  `Synthetic demo seeded. Owner: ${storeData.ownerEmail}. No real payments or email verification are implied.`,
);
await queryClient.end();
