import { describe, expect, it } from "vitest";
import { parseCustomerPage } from "@supastore/contracts";

const timestamp = "2026-10-16T12:00:00.000Z";
const store = {
  storeName: "Fixture bakery",
  logoKey: null,
  supportEmail: "support@example.test",
  publicContent: { en: { about: "A test store" } },
  currency: "USD",
  precision: 2,
  defaultLocale: "en",
  timezone: "UTC",
  isPaused: false,
  pauseMessage: "",
  isOrderingEnabled: true,
  commercePolicy: {
    guestCheckout: true,
    rewardsEnabled: false,
    rewardRateBasisPoints: 0,
    rewardEligibleCategoryIds: [],
    rewardsStartAt: null,
    rewardsEndAt: null,
    shippingEnabled: true,
    pickupEnabled: true,
    deliveryEnabled: false,
    salesThresholdCents: null,
    fiscalYearStartMonth: 1,
  },
};
const terms = {
  rewardProgramActive: false,
  settingsVersion: 1,
  currency: "USD",
  precision: 2,
  fulfillmentType: "shipping",
  shippingAddress: { country: "US", address: "Synthetic address" },
  pickup: null,
  delivery: null,
  payment: { id: "bank", name: "Bank", instructions: "Fixture only" },
  onlinePayment: false,
  promotion: null,
  input: {
    fulfillmentType: "shipping",
    shippingAddress: { country: "US", address: "Synthetic address" },
    pickupDate: "",
    pickupLocationId: "",
    pickupTime: "",
    paymentAccountId: "bank",
    promotionCode: "",
    deliveryAreaId: "",
  },
};
const catalog = { page: 1, pageSize: 24, total: 0, items: [] };
const collection = {
  id: "collection",
  handle: "bread",
  title: "Bread",
  description: "",
  imageKey: null,
  imageAlt: "",
  isPublished: true,
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const pages = {
  layout: { store, session: null },
  catalog: {
    store,
    result: catalog,
    facets: [],
    collections: [collection],
    collectionTitles: [],
    groups: [],
  },
  product: {
    store,
    purchasable: {
      id: "product",
      handle: "bread",
      title: "Bread",
      description: "",
      isPublished: true,
      quoteVersion: 1,
      variants: [
        {
          id: "variant",
          sku: "BREAD",
          title: "Loaf",
          priceCents: 500,
          isAvailable: true,
          sortOrder: 0,
          localizedAttributes: [],
        },
      ],
      images: [],
      categories: [],
    },
    availableQuantities: { variant: 1 },
    specs: [],
  },
  cart: { store, cart: null },
  checkout: {
    store,
    cart: null,
    shippingRules: [],
    accounts: [],
    locations: [],
    delivery: [],
    methods: ["shipping"],
    customer: null,
    onlinePayment: false,
  },
  account: {
    session: null,
    account: null,
    page: 1,
    reference: "",
    creditPage: 1,
    hasUnverifiedSession: false,
  },
  order: {
    store,
    result: {
      order: {
        referenceCode: "SP-TEST",
        lifecycleStatus: "unpaid",
        purchaseTotalCents: 500,
        creditAppliedCents: 0,
        termsSnapshot: terms,
        isClaimed: false,
      },
      items: [],
      proposal: null,
      fulfillment: null,
      receivedCents: 0,
      goodsReturns: [],
      returnItems: [],
      evidence: [],
      refunds: [],
    },
    onlinePayment: false,
  },
  collection: { store, collection, result: catalog },
};

describe("customer page HTTP contracts", () => {
  it.each(Object.keys(pages) as (keyof typeof pages)[])(
    "accepts a JSON round trip for %s, including omitted optional fields",
    (page) => {
      const value = JSON.parse(JSON.stringify(pages[page]));
      expect(parseCustomerPage(page, value)).toEqual(value);
    },
  );

  it("accepts additive fields without exposing them to consumers", () => {
    expect(
      parseCustomerPage("cart", {
        ...pages.cart,
        futureField: { version: 2 },
        store: { ...store, futureBranding: "new" },
      }),
    ).toEqual(pages.cart);
  });

  it.each([null, [], {}, { cart: "another-cart" }])(
    "rejects malformed cart envelopes without echoing their content",
    (value) => {
      expect(() => parseCustomerPage("cart", value)).toThrow(
        "Invalid customer page response.",
      );
    },
  );

  it.each(["500", -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid nested product prices %s",
    (priceCents) => {
      const product = structuredClone(pages.product);
      Object.assign(product.purchasable.variants[0]!, { priceCents });
      expect(() => parseCustomerPage("product", product)).toThrow();
    },
  );

  it("rejects malformed nested arrays, status and consumed order terms", () => {
    expect(() =>
      parseCustomerPage("catalog", {
        ...pages.catalog,
        groups: [{ name: "Missing category fields" }],
      }),
    ).toThrow();
    const order = structuredClone(pages.order);
    order.result.order.lifecycleStatus = "invented-status";
    expect(() => parseCustomerPage("order", order)).toThrow();
    order.result.order.lifecycleStatus = "unpaid";
    Object.assign(order.result.order.termsSnapshot, { precision: 99 });
    expect(() => parseCustomerPage("order", order)).toThrow();
  });

  it("accepts signed credit entries but rejects impossible balances and dates", () => {
    const account = {
      customer: {
        name: "Customer",
        email: "customer@example.test",
        phone: null,
      },
      addresses: [],
      orders: [],
      hasNext: false,
      credit: {
        account: {
          currency: "USD",
          precision: 2,
          balanceCents: 500,
          reservedCents: 0,
        },
        entries: [
          {
            id: "entry",
            amountCents: -100,
            reason: "Purchase",
            createdAt: timestamp,
          },
        ],
        reconciled: true,
        hasNext: false,
      },
    };
    expect(
      parseCustomerPage("account", { ...pages.account, account }).account,
    ).toEqual(account);
    account.credit.account.balanceCents = -1;
    expect(() =>
      parseCustomerPage("account", { ...pages.account, account }),
    ).toThrow();
    account.credit.account.balanceCents = 500;
    account.credit.entries[0]!.createdAt = "not-a-date";
    expect(() =>
      parseCustomerPage("account", { ...pages.account, account }),
    ).toThrow();
  });

  it("supports a store that has not been bootstrapped yet", () => {
    expect(parseCustomerPage("layout", { session: null })).toEqual({
      session: null,
    });
  });
});
