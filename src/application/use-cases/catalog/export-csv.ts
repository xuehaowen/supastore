import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  orders,
  orderItems,
  orderFulfillments,
  paymentReceipts,
} from "@/infrastructure/db/schema";
import { eq, asc, inArray, sql } from "drizzle-orm";

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
  let offset = 0;

  while (true) {
    const rows = await db
      .select({
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
      .orderBy(asc(products.handle), asc(productVariants.sku))
      .limit(BATCH)
      .offset(offset);

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
    offset += BATCH;
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

export async function* streamOrderExportRows(): AsyncGenerator<OrderExportRow> {
  const BATCH = 100;
  let offset = 0;

  while (true) {
    const orderRows = await db
      .select({
        id: orders.id,
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
      .orderBy(asc(orders.createdAt))
      .limit(BATCH)
      .offset(offset);

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
      .where(inArray(orderItems.orderId, orderIds));

    const receiptRows = await db
      .select({
        orderId: paymentReceipts.orderId,
        rawReference: paymentReceipts.rawReference,
      })
      .from(paymentReceipts)
      .where(inArray(paymentReceipts.orderId, orderIds));

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
    offset += BATCH;
  }
}

export async function* streamOrdersCsv(): AsyncGenerator<string> {
  yield csvRow([...ORDER_EXPORT_COLUMNS]) + "\n";
  for await (const row of streamOrderExportRows())
    yield csvRow(
      ORDER_EXPORT_COLUMNS.map((column) =>
        row[column] instanceof Date ? row[column].toISOString() : row[column],
      ),
    ) + "\n";
}
