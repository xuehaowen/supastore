import {
  apiResponse,
  readApiBody,
  apiText,
} from "@/infrastructure/http/commerce-api";
import { staffIdentity } from "@/infrastructure/web";
import {
  dispatchShipment,
  recordShipmentDelivered,
} from "@/application/use-cases/fulfillment/shipments";
import {
  rescheduleOrder,
  rescheduleOrderWindow,
} from "@/application/use-cases/fulfillment/reschedule-order";
import { DomainError } from "@/application/common/errors";
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readApiBody(request),
      staffUserId = await staffIdentity();
    switch (body.operation) {
      case "reschedule":
        if (!body.slotId)
          return rescheduleOrderWindow({
            staffUserId,
            orderId: apiText(body, "orderId"),
            date: apiText(body, "date", 10),
            startTime: apiText(body, "startTime", 5),
            reason: apiText(body, "reason", 500),
          });
        return rescheduleOrder({
          staffUserId,
          orderId: apiText(body, "orderId"),
          slotId: apiText(body, "slotId"),
          reason: apiText(body, "reason", 500),
        });
      case "delivered":
        return recordShipmentDelivered({
          staffUserId,
          shipmentId: apiText(body, "shipmentId"),
        });
      case "dispatch": {
        if (!Array.isArray(body.items))
          throw new DomainError("Shipment item list required.");
        return dispatchShipment({
          staffUserId,
          orderId: apiText(body, "orderId"),
          requestKey: apiText(body, "requestKey"),
          carrier: apiText(body, "carrier"),
          provider: apiText(body, "provider", 120, true) || "manual",
          trackingNumber: apiText(body, "trackingNumber", 200, true),
          items: body.items.map((line) => {
            if (
              !line ||
              typeof line !== "object" ||
              typeof line.orderItemId !== "string" ||
              typeof line.quantity !== "number"
            )
              throw new DomainError("Invalid shipment item.");
            return { orderItemId: line.orderItemId, quantity: line.quantity };
          }),
        });
      }
      default:
        throw new DomainError("Unknown fulfillment operation.");
    }
  });
}
