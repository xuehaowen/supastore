export const MAX_CART_LINES = 100;
export const CART_LINE_LIMIT_MESSAGE =
  "Your bag can contain up to 100 different items. Remove an item before adding another or checking out.";

export interface QuoteDto {
  id: string;
  cartId: string;
  expiresAt: string;
  merchandiseSubtotalCents: number;
  shippingCents: number;
  exclusiveTaxCents: number;
  inclusiveTaxCents: number;
  discountCents: number;
  totalPayableCents: number;
  items: unknown[];
}

export interface QuoteRequestDto {
  cartId: string;
  fulfillmentType: "shipping" | "pickup" | "local_delivery";
  country: string;
  address: string;
  postalCode: string;
  region: string;
  pickupDate: string;
  pickupTime: string;
  promotionCode: string;
  deliveryAreaId?: string;
  pickupLocationId?: string;
  paymentAccountId?: string;
}

export interface CreatedOrderDto {
  id: string;
  referenceCode: string;
  lifecycleStatus: "unpaid" | "confirmed" | "completed" | "cancelled";
  purchaseTotalCents: number;
}

export interface CreateOrderRequestDto {
  locale: "en" | "zh";
  quoteId: string;
  name: string;
  email: string;
  accepted: true;
  creditAppliedCents: number;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid checkout response.");
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function amount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parseQuoteDto(value: unknown): QuoteDto {
  const data = record(value);
  if (
    !text(data.id) ||
    !text(data.cartId) ||
    !text(data.expiresAt) ||
    !Number.isFinite(Date.parse(data.expiresAt)) ||
    !Array.isArray(data.items) ||
    ![
      data.merchandiseSubtotalCents,
      data.shippingCents,
      data.exclusiveTaxCents,
      data.inclusiveTaxCents,
      data.discountCents,
      data.totalPayableCents,
    ].every(amount)
  )
    throw new Error("Invalid checkout response.");
  return data as unknown as QuoteDto;
}

export function parseCreatedOrderDto(value: unknown): CreatedOrderDto {
  const data = record(value);
  if (
    !text(data.id) ||
    !text(data.referenceCode) ||
    typeof data.lifecycleStatus !== "string" ||
    !["unpaid", "confirmed", "completed", "cancelled"].includes(
      data.lifecycleStatus,
    ) ||
    !amount(data.purchaseTotalCents)
  )
    throw new Error("Invalid checkout response.");
  return data as unknown as CreatedOrderDto;
}
