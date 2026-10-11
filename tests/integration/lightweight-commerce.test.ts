import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";
import {
  ledgerTimestamp,
  ledgerBoundary,
  type LedgerCursor,
} from "@/infrastructure/db/ledger-cursor";
const active = vi.hoisted(() => ({ db: undefined as unknown }));
const storage = vi.hoisted(() => ({
  putCatalogAsset: vi.fn(),
  deleteCatalogAsset: vi.fn(),
}));
vi.mock("@/infrastructure/storage", () => storage);
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return active.db;
  },
}));
import * as schema from "@/infrastructure/db/schema";
import { createProduct } from "@/application/use-cases/catalog/create-product";
import { addToCart } from "@/application/use-cases/cart/add-to-cart";
import { getQuote } from "@/application/use-cases/get-quote";
import { createOrder } from "@/application/use-cases/create-order";
import { createManualOrder } from "@/application/use-cases/create-manual-order";
import { cancelOrder } from "@/application/use-cases/orders/cancel-order";
import { adjustStock } from "@/application/use-cases/inventory/stock-operations";
import { recordReceipt } from "@/application/use-cases/record-receipt";
import { confirmOrder } from "@/application/use-cases/confirm-order";
import { fulfillOrder } from "@/application/use-cases/fulfill-order";
import {
  dispatchShipment,
  recordShipmentDelivered,
  applyCarrierDelivery,
} from "@/application/use-cases/fulfillment/shipments";
import {
  rescheduleOrder,
  rescheduleOrderWindow,
} from "@/application/use-cases/fulfillment/reschedule-order";
import { configureSlotQuota } from "@/application/use-cases/inventory/slot-operations";
import {
  claimGuestOrder,
  customerAccount,
  openOwnedOrder,
  saveCustomerAddress,
} from "@/application/use-cases/customers/customer-ownership";
import { issueStoreCredit } from "@/application/use-cases/store-credit/credit-operations";
import { refundPurchase } from "@/application/use-cases/store-credit/purchase-refund";
import {
  createCreditSourceLot,
  reclaimRewardSource,
  offsetRewardDebts,
} from "@/application/use-cases/store-credit/credit-sources";
import {
  lockCreditAccount,
  creditHash,
} from "@/application/use-cases/store-credit/credit-operations";
import { authorizeRefund } from "@/application/use-cases/refund-payout";
import { uploadCatalogImage } from "@/application/use-cases/catalog/upload-catalog-image";
import { cleanupCatalogMedia } from "@/application/use-cases/catalog/cleanup-catalog-media";
import { removeProductImage } from "@/application/use-cases/catalog/manage-catalog";
import { importProductsCsv } from "@/application/use-cases/catalog/import-products-csv";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { bulkUpdateVariants } from "@/application/use-cases/catalog/bulk-update-variants";
import {
  requestGoodsReturn,
  reviewGoodsReturn,
  receiveGoodsReturn,
} from "@/application/use-cases/returns/manage-returns";
const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("lightweight commerce transactional journeys", () => {
  const name = `commerce_test_${randomUUID().replaceAll("-", "")}`;
  const owner = "commerce-owner";
  let admin: ReturnType<typeof postgres>,
    client: ReturnType<typeof postgres>,
    bank: string;
  beforeAll(async () => {
    admin = postgres(server!);
    await admin.unsafe(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    const url = new URL(server!);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { max: 10, onnotice: () => {} });
    active.db = drizzle(client, { schema });
    await migrate(active.db as ReturnType<typeof drizzle>, {
      migrationsFolder: "src/infrastructure/db/migrations",
    });
    await client`insert into staff_memberships(user_id,email,role) values(${owner},'owner@example.test','owner')`;
    await client`insert into store_settings(store_name,support_email,setup_completed,email_verified_at) values('Commerce tests','support@example.test',true,now())`;
    const [account] =
      await client`insert into payment_accounts(account_name,account_identifier) values('Test bank','Test bank') returning id`;
    bank = account!.id;
    await client`insert into shipping_zones(name,rate_cents) values('Worldwide',0)`;
    for (const id of ["customer-a", "customer-b"])
      await client`insert into "user"(id,name,email,email_verified) values(${id},${id},${`${id}@example.test`},true)`;
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
  async function product(priceCents = 1000) {
    const code = randomUUID();
    const result = await createProduct({
      staffUserId: owner,
      title: "Stock test",
      handle: `stock-${code}`,
      variants: [{ sku: code, title: "Default", priceCents }],
    });
    return result.variants[0]!;
  }
  async function prepare(variantId: string, quantity = 1) {
    const guestSessionId = randomUUID();
    const cart = await addToCart({ guestSessionId, variantId, quantity });
    const quote = await getQuote({
      guestSessionId,
      cartId: cart.id,
      fulfillmentType: "shipping",
      shippingAddress: { country: "US", address: "1 Test St" },
      paymentAccountId: bank,
    });
    return {
      quoteId: quote.id,
      guestSessionId,
      guestEmail: "guest@example.test",
      guestName: "Guest",
    };
  }
  it("recovers concurrent and lost-response manual submissions without duplicate side effects", async () => {
    const variant = await product();
    const input = {
      requestKey: randomUUID(),
      staffUserId: owner,
      customerName: "Manual customer",
      customerEmail: "manual@example.test",
      country: "US",
      address: "1 Test St",
      paymentAccountId: bank,
      items: [{ variantId: variant.id, quantity: 1 }],
    };
    const [first, second] = await Promise.all([
      createManualOrder(input),
      createManualOrder(input),
    ]);
    expect(second.id).toBe(first.id);
    await client`update store_settings set is_paused=true`;
    try {
      expect((await createManualOrder(input)).id).toBe(first.id);
      await expect(
        createManualOrder({ ...input, address: "Changed address" }),
      ).rejects.toThrow("request");
    } finally {
      await client`update store_settings set is_paused=false`;
    }
    const [counts] = await client`select
      (select count(*)::int from orders where source_cart_id=${first.sourceCartId}) as orders,
      (select count(*)::int from quotes where cart_id=${first.sourceCartId}) as quotes,
      (select count(*)::int from audit_records where entity_id=${first.id} and action='manual_order.created') as audits`;
    expect(counts).toMatchObject({ orders: 1, quotes: 1, audits: 1 });
  });
  it("rolls back manual preparation when quoting fails", async () => {
    const variant = await product();
    const input = {
      requestKey: randomUUID(),
      staffUserId: owner,
      customerName: "Manual customer",
      customerEmail: "manual@example.test",
      country: "US",
      address: "1 Test St",
      paymentAccountId: randomUUID(),
      items: [{ variantId: variant.id, quantity: 1 }],
    };
    const [before] = await client`select count(*)::int as count from carts`;
    await expect(createManualOrder(input)).rejects.toThrow();
    const [after] = await client`select count(*)::int as count from carts`;
    expect(after!.count).toBe(before!.count);
  });
  it("consumes partial shipment stock once and completes only after all units arrive", async () => {
    const variant = await product();
    await adjustStock({
      staffUserId: owner,
      variantId: variant.id,
      onHand: 3,
      tracking: true,
      reason: "Count",
      requestKey: randomUUID(),
    });
    const order = await createOrder(await prepare(variant.id, 3));
    await recordReceipt({
      orderId: order.id,
      paymentAccountId: bank,
      amountCents: order.purchaseTotalCents,
      rawReference: randomUUID(),
      staffUserId: owner,
    });
    await confirmOrder({ orderId: order.id, staffUserId: owner });
    const [item] =
      await client`select id from order_items where order_id=${order.id}`;
    const input = {
      orderId: order.id,
      staffUserId: owner,
      requestKey: randomUUID(),
      carrier: "Synthetic carrier",
      items: [{ orderItemId: item!.id, quantity: 1 }],
    };
    const first = await dispatchShipment(input);
    await dispatchShipment(input);
    expect(
      (
        await client`select on_hand,reserved from variant_stock where variant_id=${variant.id}`
      )[0],
    ).toMatchObject({ on_hand: 2, reserved: 2 });
    await recordShipmentDelivered({
      shipmentId: first!.id,
      staffUserId: owner,
    });
    expect(
      (
        await client`select lifecycle_status from orders where id=${order.id}`
      )[0]!.lifecycle_status,
    ).toBe("confirmed");
    await expect(
      fulfillOrder({
        orderId: order.id,
        staffUserId: owner,
        carrier: "Manual",
      }),
    ).rejects.toThrow("every ordered unit");
    await expect(
      cancelOrder({
        orderId: order.id,
        actorUserId: owner,
        reason: "Cancel dispatched",
      }),
    ).rejects.toThrow();
    const previous = process.env.CARRIER_WEBHOOK_PROVIDER;
    process.env.CARRIER_WEBHOOK_PROVIDER = "synthetic";
    try {
      const second = await dispatchShipment({
        ...input,
        requestKey: randomUUID(),
        provider: "synthetic",
        items: [{ orderItemId: item!.id, quantity: 2 }],
      });
      const event = {
        provider: "synthetic",
        eventId: "delivered-event",
        shipmentId: second!.id,
        bodyHash: "same-body",
      };
      await applyCarrierDelivery(event);
      expect((await applyCarrierDelivery(event)).duplicate).toBe(true);
      await expect(
        applyCarrierDelivery({ ...event, bodyHash: "changed" }),
      ).rejects.toThrow("changed payload");
      expect(
        (
          await client`select lifecycle_status from orders where id=${order.id}`
        )[0]!.lifecycle_status,
      ).toBe("completed");
      expect(
        (
          await client`select on_hand,reserved from variant_stock where variant_id=${variant.id}`
        )[0],
      ).toMatchObject({ on_hand: 0, reserved: 0 });
      expect(
        (
          await client`select count(*)::int count from stock_movements where order_id=${order.id}`
        )[0]!.count,
      ).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.CARRIER_WEBHOOK_PROVIDER;
      else process.env.CARRIER_WEBHOOK_PROVIDER = previous;
    }
  });
  it("serializes pickup capacity and enforces variant quotas after cancellation", async () => {
    const variant = await product();
    const schedule = Object.fromEntries(
      ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [
        day,
        [["12:00", "13:00"]],
      ]),
    );
    const [location] =
      await client`insert into pickup_location(name,address,weekly_schedule,prep_minutes,slot_capacity) values('Generic pickup','1 Test St',${JSON.stringify(schedule)}::jsonb,0,1) returning id`;
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    async function pickupInput() {
      const guestSessionId = randomUUID();
      const cart = await addToCart({
        guestSessionId,
        variantId: variant.id,
        quantity: 1,
      });
      const quote = await getQuote({
        guestSessionId,
        cartId: cart.id,
        fulfillmentType: "pickup",
        shippingAddress: { country: "US", address: "" },
        pickupLocationId: location!.id,
        pickupDate: date,
        pickupTime: "12:00",
        paymentAccountId: bank,
      });
      return {
        guestSessionId,
        quoteId: quote.id,
        guestEmail: "slot@example.test",
        guestName: "Slot buyer",
      };
    }
    const inputs = await Promise.all([pickupInput(), pickupInput()]);
    const results = await Promise.allSettled(inputs.map(createOrder));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const accepted = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>>;
    const [hold] =
      await client`select slot_id from slot_reservations where order_id=${accepted.value.id}`;
    const newDate = new Date(Date.now() + 8 * 86400000)
      .toISOString()
      .slice(0, 10);
    const [pickup] =
      await client`insert into pickup_time_slots(location_id,date,start_time,end_time) values(${location!.id},${newDate},'12:00','13:00') returning id`;
    const [destination] =
      await client`insert into fulfillment_slots(pickup_slot_id,date,start_time,end_time,timezone,capacity) values(${pickup!.id},${newDate},'12:00','13:00','UTC',0) returning id`;
    await expect(
      rescheduleOrder({
        staffUserId: owner,
        orderId: accepted.value.id,
        slotId: destination!.id,
        reason: "Change date",
      }),
    ).rejects.toThrow("full");
    expect(
      (
        await client`select slot_id from slot_reservations where order_id=${accepted.value.id}`
      )[0]!.slot_id,
    ).toBe(hold!.slot_id);
    await client`update fulfillment_slots set capacity=1 where id=${destination!.id}`;
    await rescheduleOrder({
      staffUserId: owner,
      orderId: accepted.value.id,
      slotId: destination!.id,
      reason: "Change date",
    });
    expect(
      (
        await client`select slot_id from slot_reservations where order_id=${accepted.value.id}`
      )[0]!.slot_id,
    ).toBe(destination!.id);
    await rescheduleOrder({
      staffUserId: owner,
      orderId: accepted.value.id,
      slotId: hold!.slot_id,
      reason: "Return to original window",
    });
    const newlyProvisioned = await rescheduleOrderWindow({
      staffUserId: owner,
      orderId: accepted.value.id,
      date: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10),
      startTime: "12:00",
      reason: "Choose new window",
    });
    expect(newlyProvisioned?.slotId).not.toBe(hold!.slot_id);
    await rescheduleOrder({
      staffUserId: owner,
      orderId: accepted.value.id,
      slotId: hold!.slot_id,
      reason: "Restore original booking",
    });
    // Restored pre-capacity installations have fulfillment snapshots but no holds.
    await client`delete from slot_reservations where order_id=${accepted.value.id}`;
    await client.unsafe(
      readFileSync(
        "src/infrastructure/db/migrations/0029_legacy_slot_bookings.sql",
        "utf8",
      ),
    );
    await client.unsafe(
      readFileSync(
        "src/infrastructure/db/migrations/0029_legacy_slot_bookings.sql",
        "utf8",
      ),
    );
    expect(
      await client`select slot_id,status from slot_reservations where order_id=${accepted.value.id}`,
    ).toEqual([
      expect.objectContaining({ slot_id: hold!.slot_id, status: "active" }),
    ]);
    await expect(
      configureSlotQuota({
        staffUserId: owner,
        slotId: hold!.slot_id,
        variantId: variant.id,
        quantity: 0,
      }),
    ).rejects.toThrow("already booked");
    await cancelOrder({
      orderId: accepted.value.id,
      actorUserId: owner,
      reason: "Release slot",
    });
    await configureSlotQuota({
      staffUserId: owner,
      slotId: hold!.slot_id,
      variantId: variant.id,
      quantity: 0,
    });
    await expect(createOrder(await pickupInput())).rejects.toThrow("sold out");
  });
  it("books scheduled local delivery without requiring a pickup location", async () => {
    const [settings] =
      await client`select commerce_policy from store_settings limit 1`;
    await client`update store_settings set commerce_policy=${JSON.stringify({ ...settings!.commerce_policy, deliveryEnabled: true })}::jsonb`;
    try {
      const schedule = Object.fromEntries(
        ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [
          day,
          [["12:00", "13:00"]],
        ]),
      );
      const [area] =
        await client`insert into delivery_areas(name,country_codes,postal_prefixes,rate_cents,weekly_schedule,prep_minutes,schedule_required,slot_capacity) values('Neighborhood','["US"]','["981"]',0,${JSON.stringify(schedule)}::jsonb,0,true,1) returning id`;
      const variant = await product();
      const guestSessionId = randomUUID();
      const cart = await addToCart({
        guestSessionId,
        variantId: variant.id,
        quantity: 1,
      });
      const quote = await getQuote({
        guestSessionId,
        cartId: cart.id,
        fulfillmentType: "local_delivery",
        shippingAddress: {
          country: "US",
          address: "1 Test St",
          postalCode: "98101",
        },
        deliveryAreaId: area!.id,
        pickupDate: new Date(Date.now() + 7 * 86400000)
          .toISOString()
          .slice(0, 10),
        pickupTime: "12:00",
        paymentAccountId: bank,
      });
      const order = await createOrder({
        guestSessionId,
        quoteId: quote.id,
        guestEmail: "delivery@example.test",
        guestName: "Delivery buyer",
      });
      expect(
        (
          await client`select f.delivery_area_id,o.pickup_slot_id from order_fulfillments o join fulfillment_slots f on f.id=o.fulfillment_slot_id where o.order_id=${order.id}`
        )[0],
      ).toMatchObject({ delivery_area_id: area!.id, pickup_slot_id: null });
      await cancelOrder({
        orderId: order.id,
        actorUserId: owner,
        reason: "Release delivery",
      });
    } finally {
      await client`update store_settings set commerce_policy=${JSON.stringify(settings!.commerce_policy)}::jsonb`;
    }
  });
  it("applies reviewed bulk changes atomically and rejects stale or foreign variants", async () => {
    const variant = await product();
    const other = await product();
    const [before] =
      await client`select quote_version from products where id=${variant.productId}`;
    const input = {
      staffUserId: owner,
      productId: variant.productId,
      revision: before!.quote_version,
      variantIds: [variant.id],
      priceCents: 750,
      isAvailable: false,
    };
    await expect(
      bulkUpdateVariants({ ...input, staffUserId: "not-owner" }),
    ).rejects.toThrow();
    await expect(
      bulkUpdateVariants({ ...input, variantIds: [variant.id, other.id] }),
    ).rejects.toThrow("belong");
    expect(
      (
        await client`select price_cents from product_variants where id=${variant.id}`
      )[0]!.price_cents,
    ).toBe(1000);
    await expect(bulkUpdateVariants(input)).resolves.toEqual({ updated: 1 });
    await expect(bulkUpdateVariants(input)).rejects.toThrow("changed");
    const [saved] =
      await client`select sku,price_cents,is_available from product_variants where id=${variant.id}`;
    expect(saved).toMatchObject({
      sku: variant.sku,
      price_cents: 750,
      is_available: false,
    });
    expect(
      (
        await client`select quote_version from products where id=${variant.productId}`
      )[0]!.quote_version,
    ).toBe(input.revision + 1);
    expect(
      await client`select id from audit_records where entity_id=${variant.productId} and action='variants.bulk_updated'`,
    ).toHaveLength(1);
  });
  it("pages immutable history without skipping microseconds or duplicating entries after a new append", async () => {
    const variant = await product();
    const inserted =
      await client`insert into stock_movements(variant_id,delta,reason,actor_id,request_key,created_at)
      select ${variant.id},0,'Cursor fixture',${owner},gen_random_uuid()::text,
        '2026-01-01T00:00:00Z'::timestamptz + (n % 3 + 1) * interval '1 microsecond'
      from generate_series(1,61) n returning id`;
    const expected = new Set(inserted.map((r) => r.id));
    for (const ascending of [false, true]) {
      let cursor: LedgerCursor | undefined;
      const seen: string[] = [];
      while (true) {
        const table = schema.stockMovements;
        const rows = await (active.db as ReturnType<typeof drizzle>)
          .select({
            ...getTableColumns(table),
            timestamp: ledgerTimestamp(table.createdAt),
          })
          .from(table)
          .where(
            and(
              eq(table.variantId, variant.id),
              ledgerBoundary(table.createdAt, table.id, cursor, ascending),
            ),
          )
          .orderBy(
            ascending ? asc(table.createdAt) : desc(table.createdAt),
            ascending ? asc(table.id) : desc(table.id),
          )
          .limit(25);
        if (!rows.length) break;
        seen.push(...rows.map((r) => r.id));
        const last = rows[rows.length - 1]!;
        cursor = { timestamp: last.timestamp, id: last.id };
        if (!ascending && seen.length === 25)
          await client`insert into stock_movements(variant_id,delta,reason,actor_id,request_key,created_at)
            values(${variant.id},0,'New append',${owner},${randomUUID()},'2027-01-01T00:00:00Z')`;
      }
      expect(new Set(seen).size).toBe(seen.length);
      if (!ascending) expect(new Set(seen)).toEqual(expected);
      else {
        expect(seen).toHaveLength(62);
        for (const id of expected) expect(seen).toContain(id);
      }
    }
  });
  it("protects uploaded media, compensates stale uploads and cleans detached objects", async () => {
    storage.putCatalogAsset.mockResolvedValue(undefined);
    storage.deleteCatalogAsset.mockResolvedValue(undefined);
    const v = await product();
    const bytes = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const upload = {
      staffUserId: owner,
      entityId: v.productId,
      entityType: "product" as const,
      altText: "Product preview",
      bytes,
      mime: "image/png",
    };
    await expect(
      uploadCatalogImage({ ...upload, staffUserId: "not-owner" }),
    ).rejects.toThrow("membership required");
    expect(storage.putCatalogAsset).not.toHaveBeenCalled();
    await expect(
      uploadCatalogImage({ ...upload, mime: "image/jpeg" }),
    ).rejects.toThrow();
    await uploadCatalogImage(upload);
    const [image] =
      await client`select id,s3_key from product_images where product_id=${v.productId}`;
    expect(image!.s3_key).toMatch(/^catalog\/[0-9a-f-]+\/[0-9a-f-]+\.png$/);
    await removeProductImage({
      staffUserId: owner,
      productId: v.productId,
      imageId: image!.id,
      reason: "New photography needed",
    });
    // Expiry uses a millisecond application clock; move the fixture clearly into the past.
    await client`update catalog_media_uploads set expires_at=now()-interval '1 second' where s3_key=${image!.s3_key}`;
    await cleanupCatalogMedia();
    expect(storage.deleteCatalogAsset).toHaveBeenCalledWith(image!.s3_key);
    expect(
      (
        await client`select status from catalog_media_uploads where s3_key=${image!.s3_key}`
      )[0]!.status,
    ).toBe("deleted");
    storage.putCatalogAsset.mockImplementationOnce(async () => {
      await client`update products set quote_version=quote_version+1 where id=${v.productId}`;
    });
    await expect(uploadCatalogImage(upload)).rejects.toThrow(
      "changed during upload",
    );
    expect(
      await client`select id from product_images where product_id=${v.productId}`,
    ).toHaveLength(0);
  });
  it("imports canonical sparse variants, preserves identities and filters one matching variant", async () => {
    const code = randomUUID().replaceAll("-", ""),
      handle = `import-${code}`;
    const [color] =
      await client`insert into attributes(code,name) values(${`color-${code}`},'Color') returning id`;
    const [size] =
      await client`insert into attributes(code,name) values(${`size-${code}`},'Size') returning id`;
    await client`insert into attribute_values(attribute_id,code,label) values(${color!.id},'red','Red'),(${color!.id},'blue','Blue'),(${size!.id},'s','Small'),(${size!.id},'m','Medium')`;
    const [collection] =
      await client`insert into product_collections(handle,title) values(${`collection-${code}`},'Import collection') returning id`;
    const base = {
      handle,
      productTitle: `Import ${code}`,
      description: "Imported descriptions",
      priceCents: 1000,
      isAvailable: true,
      isPublished: true,
      collectionHandles: [`collection-${code}`],
    };
    const rows = [
      {
        ...base,
        sku: `RED-${code}`,
        variantTitle: "Red Small",
        optionValues: { [`color-${code}`]: "red", [`size-${code}`]: "s" },
      },
      {
        ...base,
        sku: `BLUE-${code}`,
        variantTitle: "Blue Medium",
        optionValues: { [`color-${code}`]: "blue", [`size-${code}`]: "m" },
      },
    ];
    expect(await importProductsCsv({ staffUserId: owner, rows })).toMatchObject(
      { created: 2, updated: 0 },
    );
    const variants =
      await client`select id,sku,combination_key from product_variants where product_id=(select id from products where handle=${handle}) order by sku`;
    await importProductsCsv({ staffUserId: owner, rows });
    expect(
      await client`select id,sku,combination_key from product_variants where product_id=(select id from products where handle=${handle}) order by sku`,
    ).toEqual(variants);
    expect(
      await client`select * from product_collection_memberships where collection_id=${collection!.id}`,
    ).toHaveLength(1);
    const mismatched = await listProducts({
      search: code,
      optionValues: [
        { attribute: `color-${code}`, value: "red" },
        { attribute: `size-${code}`, value: "m" },
      ],
    });
    expect(mismatched.total).toBe(0);
    expect(
      (
        await listProducts({
          search: code,
          optionValues: [
            { attribute: `color-${code}`, value: "blue" },
            { attribute: `size-${code}`, value: "m" },
          ],
        })
      ).total,
    ).toBe(1);
    await client`insert into product_translations(product_id,locale,title,description) select id,'zh','红色测试商品','中文说明' from products where handle=${handle}`;
    expect(
      (await listProducts({ locale: "zh", search: "红色测试" })).items[0]
        ?.title,
    ).toBe("红色测试商品");
    await expect(
      importProductsCsv({
        staffUserId: owner,
        rows: [
          {
            ...rows[0]!,
            optionValues: { [`color-${code}`]: "blue", [`size-${code}`]: "s" },
          },
        ],
      }),
    ).rejects.toThrow("cannot change");
  });
  it("enforces append-only credit and inventory ledger history in PostgreSQL", async () => {
    const v = await product();
    await adjustStock({
      staffUserId: owner,
      variantId: v.id,
      onHand: 1,
      tracking: true,
      reason: "Ledger guard test",
      requestKey: randomUUID(),
    });
    await expect(
      client`update stock_movements set delta=2 where variant_id=${v.id}`,
    ).rejects.toMatchObject({ code: "23514" });
    const customer = (await customerAccount("customer-a")).customer;
    const accountId = await issueStoreCredit({
      staffUserId: owner,
      customerId: customer.id,
      amountCents: 1,
      reason: "Ledger guard test",
      requestKey: randomUUID(),
    });
    await expect(
      client`delete from store_credit_entries where account_id=${accountId}`,
    ).rejects.toMatchObject({ code: "23514" });
    // Append a legitimate compensating entry to leave later balance fixtures unchanged.
    const [entry] =
      await client`select id from store_credit_entries where account_id=${accountId} and reason='Ledger guard test'`;
    await issueStoreCredit({
      staffUserId: owner,
      customerId: customer.id,
      amountCents: 1,
      reason: "Reverse test entry",
      requestKey: randomUUID(),
      reversalOfId: entry!.id,
    });
  });
  it("reserves the last unit once, preserves the losing cart and releases on cancellation", async () => {
    const v = await product();
    const requestKey = randomUUID();
    await adjustStock({
      staffUserId: owner,
      variantId: v.id,
      onHand: 1,
      tracking: true,
      reason: "Opening count",
      requestKey,
    });
    await adjustStock({
      staffUserId: owner,
      variantId: v.id,
      onHand: 1,
      tracking: true,
      reason: "Opening count",
      requestKey,
    });
    await expect(
      adjustStock({
        staffUserId: owner,
        variantId: v.id,
        onHand: 2,
        tracking: true,
        reason: "Opening count",
        requestKey,
      }),
    ).rejects.toThrow("different input");
    const inputs = await Promise.all([prepare(v.id), prepare(v.id)]);
    const results = await Promise.allSettled(inputs.map(createOrder));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const accepted = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>>;
    const losing = inputs[results.findIndex((r) => r.status === "rejected")]!;
    expect(
      (
        await client`select converted_order_id from carts join quotes on quotes.cart_id=carts.id where quotes.id=${losing.quoteId}`
      )[0]!.converted_order_id,
    ).toBeNull();
    expect(
      (
        await client`select reserved from variant_stock where variant_id=${v.id}`
      )[0]!.reserved,
    ).toBe(1);
    await expect(
      adjustStock({
        staffUserId: owner,
        variantId: v.id,
        onHand: 1,
        tracking: false,
        reason: "Disable",
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("Cannot disable");
    await cancelOrder({
      orderId: accepted.value.id,
      actorUserId: owner,
      reason: "Customer cancelled before payment",
    });
    expect(
      (
        await client`select reserved,on_hand from variant_stock where variant_id=${v.id}`
      )[0],
    ).toMatchObject({ reserved: 0, on_hand: 1 });
    const retry = await createOrder(losing);
    expect(retry.lifecycleStatus).toBe("unpaid");
  });
  it("blocks shortages and consumes stock exactly once at fulfillment", async () => {
    const v = await product();
    await adjustStock({
      staffUserId: owner,
      variantId: v.id,
      onHand: 1,
      tracking: true,
      reason: "Opening",
      requestKey: randomUUID(),
    });
    const order = await createOrder(await prepare(v.id));
    await recordReceipt({
      orderId: order.id,
      paymentAccountId: bank,
      amountCents: order.purchaseTotalCents,
      rawReference: randomUUID(),
      staffUserId: owner,
    });
    await confirmOrder({ orderId: order.id, staffUserId: owner });
    await adjustStock({
      staffUserId: owner,
      variantId: v.id,
      onHand: 0,
      tracking: true,
      reason: "Damaged before shipment",
      requestKey: randomUUID(),
    });
    await expect(
      fulfillOrder({
        orderId: order.id,
        staffUserId: owner,
        carrier: "Manual delivery",
      }),
    ).rejects.toThrow("shortage");
    await adjustStock({
      staffUserId: owner,
      variantId: v.id,
      onHand: 1,
      tracking: true,
      reason: "Replacement counted",
      requestKey: randomUUID(),
    });
    await fulfillOrder({
      orderId: order.id,
      staffUserId: owner,
      carrier: "Manual delivery",
    });
    await expect(
      fulfillOrder({
        orderId: order.id,
        staffUserId: owner,
        carrier: "Manual delivery",
      }),
    ).rejects.toThrow("Must be 'confirmed'");
    expect(
      (
        await client`select on_hand,reserved from variant_stock where variant_id=${v.id}`
      )[0],
    ).toMatchObject({ on_hand: 0, reserved: 0 });
    expect(
      await client`select id from stock_movements where order_id=${order.id}`,
    ).toHaveLength(1);
  });
  it("prevents tracking activation while untracked orders remain outstanding", async () => {
    const v = await product();
    const order = await createOrder(await prepare(v.id));
    await expect(
      adjustStock({
        staffUserId: owner,
        variantId: v.id,
        onHand: 1,
        tracking: true,
        reason: "Opening count",
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("outstanding orders");
    await cancelOrder({
      orderId: order.id,
      actorUserId: owner,
      reason: "Untracked commitment resolved",
    });
    await adjustStock({
      staffUserId: owner,
      variantId: v.id,
      onHand: 1,
      tracking: true,
      reason: "Opening count",
      requestKey: randomUUID(),
    });
  });
  it("continues refunds from actual legacy source allocations", async () => {
    const v = await product(10000);
    const order = await createOrder(await prepare(v.id));
    await recordReceipt({
      orderId: order.id,
      paymentAccountId: bank,
      amountCents: 5000,
      rawReference: randomUUID(),
      staffUserId: owner,
    });
    await recordReceipt({
      orderId: order.id,
      paymentAccountId: bank,
      amountCents: 5000,
      rawReference: randomUUID(),
      staffUserId: owner,
    });
    await confirmOrder({ orderId: order.id, staffUserId: owner });
    const receipts =
      await client`select id from payment_receipts where order_id=${order.id} order by id`;
    await authorizeRefund({
      orderId: order.id,
      receiptId: receipts[0]!.id,
      amountCents: 5000,
      reason: "Legacy half refund",
      ownerUserId: owner,
    });
    const requestKey = randomUUID();
    await refundPurchase({
      orderId: order.id,
      amountCents: 5000,
      reason: "Remaining refund",
      ownerUserId: owner,
      requestKey,
    });
    expect(
      (
        await client`select receipt_id,authorized_amount_cents from payout_allocations where refund_authorization_id=${requestKey}`
      )[0],
    ).toMatchObject({
      receipt_id: receipts[1]!.id,
      authorized_amount_cents: 5000,
    });
  });
  it("receives returned goods once and keeps physical receipt separate from refunds", async () => {
    const v = await product();
    await adjustStock({
      staffUserId: owner,
      variantId: v.id,
      onHand: 1,
      tracking: true,
      reason: "Opening",
      requestKey: randomUUID(),
    });
    const order = await createOrder(await prepare(v.id));
    await recordReceipt({
      orderId: order.id,
      paymentAccountId: bank,
      amountCents: 1000,
      rawReference: randomUUID(),
      staffUserId: owner,
    });
    await confirmOrder({ orderId: order.id, staffUserId: owner });
    await fulfillOrder({
      orderId: order.id,
      staffUserId: owner,
      carrier: "Manual",
    });
    const [item] =
      await client`select id from order_items where order_id=${order.id}`;
    const request = {
      orderId: order.id,
      token: order.sessionToken,
      requestKey: randomUUID(),
      reason: "Wrong fit",
      items: [{ orderItemId: item!.id, quantity: 1 }],
    };
    const returnId = await requestGoodsReturn(request);
    expect(await requestGoodsReturn(request)).toBe(returnId);
    await expect(
      requestGoodsReturn({ ...request, requestKey: randomUUID() }),
    ).rejects.toThrow("exceeds");
    await reviewGoodsReturn({
      staffUserId: owner,
      returnId,
      decision: "approved",
      reason: "Accepted",
    });
    const [returned] =
      await client`select id from order_return_items where return_id=${returnId}`;
    const received = {
      staffUserId: owner,
      returnId,
      items: [{ returnItemId: returned!.id, restock: 1, damaged: 0 }],
    };
    await Promise.all([
      receiveGoodsReturn(received),
      receiveGoodsReturn(received),
    ]);
    expect(
      (
        await client`select on_hand,reserved from variant_stock where variant_id=${v.id}`
      )[0],
    ).toMatchObject({ on_hand: 1, reserved: 0 });
    expect(
      await client`select id from refund_authorizations where order_id=${order.id}`,
    ).toHaveLength(0);
  });
  it("attaches new authenticated orders and requires scoped proof to claim guest orders", async () => {
    const v = await product(0);
    const owned = await createOrder({
      ...(await prepare(v.id)),
      customerUserId: "customer-a",
    });
    expect(owned.customerId).toBeTruthy();
    const guest = await createOrder(await prepare(v.id));
    await expect(
      claimGuestOrder({
        userId: "customer-a",
        orderId: guest.id,
        token: "guessed",
      }),
    ).rejects.toThrow("recover");
    await claimGuestOrder({
      userId: "customer-a",
      orderId: guest.id,
      token: guest.sessionToken,
    });
    await claimGuestOrder({
      userId: "customer-a",
      orderId: guest.id,
      token: guest.sessionToken,
    });
    await expect(
      claimGuestOrder({
        userId: "customer-b",
        orderId: guest.id,
        token: guest.sessionToken,
      }),
    ).rejects.toThrow("another account");
    expect((await customerAccount("customer-a")).orders).toHaveLength(2);
    expect((await customerAccount("customer-b")).orders).toHaveLength(0);
    await expect(openOwnedOrder("customer-b", owned.id)).rejects.toThrow(
      "not found",
    );
    await client`update "user" set email='changed@example.test' where id='customer-a'`;
    expect((await customerAccount("customer-a")).orders).toHaveLength(2);
    await saveCustomerAddress({
      userId: "customer-a",
      label: "Home",
      address: { name: "A", line1: "1 St", city: "City", country: "US" },
    });
    const address = (await customerAccount("customer-a")).addresses[0]!;
    await expect(
      saveCustomerAddress({
        userId: "customer-b",
        id: address.id,
        remove: true,
        label: "Home",
        address: {},
      }),
    ).rejects.toThrow("not found");
  });
  it("keeps revoked reward holds intact and recovers debt on cancellation without unrelated credit", async () => {
    const userId = `lot-${randomUUID()}`;
    await client`insert into "user"(id,name,email,email_verified) values(${userId},'Lot customer',${`${userId}@example.test`},true)`;
    const customer = (await customerAccount(userId)).customer;
    const accountId = await issueStoreCredit({
      staffUserId: owner,
      customerId: customer.id,
      amountCents: 500,
      reason: "Unrelated merchant credit",
      requestKey: randomUUID(),
    });
    const database = active.db as typeof import("@/infrastructure/db").db;
    const rewardLot = await database.transaction(async (tx) => {
      const account = await lockCreditAccount(tx, accountId);
      const [entry] = await tx
        .insert(schema.storeCreditEntries)
        .values({
          accountId,
          amountCents: 100,
          kind: "issue",
          reason: "Reward fixture",
          actorId: owner,
          requestKey: randomUUID(),
          payloadHash: creditHash([100]),
        })
        .returning();
      await tx
        .update(schema.storeCreditAccounts)
        .set({ balanceCents: account.balanceCents + 100 })
        .where(eq(schema.storeCreditAccounts.id, accountId));
      return createCreditSourceLot(tx, {
        accountId,
        sourceEntryId: entry!.id,
        kind: "reward",
        amountCents: 100,
      });
    });
    const variant = await product(1000);
    const order = await createOrder({
      ...(await prepare(variant.id)),
      customerUserId: userId,
      creditAppliedCents: 100,
    });
    expect(
      (
        await client`select lot_id,a.amount_cents from credit_source_allocations a join store_credit_reservations r on r.id=a.reservation_id where r.order_id=${order.id}`
      )[0],
    ).toMatchObject({ lot_id: rewardLot.id, amount_cents: 100 });
    await database.transaction(async (tx) => {
      await lockCreditAccount(tx, accountId);
      expect(await reclaimRewardSource(tx, rewardLot.id, 100)).toEqual({
        reclaimedCents: 0,
        debtCents: 100,
      });
    });
    await cancelOrder({
      orderId: order.id,
      actorUserId: owner,
      reason: "Release revoked hold",
    });
    expect(
      (
        await client`select remaining_cents,reserved_cents,debt_cents,revoked_pending_cents from credit_source_lots where id=${rewardLot.id}`
      )[0],
    ).toMatchObject({
      remaining_cents: 0,
      reserved_cents: 0,
      debt_cents: 0,
      revoked_pending_cents: 0,
    });
    expect(
      (
        await client`select balance_cents,reserved_cents from store_credit_accounts where id=${accountId}`
      )[0],
    ).toMatchObject({ balance_cents: 500, reserved_cents: 0 });
    expect((await customerAccount(userId)).credit!.reconciled).toBe(true);
  });
  it("preserves restored revoked credit after future earnings already recovered its debt", async () => {
    const userId = `refund-lot-${randomUUID()}`;
    await client`insert into "user"(id,name,email,email_verified) values(${userId},'Refund lot customer',${`${userId}@example.test`},true)`;
    const customer = (await customerAccount(userId)).customer;
    const accountId = await issueStoreCredit({
      staffUserId: owner,
      customerId: customer.id,
      amountCents: 100,
      reason: "Credit fixture",
      requestKey: randomUUID(),
    });
    const [lot] =
      await client`select id from credit_source_lots where account_id=${accountId}`;
    await client`update credit_source_lots set kind='reward' where id=${lot!.id}`;
    const variant = await product(100);
    const order = await createOrder({
      ...(await prepare(variant.id)),
      customerUserId: userId,
      creditAppliedCents: 100,
    });
    expect(order.lifecycleStatus).toBe("confirmed");
    const database = active.db as typeof import("@/infrastructure/db").db;
    await database.transaction(async (tx) => {
      await lockCreditAccount(tx, accountId);
      expect(await reclaimRewardSource(tx, lot!.id, 100)).toEqual({
        reclaimedCents: 0,
        debtCents: 100,
      });
      expect(await offsetRewardDebts(tx, accountId, 100)).toEqual({
        recoveredCents: 100,
        netCents: 0,
      });
    });
    const request = {
      orderId: order.id,
      ownerUserId: owner,
      amountCents: 100,
      reason: "Restore after recovery",
      requestKey: randomUUID(),
    };
    await Promise.all([refundPurchase(request), refundPurchase(request)]);
    expect(
      (
        await client`select remaining_cents,debt_cents,revoked_pending_cents from credit_source_lots where id=${lot!.id}`
      )[0],
    ).toMatchObject({
      remaining_cents: 100,
      debt_cents: 0,
      revoked_pending_cents: 0,
    });
    expect(
      (
        await client`select balance_cents from store_credit_accounts where id=${accountId}`
      )[0]!.balance_cents,
    ).toBe(100);
    expect((await customerAccount(userId)).credit!.reconciled).toBe(true);
  });
  it("captures mixed funding and refunds original credit and external sources exactly once", async () => {
    const customer = (await customerAccount("customer-a")).customer;
    const requestKey = randomUUID();
    const accountId = await issueStoreCredit({
      staffUserId: owner,
      customerId: customer.id,
      amountCents: 3000,
      reason: "Customer goodwill",
      requestKey,
    });
    await issueStoreCredit({
      staffUserId: owner,
      customerId: customer.id,
      amountCents: 3000,
      reason: "Customer goodwill",
      requestKey,
    });
    const v = await product(10000);
    const order = await createOrder({
      ...(await prepare(v.id)),
      customerUserId: "customer-a",
      creditAppliedCents: 3000,
    });
    expect(order.purchaseTotalCents).toBe(10000);
    expect(order.lifecycleStatus).toBe("unpaid");
    expect(
      (
        await client`select balance_cents,reserved_cents from store_credit_accounts where id=${accountId}`
      )[0],
    ).toMatchObject({ balance_cents: 3000, reserved_cents: 3000 });
    await expect(
      confirmOrder({ orderId: order.id, staffUserId: owner }),
    ).rejects.toThrow("underfunded");
    expect(
      await client`select id from store_credit_entries where kind='debit' and order_id=${order.id}`,
    ).toHaveLength(0);
    await recordReceipt({
      orderId: order.id,
      paymentAccountId: bank,
      amountCents: 7000,
      rawReference: randomUUID(),
      staffUserId: owner,
    });
    await confirmOrder({ orderId: order.id, staffUserId: owner });
    const refund = {
      orderId: order.id,
      ownerUserId: owner,
      amountCents: 5000,
      reason: "Half purchase refund",
      requestKey: randomUUID(),
    };
    await Promise.all([refundPurchase(refund), refundPurchase(refund)]);
    expect(
      (
        await client`select amount_cents from store_credit_refund_settlements where refund_authorization_id=${refund.requestKey}`
      )[0]!.amount_cents,
    ).toBe(1500);
    expect(
      (
        await client`select authorized_amount_cents from payout_allocations where refund_authorization_id=${refund.requestKey}`
      )[0]!.authorized_amount_cents,
    ).toBe(3500);
    await refundPurchase({ ...refund, requestKey: randomUUID() });
    await expect(
      refundPurchase({ ...refund, amountCents: 1, requestKey: randomUUID() }),
    ).rejects.toThrow("remaining purchase entitlement");
    expect((await customerAccount("customer-a")).credit!.reconciled).toBe(true);
    expect(
      (
        await client`select balance_cents from store_credit_accounts where id=${accountId}`
      )[0]!.balance_cents,
    ).toBe(3000);
  });
  it("rejects concurrent overspending, confirms credit-only purchases and releases unpaid credit holds", async () => {
    const customer = (await customerAccount("customer-b")).customer;
    const accountId = await issueStoreCredit({
      staffUserId: owner,
      customerId: customer.id,
      amountCents: 3000,
      reason: "Opening credit",
      requestKey: randomUUID(),
    });
    const v = await product(3000);
    const inputs = await Promise.all([prepare(v.id), prepare(v.id)]);
    const results = await Promise.allSettled(
      inputs.map((input) =>
        createOrder({
          ...input,
          customerUserId: "customer-b",
          creditAppliedCents: 3000,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const accepted = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>>;
    expect(accepted.value.lifecycleStatus).toBe("confirmed");
    expect(
      await client`select id from payment_receipts where order_id=${accepted.value.id}`,
    ).toHaveLength(0);
    expect(
      await client`select id from confirmation_funding where order_id=${accepted.value.id} and credit_entry_id is not null`,
    ).toHaveLength(1);
    await cancelOrder({
      orderId: accepted.value.id,
      actorUserId: owner,
      reason: "Cancel before handoff",
    });
    expect(
      (
        await client`select balance_cents,reserved_cents from store_credit_accounts where id=${accountId}`
      )[0],
    ).toMatchObject({ balance_cents: 3000, reserved_cents: 0 });
    const mixed = await createOrder({
      ...(await prepare(v.id)),
      customerUserId: "customer-b",
      creditAppliedCents: 1000,
    });
    await cancelOrder({
      orderId: mixed.id,
      actorUserId: owner,
      reason: "Unpaid cancellation",
    });
    expect(
      (
        await client`select balance_cents,reserved_cents from store_credit_accounts where id=${accountId}`
      )[0],
    ).toMatchObject({ balance_cents: 3000, reserved_cents: 0 });
    await expect(
      issueStoreCredit({
        staffUserId: "not-owner",
        customerId: customer.id,
        amountCents: 1,
        reason: "Unauthorized",
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("membership required");
    await expect(
      client`insert into confirmation_funding(order_id,funded_amount_cents) values(${mixed.id},1)`,
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("places credit-only orders without an active external payment method", async () => {
    const customer = (await customerAccount("customer-b")).customer;
    await issueStoreCredit({
      staffUserId: owner,
      customerId: customer.id,
      amountCents: 1000,
      reason: "Credit-only test",
      requestKey: randomUUID(),
    });
    const v = await product(1000),
      guestSessionId = randomUUID();
    const cart = await addToCart({
      guestSessionId,
      variantId: v.id,
      quantity: 1,
    });
    await client`update payment_accounts set is_active=false`;
    try {
      const quote = await getQuote({
        guestSessionId,
        cartId: cart.id,
        fulfillmentType: "shipping",
        shippingAddress: { country: "US", address: "1 Test St" },
      });
      const order = await createOrder({
        quoteId: quote.id,
        guestSessionId,
        guestEmail: "customer-b@example.test",
        guestName: "B",
        customerUserId: "customer-b",
        creditAppliedCents: 1000,
      });
      expect(order.lifecycleStatus).toBe("confirmed");
      expect(
        await client`select id from payment_receipts where order_id=${order.id}`,
      ).toHaveLength(0);
    } finally {
      await client`update payment_accounts set is_active=true`;
    }
  });
});
