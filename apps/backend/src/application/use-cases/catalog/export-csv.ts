import {
  orderFilterConditions,
  orderSort,
  orderPickupLocation,
} from "@/application/queries/order-filters";
import { minorToDecimal } from "@/domain/money/decimal-input";
import { orderItemName } from "@/domain/catalog/order-item-name";
import type { QuoteTerms } from "@supastore/contracts";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  orders,
  orderItems,
  orderFulfillments,
  paymentReceipts,
  quotes,
  fulfillmentSlots,
  storeSettings,
} from "@/infrastructure/db/schema";
import { and, eq, asc, inArray, ilike, or, sql } from "drizzle-orm";
import type { OrderExportSelection } from "@/domain/catalog/order-export-selection";

type ExportCursor = { id: string; timestamp: string };
async function exportCutoff(database: Pick<typeof db, "execute"> = db) {
  const [snapshot] = await database.execute<{ timestamp: string }>(
    sql`select clock_timestamp()::text as timestamp`,
  );
  return snapshot!.timestamp;
}

// ---------------------------------------------------------------------------
// CSV serialization helpers
// ---------------------------------------------------------------------------
function csvCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

// ---------------------------------------------------------------------------
// Product CSV export
// Columns: handle, sku, title, variant_title, description, price_cents,
//          is_available, is_published, created_at
// ---------------------------------------------------------------------------
export async function* streamProductsCsv(): AsyncGenerator<string> {
  const cutoff = await exportCutoff();
  const HEADER = csvRow([
    "handle",
    "sku",
    "title",
    "variant_title",
    "description",
    "price_cents",
    "is_available",
    "is_published",
    "created_at",
    "option_values",
    "collection_handles",
  ]);
  yield HEADER + "\n";

  // Stream products in batches to avoid loading entire catalog into memory
  const BATCH = 200;
  let cursor: ExportCursor | undefined;

  while (true) {
    const rows = await db
      .select({
        id: productVariants.id,
        cursorTimestamp: sql<string>`${productVariants.createdAt}::text`,
        handle: products.handle,
        productTitle: products.title,
        productDescription: products.description,
        isPublished: products.isPublished,
        productCreatedAt: products.createdAt,
        sku: productVariants.sku,
        variantTitle: productVariants.title,
        priceCents: productVariants.priceCents,
        isAvailable: productVariants.isAvailable,
        optionValues: sql<string>`coalesce((select string_agg(a.code || ':' || av.code, '|' order by a.code) from variant_attribute_values va join attributes a on a.id=va.attribute_id join attribute_values av on av.id=va.attribute_value_id where va.variant_id=${productVariants.id}), '')`,
        collectionHandles: sql<string>`coalesce((select string_agg(c.handle, '|' order by c.handle) from product_collection_memberships m join product_collections c on c.id=m.collection_id where m.product_id=${products.id}), '')`,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(
        and(
          sql`${productVariants.createdAt} <= ${cutoff}::timestamptz`,
          cursor
            ? sql`(${productVariants.createdAt}, ${productVariants.id}) > (${cursor.timestamp}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(asc(productVariants.createdAt), asc(productVariants.id))
      .limit(BATCH);

    if (rows.length === 0) break;

    for (const row of rows) {
      yield csvRow([
        row.handle,
        row.sku,
        row.productTitle,
        row.variantTitle,
        row.productDescription,
        row.priceCents,
        row.isAvailable,
        row.isPublished,
        row.productCreatedAt.toISOString(),
        row.optionValues,
        row.collectionHandles,
      ]) + "\n";
    }

    if (rows.length < BATCH) break;
    const last = rows[rows.length - 1]!;
    cursor = { id: last.id, timestamp: last.cursorTimestamp };
  }
}

export const ORDER_EXPORT_COLUMNS = [
  "reference_code",
  "lifecycle_status",
  "guest_email",
  "guest_name",
  "fulfillment_type",
  "fulfillment_status",
  "discount",
  "purchase_total",
  "sku",
  "variant_title",
  "quantity",
  "unit_price",
  "line_total",
  "receipt_references",
  "created_at",
  "currency",
  "item_name",
  "pickup_location",
  "pickup_address",
  "pickup_date",
  "pickup_start_time",
  "pickup_end_time",
  "pickup_timezone",
  "shipping_address",
  "shipping_region",
  "shipping_postal_code",
  "shipping_country",
] as const;

export type OrderExportRow = Record<
  (typeof ORDER_EXPORT_COLUMNS)[number],
  string | number | Date
>;

export async function* streamOrderExportRows(
  selection: OrderExportSelection = {},
): AsyncGenerator<OrderExportRow> {
  type ExportDatabase = Pick<typeof db, "select" | "execute">;
  let provideSnapshot!: (database: ExportDatabase) => void;
  let releaseSnapshot!: () => void;
  const ready = new Promise<ExportDatabase>((resolve) => {
    provideSnapshot = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  // Keep the transaction alive while the async generator yields to its consumer.
  const transaction = db.transaction(
    async (snapshot) => {
      provideSnapshot(snapshot);
      await finished;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  try {
    const snapshot = await Promise.race([
      ready,
      transaction.then(() => {
        throw new Error("Export snapshot ended before streaming started.");
      }),
    ]);
    yield* streamSnapshotOrderRows(snapshot, selection);
  } finally {
    releaseSnapshot();
    await transaction;
  }
}

async function* streamSnapshotOrderRows(
  database: Pick<typeof db, "select" | "execute">,
  selection: OrderExportSelection,
): AsyncGenerator<OrderExportRow> {
  const BATCH = 100;
  const [store] = await database.select().from(storeSettings).limit(1);
  const sorting = orderSort(selection);
  let sortCursor: { id: string; value: string } | undefined;
  const cutoff = await exportCutoff(database);

  while (true) {
    const orderRows = await database
      .select({
        id: orders.id,
        cursorValue: sql<string>`${sorting.key}::text`,
        termsSnapshot: orders.termsSnapshot,
        shippingAddress: orders.shippingAddressSnapshot,
        pickupLocationName: orderPickupLocation,
        quoteItems: quotes.itemsSnapshot,
        referenceCode: orders.referenceCode,
        lifecycleStatus: orders.lifecycleStatus,
        guestEmail: orders.guestEmail,
        guestName: orders.guestName,
        fulfillmentType: orders.fulfillmentType,
        discountCents: orders.discountCents,
        purchaseTotalCents: orders.purchaseTotalCents,
        createdAt: orders.createdAt,
        fulfillmentStatus: orderFulfillments.status,
        pickupTimezone: sql<string>`(select ${fulfillmentSlots.timezone} from ${fulfillmentSlots} where ${fulfillmentSlots.id} = ${orderFulfillments.fulfillmentSlotId})`,
      })
      .from(orders)
      .innerJoin(quotes, eq(quotes.id, orders.quoteId))
      .leftJoin(orderFulfillments, eq(orderFulfillments.orderId, orders.id))
      .where(
        and(
          sql`${orders.createdAt} <= ${cutoff}::timestamptz`,
          selection.ids
            ? selection.ids.length
              ? inArray(orders.id, selection.ids)
              : sql`false`
            : undefined,
          orderFilterConditions(selection),
          selection.status
            ? eq(orders.lifecycleStatus, selection.status)
            : undefined,
          selection.search
            ? or(
                ilike(orders.referenceCode, `%${selection.search}%`),
                ilike(orders.guestName, `%${selection.search}%`),
                ilike(orders.guestEmail, `%${selection.search}%`),
              )
            : undefined,
          sortCursor
            ? sorting.direction === "asc"
              ? sql`(${sorting.key}, ${orders.id}) > (${sorting.cursorValue(sortCursor.value)}, ${sortCursor.id}::uuid)`
              : sql`(${sorting.key}, ${orders.id}) < (${sorting.cursorValue(sortCursor.value)}, ${sortCursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(...sorting.clauses)
      .limit(BATCH);

    if (orderRows.length === 0) break;

    const orderIds = orderRows.map((order) => order.id);
    const itemRows = await database
      .select({
        orderId: orderItems.orderId,
        sku: productVariants.sku,
        variantTitle: productVariants.title,
        variantId: orderItems.variantId,
        catalogSnapshot: orderItems.catalogSnapshot,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        lineTotalCents: orderItems.lineTotalCents,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .where(inArray(orderItems.orderId, orderIds))
      .orderBy(asc(orderItems.orderId), asc(orderItems.id));

    const receiptRows = await database
      .select({
        orderId: paymentReceipts.orderId,
        rawReference: paymentReceipts.rawReference,
      })
      .from(paymentReceipts)
      .where(inArray(paymentReceipts.orderId, orderIds))
      .orderBy(asc(paymentReceipts.createdAt), asc(paymentReceipts.id));

    for (const order of orderRows) {
      const items = itemRows.filter((item) => item.orderId === order.id);
      const receiptRefs = receiptRows
        .filter((receipt) => receipt.orderId === order.id)
        .map((receipt) => receipt.rawReference)
        .join("; ");

      const terms = order.termsSnapshot as Partial<QuoteTerms>;
      const precision = terms.precision ?? store?.precision ?? 2;
      const amount = (value: number) =>
        Number(minorToDecimal(value, precision));
      const address = order.shippingAddress as Partial<
        QuoteTerms["shippingAddress"]
      > | null;
      const base = {
        reference_code: order.referenceCode,
        lifecycle_status: order.lifecycleStatus,
        guest_email: order.guestEmail,
        guest_name: order.guestName,
        fulfillment_type: order.fulfillmentType,
        fulfillment_status: order.fulfillmentStatus ?? "",
        discount: amount(order.discountCents),
        purchase_total: amount(order.purchaseTotalCents),
        receipt_references: receiptRefs,
        created_at: order.createdAt,
        currency: terms.currency ?? store?.currency ?? "USD",
        pickup_location:
          order.fulfillmentType === "pickup" ? order.pickupLocationName : "",
        pickup_address: terms.pickup?.address ?? "",
        pickup_date: terms.pickup?.date ?? "",
        pickup_start_time: terms.pickup?.startTime ?? "",
        pickup_end_time: terms.pickup?.endTime ?? "",
        pickup_timezone: terms.pickup
          ? (order.pickupTimezone ?? store?.timezone ?? "UTC")
          : "",
        shipping_address:
          order.fulfillmentType === "pickup"
            ? ""
            : [
                address?.recipientName,
                address?.address,
                address?.line2,
                address?.city,
              ]
                .filter(Boolean)
                .join(", "),
        shipping_region:
          order.fulfillmentType === "pickup" ? "" : (address?.region ?? ""),
        shipping_postal_code:
          order.fulfillmentType === "pickup" ? "" : (address?.postalCode ?? ""),
        shipping_country:
          order.fulfillmentType === "pickup" ? "" : (address?.country ?? ""),
      };
      for (const item of items.length ? items : [null]) {
        yield {
          ...base,
          sku: item?.catalogSnapshot.sku ?? item?.sku ?? "",
          item_name: item ? orderItemName(item, order.quoteItems) : "",
          variant_title: item ? orderItemName(item, order.quoteItems) : "",
          quantity: item?.quantity ?? "",
          unit_price: item ? amount(item.unitPriceCents) : "",
          line_total: item ? amount(item.lineTotalCents) : "",
        };
      }
    }

    if (orderRows.length < BATCH) break;
    const last = orderRows[orderRows.length - 1]!;
    sortCursor = { id: last.id, value: last.cursorValue };
  }
}

export async function* streamOrdersCsv(
  selection: OrderExportSelection = {},
): AsyncGenerator<string> {
  yield csvRow([...ORDER_EXPORT_COLUMNS]) + "\n";
  for await (const row of streamOrderExportRows(selection))
    yield csvRow(
      ORDER_EXPORT_COLUMNS.map((column) =>
        row[column] instanceof Date ? row[column].toISOString() : row[column],
      ),
    ) + "\n";
}
