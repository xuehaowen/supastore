import { DomainError } from "@/application/common/errors";
export function validateShipmentQuantities(
  items: { id: string; quantity: number }[],
  shipped: { orderItemId: string; quantity: number }[],
  requested: { orderItemId: string; quantity: number }[],
) {
  if (
    !requested.length ||
    new Set(requested.map((i) => i.orderItemId)).size !== requested.length
  )
    throw new DomainError("Choose each shipment item once.");
  for (const line of requested) {
    const item = items.find((i) => i.id === line.orderItemId);
    const used = shipped
      .filter((i) => i.orderItemId === line.orderItemId)
      .reduce((sum, i) => sum + i.quantity, 0);
    if (
      !item ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > item.quantity - used
    )
      throw new DomainError("Shipment quantity exceeds unshipped order units.");
  }
}
export function shipmentCoverageComplete(
  items: { id: string; quantity: number }[],
  shipped: { orderItemId: string; quantity: number }[],
) {
  return (
    items.length > 0 &&
    items.every(
      (item) =>
        shipped
          .filter((line) => line.orderItemId === item.id)
          .reduce((sum, line) => sum + line.quantity, 0) === item.quantity,
    )
  );
}
