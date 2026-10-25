import { describe, expect, it } from "vitest";
import {
  parseCustomerPage,
  quoteItemsSnapshotSchema,
} from "@supastore/contracts/customer-page-validation";
import { parse } from "valibot";

import { pages, store, timestamp } from "../fixtures/customer-pages";

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

it("validates the quoted item fields rendered in checkout without exposing pricing internals", () => {
  const item = {
    variantId: "shirt-m",
    title: "Everyday shirt — Natural / M",
    quantity: 2,
    unitPriceCents: 3200,
  };
  expect(
    parse(quoteItemsSnapshotSchema, [{ ...item, taxRateBasisPoints: 1000 }]),
  ).toEqual([item]);
  for (const invalid of [
    { ...item, title: null },
    { ...item, quantity: "2" },
    { ...item, unitPriceCents: -1 },
  ]) {
    expect(() => parse(quoteItemsSnapshotSchema, [invalid])).toThrow();
  }
});
