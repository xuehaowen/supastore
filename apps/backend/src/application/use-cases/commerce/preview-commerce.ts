import { and, eq, inArray, sql } from "drizzle-orm";
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
  promotions,
  promotionRedemptions,
} from "@/infrastructure/db/schema";
import { InvariantViolationError } from "@/application/common/errors";
import { commercePolicy, rewardsActive } from "@/domain/commerce-policy";
import { commerceRules, evaluateCommerce } from "@/domain/commerce-evaluation";
import {
  availableFulfillment,
  shippingRequiredFields,
} from "@supastore/shipping/destination";
import { shippingQuote } from "@/domain/checkout";
import { matchesDeliveryDestination } from "@/domain/delivery";
import {
  calculateDiscountCents,
  promotionLimitIssue,
} from "@/domain/promotions";

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
    const zones = await tx
      .select()
      .from(shippingZones)
      .orderBy(shippingZones.sortOrder, shippingZones.id);
    const areas = await tx
      .select()
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
    const now = new Date();
    const evaluation = evaluateCommerce({
      rules,
      context: input.context,
      now,
      promotionCode: input.promotionCode,
      rewardRateBasisPoints: policy.rewardRateBasisPoints,
      rewardsEnabled: rewardsActive(policy, now),
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
    const code = input.promotionCode?.trim().toUpperCase();
    if (code && evaluation.promotion.eligible) {
      const [promotion] = await tx
        .select()
        .from(promotions)
        .where(eq(promotions.code, code));
      const [usage] =
        promotion?.usageLimit !== null && promotion
          ? await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(promotionRedemptions)
              .where(eq(promotionRedemptions.promotionId, promotion.id))
          : [];
      if (
        !promotion?.isActive ||
        promotionLimitIssue(
          promotion,
          input.items.reduce(
            (sum, item) =>
              sum +
              rows.find((row) => row.variant.id === item.variantId)!.variant
                .priceCents *
                item.quantity,
            0,
          ),
          input.items.reduce((sum, item) => sum + item.quantity, 0),
        ) ||
        (promotion.startsAt && promotion.startsAt > now) ||
        (promotion.endsAt && promotion.endsAt <= now) ||
        (evaluation.merchandiseSubtotalCents !== null &&
          evaluation.merchandiseSubtotalCents <
            promotion.minimumSubtotalCents) ||
        (promotion.usageLimit !== null &&
          (usage?.count ?? 0) >= promotion.usageLimit)
      ) {
        evaluation.promotion.eligible = false;
        evaluation.promotion.reason = "PROMOTION_INELIGIBLE";
      } else if (evaluation.merchandiseSubtotalCents !== null) {
        const discount = calculateDiscountCents(
          promotion.discountType,
          promotion.discountValue,
          evaluation.merchandiseSubtotalCents,
        );
        if (!discount) {
          evaluation.promotion.eligible = false;
          evaluation.promotion.reason = "PROMOTION_INELIGIBLE";
        } else evaluation.merchandiseSubtotalCents -= discount;
      }
    }
    if (evaluation.promotion.pending) {
      // A pending discount makes the adjusted subtotal and qualification unknown.
      evaluation.merchandiseSubtotalCents = null;
      evaluation.shipping.pending = true;
      evaluation.shipping.remainingCents = null;
    }
    const context = evaluation.context;
    let deliveryEstimateCents: number | null = null;
    if (context.fulfillmentType === "shipping") {
      const required = shippingRequiredFields(zones, context.country ?? "");
      const pending =
        evaluation.shipping.pending ||
        !context.country ||
        (required.region && !context.region) ||
        (required.postalCode && !context.postalCode) ||
        evaluation.merchandiseSubtotalCents === null;
      evaluation.shipping.pending = Boolean(pending);
      if (!pending) {
        const selected = shippingQuote(
          zones.map((zone) =>
            evaluation.shipping.ruleId
              ? {
                  ...zone,
                  freeThresholdCents: evaluation.shipping.freeThresholdCents,
                }
              : zone,
          ),
          context.country!,
          evaluation.merchandiseSubtotalCents!,
          {
            ...(context.region ? { region: context.region } : {}),
            ...(context.postalCode ? { postalCode: context.postalCode } : {}),
          },
        );
        evaluation.shipping.freeThresholdCents = selected.freeThresholdCents;
        evaluation.shipping.remainingCents = selected.remainingCents;
        deliveryEstimateCents = selected.amountCents;
      }
    } else if (
      context.fulfillmentType === "pickup" ||
      !context.fulfillmentType
    ) {
      evaluation.shipping.remainingCents = null;
      evaluation.shipping.pending = !context.fulfillmentType;
      if (context.fulfillmentType === "pickup") deliveryEstimateCents = 0;
    } else {
      evaluation.shipping.remainingCents = null;
      if (!context.country || !context.postalCode) {
        evaluation.shipping.pending = true;
      } else {
        const matching = areas.filter((area) =>
          matchesDeliveryDestination(
            area,
            context.country!,
            context.postalCode!,
          ),
        );
        if (!matching.length)
          throw new InvariantViolationError(
            "Local delivery is not available to this destination.",
          );
        // Checkout chooses an area explicitly; do not guess between overlapping areas.
        evaluation.shipping.pending =
          evaluation.shipping.pending ||
          matching.length !== 1 ||
          evaluation.merchandiseSubtotalCents === null;
        if (!evaluation.shipping.pending) {
          const threshold = evaluation.shipping.ruleId
            ? evaluation.shipping.freeThresholdCents
            : matching[0]!.freeThresholdCents;
          evaluation.shipping.freeThresholdCents = threshold;
          evaluation.shipping.remainingCents =
            threshold === null
              ? null
              : Math.max(0, threshold - evaluation.merchandiseSubtotalCents!);
          deliveryEstimateCents =
            threshold !== null &&
            evaluation.merchandiseSubtotalCents! >= threshold
              ? 0
              : matching[0]!.rateCents;
        }
      }
    }
    return parseCommercePreview({
      deliveryEstimateCents,
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
