import { and, eq, inArray } from "drizzle-orm";
import {
  parseCommercePreviewRequest,
  parseCommercePreview,
  type CommercePreviewRequest,
} from "@supastore/contracts";
import { db } from "@/infrastructure/db";
import {
  deliveryAreas,
  pickupLocation,
  products,
  productVariants,
  shippingZones,
  storeSettings,
  variantStock,
} from "@/infrastructure/db/schema";
import { InvariantViolationError } from "@/application/common/errors";
import { commercePolicy, rewardsActive } from "@/domain/commerce-policy";
import { commerceRules, evaluateCommerce } from "@/domain/commerce-evaluation";
import { availableFulfillment } from "@supastore/shipping/destination";

/** Public estimate only: no customer identity, credit balance or reservation writes. */
export async function previewCommerce(raw: CommercePreviewRequest) {
  const input = parseCommercePreviewRequest(raw);
  return db.transaction(async (tx) => {
    const [store] = await tx.select().from(storeSettings).limit(1);
    if (!store) throw new InvariantViolationError("Store setup is incomplete.");
    const policy = commercePolicy(store.commercePolicy),
      rules = commerceRules(store.commerceRules);
    const rows = await tx
      .select({ variant: productVariants, stock: variantStock })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(variantStock, eq(variantStock.variantId, productVariants.id))
      .where(
        and(
          inArray(
            productVariants.id,
            input.items.map((item) => item.variantId),
          ),
          eq(products.isPublished, true),
        ),
      );
    if (rows.length !== input.items.length)
      throw new InvariantViolationError("An item is unavailable.");
    const locations = await tx
      .select({ id: pickupLocation.id, name: pickupLocation.name })
      .from(pickupLocation);
    const zones = await tx.select({ id: shippingZones.id }).from(shippingZones);
    const areas = await tx
      .select({ id: deliveryAreas.id })
      .from(deliveryAreas)
      .where(eq(deliveryAreas.isActive, true));
    const methods = availableFulfillment(policy, {
      pickup: locations.length,
      shipping: zones.length,
      delivery: areas.length,
    });
    if (
      input.context.fulfillmentType &&
      !methods.includes(input.context.fulfillmentType)
    )
      throw new InvariantViolationError(
        "This fulfillment method is not available.",
      );
    if (
      input.context.pickupLocationId &&
      !locations.some(
        (location) => location.id === input.context.pickupLocationId,
      )
    )
      throw new InvariantViolationError("Choose an available pickup location.");
    const evaluation = evaluateCommerce({
      rules,
      context: input.context,
      now: new Date(),
      promotionCode: input.promotionCode,
      rewardRateBasisPoints: policy.rewardRateBasisPoints,
      rewardsEnabled: rewardsActive(policy, new Date()),
      items: input.items.map((item) => {
        const row = rows.find((row) => row.variant.id === item.variantId)!;
        return {
          ...item,
          unitPriceCents: row.variant.priceCents,
          isAvailable: row.variant.isAvailable,
          availableQuantity: row.stock?.trackingEnabled
            ? Math.max(0, row.stock.onHand - row.stock.reserved)
            : null,
        };
      }),
    });
    return parseCommercePreview({
      currency: store.currency,
      precision: store.precision,
      revision: store.quoteVersion,
      hasContextualRules: rules.some((rule) => rule.enabled),
      methods,
      locations,
      evaluation,
    });
  });
}
