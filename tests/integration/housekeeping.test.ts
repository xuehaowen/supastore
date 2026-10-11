import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, queryClient } from "@/infrastructure/db";
import { carts, quotes, orders } from "@/infrastructure/db/schema";
import { purgeUnconvertedCarts } from "@/infrastructure/worker/housekeeping";
describe.skipIf(!process.env.DATABASE_URL?.endsWith("/supastore_test"))("transactional retention cleanup", () => {
  beforeAll(async () => { await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" }); await queryClient.unsafe("TRUNCATE carts, orders CASCADE"); });
  afterAll(async () => { await queryClient.end(); });
  it("purges expired quotes while preserving purchased and active carts", async () => {
    const old = new Date("2020-01-01"); const ids = Array.from({ length: 3 }, () => randomUUID());
    await db.insert(carts).values(ids.map(id => ({ id, guestSessionId: id, createdAt: old, updatedAt: old })));
    const quoted = await db.insert(quotes).values(ids.map((id, index) => ({ cartId: id, cartRevision: 1, merchandiseSubtotalCents: 100, shippingCents: 0, exclusiveTaxCents: 0, inclusiveTaxCents: 0, totalPayableCents: 100, itemsSnapshot: [], shippingSnapshot: {}, expiresAt: index === 2 ? new Date("2099-01-01") : old }))).returning();
    await db.insert(orders).values({ sourceCartId: ids[1]!, quoteId: quoted[1]!.id, referenceCode: "HOUSEKEEPING", purchaseTotalCents: 100, guestEmail: "fixture@example.test", guestName: "Fixture", shippingAddressSnapshot: {} });
    await expect(purgeUnconvertedCarts()).resolves.toBe(1);
    expect(await db.select().from(carts).where(eq(carts.id, ids[0]!))).toHaveLength(0);
    expect(await db.select().from(carts).where(eq(carts.id, ids[1]!))).toHaveLength(1);
    expect(await db.select().from(carts).where(eq(carts.id, ids[2]!))).toHaveLength(1);
  });
});
