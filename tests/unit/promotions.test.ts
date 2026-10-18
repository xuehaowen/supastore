import { describe, expect, it } from "vitest";
import {
  calculateDiscountCents,
  giveawayLimitsConfigured,
  promotionLimitIssue,
} from "@/domain/promotions";

describe("promotion calculation", () => {
  const bounded = {
    discountType: "percentage" as const,
    discountValue: 10000,
    maximumOriginalSubtotalCents: 1000,
    maximumQuantity: 2,
    usageLimit: 10,
    endsAt: new Date("2099-01-01T00:00:00Z"),
  };
  it("requires all giveaway safeguards but leaves ordinary promotions optional", () => {
    expect(giveawayLimitsConfigured(bounded)).toBe(true);
    for (const key of [
      "maximumOriginalSubtotalCents",
      "maximumQuantity",
      "usageLimit",
      "endsAt",
    ] as const)
      expect(giveawayLimitsConfigured({ ...bounded, [key]: null })).toBe(false);
    expect(
      giveawayLimitsConfigured({ ...bounded, endsAt: new Date("invalid") }),
    ).toBe(false);
    expect(
      giveawayLimitsConfigured({ discountType: "fixed", discountValue: 1000 }),
    ).toBe(true);
    expect(
      giveawayLimitsConfigured({
        discountType: "percentage",
        discountValue: 1000,
      }),
    ).toBe(true);
    expect(
      promotionLimitIssue({ ...bounded, usageLimit: null }, 1000, 1),
    ).toMatch(/Giveaway/);
  });
  it("accepts exact basket bounds and rejects excessive original value or units", () => {
    expect(promotionLimitIssue(bounded, 1000, 2)).toBeNull();
    expect(promotionLimitIssue(bounded, 1001, 1)).toMatch(
      /maximum qualifying value/,
    );
    expect(promotionLimitIssue(bounded, 1000, 3)).toMatch(/maximum quantity/);
    expect(
      promotionLimitIssue(
        { discountType: "fixed", discountValue: 100 },
        10000,
        99,
      ),
    ).toBeNull();
  });
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
