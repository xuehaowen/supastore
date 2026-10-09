import { randomUUID } from "node:crypto";
import { db } from "@/infrastructure/db";
import { cartItems, carts } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { DomainError } from "@/application/common/errors";
import { getQuote } from "@/application/use-cases/get-quote";
import { createOrder } from "@/application/use-cases/create-order";
import {
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";

export async function createManualOrder(input: {
  staffUserId: string;
  customerName: string;
  customerEmail: string;
  country: string;
  address: string;
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
  const country = parseActionRequiredText(
    input.country,
    "Shipping country",
    2,
  ).toUpperCase();
  const address = parseActionRequiredText(
    input.address,
    "Shipping address",
    500,
  );
  const paymentAccountId = parseActionUuid(
    input.paymentAccountId,
    "Payment method",
  );
  if (!input.items.length || input.items.length > 25)
    throw new DomainError("A manual order must have between 1 and 25 items.");
  const items = input.items.map((item) => ({
    variantId: parseActionUuid(item.variantId, "Product variant"),
    quantity: parseActionInteger(item.quantity, "Quantity", 1, 999),
  }));
  if (new Set(items.map((item) => item.variantId)).size !== items.length)
    throw new DomainError("Combine duplicate product variants into one line.");

  const guestSessionId = `manual:${randomUUID()}`;
  const cart = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [created] = await tx
      .insert(carts)
      .values({ guestSessionId })
      .returning();
    await tx
      .insert(cartItems)
      .values(items.map((item) => ({ cartId: created!.id, ...item })));
    return created!;
  });
  const quote = await getQuote({
    cartId: cart.id,
    guestSessionId,
    fulfillmentType: "shipping",
    shippingAddress: {
      country,
      address,
      region: input.region?.trim().toUpperCase() ?? "",
      postalCode: input.postalCode?.trim() ?? "",
    },
    paymentAccountId,
  });
  const order = await createOrder({
    quoteId: quote.id,
    guestSessionId,
    guestEmail: customerEmail,
    guestName: customerName,
    staffUserId: input.staffUserId,
    manualItemCount: items.length,
  });
  return order;
}
