import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  orders,
  orderItems,
  orderFulfillments,
  paymentReceipts,
} from "@/infrastructure/db/schema";
import { eq, asc } from "drizzle-orm";

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
      ]) + "\n";
    }

    if (rows.length < BATCH) break;
    offset += BATCH;
  }
}

// ---------------------------------------------------------------------------
// Orders CSV export
// Columns: reference_code, lifecycle_status, guest_email, guest_name,
//          fulfillment_type, fulfillment_status, purchase_total_cents,
//          sku, variant_title, quantity, unit_price_cents, line_total_cents,
//          receipt_references, created_at
// ---------------------------------------------------------------------------
export async function* streamOrdersCsv(): AsyncGenerator<string> {
  const HEADER = csvRow([
    "reference_code",
    "lifecycle_status",
    "guest_email",
    "guest_name",
    "fulfillment_type",
    "fulfillment_status",
    "purchase_total_cents",
    "sku",
    "variant_title",
    "quantity",
    "unit_price_cents",
    "line_total_cents",
    "receipt_references",
    "created_at",
  ]);
  yield HEADER + "\n";

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

    for (const order of orderRows) {
      // Fetch line items for this order
      const items = await db
        .select({
          sku: productVariants.sku,
          variantTitle: productVariants.title,
          quantity: orderItems.quantity,
          unitPriceCents: orderItems.unitPriceCents,
          lineTotalCents: orderItems.lineTotalCents,
        })
        .from(orderItems)
        .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
        .where(eq(orderItems.orderId, order.id));

      // Fetch payment receipt references
      const receipts = await db
        .select({ rawReference: paymentReceipts.rawReference })
        .from(paymentReceipts)
        .where(eq(paymentReceipts.orderId, order.id));

      const receiptRefs = receipts.map((r) => r.rawReference).join("; ");

      if (items.length === 0) {
        // Order with no items (edge case — emit one row)
        yield csvRow([
          order.referenceCode,
          order.lifecycleStatus,
          order.guestEmail,
          order.guestName,
          order.fulfillmentType,
          order.fulfillmentStatus ?? "",
          order.purchaseTotalCents,
          "",
          "",
          "",
          "",
          "",
          receiptRefs,
          order.createdAt.toISOString(),
        ]) + "\n";
      } else {
        for (const item of items) {
          yield csvRow([
            order.referenceCode,
            order.lifecycleStatus,
            order.guestEmail,
            order.guestName,
            order.fulfillmentType,
            order.fulfillmentStatus ?? "",
            order.purchaseTotalCents,
            item.sku,
            item.variantTitle,
            item.quantity,
            item.unitPriceCents,
            item.lineTotalCents,
            receiptRefs,
            order.createdAt.toISOString(),
          ]) + "\n";
        }
      }
    }

    if (orderRows.length < BATCH) break;
    offset += BATCH;
  }
}
