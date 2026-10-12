import { describe, expect, it } from "vitest";
import { calculateDiscountCents } from "@/domain/promotions";

describe("promotion calculation", () => {
  it("calculates percentage discounts with exact half-up rounding", () => {
    expect(calculateDiscountCents("percentage", 1500, 999)).toBe(150);
  });
  it("caps discounts at the merchandise subtotal", () => {
    expect(calculateDiscountCents("fixed", 5000, 1200)).toBe(1200);
    expect(calculateDiscountCents("percentage", 10000, 1200)).toBe(1200);
  });
  it("rejects invalid amounts", () => {
    expect(() => calculateDiscountCents("percentage", 10001, 1000)).toThrow(
      "100%",
    );
    expect(() => calculateDiscountCents("fixed", 0, 1000)).toThrow("positive");
  });
});
