import { roundHalfUp } from "@/domain/money/calculations";

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
