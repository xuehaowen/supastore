import { schedulePickupReminder } from "@/application/scheduling/scheduled-actions";
import type { Transaction } from "@/application/common/transaction";
import {
  InvariantViolationError,
  UnauthorizedError,
} from "@/application/common/errors";
import { emitOrderEvent } from "@/application/common/events";
import { parseActionInteger } from "@/application/common/request-validation";
import { commercePolicy } from "@/domain/commerce-policy";
import { createRewardSnapshot, type RewardComponent } from "@/domain/rewards";
import { stripeCurrencyIssue } from "@/domain/stripe-currency";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  carts,
  fulfillmentSlots,
  orderFulfillments,
  orderItems,
  orders,
  pickupTimeSlots,
  promotionRedemptions,
  quotes,
  storeSettings,
  smsPreferences,
} from "@/infrastructure/db/schema";
import { stripeConfiguredFor } from "@/infrastructure/payments/configuration";
import { eq } from "drizzle-orm";
import { smsConsentCurrent } from "@supastore/contracts";
import { isDeepStrictEqual } from "node:util";
import * as v from "valibot";
import { verifiedCustomer } from "./customers/customer-ownership";
import { calculateQuote, type QuoteTerms } from "./get-quote";
import { issueOrderSession } from "./guest/create-guest-session";
import {
  reserveFulfillmentSlot,
  reserveSlot,
} from "./inventory/slot-operations";
import { reserveOrderStock } from "./inventory/stock-operations";
import {
  reserveOrderCredit,
  settleOrderCredit,
} from "./store-credit/credit-operations";
import { getLaunchReadiness } from "./store/get-launch-readiness";
export interface CreateOrderInput {
  quoteId: string;
  guestSessionId: string;
  guestEmail: string;
  guestName: string;
  requestKey?: string;
  staffUserId?: string;
  manualItemCount?: number;
  customerUserId?: string;
  creditAppliedCents?: number;
  locale?: "en" | "zh";
  smsPreferenceId?: string;
}
export async function createOrder(input: CreateOrderInput) {
  return db.transaction((tx) => createOrderInTransaction(tx, input));
}
export async function createOrderInTransaction(
  tx: Transaction,
  input: CreateOrderInput,
) {
  const email = v.parse(
    v.pipe(v.string(), v.trim(), v.email()),
    input.guestEmail,
  );
  const name = v.parse(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
    input.guestName,
  );

  if (input.staffUserId)
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
  const [settings] = await tx
    .select()
    .from(storeSettings)
    .for("update")
    .limit(1);
  const [quote] = await tx
    .select()
    .from(quotes)
    .where(eq(quotes.id, input.quoteId))
    .limit(1);
  if (!quote) throw new UnauthorizedError("Quote not found.");
  const [cart] = await tx
    .select()
    .from(carts)
    .where(eq(carts.id, quote.cartId))
    .for("update")
    .limit(1);
  if (!cart || cart.guestSessionId !== input.guestSessionId)
    throw new UnauthorizedError();
  // Authorized source-cart recovery precedes expiry and current launch gates.
  if (cart.convertedOrderId) {
    const [existing] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, cart.convertedOrderId));
    const session = await issueOrderSession(tx, existing!.id);
    return {
      ...existing!,
      orderId: existing!.id,
      sessionToken: session.rawToken,
      isExisting: true,
    };
  }
  const creditAppliedCents = parseActionInteger(
    input.creditAppliedCents ?? 0,
    "Store credit",
    0,
    quote.totalPayableCents,
  );
  if (creditAppliedCents && (!input.customerUserId || input.staffUserId))
    throw new UnauthorizedError(
      "Store credit requires a verified customer checkout.",
    );
  if (!settings || settings.isPaused || !settings.isOrderingEnabled)
    throw new InvariantViolationError(
      settings?.pauseMessage ?? "Store is currently paused.",
    );
  const readiness = await getLaunchReadiness(tx);
  // Free purchases do not require a manual payment method.
  if (
    readiness.checklist.some(
      (c) =>
        !c.isReady &&
        !(
          c.key === "payment" && quote.totalPayableCents === creditAppliedCents
        ),
    )
  )
    throw new InvariantViolationError(
      "Store setup is incomplete. Please contact the store.",
    );
  if (quote.expiresAt <= new Date() || quote.cartRevision !== cart.revision)
    throw new InvariantViolationError(
      "Your checkout changed or expired. Review the final total again before ordering.",
    );
  const terms = quote.termsSnapshot as QuoteTerms;
  if (
    quote.totalPayableCents > creditAppliedCents &&
    !terms.payment &&
    !(
      terms.onlinePayment &&
      stripeConfiguredFor(terms) &&
      !stripeCurrencyIssue(
        terms.currency,
        terms.precision,
        quote.totalPayableCents - creditAppliedCents,
      )
    )
  )
    throw new InvariantViolationError(
      "Choose a payment method for the amount remaining after store credit. Edit checkout and review again.",
    );
  const current = await calculateQuote(tx, {
    cartId: cart.id,
    guestSessionId: input.guestSessionId,
    ...terms.input,
  });
  if (
    !isDeepStrictEqual(current.terms, terms) ||
    !isDeepStrictEqual(current.calculationItems, quote.itemsSnapshot) ||
    current.result.totalPayableCents !== quote.totalPayableCents
  )
    throw new InvariantViolationError(
      "Prices or fulfillment terms changed. Review the final total again before ordering.",
    );
  const customer = input.customerUserId
    ? await verifiedCustomer(tx, input.customerUserId)
    : undefined;
  if (
    !input.staffUserId &&
    !customer &&
    !commercePolicy(settings.commercePolicy).guestCheckout
  )
    throw new UnauthorizedError(
      "Sign in with a verified account to check out.",
    );
  const rewardComponents: RewardComponent[] = current.calculationItems.flatMap(
    (item, index) => {
      const calculated = current.result.lineItems[index]!;
      return [
        {
          id: item.variantId,
          type: "merchandise" as const,
          amount:
            calculated.subtotalCents -
            (calculated.isTaxInclusive ? calculated.taxCents : 0),
          eligible: item.rewardEligible,
        },
        {
          id: `tax:${item.variantId}`,
          type: "tax" as const,
          amount: calculated.taxCents,
          eligible: false,
        },
      ];
    },
  );
  rewardComponents.push(
    {
      id: "fulfillment",
      type: "fulfillment",
      amount:
        current.result.shipping.amountCents -
        (current.result.shipping.isTaxInclusive
          ? current.result.shipping.taxCents
          : 0),
      eligible: false,
    },
    {
      id: "tax:fulfillment",
      type: "tax",
      amount: current.result.shipping.taxCents,
      eligible: false,
    },
  );
  const rewardSnapshot =
    customer && current.terms.rewardProgramActive
      ? createRewardSnapshot({
          policyVersion: String(settings.quoteVersion),
          customerId: customer.id,
          verified: true,
          enabled: true,
          rateBasisPoints: current.terms.evaluation.rewardRateBasisPoints,
          externalAmount: quote.totalPayableCents - creditAppliedCents,
          components: rewardComponents,
        })
      : null;
  let smsPreferenceId: string | null = null;
  if (input.smsPreferenceId) {
    const [smsStore] = await tx.select().from(storeSettings).limit(1);
    const [preference] = await tx
      .select()
      .from(smsPreferences)
      .where(eq(smsPreferences.id, input.smsPreferenceId));
    if (
      smsConsentCurrent(smsStore, preference) &&
      preference?.optedIn &&
      preference.verifiedAt &&
      preference.consentAt
    )
      smsPreferenceId = preference.id;
  }
  const [order] = await tx
    .insert(orders)
    .values({
      sourceCartId: cart.id,
      quoteId: quote.id,
      lifecycleStatus:
        quote.totalPayableCents === creditAppliedCents ? "confirmed" : "unpaid",
      creditAppliedCents,
      purchaseTotalCents: quote.totalPayableCents,
      discountCents: quote.discountCents,
      guestEmail: email,
      guestName: name,
      smsPreferenceId,
      notificationLocale: input.locale === "zh" ? "zh" : "en",
      customerId: customer?.id ?? null,
      fulfillmentType: terms.fulfillmentType,
      shippingAddressSnapshot: terms.shippingAddress,
      termsSnapshot: terms,
      rewardSnapshot,
    })
    .returning();
  if (!order)
    throw new InvariantViolationError(
      "Unable to allocate an order reference. Please retry.",
    );
  await tx.insert(orderItems).values(
    current.calculationItems.map((i) => ({
      orderId: order!.id,
      variantId: i.variantId,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      lineTotalCents: i.unitPriceCents * i.quantity - i.discountCents,
      catalogSnapshot: { title: i.title, sku: i.sku, options: i.options },
    })),
  );
  let pickupSlotId: string | null = null;
  let fulfillmentSlotId: string | null = null;
  if (terms.pickup?.date) {
    const { locationId, date, startTime, endTime } = terms.pickup;
    const [slot] = await tx
      .insert(pickupTimeSlots)
      .values({ locationId, date, startTime, endTime })
      .onConflictDoUpdate({
        target: [
          pickupTimeSlots.locationId,
          pickupTimeSlots.date,
          pickupTimeSlots.startTime,
          pickupTimeSlots.endTime,
        ],
        set: { locationId },
      })
      .returning();
    pickupSlotId = slot!.id;
    fulfillmentSlotId = await reserveSlot(
      tx,
      order.id,
      pickupSlotId,
      settings.timezone,
    );
  }
  if (
    terms.delivery?.date &&
    terms.delivery.startTime &&
    terms.delivery.endTime
  ) {
    const { areaId, date, startTime, endTime } = terms.delivery;
    const { deliveryAreas } = await import("@/infrastructure/db/schema");
    const [area] = await tx
      .select()
      .from(deliveryAreas)
      .where(eq(deliveryAreas.id, areaId));
    const [slot] = await tx
      .insert(fulfillmentSlots)
      .values({
        deliveryAreaId: areaId,
        date,
        startTime,
        endTime,
        timezone: settings.timezone,
        capacity: area?.slotCapacity,
      })
      .onConflictDoUpdate({
        target: [
          fulfillmentSlots.deliveryAreaId,
          fulfillmentSlots.date,
          fulfillmentSlots.startTime,
          fulfillmentSlots.endTime,
        ],
        set: { deliveryAreaId: areaId },
      })
      .returning();
    fulfillmentSlotId = slot!.id;
    await reserveFulfillmentSlot(tx, order.id, fulfillmentSlotId);
  }
  // All tracked items reserve atomically with the order. Quote/cart never hold stock.
  await reserveOrderStock(tx, order.id);
  if (creditAppliedCents) {
    await reserveOrderCredit(
      tx,
      order.id,
      customer!.id,
      creditAppliedCents,
      terms.currency,
      terms.precision,
    );
    if (quote.totalPayableCents === creditAppliedCents)
      await settleOrderCredit(tx, order.id, "captured", input.customerUserId!);
  }
  if (terms.promotion)
    await tx.insert(promotionRedemptions).values({
      promotionId: terms.promotion.id,
      orderId: order.id,
      discountCents: terms.promotion.discountCents,
    });
  await tx.insert(orderFulfillments).values({
    orderId: order.id,
    status: "unfulfilled",
    pickupSlotId,
    fulfillmentSlotId,
  });
  await tx
    .update(carts)
    .set({ convertedOrderId: order.id, updatedAt: new Date() })
    .where(eq(carts.id, cart.id));
  await emitOrderEvent(tx, order.id, "order.submitted", email, {
    orderId: order.id,
    referenceCode: order.referenceCode,
    purchaseTotalCents: order.purchaseTotalCents,
  });
  if (quote.totalPayableCents === creditAppliedCents)
    await emitOrderEvent(tx, order.id, "order.confirmed", email, {
      orderId: order.id,
      purchaseTotalCents: quote.totalPayableCents,
    });
  if (input.staffUserId)
    await tx.insert(auditRecords).values({
      entityType: "order",
      entityId: order.id,
      actorId: input.staffUserId,
      action: "manual_order.created",
      details: { itemCount: input.manualItemCount ?? 0 },
    });
  const session = await issueOrderSession(tx, order.id);
  await schedulePickupReminder(tx, order.id);
  return {
    ...order,
    orderId: order.id,
    sessionToken: session.rawToken,
    isExisting: false,
  };
}
