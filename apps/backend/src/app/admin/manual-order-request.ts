import { parseActionInteger } from "@/application/common/request-validation";
import { field } from "@/app/actions/common";

export function parseManualOrderForm(form: FormData) {
  const itemCount = parseActionInteger(
    field(form, "itemCount"),
    "Item count",
    1,
    25,
  );
  return {
    requestKey: field(form, "requestKey"),
    customerName: field(form, "customerName"),
    customerEmail: field(form, "customerEmail"),
    fulfillmentType: field(form, "fulfillmentType") || "shipping",
    pickupLocationId: field(form, "pickupLocationId"),
    pickupDate: field(form, "pickupDate"),
    pickupTime: field(form, "pickupTime"),
    country: field(form, "country"),
    address: field(form, "address"),
    region: field(form, "region"),
    postalCode: field(form, "postalCode"),
    paymentAccountId: field(form, "paymentAccountId"),
    items: Array.from({ length: itemCount }, (_, index) => ({
      variantId: field(form, `variantId-${index}`),
      quantity: parseActionInteger(
        field(form, `quantity-${index}`),
        "Quantity",
        1,
        999,
      ),
    })),
  };
}
