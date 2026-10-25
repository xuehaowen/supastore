import { expect, it } from "vitest";
import { canPlaceQuotedOrder } from "./checkout-payment";
it("uses the evaluated total and available funding rather than catalog prices", () => {
  expect(
    canPlaceQuotedOrder({
      totalPayableCents: 0,
      hasPayment: false,
      onlinePayment: false,
      availableCreditCents: 0,
    }),
  ).toBe(true);
  expect(
    canPlaceQuotedOrder({
      totalPayableCents: 1000,
      hasPayment: false,
      onlinePayment: false,
      availableCreditCents: 0,
    }),
  ).toBe(false);
  expect(
    canPlaceQuotedOrder({
      totalPayableCents: 1000,
      hasPayment: false,
      onlinePayment: false,
      availableCreditCents: 999,
    }),
  ).toBe(false);
  expect(
    canPlaceQuotedOrder({
      totalPayableCents: 10000,
      hasPayment: false,
      onlinePayment: false,
      availableCreditCents: 10000,
    }),
  ).toBe(true);
  expect(
    canPlaceQuotedOrder({
      totalPayableCents: 1000,
      hasPayment: true,
      onlinePayment: false,
      availableCreditCents: 0,
    }),
  ).toBe(true);
  expect(
    canPlaceQuotedOrder({
      totalPayableCents: 1000,
      hasPayment: false,
      onlinePayment: true,
      availableCreditCents: 0,
    }),
  ).toBe(true);
});
