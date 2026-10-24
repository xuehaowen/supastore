type CatalogVariant = {
  priceCents: number;
  isAvailable: boolean;
  trackingEnabled: boolean | null;
  onHand: number | null;
  reserved: number | null;
};

export function catalogAvailability(variants: CatalogVariant[]) {
  const purchasable = variants.filter(
    (variant) =>
      variant.isAvailable &&
      (variant.trackingEnabled !== true ||
        (variant.onHand ?? 0) > (variant.reserved ?? 0)),
  );
  const prices = (purchasable.length ? purchasable : variants).map(
    (variant) => variant.priceCents,
  );
  return {
    lowestPriceCents: prices.length ? Math.min(...prices) : null,
    highestPriceCents: prices.length ? Math.max(...prices) : null,
    isAvailable: purchasable.length > 0,
  };
}
