import {
  InvariantViolationError,
  UnauthorizedError,
} from "@/application/common/errors";
import type { Transaction } from "@/application/common/transaction";
import { shippingPrice, validatePickup } from "@/domain/checkout";
import {
  commercePolicy,
  rewardMerchandiseEligible,
  rewardsActive,
} from "@/domain/commerce-policy";
import { quoteDelivery } from "@/domain/delivery";
import { calculatePurchaseTotal } from "@/domain/money/calculations";
import { calculateDiscountCents } from "@/domain/promotions";
import { allocateRewardFunding } from "@/domain/rewards";
import { stripeCurrencyIssue } from "@/domain/stripe-currency";
import { db } from "@/infrastructure/db";
import {
  commerceRules,
  evaluateCommerce,
  shoppingContext,
} from "@/domain/commerce-evaluation";
import {
  cartItems,
  carts,
  deliveryAreas,
  paymentAccounts,
  pickupLocation,
  productCategories,
  productVariants,
  products,
  promotionRedemptions,
  promotions,
  quotes,
  shippingZones,
  storeSettings,
  variantStock,
} from "@/infrastructure/db/schema";
import { stripeConfiguredFor } from "@/infrastructure/payments/configuration";
import { eq, inArray, sql } from "drizzle-orm";
export interface GetQuoteInput {
  cartId: string;
  guestSessionId: string;
  fulfillmentType: "shipping" | "pickup" | "local_delivery";
  shippingAddress: {
    country: string;
    address: string;
    region?: string;
    postalCode?: string;
  };
  deliveryAreaId?: string;
  pickupDate?: string;
  pickupLocationId?: string;
  pickupTime?: string;
  paymentAccountId?: string;
  promotionCode?: string;
}
export async function calculateQuote(tx: Transaction, input: GetQuoteInput) {
  const [cart] = await tx
    .select()
    .from(carts)
    .where(eq(carts.id, input.cartId))
    .limit(1);
  if (!cart || cart.guestSessionId !== input.guestSessionId)
    throw new UnauthorizedError();
  if (cart.convertedOrderId)
    throw new InvariantViolationError("Cart already checked out.");
  const [settings] = await tx.select().from(storeSettings).limit(1);
  if (!settings)
    throw new InvariantViolationError("Store setup is incomplete.");
  const policy = commercePolicy(settings.commercePolicy);
  if (
    (input.fulfillmentType === "shipping" && !policy.shippingEnabled) ||
    (input.fulfillmentType === "pickup" && !policy.pickupEnabled) ||
    (input.fulfillmentType === "local_delivery" && !policy.deliveryEnabled)
  )
    throw new InvariantViolationError(
      "This fulfillment method is not available.",
    );
  const items = await tx
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));
  if (!items.length) throw new InvariantViolationError("Your cart is empty.");
  const rows = await tx
    .select()
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      inArray(
        productVariants.id,
        items.map((i) => i.variantId),
      ),
    );
  const categoryMemberships = policy.rewardEligibleCategoryIds.length
    ? await tx
        .select()
        .from(productCategories)
        .where(
          inArray(productCategories.productId, [
            ...new Set(rows.map((row) => row.products.id)),
          ]),
        )
    : [];
  const rewardProgramActive = rewardsActive(policy, new Date());
  const stock = await tx
    .select()
    .from(variantStock)
    .where(
      inArray(
        variantStock.variantId,
        items.map((item) => item.variantId),
      ),
    );
  const context = shoppingContext({
    fulfillmentType: input.fulfillmentType,
    ...(input.fulfillmentType === "pickup"
      ? { pickupLocationId: input.pickupLocationId }
      : {
          country: input.shippingAddress.country,
          region: input.shippingAddress.region,
          postalCode: input.shippingAddress.postalCode,
        }),
  });
  const evaluation = evaluateCommerce({
    rules: commerceRules(settings.commerceRules),
    context,
    now: new Date(),
    items: items.map((item) => {
      const row = rows.find(
        (row) => row.product_variants.id === item.variantId,
      );
      const available = stock.find((s) => s.variantId === item.variantId);
      return {
        variantId: item.variantId,
        quantity: item.quantity,
        unitPriceCents: row?.product_variants.priceCents ?? 0,
        isAvailable: Boolean(
          row?.products.isPublished && row.product_variants.isAvailable,
        ),
        availableQuantity: available?.trackingEnabled
          ? Math.max(0, available.onHand - available.reserved)
          : null,
      };
    }),
    rewardsEnabled: rewardProgramActive,
    rewardRateBasisPoints: policy.rewardRateBasisPoints,
    promotionCode: input.promotionCode,
  });
  for (const item of evaluation.items) {
    if (item.pending)
      throw new InvariantViolationError(
        "Choose fulfillment and complete the destination or pickup location before reviewing prices.",
      );
    if (!item.available)
      throw new InvariantViolationError(
        item.reason === "INSUFFICIENT_STOCK"
          ? "Insufficient stock. Review your cart."
          : "An item is not offered for this fulfillment or destination. Review your cart.",
      );
  }
  if (evaluation.reward.pending || evaluation.shipping.pending)
    throw new InvariantViolationError(
      "Complete the destination or pickup location to calculate rewards and shipping.",
    );
  let calculationItems = items.map((item) => {
    const row = rows.find((r) => r.product_variants.id === item.variantId);
    if (!row?.products.isPublished || !row.product_variants.isAvailable)
      throw new InvariantViolationError(
        "An item is unavailable. Review your cart.",
      );
    const variant = row.product_variants;
    return {
      variantId: variant.id,
      sku: variant.sku,
      options: variant.attributes,
      title: row.products.title + " — " + variant.title,
      catalogVersion: row.products.quoteVersion,
      quantity: item.quantity,
      unitPriceCents: evaluation.items.find(
        (item) => item.variantId === variant.id,
      )!.unitPriceCents!,
      taxRateBasisPoints:
        row.products.taxable === false ? 0 : settings.taxRateBasisPoints,
      isTaxInclusive: settings.isTaxInclusive,
      rewardEligible: rewardMerchandiseEligible(
        policy,
        row.products.rewardEligible !== false,
        categoryMemberships
          .filter((membership) => membership.productId === row.products.id)
          .map((membership) => membership.categoryId),
      ),
      discountCents: 0,
    };
  });
  const subtotal = calculationItems.reduce(
    (sum, i) => sum + i.unitPriceCents * i.quantity,
    0,
  );
  let shippingCents = 0;
  let pickup: {
    locationId: string;
    address: string;
    date: string;
    startTime: string;
    endTime: string;
  } | null = null;
  let delivery: {
    areaId: string;
    name: string;
    country: string;
    postalCode: string;
    rateCents: number;
    date?: string;
    startTime?: string;
    endTime?: string;
  } | null = null;
  const baseShippingRules =
    input.fulfillmentType === "shipping"
      ? await tx
          .select()
          .from(shippingZones)
          .orderBy(shippingZones.sortOrder, shippingZones.id)
      : [];
  const shippingRules = baseShippingRules.map(zone => evaluation.shipping.ruleId ? { ...zone, freeThresholdCents: evaluation.shipping.freeThresholdCents } : zone);
  let selectedDeliveryArea: typeof deliveryAreas.$inferSelect | undefined;
  if (input.fulfillmentType === "shipping") {
    if (
      !/^[A-Z]{2}$/.test(input.shippingAddress.country) ||
      !input.shippingAddress.address.trim()
    )
      throw new InvariantViolationError(
        "Enter your shipping address and country.",
      );
    shippingCents = shippingPrice(
      shippingRules,
      input.shippingAddress.country,
      subtotal,
      input.shippingAddress,
    );
  } else if (input.fulfillmentType === "local_delivery") {
    if (!input.shippingAddress.address.trim())
      throw new InvariantViolationError("Enter your delivery address.");
    const [area] = await tx
      .select()
      .from(deliveryAreas)
      .where(
        eq(
          deliveryAreas.id,
          input.deliveryAreaId || "00000000-0000-0000-0000-000000000000",
        ),
      );
    if (!area)
      throw new InvariantViolationError("Choose an available delivery area.");
    selectedDeliveryArea = evaluation.shipping.ruleId ? { ...area, freeThresholdCents: evaluation.shipping.freeThresholdCents } : area;
    delivery = quoteDelivery(
      selectedDeliveryArea,
      input.shippingAddress.country,
      input.shippingAddress.postalCode ?? "",
      subtotal,
    );
    if (area.scheduleRequired || input.pickupDate || input.pickupTime) {
      delivery = {
        ...delivery,
        ...validatePickup(
          { ...area, blackoutDates: [] },
          input.pickupDate ?? "",
          input.pickupTime ?? "",
          settings.timezone,
          new Date(),
        ),
      };
    }
    shippingCents = delivery.rateCents;
  } else {
    const [location] = await tx
      .select()
      .from(pickupLocation)
      .where(
        eq(
          pickupLocation.id,
          input.pickupLocationId || "00000000-0000-0000-0000-000000000000",
        ),
      );
    if (!location)
      throw new InvariantViolationError("Pickup is not available.");
    pickup = {
      locationId: location.id,
      address: location.address,
      ...(location.scheduleRequired || input.pickupDate || input.pickupTime
        ? validatePickup(
            location,
            input.pickupDate ?? "",
            input.pickupTime ?? "",
            settings.timezone,
            new Date(),
          )
        : { date: "", startTime: "", endTime: "" }),
    };
  }
  const promotionCode = input.promotionCode?.trim().toUpperCase() ?? "";
  let promotion: {
    id: string;
    code: string;
    name: string;
    discountCents: number;
  } | null = null;
  if (promotionCode) {
    if (!evaluation.promotion.eligible)
      throw new InvariantViolationError(
        "This promotion is not eligible for the selected fulfillment or destination.",
      );
    const [candidate] = await tx
      .select()
      .from(promotions)
      .where(eq(promotions.code, promotionCode))
      .for("update");
    const now = new Date();
    if (
      !candidate?.isActive ||
      (candidate.startsAt && candidate.startsAt > now) ||
      (candidate.endsAt && candidate.endsAt <= now)
    )
      throw new InvariantViolationError("This promotion code is not active.");
    if (subtotal < candidate.minimumSubtotalCents)
      throw new InvariantViolationError(
        "Your order does not meet this promotion's minimum subtotal.",
      );
    if (candidate.usageLimit !== null) {
      const [usage] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(promotionRedemptions)
        .where(eq(promotionRedemptions.promotionId, candidate.id));
      if ((usage?.count ?? 0) >= candidate.usageLimit)
        throw new InvariantViolationError(
          "This promotion has reached its usage limit.",
        );
    }
    promotion = {
      id: candidate.id,
      code: candidate.code,
      name: candidate.name,
      discountCents: calculateDiscountCents(
        candidate.discountType,
        candidate.discountValue,
        subtotal,
      ),
    };
  }
  if (promotion?.discountCents) {
    const discounts = allocateRewardFunding(
      calculationItems.map((i) => ({
        id: i.variantId,
        type: "merchandise" as const,
        eligible: false,
        amount: i.unitPriceCents * i.quantity,
      })),
      promotion.discountCents,
    );
    calculationItems = calculationItems.map((i) => ({
      ...i,
      discountCents: discounts.find((d) => d.id === i.variantId)!
        .externalAmount,
    }));
  }
  const adjustedSubtotal = subtotal - (promotion?.discountCents ?? 0);
  if (input.fulfillmentType === "shipping")
    shippingCents = shippingPrice(
      shippingRules,
      input.shippingAddress.country,
      adjustedSubtotal,
      input.shippingAddress,
    );
  if (selectedDeliveryArea) {
    shippingCents = quoteDelivery(
      selectedDeliveryArea,
      input.shippingAddress.country,
      input.shippingAddress.postalCode ?? "",
      adjustedSubtotal,
    ).rateCents;
    if (delivery) delivery.rateCents = shippingCents;
  }
  if (
    input.fulfillmentType !== "pickup" &&
    evaluation.shipping.freeThresholdCents !== null &&
    adjustedSubtotal >= evaluation.shipping.freeThresholdCents
  ) {
    shippingCents = 0;
    if (delivery) delivery.rateCents = 0;
  }
  const discountedResult = calculatePurchaseTotal(calculationItems, {
    amountCents: shippingCents,
    taxRateBasisPoints: settings.taxRateBasisPoints,
    isTaxInclusive: settings.isTaxInclusive,
  });
  let payment: { id: string; name: string; instructions: string } | null = null;
  if (discountedResult.totalPayableCents > 0 && input.paymentAccountId) {
    const [account] = await tx
      .select()
      .from(paymentAccounts)
      .where(
        eq(
          paymentAccounts.id,
          input.paymentAccountId ?? "00000000-0000-0000-0000-000000000000",
        ),
      )
      .limit(1);
    if (!account?.isActive || account.accountType === "stripe")
      throw new InvariantViolationError("Choose an active payment method.");
    payment = {
      id: account.id,
      name: account.accountName,
      instructions: account.accountIdentifier,
    };
  }
  return {
    cart,
    settings,
    calculationItems,
    result: discountedResult,
    terms: {
      evaluation: {
        context: evaluation.context,
        matchedRuleIds: evaluation.matchedRuleIds,
        rewardRateBasisPoints: evaluation.reward.rateBasisPoints ?? 0,
      },
      rewardProgramActive,
      settingsVersion: settings.quoteVersion,
      currency: settings.currency,
      precision: settings.precision,
      fulfillmentType: input.fulfillmentType,
      shippingAddress: input.shippingAddress,
      pickup,
      delivery,
      payment,
      onlinePayment:
        !input.paymentAccountId &&
        stripeConfiguredFor(settings) &&
        !stripeCurrencyIssue(
          settings.currency,
          settings.precision,
          discountedResult.totalPayableCents,
        ),
      promotion,
      input: {
        fulfillmentType: input.fulfillmentType,
        shippingAddress: input.shippingAddress,
        pickupDate: input.pickupDate ?? "",
        pickupLocationId: input.pickupLocationId ?? "",
        pickupTime: input.pickupTime ?? "",
        paymentAccountId: input.paymentAccountId ?? "",
        promotionCode,
        deliveryAreaId: input.deliveryAreaId ?? "",
      },
    },
  };
}
export type QuoteTerms = Awaited<ReturnType<typeof calculateQuote>>["terms"];
export async function getQuote(input: GetQuoteInput) {
  return db.transaction((tx) => getQuoteInTransaction(tx, input));
}
export async function getQuoteInTransaction(
  tx: Transaction,
  input: GetQuoteInput,
) {
  await tx.select().from(storeSettings).for("update");
  await tx.select().from(carts).where(eq(carts.id, input.cartId)).for("update");
  const { cart, calculationItems, result, terms } = await calculateQuote(
    tx,
    input,
  );
  const [quote] = await tx
    .insert(quotes)
    .values({
      cartId: cart.id,
      cartRevision: cart.revision,
      merchandiseSubtotalCents: result.merchandiseSubtotalCents,
      shippingCents: result.shippingCents,
      exclusiveTaxCents: result.exclusiveTaxCents,
      inclusiveTaxCents: result.inclusiveTaxCents,
      totalPayableCents: result.totalPayableCents,
      discountCents: terms.promotion?.discountCents ?? 0,
      itemsSnapshot: calculationItems,
      shippingSnapshot: result.shipping,
      termsSnapshot: terms,
      expiresAt: new Date(Date.now() + 15 * 60000),
    })
    .returning();
  return quote!;
}
