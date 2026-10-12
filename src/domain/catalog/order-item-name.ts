// Old purchases recover names from their immutable quote, never today's catalog.
export function orderItemName(
  item: {
    variantId: string;
    catalogSnapshot?: { title?: string; sku?: string };
  },
  quoteItems: unknown,
) {
  if (item.catalogSnapshot?.title) return item.catalogSnapshot.title;
  if (Array.isArray(quoteItems)) {
    const snapshot = quoteItems.find(
      (value: unknown) =>
        value &&
        typeof value === "object" &&
        "variantId" in value &&
        value.variantId === item.variantId,
    );
    if (snapshot && typeof snapshot.title === "string") return snapshot.title;
  }
  return "Historical item (name unavailable)";
}
