import { trackOrder } from "@/application/use-cases/tracking";
import { orderToken } from "@/infrastructure/web";
import { apiResponse } from "@/infrastructure/http/commerce-api";
import { parseActionUuid } from "@/application/common/request-validation";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { orderShipments, shipmentItems } from "@/infrastructure/db/schema";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiResponse(async () => {
    const id = parseActionUuid((await context.params).id, "Order");
    const result = await trackOrder(id, await orderToken(id));
    const shipmentRows = await db.select({
      id: orderShipments.id,
      carrier: orderShipments.carrier,
      trackingNumber: orderShipments.trackingNumber,
      status: orderShipments.status,
      deliveredAt: orderShipments.deliveredAt,
      orderItemId: shipmentItems.orderItemId,
      quantity: shipmentItems.quantity,
    }).from(orderShipments).innerJoin(shipmentItems, eq(shipmentItems.shipmentId, orderShipments.id)).where(eq(orderShipments.orderId, id));
    const shipments = new Map<string, {
      id: string; carrier: string; trackingNumber: string | null;
      status: "dispatched" | "delivered"; deliveredAt: Date | null;
      items: { orderItemId: string; quantity: number }[];
    }>();
    for (const row of shipmentRows) {
      const shipment = shipments.get(row.id) ?? {
        id: row.id, carrier: row.carrier, trackingNumber: row.trackingNumber,
        status: row.status, deliveredAt: row.deliveredAt, items: [],
      };
      shipment.items.push({ orderItemId: row.orderItemId, quantity: row.quantity });
      shipments.set(row.id, shipment);
    }
    const o = result.order;
    const terms = o.termsSnapshot as QuoteTerms;
    const responseTerms = {
      currency: terms.currency,
      precision: terms.precision,
      pickup: terms.pickup,
      payment:
        !result.proposal && o.lifecycleStatus === "unpaid" && terms.payment
          ? {
              name: terms.payment.name,
              instructions: terms.payment.instructions,
            }
          : null,
    };
    return {
      order: {
        id: o.id,
        referenceCode: o.referenceCode,
        lifecycleStatus: o.lifecycleStatus,
        purchaseTotalCents: o.purchaseTotalCents,
        discountCents: o.discountCents,
        creditAppliedCents: o.creditAppliedCents,
        fulfillmentType: o.fulfillmentType,
        createdAt: o.createdAt,
        terms: responseTerms,
      },
      items: result.items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        lineTotalCents: i.lineTotalCents,
        catalog: i.catalogSnapshot,
      })),
      receivedCents: result.receivedCents,
      proposal: result.proposal
        ? {
            id: result.proposal.id,
            reason: result.proposal.reason,
            proposedTotalCents: result.proposal.proposedTotalCents,
          }
        : null,
      fulfillment: result.fulfillment
        ? {
            status: result.fulfillment.status,
            carrier: result.fulfillment.carrier,
            trackingNumber: result.fulfillment.trackingNumber,
          }
        : null,
      refunds: result.refunds,
      shipments: [...shipments.values()],
      evidence: result.evidence,
    };
  });
}
