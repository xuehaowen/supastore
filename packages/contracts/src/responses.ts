import type {
  CartDto,
  CustomerAccountDto,
  ProductDto,
  StoreDto,
} from "./index";

export interface CatalogDto {
  total: number;
  page: number;
  pageSize: number;
  items: {
    id: string;
    handle: string;
    title: string;
    description: string;
    coverImageKey: string | null;
    lowestPriceCents: number | null;
  }[];
}

export interface VariantOptionsDto {
  options: { id: string; label: string }[];
  hasNext: boolean;
}

export interface OrderDetailDto {
  order: {
    referenceCode: string;
    lifecycleStatus: string;
    purchaseTotalCents: number;
    creditAppliedCents: number;
    terms: {
      currency: string;
      precision: number;
      pickup?: {
        address: string;
        date: string;
        startTime: string;
        endTime: string;
      } | null;
      payment: { name: string; instructions: string } | null;
    };
  };
  receivedCents: number;
  paymentStatus: string | null;
  refunds: {
    id: string;
    amountCents: number;
    settledCents: number;
    reason: string;
  }[];
  returns: { id: string; status: string; reason: string }[];
  returnableItems: { id: string; quantity: number }[];
  shipments?: {
    id: string;
    carrier: string;
    trackingNumber: string | null;
    status: string;
    items: { orderItemId: string; quantity: number }[];
  }[];
  proposal?: { id: string; reason: string; proposedTotalCents: number } | null;
  items: {
    id: string;
    quantity: number;
    lineTotalCents: number;
    catalog: { productTitle?: string; variantTitle?: string; title?: string };
  }[];
  fulfillment: {
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
  } | null;
}

type Check = (value: unknown) => boolean;
const text: Check = (value) => typeof value === "string";
const id: Check = (value) =>
  typeof value === "string" && value.trim().length > 0;
const bool: Check = (value) => typeof value === "boolean";
const integer: Check = (value) =>
  typeof value === "number" && Number.isSafeInteger(value);
const amount: Check = (value) => integer(value) && (value as number) >= 0;
const positive: Check = (value) => integer(value) && (value as number) > 0;
const precision: Check = (value) => amount(value) && (value as number) <= 4;
const currency: Check = (value) =>
  typeof value === "string" && /^[A-Z]{3}$/.test(value);
const date: Check = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const optional =
  (check: Check): Check =>
  (value) =>
    value === undefined || check(value);
const array =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const shape =
  (fields: Record<string, Check>): Check =>
  (value) =>
    object(value) &&
    Object.entries(fields).every(([name, check]) => check(value[name]));
const oneOf =
  (...values: string[]): Check =>
  (value) =>
    typeof value === "string" && values.includes(value);
const lifecycle = oneOf("unpaid", "confirmed", "completed", "cancelled");
const stringRecord: Check = (value) =>
  object(value) && Object.values(value).every(text);
const schedule = array(
  shape({
    date: text,
    slots: array(shape({ startTime: text, endTime: text })),
  }),
);

function parse<T>(value: unknown, check: Check): T {
  if (!check(value)) throw new Error("Invalid API response.");
  // The complete public shape is checked before crossing the HTTP boundary.
  return value as T;
}

