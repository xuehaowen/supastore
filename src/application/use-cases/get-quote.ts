import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  carts,
  cartItems,
  productVariants,
  products,
  quotes,
  storeSettings,
  shippingZones,
  pickupLocation,
  paymentAccounts,
} from "@/infrastructure/db/schema";
import type { Transaction } from "@/application/common/transaction";
import { calculatePurchaseTotal } from "@/domain/money/calculations";
import { shippingPrice, validatePickup } from "@/domain/checkout";
import {
  InvariantViolationError,
  UnauthorizedError,
} from "@/application/common/errors";
export interface GetQuoteInput {
  cartId: string;
  guestSessionId: string;
  fulfillmentType: "shipping" | "pickup";
  shippingAddress: { country: string; address: string };
  pickupDate?: string;
  pickupTime?: string;
  paymentAccountId?: string;
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
  const calculationItems = items.map((item) => {
    const row = rows.find((r) => r.product_variants.id === item.variantId);
    if (!row?.products.isPublished || !row.product_variants.isAvailable)
      throw new InvariantViolationError(
        "An item is unavailable. Review your cart.",
      );
    const variant = row.product_variants;
    return {
      variantId: variant.id,
      sku: variant.sku,
      title: row.products.title + " — " + variant.title,
      catalogVersion: row.products.quoteVersion,
      quantity: item.quantity,
      unitPriceCents: variant.priceCents,
      taxRateBasisPoints: settings.taxRateBasisPoints,
      isTaxInclusive: settings.isTaxInclusive,
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
  if (input.fulfillmentType === "shipping") {
    if (
      !/^[A-Z]{2}$/.test(input.shippingAddress.country) ||
      !input.shippingAddress.address.trim()
    )
      throw new InvariantViolationError(
        "Enter your shipping address and country.",
      );
    shippingCents = shippingPrice(
      await tx.select().from(shippingZones).orderBy(shippingZones.sortOrder),
      input.shippingAddress.country,
      subtotal,
    );
  } else {
    const [location] = await tx.select().from(pickupLocation).limit(1);
    if (!location)
      throw new InvariantViolationError("Pickup is not available.");
    pickup = {
      locationId: location.id,
      address: location.address,
      ...validatePickup(
        location,
        input.pickupDate ?? "",
        input.pickupTime ?? "",
        settings.timezone,
      ),
    };
  }
  const result = calculatePurchaseTotal(calculationItems, {
    amountCents: shippingCents,
    taxRateBasisPoints: settings.taxRateBasisPoints,
    isTaxInclusive: settings.isTaxInclusive,
  });
  let payment: { id: string; name: string; instructions: string } | null = null;
  if (result.totalPayableCents > 0) {
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
    if (!account?.isActive)
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
    result,
    terms: {
      settingsVersion: settings.quoteVersion,
      currency: settings.currency,
      precision: settings.precision,
      fulfillmentType: input.fulfillmentType,
      shippingAddress: input.shippingAddress,
      pickup,
      payment,
      input: {
        fulfillmentType: input.fulfillmentType,
        shippingAddress: input.shippingAddress,
        pickupDate: input.pickupDate ?? "",
        pickupTime: input.pickupTime ?? "",
        paymentAccountId: input.paymentAccountId ?? "",
      },
    },
  };
}
export type QuoteTerms = Awaited<ReturnType<typeof calculateQuote>>["terms"];
export async function getQuote(input: GetQuoteInput) {
  return db.transaction(async (tx) => {
    await tx.select().from(storeSettings).for("update");
    await tx
      .select()
      .from(carts)
      .where(eq(carts.id, input.cartId))
      .for("update");
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
        itemsSnapshot: calculationItems,
        shippingSnapshot: result.shipping,
        termsSnapshot: terms,
        expiresAt: new Date(Date.now() + 15 * 60000),
      })
      .returning();
    return quote!;
  });
}
