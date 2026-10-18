import { describe, expect, it } from "vitest";
import {
  commerceRules,
  evaluateCommerce,
  shoppingContext,
} from "@/domain/commerce-evaluation";

const variant = "10000000-0000-4000-8000-000000000001";
const location = "10000000-0000-4000-8000-000000000002";
const item = {
  variantId: variant,
  unitPriceCents: 1000,
  quantity: 2,
  isAvailable: true,
  availableQuantity: null,
};
const now = new Date("2026-10-17T12:00:00Z");
function rules(input: unknown[]) {
  return commerceRules(input);
}
function rule(
  kind: string,
  value: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    name: "Example rule",
    kind,
    value,
    priority: 10,
    conditions: {},
    ...extra,
  };
}
function evaluate(input: Partial<Parameters<typeof evaluateCommerce>[0]> = {}) {
  return evaluateCommerce({
    rules: [],
    context: shoppingContext({
      fulfillmentType: "shipping",
      country: "US",
      region: "CA",
    }),
    items: [item],
    rewardRateBasisPoints: 500,
    rewardsEnabled: true,
    now,
    ...input,
  });
}
describe("contextual commerce evaluation", () => {
  it("ignores disabled promotion restrictions and waits for fulfillment before applying destination rules", () => {
    expect(
      evaluate({
        promotionCode: "SAVE",
        rules: rules([
          rule("promotion", 0, { enabled: false, promotionCode: "SAVE" }),
        ]),
      }).promotion.eligible,
    ).toBe(true);
    expect(
      evaluate({
        context: shoppingContext({ country: "US", region: "CA" }),
        rules: rules([
          rule("price", 1200, {
            variantIds: [variant],
            conditions: { countries: ["US"], regions: ["CA"] },
          }),
        ]),
      }).items[0]?.pending,
    ).toBe(true);
  });
  it("preserves base prices and stock without configured rules and never reserves", () => {
    const result = evaluate();
    expect(result.items[0]).toMatchObject({
      unitPriceCents: 1000,
      available: true,
      pending: false,
    });
    expect(result.reward.rateBasisPoints).toBe(500);
    expect(item.availableQuantity).toBeNull();
  });
  it("selects explicit price priority while sharing the same variant identity", () => {
    const result = evaluate({
      rules: rules([
        rule("price", 1200, {
          priority: 20,
          variantIds: [variant],
          conditions: { fulfillmentMethods: ["shipping"] },
        }),
        rule("price", 1100, {
          priority: 10,
          variantIds: [variant],
          conditions: { countries: ["US"], regions: ["CA"] },
        }),
      ]),
    });
    expect(result.items[0]).toMatchObject({
      variantId: variant,
      unitPriceCents: 1100,
    });
    expect(result.merchandiseSubtotalCents).toBe(2200);
  });
  it("keeps a zero override and an explicit exclusion distinct from fallback", () => {
    const result = evaluate({
      rules: rules([
        rule("price", 0, { variantIds: [variant] }),
        rule("availability", 0, { variantIds: [variant] }),
        rule("reward", 0),
      ]),
    });
    expect(result.items[0]).toMatchObject({
      unitPriceCents: 0,
      available: false,
      reason: "NOT_OFFERED",
    });
    expect(result.reward.rateBasisPoints).toBe(0);
  });
  it("cannot make unpublished or out-of-stock items purchasable", () => {
    const configured = rules([rule("availability", 1)]);
    expect(
      evaluate({ rules: configured, items: [{ ...item, isAvailable: false }] })
        .items[0]?.available,
    ).toBe(false);
    expect(
      evaluate({
        rules: configured,
        items: [{ ...item, availableQuantity: 1 }],
      }).items[0]?.reason,
    ).toBe("INSUFFICIENT_STOCK");
  });
  it("marks incomplete price or availability context pending instead of showing a final price", () => {
    const result = evaluate({
      context: shoppingContext({ fulfillmentType: "shipping", country: "US" }),
      rules: rules([
        rule("price", 1300, {
          variantIds: [variant],
          conditions: { countries: ["US"], regions: ["CA"] },
        }),
      ]),
    });
    expect(result.items[0]).toMatchObject({
      pending: true,
      unitPriceCents: null,
      available: false,
      reason: "CONTEXT_REQUIRED",
    });
    expect(result.merchandiseSubtotalCents).toBeNull();
  });
  it("ignores missing fields on rules that already mismatch the selected method", () => {
    const result = evaluate({
      context: shoppingContext({
        fulfillmentType: "pickup",
        pickupLocationId: location,
      }),
      rules: rules([
        rule("price", 1300, {
          variantIds: [variant],
          conditions: {
            fulfillmentMethods: ["shipping"],
            countries: ["US"],
            regions: ["CA"],
          },
        }),
      ]),
    });
    expect(result.items[0]?.pending).toBe(false);
  });
  it("matches pickup rewards by location and shipping rewards by normalized destination", () => {
    const configured = rules([
      rule("reward", 500, {
        conditions: {
          fulfillmentMethods: ["pickup"],
          pickupLocationIds: [location],
        },
      }),
      rule("reward", 100, {
        priority: 20,
        conditions: {
          fulfillmentMethods: ["shipping"],
          countries: ["US"],
          regions: ["CA"],
        },
      }),
    ]);
    expect(
      evaluate({
        rules: configured,
        context: shoppingContext({
          fulfillmentType: "pickup",
          pickupLocationId: location,
        }),
        rewardRateBasisPoints: 0,
      }).reward.rateBasisPoints,
    ).toBe(500);
    expect(
      evaluate({
        rules: configured,
        context: shoppingContext({
          fulfillmentType: "shipping",
          country: " us ",
          region: " ca ",
        }),
      }).reward.rateBasisPoints,
    ).toBe(100);
    expect(
      evaluate({ rules: configured, rewardsEnabled: false }).reward
        .rateBasisPoints,
    ).toBe(0);
  });
  it("uses inclusive starts and exclusive ends and a supplied evaluation clock", () => {
    const configured = rules([
      rule("reward", 100, {
        conditions: {
          startsAt: now.toISOString(),
          endsAt: "2026-10-18T00:00:00Z",
        },
      }),
    ]);
    expect(evaluate({ rules: configured }).reward.rateBasisPoints).toBe(100);
    expect(
      evaluate({ rules: configured, now: new Date("2026-10-18T00:00:00Z") })
        .reward.rateBasisPoints,
    ).toBe(500);
  });
  it("selects contextual free shipping and promotion eligibility without changing ledger balances", () => {
    const configured = rules([
      rule("free_shipping", 15000, {
        conditions: { countries: ["US"], regions: ["CA"] },
      }),
      rule("promotion", 0, {
        promotionCode: "LOCAL",
        conditions: { fulfillmentMethods: ["pickup"] },
      }),
    ]);
    const result = evaluate({ rules: configured, promotionCode: "LOCAL" });
    expect(result.shipping).toMatchObject({
      freeThresholdCents: 15000,
      remainingCents: 13000,
    });
    expect(result.promotion).toMatchObject({
      eligible: false,
      reason: "PROMOTION_INELIGIBLE",
    });
    expect(
      evaluate({ promotionCode: "OTHER", rules: configured }).promotion
        .eligible,
    ).toBe(true);
  });
  it("rejects ambiguous priority, malformed conditions, missing price targets and overflow", () => {
    expect(() => rules([rule("reward", 500), rule("reward", 100)])).toThrow();
    expect(() => rules([rule("price", 1000)])).toThrow();
    expect(() => rules([rule("reward", 10001)])).toThrow();
    expect(() =>
      rules([
        rule("reward", 500, {
          conditions: { countries: ["US"], regions: ["ZZ"] },
        }),
      ]),
    ).toThrow();
    expect(() =>
      rules([rule("reward", 500, { conditions: { startsAt: "invalid" } })]),
    ).toThrow();
    expect(() =>
      rules([
        rule("reward", 500, {
          conditions: {
            countries: ["US"],
            regions: ["CA"],
            pickupLocationIds: [location],
          },
        }),
      ]),
    ).toThrow();
    expect(() =>
      evaluate({ items: [{ ...item, unitPriceCents: 2147483647 }] }),
    ).toThrow();
    expect(() =>
      shoppingContext({
        fulfillmentType: "shipping",
        country: "US",
        region: "ZZ",
      }),
    ).toThrow();
  });
});