const store = shape({
  storeName: text,
  currency,
  precision,
  supportEmail: text,
  isPaused: bool,
  pauseMessage: nullable(text),
  isOrderingEnabled: bool,
  commercePolicy: optional(
    shape({
      shippingEnabled: bool,
      pickupEnabled: bool,
      deliveryEnabled: bool,
    }),
  ),
  stripeConfigured: optional(bool),
  categories: array(shape({ id, name: text, slug: text })),
  paymentMethods: array(shape({ id, name: text, type: text })),
  pickupLocations: array(
    shape({
      id,
      name: text,
      address: text,
      scheduleRequired: bool,
      dates: schedule,
    }),
  ),
  shippingZones: array(
    shape({
      id,
      name: text,
      countryCodes: optional(nullable(array(text))),
      regionCodes: optional(array(text)),
      postalPrefixes: optional(array(text)),
    }),
  ),
  deliveryAreas: optional(
    array(
      shape({
        id,
        name: text,
        countryCodes: array(text),
        postalPrefixes: array(text),
        rateCents: amount,
        freeThresholdCents: nullable(amount),
        scheduleRequired: bool,
        dates: schedule,
      }),
    ),
  ),
});
const product = shape({
  id,
  handle: id,
  title: text,
  description: text,
  variants: array(
    shape({ id, title: text, priceCents: amount, isAvailable: bool }),
  ),
  images: array(shape({ s3Key: id, altText: nullable(text) })),
});
const cart = shape({
  id,
  subtotalCents: amount,
  revision: optional(positive),
  itemCount: optional(amount),
  items: array(
    shape({
      id,
      productTitle: text,
      title: text,
      quantity: positive,
      lineTotalCents: amount,
      isAvailable: bool,
    }),
  ),
});
const account = shape({
  customer: shape({ name: text, email: text, phone: nullable(text) }),
  orders: array(
    shape({
      id,
      referenceCode: id,
      lifecycleStatus: lifecycle,
      purchaseTotalCents: amount,
      createdAt: date,
    }),
  ),
  addresses: array(shape({ id, label: text, address: stringRecord })),
  credit: nullable(
    shape({
      balanceCents: amount,
      reservedCents: amount,
      currency,
      precision,
      reconciled: optional(bool),
      hasNext: optional(bool),
      entries: array(
        shape({
          id,
          amountCents: integer,
          kind: text,
          reason: optional(text),
          createdAt: date,
        }),
      ),
    }),
  ),
  hasNext: bool,
});
const catalog = shape({
  total: amount,
  page: positive,
  pageSize: positive,
  items: array(
    shape({
      id,
      handle: id,
      title: text,
      description: text,
      coverImageKey: nullable(text),
      lowestPriceCents: nullable(amount),
    }),
  ),
});
const order = shape({
  order: shape({
    referenceCode: id,
    lifecycleStatus: lifecycle,
    purchaseTotalCents: amount,
    creditAppliedCents: amount,
    terms: shape({
      currency,
      precision,
      pickup: optional(
        nullable(
          shape({ address: text, date: text, startTime: text, endTime: text }),
        ),
      ),
      payment: nullable(shape({ name: text, instructions: text })),
    }),
  }),
  receivedCents: integer,
  paymentStatus: nullable(
    oneOf("creating", "open", "paid", "review", "expired"),
  ),
  refunds: array(
    shape({ id, amountCents: amount, settledCents: amount, reason: text }),
  ),
  returns: array(shape({ id, status: text, reason: text })),
  returnableItems: array(shape({ id, quantity: positive })),
  shipments: optional(
    array(
      shape({
        id,
        carrier: text,
        trackingNumber: nullable(text),
        status: text,
        items: array(shape({ orderItemId: id, quantity: positive })),
      }),
    ),
  ),
  proposal: optional(
    nullable(shape({ id, reason: text, proposedTotalCents: amount })),
  ),
  items: array(
    shape({
      id,
      quantity: positive,
      lineTotalCents: amount,
      catalog: shape({
        productTitle: optional(text),
        variantTitle: optional(text),
        title: optional(text),
      }),
    }),
  ),
  fulfillment: nullable(
    shape({
      status: text,
      carrier: nullable(text),
      trackingNumber: nullable(text),
    }),
  ),
});

export const parseStoreDto = (value: unknown): StoreDto => parse(value, store);
export const parseOptionalStoreDto = (value: unknown): StoreDto | null =>
  parse(value, nullable(store));
export const parseProductDto = (value: unknown): ProductDto =>
  parse(value, product);
export const parseCartDto = (value: unknown): CartDto => parse(value, cart);
export const parseOptionalCartDto = (value: unknown): CartDto | null =>
  parse(value, nullable(cart));
export const parseCustomerAccountDto = (value: unknown): CustomerAccountDto =>
  parse(value, account);
export const parseVariantOptionsDto = (value: unknown): VariantOptionsDto =>
  parse(
    value,
    shape({ options: array(shape({ id, label: text })), hasNext: bool }),
  );
export const parseCatalogDto = (value: unknown): CatalogDto =>
  parse(value, catalog);
export const parseOrderDetailDto = (value: unknown): OrderDetailDto =>
  parse(value, order);
export const parseUploadIntentDto = (value: unknown): { intentId: string } =>
  parse(value, shape({ intentId: id }));
export const parseRecoveryOrderDto = (value: unknown): { orderId: string } =>
  parse(value, shape({ orderId: id }));
export function parsePaymentCheckoutDto(value: unknown): { url: string } {
  const checkout = parse<{ url: string }>(value, shape({ url: text }));
  try {
    const url = new URL(checkout.url);
    if (url.protocol === "https:" && url.hostname === "checkout.stripe.com")
      return checkout;
  } catch {
    /* Reject malformed URLs along with untrusted destinations. */
  }
  throw new Error("Invalid API response.");
}
