import { describe, expect, it } from "vitest";
import { shippingPrice } from "@/domain/checkout";
import {
  countryOptions,
  shippingRequiredFields,
  validShippingRegion,
} from "@/domain/shipping-destination";

const fallback = {
  countryCodes: ["US"],
  rateCents: 2000,
  freeThresholdCents: null,
};
const west = { ...fallback, regionCodes: ["CA", "OR", "WA"], rateCents: 800 };
const east = { ...fallback, regionCodes: ["NY", "MA"], rateCents: 1500 };
const postal = {
  ...fallback,
  regionCodes: ["CA"],
  postalPrefixes: ["941"],
  rateCents: 500,
};
describe("regional shipping", () => {
  it("uses the same region policy for setup and checkout", () => {
    expect(validShippingRegion("US", "CA")).toBe(true);
    expect(validShippingRegion("US", "ZZ")).toBe(false);
    expect(validShippingRegion("US", "CALIFORNIA")).toBe(false);
    expect(validShippingRegion("CA", "BC")).toBe(true);
  });
  it("prices West Coast, East Coast and other states independently", () => {
    expect(
      shippingPrice([fallback, west, east], "US", 100, { region: "ca" }),
    ).toBe(800);
    expect(
      shippingPrice([fallback, west, east], "US", 100, { region: "NY" }),
    ).toBe(1500);
    expect(
      shippingPrice([fallback, west, east], "US", 100, { region: "TX" }),
    ).toBe(2000);
  });
  it("prioritizes postal rules and requires both constraints to match", () => {
    expect(
      shippingPrice([fallback, west, postal], "US", 100, {
        region: "CA",
        postalCode: "94105-1234",
      }),
    ).toBe(500);
    expect(
      shippingPrice([fallback, west, postal], "US", 100, {
        region: "OR",
        postalCode: "94105",
      }),
    ).toBe(800);
  });
  it("requires destination fields so omitting them cannot select a cheaper fallback", () => {
    expect(() => shippingPrice([fallback, west], "US", 100)).toThrow(
      "state or region",
    );
    expect(() =>
      shippingPrice([fallback, postal], "US", 100, { region: "CA" }),
    ).toThrow("postal code");
    expect(() =>
      shippingPrice([fallback], "US", 100, { region: "California" }),
    ).toThrow("valid state");
    expect(() =>
      shippingPrice([fallback], "US", 100, { postalCode: "???" }),
    ).toThrow("valid ZIP");
  });
  it("retains existing country and catch-all rates and selected zone thresholds", () => {
    expect(shippingPrice([fallback], "US", 100)).toBe(2000);
    expect(
      shippingPrice([{ ...fallback, countryCodes: null }], "CA", 100),
    ).toBe(2000);
    expect(
      shippingPrice(
        [{ ...west, freeThresholdCents: 10000 }, fallback],
        "US",
        10000,
        { region: "WA" },
      ),
    ).toBe(0);
    expect(() => shippingPrice([west], "US", 100, { region: "NY" })).toThrow(
      "destination",
    );
  });
  it("keeps configured order for equally specific rules without mutating zones", () => {
    const zones = [west, { ...west, rateCents: 900 }, fallback];
    expect(shippingPrice(zones, "US", 100, { region: "WA" })).toBe(800);
    expect(zones[0]).toBe(west);
  });
  it("normalizes Canadian postal codes and isolates countries", () => {
    const canada = {
      ...fallback,
      countryCodes: ["CA"],
      postalPrefixes: ["V6B"],
      rateCents: 1200,
    };
    expect(
      shippingPrice([canada, fallback], "CA", 100, { postalCode: "v6b 1a1" }),
    ).toBe(1200);
    expect(shippingPrice([canada, fallback], "US", 100)).toBe(2000);
  });
  it("shows country names while submitting codes and requires only applicable fields", () => {
    expect(countryOptions("en").find((c) => c.code === "US")?.name).toBe(
      "United States",
    );
    expect(countryOptions("zh").find((c) => c.code === "US")?.name).toBe(
      "美国",
    );
    const rules = [{ ...west, postalPrefixes: [] }];
    expect(shippingRequiredFields(rules, "US")).toEqual({
      region: true,
      postalCode: false,
    });
    expect(shippingRequiredFields(rules, "CA")).toEqual({
      region: false,
      postalCode: false,
    });
  });
});
