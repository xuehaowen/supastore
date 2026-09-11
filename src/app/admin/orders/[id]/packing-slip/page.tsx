import { db } from "@/infrastructure/db";
import { eq } from "drizzle-orm";
import {
  orders,
  orderItems,
  productVariants,
  products,
  storeSettings,
  orderFulfillments,
} from "@/infrastructure/db/schema";
import { notFound } from "next/navigation";
import { money } from "@/infrastructure/web";

interface PackingSlipPageProps {
  params: Promise<{ id: string }>;
}

export default async function PackingSlipPage({ params }: PackingSlipPageProps) {
  const { id } = await params;

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  if (!order) notFound();

  const [store] = await db.select().from(storeSettings).limit(1);

  const [fulfillment] = await db
    .select()
    .from(orderFulfillments)
    .where(eq(orderFulfillments.orderId, order.id))
    .limit(1);

  const items = await db
    .select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      lineTotalCents: orderItems.lineTotalCents,
      variantTitle: productVariants.title,
      sku: productVariants.sku,
      productTitle: products.title,
    })
    .from(orderItems)
    .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(orderItems.orderId, order.id));

  const shipping = order.shippingAddressSnapshot as any;

  return (
    <div className="min-h-screen bg-neutral-100 p-4 font-mono text-xs text-black print:bg-white print:p-0">
      <style>{`
        @media print {
          @page {
            margin: 0;
            size: 80mm auto;
          }
          body {
            margin: 0;
            padding: 2mm;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .thermal-slip {
            width: 100% !important;
            max-width: 76mm !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* Action bar for screen view */}
      <div className="no-print mx-auto mb-4 flex max-w-sm items-center justify-between rounded bg-white p-3 shadow">
        <div>
          <span className="font-semibold text-neutral-800">Thermal Packing Slip</span>
          <p className="text-[10px] text-neutral-500">Optimized for 58mm / 80mm printers</p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
        >
          Print Slip
        </button>
      </div>

      {/* 80mm / 58mm Thermal Print Container */}
      <div className="thermal-slip mx-auto max-w-[80mm] rounded border border-neutral-300 bg-white p-4 shadow-sm">
        {/* Store Header */}
        <div className="border-b border-dashed border-black pb-2 text-center">
          <h1 className="text-sm font-bold uppercase tracking-wider">
            {store?.storeName || "SupaStore"}
          </h1>
          <p className="text-[10px] text-neutral-600">PACKING SLIP / DISPATCH</p>
        </div>

        {/* Order Meta */}
        <div className="my-2 border-b border-dashed border-black pb-2 leading-tight">
          <div className="flex justify-between font-bold">
            <span>ORDER:</span>
            <span>{order.referenceCode}</span>
          </div>
          <div className="flex justify-between text-[10px] text-neutral-600">
            <span>DATE:</span>
            <span>{new Date(order.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between text-[10px] text-neutral-600">
            <span>TYPE:</span>
            <span className="uppercase">{order.fulfillmentType}</span>
          </div>
          {fulfillment?.trackingNumber && (
            <div className="flex justify-between text-[10px]">
              <span>TRACKING:</span>
              <span className="font-bold">{fulfillment.trackingNumber}</span>
            </div>
          )}
        </div>

        {/* Recipient */}
        <div className="mb-2 border-b border-dashed border-black pb-2 leading-tight">
          <p className="font-bold">DELIVER TO:</p>
          <p>{order.guestName}</p>
          <p className="text-neutral-600">{order.guestEmail}</p>
          {shipping?.street && <p>{shipping.street}</p>}
          {(shipping?.city || shipping?.postalCode) && (
            <p>
              {shipping.city} {shipping.postalCode}
            </p>
          )}
          {shipping?.country && <p>{shipping.country}</p>}
        </div>

        {/* Items Table */}
        <div className="mb-2 border-b border-dashed border-black pb-2">
          <div className="flex justify-between border-b border-black pb-1 font-bold">
            <span className="w-8">QTY</span>
            <span className="flex-1">ITEM</span>
            <span className="w-14 text-right">TOTAL</span>
          </div>
          <div className="divide-y divide-dotted divide-neutral-300 pt-1">
            {items.map((item) => (
              <div key={item.id} className="py-1">
                <div className="flex justify-between">
                  <span className="w-8 font-bold">{item.quantity}x</span>
                  <span className="flex-1 font-medium">{item.productTitle}</span>
                  <span className="w-14 text-right">
                    {money(item.lineTotalCents, store?.currency, store?.precision)}
                  </span>
                </div>
                {item.variantTitle && (
                  <p className="pl-8 text-[10px] text-neutral-500">
                    {item.variantTitle} {item.sku ? `(${item.sku})` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="space-y-1 text-right">
          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL:</span>
            <span>{money(order.purchaseTotalCents, store?.currency, store?.precision)}</span>
          </div>
        </div>

        {/* Barcode visual representation */}
        <div className="mt-4 border-t border-dashed border-black pt-3 text-center">
          <div className="inline-block tracking-widest font-mono text-[10px] border border-black px-4 py-1">
            * {order.referenceCode} *
          </div>
          <p className="mt-1 text-[9px] text-neutral-500">Thank you for your order!</p>
        </div>
      </div>
    </div>
  );
}
