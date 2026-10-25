import { describe, expect, it } from "vitest";
import { availableFulfillment } from "@supastore/shipping/destination";
const configured = { shipping: 1, pickup: 1, delivery: 1 };
describe("customer fulfillment choices", () => {
  it.each([
    [
      { shippingEnabled: false, pickupEnabled: true, deliveryEnabled: false },
      ["pickup"],
    ],
    [
      { shippingEnabled: true, pickupEnabled: false, deliveryEnabled: false },
      ["shipping"],
    ],
    [
      { shippingEnabled: false, pickupEnabled: false, deliveryEnabled: true },
      ["local_delivery"],
    ],
    [
      { shippingEnabled: false, pickupEnabled: false, deliveryEnabled: false },
      [],
    ],
  ] as const)("respects configured policies %j", (policy, expected) => {
    expect(availableFulfillment(policy, configured)).toEqual(expected);
  });
  it("does not offer enabled but unconfigured services", () => {
    expect(
      availableFulfillment(
        { shippingEnabled: true, pickupEnabled: true, deliveryEnabled: true },
        { shipping: 0, pickup: 0, delivery: 0 },
      ),
    ).toEqual([]);
  });
  it("uses the store's default policy for legacy responses", () => {
    expect(availableFulfillment(undefined, configured)).toEqual([
      "shipping",
      "pickup",
    ]);
  });
});
