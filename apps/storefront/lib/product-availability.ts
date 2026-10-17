export function variantCanBePurchased(
  variant: { id: string; isAvailable: boolean } | undefined,
  availableQuantities: Record<string, number>,
) {
  return !!variant?.isAvailable && (availableQuantities[variant.id] ?? 999) > 0;
}
