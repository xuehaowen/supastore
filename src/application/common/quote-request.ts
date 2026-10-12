import { DomainError } from "./errors";
import { parseActionEnum, parseActionUuid } from "./request-validation";
import type { QuoteRequestDto } from "@supastore/contracts";

/** The same public quote fields are accepted by JSON and form entry points. */
export function parseQuoteRequest(
  input: Record<string, unknown>,
): QuoteRequestDto {
  const text = (key: string, max: number, required = false) => {
    const value = input[key];
    if (value === undefined && !required) return "";
    if (typeof value !== "string") throw new DomainError(`Invalid ${key}.`);
    const normalized = value.trim();
    if (normalized.length > max || (required && !normalized))
      throw new DomainError(`Invalid ${key}.`);
    return normalized;
  };
  const optionalUuid = (key: string) => {
    const value = text(key, 36);
    return value ? parseActionUuid(value, key) : undefined;
  };
  const pickupLocationId = optionalUuid("pickupLocationId");
  const paymentAccountId = optionalUuid("paymentAccountId");
  const deliveryAreaId = optionalUuid("deliveryAreaId");
  return {
    cartId: parseActionUuid(text("cartId", 36, true), "Cart"),
    fulfillmentType: parseActionEnum(
      text("fulfillmentType", 20, true),
      "Fulfillment",
      ["shipping", "pickup", "local_delivery"] as const,
    ),
    country: text("country", 2).toUpperCase(),
    address: text("address", 2000),
    region: text("region", 12).toUpperCase(),
    postalCode: text("postalCode", 40),
    pickupDate: text("pickupDate", 10),
    pickupTime: text("pickupTime", 20),
    promotionCode: text("promotionCode", 100),
    ...(pickupLocationId ? { pickupLocationId } : {}),
    ...(paymentAccountId ? { paymentAccountId } : {}),
    ...(deliveryAreaId ? { deliveryAreaId } : {}),
  };
}
