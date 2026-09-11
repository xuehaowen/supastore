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
await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" });
let [owner] = await db
  .select()
  .from(user)
  .where(eq(user.email, "owner@example.test"));
if (!owner) {
  const result = await auth.api.signUpEmail({
    body: { email: "owner@example.test", name: "Demo Owner", password },
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
const [settings] = await db.select().from(storeSettings);
if (!settings)
  await db
    .insert(storeSettings)
    .values({
      storeName: "Supa / everyday",
      supportEmail: "support@example.test",
      isBootstrapCompleted: true,
      setupCompleted: true,
      emailVerifiedAt: new Date(),
    });
if (!(await db.select().from(paymentAccounts)).length)
  await db
    .insert(paymentAccounts)
    .values({
      accountName: "Demo bank transfer",
      accountIdentifier: "SYNTHETIC ONLY — Do not send real funds.",
    });
if (!(await db.select().from(shippingZones)).length)
  await db
    .insert(shippingZones)
    .values({ name: "Standard", rateCents: 500, freeThresholdCents: 5000 });
if (!(await db.select().from(pickupLocation)).length)
  await db
    .insert(pickupLocation)
    .values({
      name: "The studio",
      address: "1 Demo Street",
      weeklySchedule: {
        mon: [["12:00", "17:00"]],
        tue: [["12:00", "17:00"]],
        wed: [["12:00", "17:00"]],
        thu: [["12:00", "17:00"]],
        fri: [["12:00", "17:00"]],
        sat: [["12:00", "17:00"]],
        sun: [["12:00", "17:00"]],
      },
    });
const entries = [
  [
    "everyday-shirt",
    "Everyday shirt",
    "Soft cotton. A relaxed fit for unhurried days.",
    3200,
    "日常衬衫",
  ],
  [
    "studio-cup",
    "Studio cup",
    "A generous ceramic cup, made for your morning ritual.",
    2400,
    "陶瓷杯",
  ],
  [
    "market-tote",
    "Market tote",
    "Carry a little less. A durable everyday canvas bag.",
    1800,
    "帆布袋",
  ],
];
for (const [handle, title, description, price, zh] of entries) {
  if (
    (
      await db
        .select()
        .from(products)
        .where(eq(products.handle, String(handle)))
    ).length
  )
    continue;
  await createProduct({
    staffUserId: owner.id,
    handle: String(handle),
    title: String(title),
    description: String(description),
    variants: [
      {
        sku: String(handle) + "-01",
        title: "Natural",
        priceCents: Number(price),
        attributes: { color: "Natural" },
      },
    ],
    translations: [
      { locale: "zh", title: String(zh), description: "精心挑选的日常好物。" },
    ],
  });
}
console.log(
  "Synthetic demo seeded. Owner: owner@example.test. No real payments or email verification are implied.",
);
await queryClient.end();
