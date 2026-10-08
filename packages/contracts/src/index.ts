/** Serializable HTTP DTOs only. No server code, secrets, database or runtime dependencies. */
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
    entries: {
      id: string;
      amountCents: number;
      kind: string;
      createdAt: string;
    }[];
  };
  hasNext: boolean;
}

export interface StoreDto {
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
  shippingZones: { id: string; name: string }[];
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
