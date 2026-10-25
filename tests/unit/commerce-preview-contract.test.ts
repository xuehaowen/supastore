import { expect, it } from "vitest";
import {
  parseCommercePreviewRequest,
  parseCommercePreview,
} from "@supastore/contracts";
it("accepts the per-item quantity boundary and rejects an overflow", () => {
  const variantId = crypto.randomUUID();
  expect(
    parseCommercePreviewRequest({
      items: [{ variantId, quantity: 999 }],
    }).items[0]?.quantity,
  ).toBe(999);
  expect(() =>
    parseCommercePreviewRequest({
      items: [{ variantId, quantity: 1000 }],
    }),
  ).toThrow();
});
it("bounds preview input and strips caller-selected prices, rewards and identity", () => {
  const input = {
    items: [{ variantId: crypto.randomUUID(), quantity: 1, unitPriceCents: 0 }],
    context: {
      fulfillmentType: "shipping",
      country: "US",
      rewardRateBasisPoints: 10000,
      customerId: "another",
    },
    creditAppliedCents: 5000,
  };
  const parsed = parseCommercePreviewRequest(input);
  expect(parsed.items[0]).not.toHaveProperty("unitPriceCents");
  expect(parsed.context).not.toHaveProperty("customerId");
  expect(parsed.context).not.toHaveProperty("rewardRateBasisPoints");
  expect(() =>
    parseCommercePreviewRequest({
      ...input,
      items: Array.from({ length: 101 }, () => input.items[0]),
    }),
  ).toThrow();
  expect(() =>
    parseCommercePreviewRequest({
      ...input,
      items: [{ variantId: "invalid", quantity: -1 }],
    }),
  ).toThrow();
  expect(() =>
    parseCommercePreview({ currency: "USD", evaluation: { items: [] } }),
  ).toThrow();
});
