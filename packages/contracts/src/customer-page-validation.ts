import * as v from "valibot";
import type { CustomerPageModels } from "./customer-pages";
import { shoppingContextSchema } from "./commerce-evaluation";

import { storefrontHeroSchema } from "./storefront-hero";

const text = v.string();
const id = v.pipe(text, v.minLength(1));
const integer = v.pipe(v.number(), v.safeInteger());
const amount = v.pipe(integer, v.minValue(0));
const positive = v.pipe(integer, v.minValue(1));
const precision = v.pipe(amount, v.maxValue(4));
const currency = v.pipe(text, v.regex(/^[A-Z]{3}$/));
const timestamp = v.pipe(text, v.isoTimestamp());
const lifecycle = v.picklist(["unpaid", "confirmed", "completed", "cancelled"]);
const fulfillment = v.picklist(["shipping", "pickup", "local_delivery"]);
const strings = v.array(text);
const address = v.object({
  country: text,
  address: text,
  region: v.exactOptional(text),
  postalCode: v.exactOptional(text),
});
const pickup = v.object({
  locationId: id,
  address: text,
  date: text,
  startTime: text,
  endTime: text,
});
const delivery = v.object({
  areaId: id,
  name: text,
  country: text,
  postalCode: text,
  rateCents: amount,
  date: v.exactOptional(text),
  startTime: v.exactOptional(text),
  endTime: v.exactOptional(text),
});
const terms = v.object({
  evaluation: v.exactOptional(
    v.object({
      context: shoppingContextSchema,
      matchedRuleIds: v.array(id),
      rewardRateBasisPoints: v.pipe(amount, v.maxValue(10000)),
    }),
  ),
  rewardProgramActive: v.boolean(),
  settingsVersion: amount,
  currency,
  precision,
  fulfillmentType: fulfillment,
  shippingAddress: address,
  pickup: v.nullable(pickup),
  delivery: v.nullable(delivery),
  payment: v.nullable(v.object({ id, name: text, instructions: text })),
  onlinePayment: v.boolean(),
  promotion: v.nullable(
    v.object({ id, code: text, name: text, discountCents: amount }),
  ),
  input: v.object({
    fulfillmentType: fulfillment,
    shippingAddress: address,
    pickupDate: text,
    pickupLocationId: text,
    pickupTime: text,
    paymentAccountId: text,
    promotionCode: text,
    deliveryAreaId: text,
  }),
});
const publicContent = v.object({
  support: v.exactOptional(text),
  about: v.exactOptional(text),
  shipping: v.exactOptional(text),
  returns: v.exactOptional(text),
  privacy: v.exactOptional(text),
  terms: v.exactOptional(text),
});
const store = v.exactOptional(
  v.object({
    storeName: text,
    sms: v.exactOptional(
      v.object({ enabled: v.boolean(), available: v.boolean() }),
    ),
    hasContextualRules: v.exactOptional(v.boolean()),
    logoKey: v.nullable(text),
    storefrontHero: v.exactOptional(storefrontHeroSchema),
    supportEmail: text,
    publicContent: v.object({
      en: v.exactOptional(publicContent),
      zh: v.exactOptional(publicContent),
    }),
    currency,
    precision,
    defaultLocale: text,
    timezone: text,
    isPaused: v.boolean(),
    pauseMessage: text,
    isOrderingEnabled: v.boolean(),
    commercePolicy: v.object({
      guestCheckout: v.boolean(),
      rewardsEnabled: v.boolean(),
      rewardRateBasisPoints: v.pipe(amount, v.maxValue(10000)),
      rewardEligibleCategoryIds: v.array(id),
      rewardsStartAt: v.nullable(timestamp),
      rewardsEndAt: v.nullable(timestamp),
      shippingEnabled: v.boolean(),
      pickupEnabled: v.boolean(),
      deliveryEnabled: v.boolean(),
      salesThresholdCents: v.nullable(amount),
      fiscalYearStartMonth: v.pipe(positive, v.maxValue(12)),
    }),
  }),
);
const cart = v.nullable(
  v.object({
    id,
    revision: amount,
    subtotalCents: amount,
    itemCount: amount,
    items: v.array(
      v.object({
        id,
        variantId: id,
        sku: text,
        title: text,
        productTitle: text,
        productHandle: text,
        priceCents: amount,
        quantity: positive,
        lineTotalCents: amount,
        isAvailable: v.boolean(),
        imageKey: v.nullable(text),
      }),
    ),
  }),
);
const user = { id, name: text, email: text };
const account = v.nullable(
  v.object({
    customer: v.object({ name: text, email: text, phone: v.nullable(text) }),
    addresses: v.array(
      v.object({ id, label: text, address: v.record(text, text) }),
    ),
    orders: v.array(
      v.object({
        id,
        referenceCode: text,
        lifecycleStatus: lifecycle,
        purchaseTotalCents: amount,
        termsSnapshot: v.object({ currency, precision }),
      }),
    ),
    hasNext: v.boolean(),
    credit: v.nullable(
      v.object({
        account: v.object({
          currency,
          precision,
          balanceCents: amount,
          reservedCents: amount,
        }),
        entries: v.array(
          v.object({
            id,
            amountCents: integer,
            reason: text,
            createdAt: timestamp,
          }),
        ),
        reconciled: v.boolean(),
        hasNext: v.boolean(),
      }),
    ),
  }),
);
const catalog = v.object({
  page: positive,
  pageSize: positive,
  total: amount,
  items: v.array(
    v.object({
      id,
      handle: text,
      title: text,
      description: text,
      isPublished: v.boolean(),
      coverImageKey: v.nullable(text),
      previewImageKey: v.exactOptional(v.nullable(text)),
      lowestPriceCents: v.nullable(amount),
      variantCount: amount,
    }),
  ),
});
const collection = v.object({
  id,
  handle: text,
  title: text,
  description: text,
  imageKey: v.nullable(text),
  imageAlt: text,
  isPublished: v.boolean(),
  revision: amount,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const translation = v.object({
  id,
  collectionId: id,
  locale: text,
  title: text,
  description: text,
});
const dates = v.array(
  v.object({
    date: text,
    slots: v.array(v.object({ date: text, startTime: text, endTime: text })),
  }),
);
const schedule = v.record(text, v.array(v.tuple([text, text])));
const quote = v.object({
  id,
  cartId: id,
  cartRevision: amount,
  termsSnapshot: terms,
  merchandiseSubtotalCents: amount,
  shippingCents: amount,
  exclusiveTaxCents: amount,
  inclusiveTaxCents: amount,
  totalPayableCents: amount,
  discountCents: amount,
  // Opaque persisted snapshots are not rendered directly by customer pages.
  itemsSnapshot: v.array(v.unknown()),
  shippingSnapshot: v.record(text, v.unknown()),
  expiresAt: timestamp,
  createdAt: timestamp,
});

/** Unknown additive fields are discarded; consumed fields are never coerced. */
export const customerPageSchemas = {
  layout: v.object({
    store,
    session: v.nullable(
      v.object({ user: v.object({ ...user, emailVerified: v.boolean() }) }),
    ),
  }),
  catalog: v.object({
    store,
    result: catalog,
    facets: v.array(
      v.object({ attribute: text, name: text, value: text, label: text }),
    ),
    collections: v.array(collection),
    collectionTitles: v.array(translation),
    groups: v.array(
      v.object({
        id,
        slug: text,
        name: text,
        parentId: v.nullable(text),
        sortOrder: integer,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ),
  }),
  product: v.object({
    store,
    purchasable: v.object({
      id,
      handle: text,
      title: text,
      description: text,
      isPublished: v.boolean(),
      quoteVersion: amount,
      variants: v.array(
        v.object({
          id,
          sku: text,
          title: text,
          priceCents: amount,
          sortOrder: integer,
          isAvailable: v.boolean(),
          localizedAttributes: v.array(
            v.object({ code: text, name: text, valueCode: text, label: text }),
          ),
        }),
      ),
      images: v.array(
        v.object({
          id,
          variantId: v.nullable(text),
          s3Key: text,
          altText: text,
          sortOrder: integer,
        }),
      ),
      categories: v.array(v.object({ id, slug: text, name: text })),
    }),
    availableQuantities: v.record(text, amount),
    specs: v.array(
      v.object({ valueId: id, name: text, label: text, sortOrder: integer }),
    ),
  }),
  cart: v.object({ store, cart }),
  checkout: v.object({
    store,
    cart,
    shippingRules: v.array(
      v.object({
        countryCodes: v.nullable(strings),
        regionCodes: strings,
        postalPrefixes: strings,
      }),
    ),
    accounts: v.array(v.object({ id, name: text })),
    locations: v.array(
      v.object({
        id,
        name: text,
        address: text,
        dates,
        weeklySchedule: schedule,
        blackoutDates: strings,
        prepMinutes: amount,
        slotCapacity: v.nullable(amount),
        scheduleRequired: v.boolean(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ),
    delivery: v.array(
      v.object({
        id,
        name: text,
        countryCodes: strings,
        postalPrefixes: strings,
        rateCents: amount,
        freeThresholdCents: v.nullable(amount),
        isActive: v.boolean(),
        weeklySchedule: schedule,
        prepMinutes: amount,
        scheduleRequired: v.boolean(),
        slotCapacity: v.nullable(amount),
        dates,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ),
    methods: v.array(fulfillment),
    savedQuote: v.exactOptional(quote),
    quote: v.exactOptional(quote),
    initial: v.exactOptional(terms),
    customer: account,
    onlinePayment: v.boolean(),
  }),
  account: v.object({
    session: v.nullable(v.object({ user: v.object(user) })),
    account,
    page: positive,
    reference: text,
    creditPage: positive,
    hasUnverifiedSession: v.boolean(),
  }),
  order: v.object({
    store,
    result: v.object({
      order: v.object({
        referenceCode: text,
        lifecycleStatus: lifecycle,
        purchaseTotalCents: amount,
        creditAppliedCents: amount,
        termsSnapshot: terms,
        isClaimed: v.boolean(),
      }),
      items: v.array(
        v.object({
          id,
          variantId: id,
          quantity: positive,
          unitPriceCents: amount,
          catalogSnapshot: v.object({ title: text }),
        }),
      ),
      proposal: v.nullable(
        v.object({ id, reason: text, proposedTotalCents: amount }),
      ),
      fulfillment: v.nullable(
        v.object({
          status: v.picklist([
            "unfulfilled",
            "preparing",
            "ready_for_pickup",
            "shipped",
            "fulfilled",
          ]),
        }),
      ),
      receivedCents: amount,
      goodsReturns: v.array(
        v.object({
          id,
          status: v.picklist([
            "cancelled",
            "rejected",
            "requested",
            "approved",
            "received",
          ]),
          reason: text,
          reviewReason: v.nullable(text),
        }),
      ),
      returnItems: v.array(
        v.object({ returnId: id, orderItemId: id, quantity: positive }),
      ),
      evidence: v.array(v.object({ id })),
      refunds: v.array(
        v.object({
          id,
          amountCents: amount,
          reason: text,
          settledCents: amount,
        }),
      ),
    }),
    paymentAttempt: v.exactOptional(
      v.object({
        status: v.picklist(["open", "review", "expired", "creating", "paid"]),
      }),
    ),
    onlinePayment: v.boolean(),
  }),
  collection: v.object({
    store,
    collection,
    translated: v.exactOptional(translation),
    result: catalog,
  }),
} satisfies {
  [K in keyof CustomerPageModels]: v.GenericSchema<
    unknown,
    CustomerPageModels[K]
  >;
};

/** Return only a validated response. Never expose validation issues or payloads. */
export function parseCustomerPage<K extends keyof CustomerPageModels>(
  page: K,
  value: unknown,
): CustomerPageModels[K] {
  const result = v.safeParse(customerPageSchemas[page], value);
  if (!result.success) throw new Error("Invalid customer page response.");
  // The selected key determines the schema; TS otherwise widens this to all pages.
  return result.output as CustomerPageModels[K];
}
