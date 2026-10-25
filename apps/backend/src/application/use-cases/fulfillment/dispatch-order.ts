import { dispatchShipment } from "./shipments";
export async function dispatchOrder(input: {
  orderId: string;
  staffUserId: string;
  carrier: string;
  trackingNumber?: string;
}) {
  return dispatchShipment({ ...input, requestKey: "whole-order-dispatch" });
}
