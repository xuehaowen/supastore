import { roundHalfUp } from "@/domain/money/calculations";

type CampaignLimits = {
  discountType: "percentage" | "fixed";
  discountValue: number;
  maximumOriginalSubtotalCents?: number | null | undefined;
  maximumQuantity?: number | null | undefined;
  usageLimit?: number | null | undefined;
  endsAt?: Date | null | undefined;
};
export function giveawayLimitsConfigured(promotion: CampaignLimits) {
  return (
    promotion.discountType !== "percentage" ||
    promotion.discountValue !== 10000 ||
    Boolean(
      promotion.maximumOriginalSubtotalCents &&
      promotion.maximumOriginalSubtotalCents > 0 &&
      promotion.maximumQuantity &&
      promotion.maximumQuantity > 0 &&
      promotion.usageLimit &&
      promotion.usageLimit > 0 &&
      promotion.endsAt &&
      Number.isFinite(promotion.endsAt.getTime()),
    )
  );
}
export function promotionLimitIssue(
  promotion: CampaignLimits,
  originalSubtotalCents: number,
  quantity: number,
) {
  if (!giveawayLimitsConfigured(promotion))
    return "Giveaway campaigns require value and quantity limits, an expiry and a total usage limit.";
  if (
    promotion.maximumOriginalSubtotalCents != null &&
    originalSubtotalCents > promotion.maximumOriginalSubtotalCents
  )
    return "This basket exceeds the promotion's maximum qualifying value.";
  if (promotion.maximumQuantity != null && quantity > promotion.maximumQuantity)
    return "This basket exceeds the promotion's maximum quantity.";
  return null;
}

export function calculateDiscountCents(
  type: "percentage" | "fixed",
  value: number,
  subtotalCents: number,
) {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error("Discount value must be a positive integer.");
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0)
    throw new Error("Subtotal must be a non-negative integer.");
  if (type === "percentage" && value > 10000)
    throw new Error("Percentage discount cannot exceed 100%.");
  const calculated =
    type === "percentage"
      ? roundHalfUp(BigInt(subtotalCents) * BigInt(value), 10000n)
      : value;
  return Math.min(calculated, subtotalCents);
}
