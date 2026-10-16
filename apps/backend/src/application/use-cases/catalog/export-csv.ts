import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  orders,
  orderItems,
  orderFulfillments,
  paymentReceipts,
} from "@/infrastructure/db/schema";
import { and, eq, asc, inArray, ilike, or, sql } from "drizzle-orm";
import type { OrderExportSelection } from "@/domain/catalog/order-export-selection";

type ExportCursor = { id: string; timestamp: string };
async function exportCutoff() {
  const [snapshot] = await db.execute<{ timestamp: string }>(
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
  "discount_cents",
  "purchase_total_cents",
  "sku",
  "variant_title",
  "quantity",
  "unit_price_cents",
  "line_total_cents",
  "receipt_references",
  "created_at",
] as const;

export type OrderExportRow = Record<
  (typeof ORDER_EXPORT_COLUMNS)[number],
  string | number | Date
>;

export async function* streamOrderExportRows(
  selection: OrderExportSelection = {},
): AsyncGenerator<OrderExportRow> {
  const BATCH = 100;
  const cutoff = await exportCutoff();
  let cursor: ExportCursor | undefined;

  while (true) {
    const orderRows = await db
      .select({
        id: orders.id,
        cursorTimestamp: sql<string>`${orders.createdAt}::text`,
        referenceCode: orders.referenceCode,
        lifecycleStatus: orders.lifecycleStatus,
        guestEmail: orders.guestEmail,
        guestName: orders.guestName,
        fulfillmentType: orders.fulfillmentType,
        discountCents: orders.discountCents,
        purchaseTotalCents: orders.purchaseTotalCents,
        createdAt: orders.createdAt,
        fulfillmentStatus: orderFulfillments.status,
      })
      .from(orders)
      .leftJoin(orderFulfillments, eq(orderFulfillments.orderId, orders.id))
      .where(
        and(
          sql`${orders.createdAt} <= ${cutoff}::timestamptz`,
          selection.ids
            ? selection.ids.length
              ? inArray(orders.id, selection.ids)
              : sql`false`
            : undefined,
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
          cursor
            ? sql`(${orders.createdAt}, ${orders.id}) > (${cursor.timestamp}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(asc(orders.createdAt), asc(orders.id))
      .limit(BATCH);

    if (orderRows.length === 0) break;

    const orderIds = orderRows.map((order) => order.id);
    const itemRows = await db
      .select({
        orderId: orderItems.orderId,
        sku: productVariants.sku,
        variantTitle: productVariants.title,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        lineTotalCents: orderItems.lineTotalCents,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .where(inArray(orderItems.orderId, orderIds))
      .orderBy(asc(orderItems.orderId), asc(orderItems.id));

    const receiptRows = await db
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

      if (items.length === 0) {
        yield {
          reference_code: order.referenceCode,
          lifecycle_status: order.lifecycleStatus,
          guest_email: order.guestEmail,
          guest_name: order.guestName,
          fulfillment_type: order.fulfillmentType,
          fulfillment_status: order.fulfillmentStatus ?? "",
          discount_cents: order.discountCents,
          purchase_total_cents: order.purchaseTotalCents,
          sku: "",
          variant_title: "",
          quantity: "",
          unit_price_cents: "",
          line_total_cents: "",
          receipt_references: receiptRefs,
          created_at: order.createdAt,
        };
      } else {
        for (const item of items) {
          yield {
            reference_code: order.referenceCode,
            lifecycle_status: order.lifecycleStatus,
            guest_email: order.guestEmail,
            guest_name: order.guestName,
            fulfillment_type: order.fulfillmentType,
            fulfillment_status: order.fulfillmentStatus ?? "",
            discount_cents: order.discountCents,
            purchase_total_cents: order.purchaseTotalCents,
            sku: item.sku,
            variant_title: item.variantTitle,
            quantity: item.quantity,
            unit_price_cents: item.unitPriceCents,
            line_total_cents: item.lineTotalCents,
            receipt_references: receiptRefs,
            created_at: order.createdAt,
          };
        }
      }
    }

    if (orderRows.length < BATCH) break;
    const last = orderRows[orderRows.length - 1]!;
    cursor = { id: last.id, timestamp: last.cursorTimestamp };
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
