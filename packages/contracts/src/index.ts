/** Serializable HTTP DTOs and pure validation. No server or database dependencies. */
export * from "./checkout";
export * from "./responses";
export type {
  CustomerPageModels,
  QuoteTerms,
  ProductDetail,
} from "./customer-pages";
export interface CustomerAccountDto {
  customer: { name: string; email: string; phone: string | null };
  orders: {
    id: string;
    referenceCode: string;
    lifecycleStatus: string;
    purchaseTotalCents: number;
    createdAt: string;
  }[];
  addresses: { id: string; label: string; address: Record<string, string> }[];
  credit: null | {
    balanceCents: number;
    reservedCents: number;
    currency: string;
    precision: number;
    reconciled?: boolean;
    hasNext?: boolean;
    entries: {
      id: string;
      amountCents: number;
      kind: string;
      reason?: string;
      createdAt: string;
    }[];
  };
  hasNext: boolean;
}

export interface StoreDto {
  commercePolicy?: {
    shippingEnabled: boolean;
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
  };
  storeName: string;
  currency: string;
  precision: number;
  supportEmail: string;
  stripeConfigured?: boolean;
  isPaused: boolean;
  pauseMessage: string | null;
  isOrderingEnabled: boolean;
  categories: { id: string; name: string; slug: string }[];
  paymentMethods: { id: string; name: string; type: string }[];
  pickupLocations: {
    id: string;
    name: string;
    address: string;
    scheduleRequired: boolean;
    dates: { date: string; slots: { startTime: string; endTime: string }[] }[];
  }[];
  shippingZones: {
    id: string;
    name: string;
    countryCodes?: string[] | null;
    regionCodes?: string[];
    postalPrefixes?: string[];
  }[];
  deliveryAreas?: {
    id: string;
    name: string;
    countryCodes: string[];
    postalPrefixes: string[];
    rateCents: number;
    freeThresholdCents: number | null;
    scheduleRequired: boolean;
    dates: { date: string; slots: { startTime: string; endTime: string }[] }[];
  }[];
}
export interface ProductDto {
  id: string;
  handle: string;
  title: string;
  description: string;
  variants: {
    id: string;
    title: string;
    priceCents: number;
    isAvailable: boolean;
  }[];
  images: { s3Key: string; altText: string | null }[];
}
export interface CartDto {
  id: string;
  revision?: number;
  itemCount?: number;
  items: {
    id: string;
    productTitle: string;
    title: string;
    quantity: number;
    lineTotalCents: number;
    isAvailable: boolean;
  }[];
  subtotalCents: number;
}
