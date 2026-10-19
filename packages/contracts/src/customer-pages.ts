export type CustomerStore = {
  hasContextualRules?: boolean;
  sms?: { enabled: boolean; available: boolean };
  storeName: string;
  logoKey: null | string;
  supportEmail: string;
  publicContent: {
    en?: {
      about?: string;
      shipping?: string;
      returns?: string;
      privacy?: string;
      terms?: string;
    };
    zh?: {
      about?: string;
      shipping?: string;
      returns?: string;
      privacy?: string;
      terms?: string;
    };
  };
  currency: string;
  precision: number;
  defaultLocale: string;
  timezone: string;
  isPaused: boolean;
  pauseMessage: string;
  isOrderingEnabled: boolean;
  commercePolicy: {
    guestCheckout: boolean;
    rewardsEnabled: boolean;
    rewardRateBasisPoints: number;
    rewardEligibleCategoryIds: Array<string>;
    rewardsStartAt: null | string;
    rewardsEndAt: null | string;
    shippingEnabled: boolean;
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    salesThresholdCents: null | number;
    fiscalYearStartMonth: number;
  };
};
export type CustomerCart = null | {
  id: string;
  revision: number;
  items: Array<{
    id: string;
    variantId: string;
    sku: string;
    title: string;
    productTitle: string;
    productHandle: string;
    priceCents: number;
    quantity: number;
    lineTotalCents: number;
    isAvailable: boolean;
    imageKey: null | string;
  }>;
  subtotalCents: number;
  itemCount: number;
};
export type CustomerAccount = null | {
  customer: { name: string; email: string; phone: null | string };
  addresses: Array<{
    id: string;
    label: string;
    address: { [key: string]: string };
  }>;
  orders: Array<{
    id: string;
    referenceCode: string;
    lifecycleStatus: "unpaid" | "confirmed" | "completed" | "cancelled";
    purchaseTotalCents: number;
    termsSnapshot: { currency: string; precision: number };
  }>;
  hasNext: boolean;
  credit: null | {
    account: {
      currency: string;
      precision: number;
      balanceCents: number;
      reservedCents: number;
    };
    entries: Array<{
      id: string;
      amountCents: number;
      reason: string;
      createdAt: string;
    }>;
    reconciled: boolean;
    hasNext: boolean;
  };
};
export type CatalogResult = {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    handle: string;
    title: string;
    description: string;
    isPublished: boolean;
    coverImageKey: null | string;
    lowestPriceCents: null | number;
    variantCount: number;
  }>;
};

