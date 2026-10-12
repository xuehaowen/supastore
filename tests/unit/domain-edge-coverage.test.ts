import { describe, expect, it } from "vitest";
import { shippingPrice } from "@/domain/checkout";
import { validateEvidence } from "@/domain/evidence";
import { areDestinationsEqual } from "@/domain/financial-projection/discrepancies";
import {
  assertNonNegativeCents,
  assertValidQuantity,
  calculatePurchaseTotal,
  roundHalfUp,
} from "@/domain/money/calculations";
import {
  computeCrockfordChecksum,
  validateOrderReferenceCode,
} from "@/domain/money/reference-code";

describe("domain validation edge cases", () => {
  it("covers shipping zone precedence and free-threshold boundaries", () => {
    expect(
      shippingPrice(
        [
          { countryCodes: ["US"], rateCents: 500, freeThresholdCents: 1000 },
          { countryCodes: null, rateCents: 900, freeThresholdCents: null },
        ],
        "US",
        1000,
      ),
    ).toBe(0);
    expect(
      shippingPrice(
        [{ countryCodes: null, rateCents: 900, freeThresholdCents: null }],
        "CA",
        1,
      ),
    ).toBe(900);
  });

  it("accepts JPEG and WebP signatures and rejects unknown bytes", () => {
    expect(
      validateEvidence(
        Uint8Array.from([255, 216, 255]),
        3,
        3,
        "image/jpeg",
        "image/jpeg",
      ),
    ).toBe("image/jpeg");
    const webp = new Uint8Array(12);
    webp.set([82, 73, 70, 70], 0);
    webp.set([87, 69, 66, 80], 8);
    expect(validateEvidence(webp, 12, 12, "image/webp", "image/webp")).toBe(
      "image/webp",
    );
    expect(() =>
      validateEvidence(
        Uint8Array.from([1, 2, 3]),
        3,
        3,
        "image/png",
        "image/png",
      ),
    ).toThrow();
  });

  it("compares destinations across type, hash, raw, and incomplete values", () => {
    expect(areDestinationsEqual({ type: "cash" }, { type: "card" })).toBe(
      false,
    );
    expect(
      areDestinationsEqual(
        { type: "bank_account", accountNumberHash: "a" },
        { type: "bank_account", accountNumberHash: "b" },
      ),
    ).toBe(false);
    expect(
      areDestinationsEqual(
        { type: "card", rawDestination: "a" },
        { type: "card", rawDestination: "b" },
      ),
    ).toBe(false);
    expect(areDestinationsEqual({ type: "cash" }, { type: "cash" })).toBe(true);
  });

  it("covers arithmetic validation, signed rounding, and tax branches", () => {
    expect(roundHalfUp(-5n, 2n)).toBe(-3);
    expect(roundHalfUp(5n, -2n)).toBe(-3);
    expect(() => roundHalfUp(1n, 0n)).toThrow();
    expect(() => assertValidQuantity(0)).toThrow();
    expect(() => assertValidQuantity(10_001)).toThrow();
    expect(() => assertNonNegativeCents(-1)).toThrow();
    expect(
      calculatePurchaseTotal(
        [{ unitPriceCents: 1000, quantity: 1, taxRateBasisPoints: 0 }],
        { amountCents: 500, taxRateBasisPoints: 2000, isTaxInclusive: true },
      ).shipping.taxCents,
    ).toBe(83);
  });

  it("rejects malformed reference codes and ignores unsupported checksum input", () => {
    expect(() => computeCrockfordChecksum("I-O-U")).toThrow();
    expect(validateOrderReferenceCode("", "SP")).toBe(false);
    expect(validateOrderReferenceCode("XX-1234-5678K", "SP")).toBe(false);
    expect(validateOrderReferenceCode("SP-123-5678K", "SP")).toBe(false);
    expect(validateOrderReferenceCode("SP-1234-5678!", "SP")).toBe(false);
  });
});
