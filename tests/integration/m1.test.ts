import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, queryClient } from "@/infrastructure/db";
import {
  storeSettings,
  staffMemberships,
  paymentAccounts,
  shippingZones,
  orders,
  quotes,
  orderProposals,
  outboxEvents,
  guestOrderSessions,
  productVariants,
} from "@/infrastructure/db/schema";
import { createProduct } from "@/application/use-cases/catalog/create-product";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { addToCart } from "@/application/use-cases/cart/add-to-cart";
import { getQuote } from "@/application/use-cases/get-quote";
import { createOrder } from "@/application/use-cases/create-order";
import { pauseStore } from "@/application/use-cases/store/pause-store";
import { updateProductAvailability } from "@/application/use-cases/catalog/update-product-availability";
import {
  proposeOrderChange,
  acceptOrderChange,
} from "@/application/use-cases/order-proposals";
import { recordReceipt } from "@/application/use-cases/record-receipt";
import { verifyTrackingLink } from "@/application/use-cases/guest/verify-tracking-link";
import { requestTrackingLink } from "@/application/use-cases/guest/request-tracking-link";
import { trackOrder } from "@/application/use-cases/tracking";
const objects = vi.hoisted(
  () => new Map<string, { bytes: Uint8Array; mime: string; size: number }>(),
);
vi.mock("@/infrastructure/storage", () => ({
  presignUpload: async (key: string) => key,
  copyCandidate: async (source: string, target: string) => {
    const sourceObject = objects.get(source)!;
    const copy = { ...sourceObject, bytes: sourceObject.bytes.slice() };
    objects.set(target, copy);
    return copy;
  },
  deleteObject: async (key: string) => {
    objects.delete(key);
  },
}));
const enabled = process.env.DATABASE_URL?.endsWith("/supastore_test");
describe.skipIf(!enabled)("M1 real PostgreSQL journeys", () => {
  let variantId: string, accountId: string;
  const staff = "m1-owner";
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" });
    await queryClient.unsafe(
      "TRUNCATE store_settings, staff_memberships, products, payment_accounts, shipping_zones, carts, orders, guest_order_sessions, operation_requests CASCADE",
    );
    await db
      .insert(staffMemberships)
      .values({ userId: staff, email: "owner@example.test", role: "owner" });
    await db
      .insert(storeSettings)
      .values({
        storeName: "M1 shop",
        supportEmail: "owner@example.test",
        setupCompleted: true,
        emailVerifiedAt: new Date(),
      });
    [accountId] = (
      await db
        .insert(paymentAccounts)
        .values({
          accountName: "Bank",
          accountIdentifier: "Test receiving account",
        })
        .returning()
    ).map((a) => a.id);
    await db
      .insert(shippingZones)
      .values({ name: "Worldwide", rateCents: 500, freeThresholdCents: 4000 });
    const result = await createProduct({
      staffUserId: staff,
      handle: "shirt",
      title: "Shirt",
      variants: [{ sku: "SHIRT", title: "Medium", priceCents: 2000 }],
      translations: [{ locale: "zh", title: "衬衫" }],
    });
    variantId = result.variants[0]!.id;
  }, 30000);
  afterAll(async () => {
    await queryClient.end();
  });
  async function prepared(quantity = 1) {
    const guestSessionId = randomUUID();
    const cart = await addToCart({ guestSessionId, variantId, quantity });
    const quote = await getQuote({
      guestSessionId,
      cartId: cart.id,
      fulfillmentType: "shipping",
      shippingAddress: { country: "US", address: "1 Test Street" },
      paymentAccountId: accountId,
    });
    return {
      guestSessionId,
      cart,
      quote,
      input: {
        guestSessionId,
        quoteId: quote.id,
        guestName: "Customer",
        guestEmail: "customer@example.test",
      },
    };
  }
  it("C1 searches typo and translates catalog", async () => {
    expect((await listProducts({ search: "shrit" })).items[0]?.handle).toBe(
      "shirt",
    );
    expect((await listProducts({ locale: "zh" })).items[0]?.title).toBe("衬衫");
  });
  it("C2 serializes concurrent additions without dropping quantity", async () => {
    const guestSessionId = randomUUID();
    await Promise.all(
      Array.from({ length: 5 }, () => addToCart({ guestSessionId, variantId })),
    );
    const { getCart } = await import("@/application/use-cases/cart/get-cart");
    expect((await getCart({ guestSessionId }))!.items[0]!.quantity).toBe(5);
  });
  it("C3 applies free shipping at the threshold", async () => {
    expect((await prepared(2)).quote.shippingCents).toBe(0);
  });
  it("C4/C5 returns one authorized order after racing and expiry", async () => {
    const p = await prepared();
    const result = await Promise.all([
      createOrder(p.input),
      createOrder(p.input),
    ]);
    expect(result[0]!.id).toBe(result[1]!.id);
    await db
      .update(quotes)
      .set({ expiresAt: new Date(0) })
      .where(eq(quotes.id, p.quote.id));
    expect((await createOrder(p.input)).id).toBe(result[0]!.id);
    await expect(
      createOrder({ ...p.input, guestSessionId: "attacker" }),
    ).rejects.toThrow();
    await expect(trackOrder(result[0]!.id, "wrong")).rejects.toThrow();
    expect(
      (await trackOrder(result[0]!.id, result[0]!.sessionToken)).order
        .referenceCode,
    ).toBe(result[0]!.referenceCode);
  });
  it("M6 pause blocks new orders and preserves retry access", async () => {
    const p = await prepared();
    await pauseStore({ staffUserId: staff, isPaused: true });
    await expect(createOrder(p.input)).rejects.toThrow("paused");
    await pauseStore({ staffUserId: staff, isPaused: false });
    expect((await createOrder(p.input)).id).toBeTruthy();
  });
  it("rejects availability changes after a quote", async () => {
    const p = await prepared();
    await updateProductAvailability({
      staffUserId: staff,
      variantId,
      isAvailable: false,
    });
    await expect(createOrder(p.input)).rejects.toThrow();
    await updateProductAvailability({
      staffUserId: staff,
      variantId,
      isAvailable: true,
    });
  });
  it("C7 confirms a zero-total order without receipts or payment method", async () => {
    const free = await createProduct({
      staffUserId: staff,
      handle: "free",
      title: "Free",
      variants: [{ sku: "FREE", title: "Free", priceCents: 0 }],
    });
    await db.update(shippingZones).set({ rateCents: 0 });
    const guestSessionId = randomUUID();
    const cart = await addToCart({
      guestSessionId,
      variantId: free.variants[0]!.id,
    });
    const quote = await getQuote({
      guestSessionId,
      cartId: cart.id,
      fulfillmentType: "shipping",
      shippingAddress: { country: "US", address: "1 Test" },
    });
    expect(
      (
        await createOrder({
          guestSessionId,
          quoteId: quote.id,
          guestEmail: "free@example.test",
          guestName: "Free",
        })
      ).lifecycleStatus,
    ).toBe("confirmed");
  });
  it("C8 only exchanges a recovery token once under concurrency", async () => {
    const p = await prepared();
    const order = await createOrder(p.input);
    const response = await requestTrackingLink({
      email: p.input.guestEmail,
      referenceCode: order.referenceCode,
    });
    expect(response).not.toHaveProperty("tokens");
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, order.id));
    const payload = events.find((e) => e.eventType === "order.access_recovery")!
      .payload as { recoveryUrl: string };
    const token = new URL(payload.recoveryUrl).searchParams.get("token")!;
    const results = await Promise.allSettled([
      verifyTrackingLink({ recoveryToken: token }),
      verifyTrackingLink({ recoveryToken: token }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("C10 accepts an owner proposal and preserves the previous version", async () => {
    const p = await prepared();
    const order = await createOrder(p.input);
    const proposal = await proposeOrderChange({
      staffUserId: staff,
      orderId: order.id,
      totalCents: 1800,
      reason: "Adjusted item price",
    });
    await acceptOrderChange({
      orderId: order.id,
      proposalId: proposal.id,
      sessionToken: order.sessionToken,
    });
    expect(
      (await trackOrder(order.id, order.sessionToken)).order.purchaseTotalCents,
    ).toBe(1800);
    expect(proposal.previousTotalCents).toBe(order.purchaseTotalCents);
  });
  it.each([100, 2000, 3000])(
    "C10 receipt %i voids proposal without applying its total",
    async (amount) => {
      const p = await prepared();
      const order = await createOrder(p.input);
      const proposal = await proposeOrderChange({
        staffUserId: staff,
        orderId: order.id,
        totalCents: 1500,
        reason: "Discount",
      });
      await recordReceipt({
        orderId: order.id,
        paymentAccountId: accountId,
        amountCents: amount,
        rawReference: randomUUID(),
        staffUserId: staff,
      });
      await expect(
        acceptOrderChange({
          orderId: order.id,
          proposalId: proposal.id,
          sessionToken: order.sessionToken,
        }),
      ).rejects.toThrow();
      const tracking = await trackOrder(order.id, order.sessionToken);
      expect(tracking.order.purchaseTotalCents).toBe(order.purchaseTotalCents);
      expect(tracking.receivedCents).toBe(amount);
    },
  );
  it("C6 validates immutable candidates and returns one final record under races", async () => {
    const { createUploadIntent } =
      await import("@/application/use-cases/uploads/create-upload-intent");
    const { finalizeUpload } =
      await import("@/application/use-cases/uploads/finalize-upload");
    const { cleanupUploads } =
      await import("@/application/use-cases/uploads/cleanup-uploads");
    const p = await prepared();
    const order = await createOrder(p.input);
    const intent = await createUploadIntent({
      orderId: order.id,
      sessionToken: order.sessionToken,
      declaredMimeType: "image/png",
      declaredSizeBytes: 100,
    });
    objects.set(intent.uploadUrl, {
      bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mime: "image/png",
      size: 100,
    });
    const input = {
      orderId: order.id,
      sessionToken: order.sessionToken,
      intentId: intent.intentId,
    };
    const results = await Promise.all([
      finalizeUpload(input),
      finalizeUpload(input),
    ]);
    expect(results[0]!.finalKey).toBe(results[1]!.finalKey);
    const key = results[0]!.finalKey!;
    objects.set(intent.uploadUrl, {
      bytes: new Uint8Array([1, 2, 3]),
      mime: "image/png",
      size: 100,
    });
    expect((await finalizeUpload(input)).finalKey).toBe(key);
    await cleanupUploads();
    expect(objects.get(key)!.bytes[0]).toBe(137);
    const bad = await createUploadIntent({
      orderId: order.id,
      sessionToken: order.sessionToken,
      declaredMimeType: "image/png",
      declaredSizeBytes: 100,
    });
    objects.set(bad.uploadUrl, {
      bytes: new Uint8Array([1, 2, 3]),
      mime: "image/png",
      size: 100,
    });
    await expect(
      finalizeUpload({ ...input, intentId: bad.intentId }),
    ).rejects.toThrow("Invalid image");
  });
  it("C9 delivery failure does not remove tracking access", async () => {
    const { processOutboxBatch } =
      await import("@/infrastructure/worker/outbox");
    const p = await prepared();
    const order = await createOrder(p.input);
    await processOutboxBatch({
      batchSize: 100,
      adapter: {
        sendEmail: async () => ({ success: false, error: "Synthetic outage" }),
      },
    });
    expect((await trackOrder(order.id, order.sessionToken)).order.id).toBe(
      order.id,
    );
  });
  it("revoked staff cannot publish products", async () => {
    await db
      .update(staffMemberships)
      .set({ isActive: false })
      .where(eq(staffMemberships.userId, staff));
    await expect(
      createProduct({
        staffUserId: staff,
        handle: "blocked",
        title: "Blocked",
        variants: [{ sku: "BLOCK", title: "Block", priceCents: 1 }],
      }),
    ).rejects.toThrow();
  });
});
