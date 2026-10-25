import {
  getAdminOperations,
  type AdminOperationsInput,
} from "@/application/queries/admin-operations";
import { createCategory } from "@/application/use-cases/catalog/create-category";
import { searchVariantOptions } from "@/application/queries/variant-options";
import { searchCategoryOptions } from "@/application/queries/category-options";
import { savePaymentAccount } from "@/application/use-cases/payments/save-payment-account";
import {
  customerCredit,
  issueStoreCredit,
} from "@/application/use-cases/store-credit/credit-operations";
import { db, queryClient } from "@/infrastructure/db";
import {
  auditRecords,
  carts,
  customers,
  orders,
  paymentReceipts,
  paymentUploadIntents,
  products,
  productVariants,
  payoutAllocations,
  quotes,
  staffMemberships,
  storeSettings,
} from "@/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(!process.env.DATABASE_URL?.endsWith("/supastore_test"))(
  "admin query scope and command ownership",
  () => {
    const owner = "query-owner";
    const staff = "query-staff";
    const input: AdminOperationsInput = {
      staffUserId: owner,
      view: "orders",
      search: "",
      status: "",
      page: 1,
      paymentSearch: "",
      paymentStatus: "",
      paymentType: "",
      paymentPage: 1,
      payoutPage: 1,
      evidencePage: 1,
      failurePage: 1,
    };
    let accountId: string;
    const data = Array.from({ length: 110 }, (_, i) => ({
      cartId: randomUUID(),
      quoteId: randomUUID(),
      orderId: randomUUID(),
      receiptId: randomUUID(),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      index: i,
    }));
    beforeAll(async () => {
      await migrate(db, {
        migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
      });
      await queryClient.unsafe(
        "TRUNCATE store_settings, staff_memberships, products, payment_accounts, categories, carts, orders, outbox_events CASCADE",
      );
      await db.insert(staffMemberships).values([
        { userId: owner, email: "owner@example.test", role: "owner" },
        { userId: staff, email: "staff@example.test", role: "staff" },
      ]);
      await db.insert(storeSettings).values({
        storeName: "Query fixture",
        supportEmail: "owner@example.test",
      });
      const account = await savePaymentAccount({
        staffUserId: owner,
        id: "",
        mode: "",
        name: "Fixture",
        instructions: "fixture-account",
        accountType: "cash",
        active: "",
      });
      accountId = account.id;
      await db.insert(carts).values(
        data.map((d) => ({
          id: d.cartId,
          guestSessionId: `fixture:${d.index}`,
        })),
      );
      await db.insert(quotes).values(
        data.map((d) => ({
          id: d.quoteId,
          cartId: d.cartId,
          cartRevision: 1,
          merchandiseSubtotalCents: 100,
          shippingCents: 0,
          exclusiveTaxCents: 0,
          inclusiveTaxCents: 0,
          totalPayableCents: 100,
          itemsSnapshot: [],
          shippingSnapshot: {},
          expiresAt: new Date("2030-01-01"),
        })),
      );
      await db.insert(orders).values(
        data.map((d) => ({
          id: d.orderId,
          sourceCartId: d.cartId,
          quoteId: d.quoteId,
          referenceCode: `QUERY-${d.index}`,
          guestEmail: "buyer@example.test",
          guestName: "Buyer",
          purchaseTotalCents: 100,
          shippingAddressSnapshot: {},
          createdAt: d.createdAt,
        })),
      );
      await db.insert(paymentReceipts).values(
        data.map((d) => ({
          id: d.receiptId,
          orderId: d.orderId,
          paymentAccountId: accountId,
          amountCents: 100,
          rawReference: `RECEIPT-${d.index}`,
          normalizedReference: `RECEIPT-${d.index}`,
          recordedByUserId: owner,
          createdAt: d.createdAt,
        })),
      );
      await db.insert(payoutAllocations).values(
        data.map((d) => ({
          receiptId: d.receiptId,
          authorizedAmountCents: 50,
          createdAt: d.createdAt,
        })),
      );
      await db.insert(paymentUploadIntents).values(
        data.map((d) => ({
          orderId: d.orderId,
          s3Key: `fixture/${d.index}`,
          status: "finalized" as const,
          declaredMimeType: "image/png",
          declaredSizeBytes: 1,
          expiresAt: new Date("2030-01-01"),
          createdAt: d.createdAt,
        })),
      );
    });
    afterAll(async () => {
      await queryClient.end();
    });
    it("bounds category searches and enforces owner access", async () => {
      const prefix = randomUUID();
      try {
        await queryClient`insert into categories(name,slug) select ${prefix} || '-' || n, ${prefix} || '-' || n from generate_series(1,61) n`;
        const results = await searchCategoryOptions(owner, prefix);
        expect(results.options).toHaveLength(50);
        expect(results.hasNext).toBe(true);
        await expect(searchCategoryOptions(staff, prefix)).rejects.toThrow(
          "Owner privileges",
        );
      } finally {
        await queryClient`delete from categories where slug like ${prefix + "%"}`;
      }
    });

    it("loads receipts only for the selected orders", async () => {
      const page = await getAdminOperations(input);
      expect(page.rows).toHaveLength(51);
      expect(page.receipts).toHaveLength(51);
      expect(
        page.receipts.every((receipt) =>
          page.rows.some((order) => order.id === receipt.orderId),
        ),
      ).toBe(true);
      expect(page.allocations).toEqual([]);
      expect(page.evidence).toEqual([]);
    });
    it("keeps older payment search results and their receipts available", async () => {
      const page = await getAdminOperations({
        ...input,
        view: "payments",
        paymentSearch: "RECEIPT-0",
      });
      expect(page.paymentRows).toHaveLength(1);
      expect(
        page.receipts.some((receipt) => receipt.orderId === data[0]!.orderId),
      ).toBe(true);
    });
    it("paginates independent payout and evidence queues without losing older work", async () => {
      const first = await getAdminOperations({ ...input, view: "payments" });
      const last = await getAdminOperations({
        ...input,
        view: "payments",
        payoutPage: 3,
        evidencePage: 3,
      });
      expect(first.allocations).toHaveLength(50);
      expect(first.payoutHasNext).toBe(true);
      expect(first.evidence).toHaveLength(50);
      expect(first.evidenceHasNext).toBe(true);
      expect(last.allocations).toHaveLength(10);
      expect(last.payoutHasNext).toBe(false);
      expect(last.evidence).toHaveLength(10);
      expect(last.evidenceHasNext).toBe(false);
    });
    it("counts all overview work instead of the latest 100 orders", async () => {
      const summary = await getAdminOperations({ ...input, view: "overview" });
      expect(summary.queueCounts.unpaidOrders).toBe(110);
      expect(summary.queueCounts.evidenceReviews).toBe(110);
    });
    it("paginates fulfillment and opens orders outside the selected page", async () => {
      const activeWork = await getAdminOperations({
        ...input,
        view: "fulfillment",
      });
      expect(activeWork.rows).toEqual([]);
      const receiptWork = await getAdminOperations({
        ...input,
        view: "fulfillment",
        fulfillmentWork: "all",
      });
      expect(receiptWork.rows).toHaveLength(50);
      const staffWork = await getAdminOperations({
        ...input,
        view: "fulfillment",
        staffUserId: staff,
        fulfillmentWork: "all",
      });
      expect(staffWork.rows).toEqual([]);
      await db.update(orders).set({ lifecycleStatus: "confirmed" });
      try {
        const first = await getAdminOperations({
          ...input,
          view: "fulfillment",
          fulfillmentPage: 1,
        });
        const last = await getAdminOperations({
          ...input,
          view: "fulfillment",
          fulfillmentPage: 3,
        });
        expect(first.rows).toHaveLength(50);
        expect(first.fulfillmentHasNext).toBe(true);
        expect(last.rows).toHaveLength(10);
        expect(last.fulfillmentHasNext).toBe(false);
        expect(last.rows.some((order) => order.id === data[0]!.orderId)).toBe(
          true,
        );
        const selected = await getAdminOperations({
          ...input,
          view: "fulfillment",
          fulfillmentPage: 1,
          managedOrderId: data[0]!.orderId,
        });
        expect(selected.managedOrders).toHaveLength(1);
        expect(selected.managedOrders[0]!.id).toBe(data[0]!.orderId);
        expect(
          selected.receipts.some(
            (receipt) => receipt.orderId === data[0]!.orderId,
          ),
        ).toBe(true);
      } finally {
        await db.update(orders).set({ lifecycleStatus: "unpaid" });
      }
    });
    it("bounds variant options and finds catalog items beyond the initial batch", async () => {
      const id = randomUUID();
      await db
        .insert(products)
        .values({ id, handle: id, title: "Selector fixture" });
      await db.insert(productVariants).values(
        Array.from({ length: 51 }, (_, index) => ({
          productId: id,
          sku: `selector-${String(index).padStart(3, "0")}`,
          title: `Variant ${index}`,
          priceCents: 100,
        })),
      );
      const first = await searchVariantOptions(owner, "selector-");
      expect(first.options).toHaveLength(50);
      expect(first.hasNext).toBe(true);
      const last = await searchVariantOptions(owner, "selector-050");
      expect(last.options).toHaveLength(1);
      expect(last.options[0]?.label).toContain("selector-050");
      await expect(searchVariantOptions(staff, "selector-")).rejects.toThrow(
        "Owner privileges",
      );
    });
    it("pages customer credit history while reconciling the complete ledger", async () => {
      const customerId = randomUUID();
      await db.insert(customers).values({
        id: customerId,
        email: `${customerId}@example.test`,
        name: "Credit history fixture",
      });
      for (let index = 0; index < 26; index++)
        await issueStoreCredit({
          staffUserId: owner,
          customerId,
          amountCents: 100,
          reason: `History ${index}`,
          requestKey: randomUUID(),
        });
      const first = await db.transaction((tx) =>
        customerCredit(tx, customerId),
      );
      const second = await db.transaction((tx) =>
        customerCredit(tx, customerId, 2),
      );
      expect(first?.entries).toHaveLength(25);
      expect(second?.entries).toHaveLength(1);
      expect(first?.account.balanceCents).toBe(2600);
      expect(second?.reconciled).toBe(true);
      expect(
        new Set(
          [...first!.entries, ...second!.entries].map((entry) => entry.id),
        ).size,
      ).toBe(26);
    });
    it("enforces owner authorization and audits extracted mutations", async () => {
      await expect(
        createCategory({ staffUserId: staff, name: "Denied", slug: "denied" }),
      ).rejects.toThrow("Owner privileges");
      await expect(
        savePaymentAccount({
          staffUserId: staff,
          id: accountId,
          mode: "",
          active: "false",
          name: "",
          instructions: "",
          accountType: "",
        }),
      ).rejects.toThrow("Owner privileges");
      const category = await createCategory({
        staffUserId: owner,
        name: "New",
        slug: "new",
      });
      await expect(
        createCategory({ staffUserId: owner, name: "Duplicate", slug: "new" }),
      ).rejects.toThrow("already in use");
      const audit = await db
        .select()
        .from(auditRecords)
        .where(eq(auditRecords.entityId, category.id));
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: "created", actorId: owner });
      await expect(
        savePaymentAccount({
          staffUserId: owner,
          id: randomUUID(),
          mode: "",
          active: "false",
          name: "",
          instructions: "",
          accountType: "",
        }),
      ).rejects.toThrow("Payment account not found");
    });
  },
);
