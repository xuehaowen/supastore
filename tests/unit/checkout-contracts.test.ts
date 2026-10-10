import { describe, expect, it } from "vitest";
import { parseQuoteDto, parseCreatedOrderDto } from "../../packages/contracts/src";

describe("checkout response contracts", () => {
  const quote = {
    id: "quote-1", cartId: "cart-1", expiresAt: "2026-10-10T12:00:00.000Z",
    merchandiseSubtotalCents: 1000, shippingCents: 100,
    exclusiveTaxCents: 50, inclusiveTaxCents: 0, discountCents: 0,
    totalPayableCents: 1150, items: [],
  };
  it("accepts a serialized quote", () => {
    expect(parseQuoteDto(quote)).toEqual(quote);
  });
  it.each([null, {}, { ...quote, totalPayableCents: "1150" },
    { ...quote, shippingCents: -1 }, { ...quote, expiresAt: "invalid" },
    { ...quote, totalPayableCents: Number.MAX_SAFE_INTEGER + 1 }])(
    "rejects malformed quote data", (value) => {
      expect(() => parseQuoteDto(value)).toThrow("Invalid checkout response");
    },
  );
  it("requires a valid order before navigation", () => {
    const order = { id: "order-1", referenceCode: "REF", lifecycleStatus: "unpaid", purchaseTotalCents: 1150 };
    expect(parseCreatedOrderDto(order)).toEqual(order);
    expect(() => parseCreatedOrderDto({ ...order, id: null })).toThrow();
    expect(() => parseCreatedOrderDto({ ...order, lifecycleStatus: "unknown" })).toThrow();
  });
});

