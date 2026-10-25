import { customerError } from "@supastore/i18n/customer";

// Known public validation messages only. Unrecognized failures stay in the summary.
const fields: Record<string, string> = {
  "Enter your shipping address and country.": "address",
  "Enter your delivery address.": "address",
  "Enter a valid state or region code.": "region",
  "Enter your state or region.": "region",
  "Enter a valid ZIP or postal code.": "postalCode",
  "Enter your ZIP or postal code.": "postalCode",
  "We do not ship to this destination.": "country",
  "Choose an available delivery area.": "deliveryAreaId",
  "Choose an active payment method.": "paymentAccountId",
  "This promotion code is not active.": "promotionCode",
  "This promotion is not eligible for the selected fulfillment or destination.":
    "promotionCode",
  "Your order does not meet this promotion's minimum subtotal.":
    "promotionCode",
  "This promotion has reached its usage limit.": "promotionCode",
};

export function checkoutFieldErrors(message: string, locale: string) {
  const field = Object.hasOwn(fields, message) ? fields[message] : undefined;
  return field ? { [field]: customerError(message, locale) } : undefined;
}
