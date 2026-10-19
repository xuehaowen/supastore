import { MAX_ITEM_QUANTITY } from "@supastore/contracts";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  cartItems,
  carts,
  orders,
  storeSettings,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { DomainError } from "@/application/common/errors";
import { getQuoteInTransaction } from "@/application/use-cases/get-quote";
import { createOrderInTransaction } from "@/application/use-cases/create-order";
import {
  parseActionInteger,
  parseActionEnum,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";

export async function createManualOrder(input: {
  requestKey: string;
  staffUserId: string;
  customerName: string;
  customerEmail: string;
  fulfillmentType?: string;
  country?: string;
  address?: string;
  pickupLocationId?: string;
  pickupDate?: string;
  pickupTime?: string;
  region?: string;
  postalCode?: string;
  paymentAccountId: string;
  items: { variantId: string; quantity: number }[];
}) {
  const customerName = parseActionRequiredText(
    input.customerName,
    "Customer name",
    120,
  );
  const customerEmail = parseActionRequiredText(
    input.customerEmail,
    "Customer email",
    320,
  );
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
    throw new DomainError("Enter a valid customer email address.");
  const fulfillmentType = parseActionEnum(
    input.fulfillmentType ?? "shipping",
    "Fulfillment",
    ["shipping", "pickup"],
  );
  const pickupLocationId =
    fulfillmentType === "pickup"
      ? parseActionUuid(input.pickupLocationId, "Pickup location")
      : undefined;
  const pickupDate =
    fulfillmentType === "pickup" ? (input.pickupDate?.trim() ?? "") : "";
  const pickupTime =
    fulfillmentType === "pickup" ? (input.pickupTime?.trim() ?? "") : "";
  const country =
    fulfillmentType === "shipping"
      ? parseActionRequiredText(
          input.country,
          "Shipping country",
          2,
        ).toUpperCase()
      : "";
  const address =
    fulfillmentType === "shipping"
      ? parseActionRequiredText(input.address, "Shipping address", 500)
      : "";
  const paymentAccountId = parseActionUuid(
    input.paymentAccountId,
    "Payment method",
  );
  if (!input.items.length || input.items.length > 25)
    throw new DomainError("A manual order must have between 1 and 25 items.");
  const items = input.items.map((item) => ({
    variantId: parseActionUuid(item.variantId, "Product variant"),
    quantity: parseActionInteger(
      item.quantity,
      "Quantity",
      1,
      MAX_ITEM_QUANTITY,
    ),
  }));
  if (new Set(items.map((item) => item.variantId)).size !== items.length)
    throw new DomainError("Combine duplicate product variants into one line.");

  const requestKey = parseActionUuid(input.requestKey, "Manual order request");
  const shippingAddress = {
    country,
    address,
    region:
      fulfillmentType === "shipping"
        ? (input.region?.trim().toUpperCase() ?? "")
        : "",
    postalCode:
      fulfillmentType === "shipping" ? (input.postalCode?.trim() ?? "") : "",
  };
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        staffUserId: input.staffUserId,
        customerName,
        customerEmail,
        shippingAddress,
        ...(fulfillmentType === "pickup"
          ? { fulfillmentType, pickupLocationId, pickupDate, pickupTime }
          : {}),
        paymentAccountId,
        items: [...items].sort((a, b) =>
          a.variantId.localeCompare(b.variantId),
        ),
      }),
    )
    .digest("hex");
  const guestSessionId = `manual:${fingerprint}`;
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    // Follow checkout's settings-before-cart lock order, including retries.
    await tx.select().from(storeSettings).for("update");
    const [created] = await tx
      .insert(carts)
      .values({ id: requestKey, guestSessionId })
      .onConflictDoNothing()
      .returning();
    const [cart] = await tx
      .select()
      .from(carts)
      .where(eq(carts.id, requestKey))
      .for("update");
    if (!cart || cart.guestSessionId !== guestSessionId)
      throw new DomainError(
        "Manual order request was already used with different details.",
      );
    if (cart.convertedOrderId) {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, cart.convertedOrderId));
      if (!existing)
        throw new DomainError("Manual order request has no recoverable order.");
      return { ...existing, orderId: existing.id, isExisting: true };
    }
    if (created)
      await tx
        .insert(cartItems)
        .values(items.map((item) => ({ cartId: cart.id, ...item })));
    const quote = await getQuoteInTransaction(tx, {
      cartId: cart.id,
      guestSessionId,
      fulfillmentType,
      ...(pickupLocationId ? { pickupLocationId } : {}),
      pickupDate,
      pickupTime,
      shippingAddress,
      paymentAccountId,
    });
    return createOrderInTransaction(tx, {
      quoteId: quote.id,
      guestSessionId,
      guestEmail: customerEmail,
      guestName: customerName,
      staffUserId: input.staffUserId,
      manualItemCount: items.length,
    });
  });
}