/** Public customer page response shapes. Dates are ISO strings on the wire. */
export interface CustomerPageModels {
  layout: {
    store?: CustomerStore | undefined;
    session: null | {
      user: {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
      };
    };
  };
  catalog: {
    result: CatalogResult;
    store?: CustomerStore | undefined;
    facets: Array<{
      attribute: string;
      name: string;
      value: string;
      label: string;
    }>;
    collections: Array<{
      id: string;
      handle: string;
      title: string;
      description: string;
      imageKey: null | string;
      imageAlt: string;
      isPublished: boolean;
      revision: number;
      createdAt: string;
      updatedAt: string;
    }>;
    collectionTitles: Array<{
      id: string;
      collectionId: string;
      locale: string;
      title: string;
      description: string;
    }>;
    groups: Array<{
      id: string;
      slug: string;
      name: string;
      parentId: null | string;
      sortOrder: number;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  product: {
    purchasable: {
      variants: Array<{
        isAvailable: boolean;
        id: string;
        sku: string;
        localizedAttributes: Array<{
          code: string;
          name: string;
          valueCode: string;
          label: string;
        }>;
        title: string;
        priceCents: number;
        sortOrder: number;
      }>;
      id: string;
      handle: string;
      title: string;
      description: string;
      isPublished: boolean;
      quoteVersion: number;
      images: Array<{
        id: string;
        variantId: null | string;
        s3Key: string;
        altText: string;
        sortOrder: number;
      }>;
      categories: Array<{ id: string; slug: string; name: string }>;
    };
    store?: CustomerStore | undefined;
    availableQuantities: { [key: string]: number };
    specs: Array<{
      valueId: string;
      name: string;
      label: string;
      sortOrder: number;
    }>;
  };
  cart: {
    cart: CustomerCart;
    store?: CustomerStore | undefined;
  };
  checkout: {
    cart: CustomerCart;
    store?: CustomerStore | undefined;
    shippingRules: Array<{
      countryCodes: null | Array<string>;
      regionCodes: Array<string>;
      postalPrefixes: Array<string>;
    }>;
    accounts: Array<{ id: string; name: string }>;
    locations: Array<{
      dates: Array<{
        date: string;
        slots: Array<{ date: string; startTime: string; endTime: string }>;
      }>;
      id: string;
      name: string;
      address: string;
      weeklySchedule: { [key: string]: Array<[string, string]> };
      blackoutDates: Array<string>;
      prepMinutes: number;
      slotCapacity: null | number;
      scheduleRequired: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    delivery: Array<{
      dates: Array<{
        date: string;
        slots: Array<{ date: string; startTime: string; endTime: string }>;
      }>;
      id: string;
      name: string;
      countryCodes: Array<string>;
      postalPrefixes: Array<string>;
      rateCents: number;
      freeThresholdCents: null | number;
      isActive: boolean;
      weeklySchedule: { [key: string]: Array<[string, string]> };
      prepMinutes: number;
      scheduleRequired: boolean;
      slotCapacity: null | number;
      createdAt: string;
      updatedAt: string;
    }>;
    methods: Array<"shipping" | "pickup" | "local_delivery">;
    savedQuote?:
      | undefined
      | {
          id: string;
          cartId: string;
          cartRevision: number;
          termsSnapshot: unknown;
          merchandiseSubtotalCents: number;
          shippingCents: number;
          exclusiveTaxCents: number;
          inclusiveTaxCents: number;
          totalPayableCents: number;
          discountCents: number;
          itemsSnapshot: unknown;
          shippingSnapshot: unknown;
          expiresAt: string;
          createdAt: string;
        };
    quote?:
      | undefined
      | {
          id: string;
          cartId: string;
          cartRevision: number;
          termsSnapshot: unknown;
          merchandiseSubtotalCents: number;
          shippingCents: number;
          exclusiveTaxCents: number;
          inclusiveTaxCents: number;
          totalPayableCents: number;
          discountCents: number;
          itemsSnapshot: unknown;
          shippingSnapshot: unknown;
          expiresAt: string;
          createdAt: string;
        };
    initial?:
      | undefined
      | {
          rewardProgramActive: boolean;
          settingsVersion: number;
          currency: string;
          precision: number;
          fulfillmentType: "shipping" | "pickup" | "local_delivery";
          shippingAddress: {
            country: string;
            address: string;
            region?: string;
            postalCode?: string;
          };
          pickup: null | {
            locationId: string;
            address: string;
            date: string;
            startTime: string;
            endTime: string;
          };
          delivery: null | {
            areaId: string;
            name: string;
            country: string;
            postalCode: string;
            rateCents: number;
            date?: string;
            startTime?: string;
            endTime?: string;
          };
          payment: null | { id: string; name: string; instructions: string };
          onlinePayment: boolean;
          promotion: null | {
            id: string;
            code: string;
            name: string;
            discountCents: number;
          };
          input: {
            fulfillmentType: "shipping" | "pickup" | "local_delivery";
            shippingAddress: {
              country: string;
              address: string;
              region?: string;
              postalCode?: string;
            };
            pickupDate: string;
            pickupLocationId: string;
            pickupTime: string;
            paymentAccountId: string;
            promotionCode: string;
            deliveryAreaId: string;
          };
        };
    customer: CustomerAccount;
    onlinePayment: boolean;
  };
  account: {
    session: null | { user: { id: string; name: string; email: string } };
    account: CustomerAccount;
    page: number;
    reference: string;
    creditPage: number;
    hasUnverifiedSession: boolean;
  };
  order: {
    result: {
      order: {
        referenceCode: string;
        lifecycleStatus: "unpaid" | "confirmed" | "completed" | "cancelled";
        purchaseTotalCents: number;
        creditAppliedCents: number;
        termsSnapshot: unknown;
        isClaimed: boolean;
      };
      items: Array<{
        id: string;
        variantId: string;
        quantity: number;
        unitPriceCents: number;
        catalogSnapshot: { title: string };
      }>;
      proposal: null | {
        id: string;
        reason: string;
        proposedTotalCents: number;
      };
      fulfillment: null | {
        status:
          | "unfulfilled"
          | "preparing"
          | "ready_for_pickup"
          | "shipped"
          | "fulfilled";
      };
      receivedCents: number;
      goodsReturns: Array<{
        id: string;
        status:
          "cancelled" | "rejected" | "requested" | "approved" | "received";
        reason: string;
        reviewReason: null | string;
      }>;
      returnItems: Array<{
        returnId: string;
        orderItemId: string;
        quantity: number;
      }>;
      evidence: Array<{ id: string }>;
      refunds: Array<{
        id: string;
        amountCents: number;
        reason: string;
        settledCents: number;
      }>;
    };
    store?: CustomerStore | undefined;
    paymentAttempt?:
      | undefined
      | {
          status: "open" | "review" | "expired" | "creating" | "paid";
        };
    onlinePayment: boolean;
  };
  collection: {
    collection: {
      id: string;
      handle: string;
      title: string;
      description: string;
      imageKey: null | string;
      imageAlt: string;
      isPublished: boolean;
      revision: number;
      createdAt: string;
      updatedAt: string;
    };
    translated?:
      | undefined
      | {
          id: string;
          collectionId: string;
          locale: string;
          title: string;
          description: string;
        };
    result: CatalogResult;
    store?: CustomerStore | undefined;
  };
}
export type QuoteTerms = {
  evaluation?: {
    context: import("./commerce-evaluation").CommercePreviewRequest["context"];
    matchedRuleIds: string[];
    rewardRateBasisPoints: number;
  };
  rewardProgramActive: boolean;
  settingsVersion: number;
  currency: string;
  precision: number;
  fulfillmentType: "shipping" | "pickup" | "local_delivery";
  shippingAddress: {
    country: string;
    address: string;
    region?: string;
    postalCode?: string;
  };
  pickup: null | {
    locationId: string;
    address: string;
    date: string;
    startTime: string;
    endTime: string;
  };
  delivery: null | {
    areaId: string;
    name: string;
    country: string;
    postalCode: string;
    rateCents: number;
    date?: string;
    startTime?: string;
    endTime?: string;
  };
  payment: null | { id: string; name: string; instructions: string };
  onlinePayment: boolean;
  promotion: null | {
    id: string;
    code: string;
    name: string;
    discountCents: number;
  };
  input: {
    fulfillmentType: "shipping" | "pickup" | "local_delivery";
    shippingAddress: {
      country: string;
      address: string;
      region?: string;
      postalCode?: string;
    };
    pickupDate: string;
    pickupLocationId: string;
    pickupTime: string;
    paymentAccountId: string;
    promotionCode: string;
    deliveryAreaId: string;
  };
};
export type ProductDetail = {
  id: string;
  handle: string;
  title: string;
  description: string;
  isPublished: boolean;
  quoteVersion: number;
  variants: Array<{
    id: string;
    sku: string;
    localizedAttributes: Array<{
      code: string;
      name: string;
      valueCode: string;
      label: string;
    }>;
    title: string;
    priceCents: number;
    isAvailable: boolean;
    sortOrder: number;
  }>;
  images: Array<{
    id: string;
    variantId: null | string;
    s3Key: string;
    altText: string;
    sortOrder: number;
  }>;
  categories: Array<{ id: string; slug: string; name: string }>;
};
