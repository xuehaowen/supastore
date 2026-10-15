"use server";
import { parseQuoteRequest } from "@/application/common/quote-request";
import { DomainError } from "@/application/common/errors";
import { allowRequest } from "@/application/common/rate-limit";
import {
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";
import { addToCart } from "@/application/use-cases/cart/add-to-cart";
import { updateCartItem } from "@/application/use-cases/cart/update-cart-item";
import { createManualOrder } from "@/application/use-cases/create-manual-order";
import { createOrder } from "@/application/use-cases/create-order";
import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { getQuote } from "@/application/use-cases/get-quote";
import { requestTrackingLink } from "@/application/use-cases/guest/request-tracking-link";
import { verifyTrackingLink } from "@/application/use-cases/guest/verify-tracking-link";
import { acceptOrderChange } from "@/application/use-cases/order-proposals";
import { customerError } from "@supastore/i18n/customer";
import {
  customerIdentity,
  guestIdentity,
  localeOf,
  orderToken,
  setOrderToken,
  staffIdentity,
} from "@/infrastructure/web";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValiError } from "valibot";
import { field, perform } from "./common";
interface CheckoutActionState {
  error?: string;
}
export async function addItem(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform("/" + locale + "/cart", async () => {
    await addToCart({
      guestSessionId: await guestIdentity(true),
      variantId: parseActionUuid(field(form, "variantId"), "Product variant"),
      quantity: parseActionInteger(field(form, "quantity"), "Quantity", 1, 999),
      locale,
    });
  });
}
export async function changeItem(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform("/" + locale + "/cart", async () => {
    await updateCartItem({
      guestSessionId: await guestIdentity(),
      itemId: parseActionUuid(field(form, "itemId"), "Cart item"),
      quantity: parseActionInteger(field(form, "quantity"), "Quantity", 0, 999),
      locale,
    });
  });
}
export async function quoteCart(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform("/" + locale + "/checkout", async () => {
    const quote = await quoteFromForm(form);
    return "/" + locale + "/checkout?quote=" + quote.id;
  });
}
async function quoteFromForm(form: FormData) {
  const fields = parseQuoteRequest(Object.fromEntries(form));
  return getQuote({
    ...fields,
    guestSessionId: await guestIdentity(),
    shippingAddress: {
      country: fields.country,
      address: fields.address,
      region: fields.region,
      postalCode: fields.postalCode,
    },
  });
}
export async function placeOrder(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform("/" + locale + "/checkout", () => orderFromForm(form));
}
async function orderFromForm(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  if (field(form, "accepted") !== "yes")
    throw new DomainError("Accept the final total before placing an order.");
  if (!allowRequest("checkout:" + (await guestIdentity()), 20))
    throw new DomainError("Please wait a minute before retrying.");
  const customerUserId = await customerIdentity();
  const order = await createOrder({
    locale,
    quoteId: parseActionUuid(field(form, "quoteId"), "Quote"),
    guestSessionId: await guestIdentity(),
    guestName: field(form, "name"),
    guestEmail: field(form, "email"),
    ...(customerUserId ? { customerUserId } : {}),
    creditAppliedCents: parseActionInteger(
      field(form, "creditAppliedCents") || "0",
      "Store credit",
      0,
      2147483647,
    ),
  });
  await setOrderToken(order.id, order.sessionToken);
  return "/" + locale + "/orders/" + order.id;
}

function checkoutError(error: unknown, locale: string): CheckoutActionState {
  const message =
    error instanceof DomainError || error instanceof ValiError
      ? error.message
      : "Unable to save. Check your entries and try again.";
  return { error: customerError(message, locale) };
}

export async function quoteCheckout(
  _previous: CheckoutActionState,
  form: FormData,
): Promise<CheckoutActionState> {
  const locale = localeOf(field(form, "locale"));
  let id: string;
  try {
    const quote = await quoteFromForm(form);
    const terms = quote.termsSnapshot as QuoteTerms;
    if (quote.totalPayableCents > 0 && !terms.payment && !terms.onlinePayment) {
      const userId = await customerIdentity();
      const customer = userId ? await customerAccount(userId) : null;
      const availableCredit = customer?.credit?.reconciled
        ? customer.credit.account.balanceCents -
          customer.credit.account.reservedCents
        : 0;
      if (availableCredit < quote.totalPayableCents) {
        throw new DomainError("Choose an active payment method.");
      }
    }
    id = quote.id;
  } catch (error) {
    return checkoutError(error, locale);
  }
  redirect("/" + locale + "/checkout?quote=" + id);
}

export async function placeCheckout(
  _previous: CheckoutActionState,
  form: FormData,
): Promise<CheckoutActionState> {
  let destination: string;
  try {
    destination = await orderFromForm(form);
  } catch (error) {
    return checkoutError(error, localeOf(field(form, "locale")));
  }
  redirect(destination);
}

export async function createManualOrderAction(form: FormData) {
  return perform("/admin/orders", async () => {
    const itemCount = parseActionInteger(
      field(form, "itemCount"),
      "Item count",
      1,
      25,
    );
    const order = await createManualOrder({
      requestKey: field(form, "requestKey"),
      staffUserId: await staffIdentity(),
      customerName: field(form, "customerName"),
      customerEmail: field(form, "customerEmail"),
      fulfillmentType: field(form, "fulfillmentType") || "shipping",
      pickupLocationId: field(form, "pickupLocationId"),
      pickupDate: field(form, "pickupDate"),
      pickupTime: field(form, "pickupTime"),
      country: field(form, "country"),
      address: field(form, "address"),
      region: field(form, "region"),
      postalCode: field(form, "postalCode"),
      paymentAccountId: field(form, "paymentAccountId"),
      items: Array.from({ length: itemCount }, (_, index) => ({
        variantId: field(form, `variantId-${index}`),
        quantity: parseActionInteger(
          field(form, `quantity-${index}`),
          "Quantity",
          1,
          999,
        ),
      })),
    });
    revalidatePath("/admin", "layout");
    return `/admin/orders?created=${order.referenceCode}`;
  });
}
export async function recoverOrder(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  const path = locale === "zh" ? "/recover?locale=zh" : "/recover";
  return perform(path, async () => {
    await requestTrackingLink({
      email: field(form, "email"),
      referenceCode: field(form, "reference"),
      locale,
    });
    return path + (path.includes("?") ? "&" : "?") + "sent=1";
  });
}
export async function exchangeLink(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform(
    locale === "zh" ? "/recover?locale=zh" : "/recover",
    async () => {
      const result = await verifyTrackingLink({
        recoveryToken: field(form, "token"),
      });
      await setOrderToken(result.orderId, result.sessionToken);
      return "/" + locale + "/orders/" + result.orderId;
    },
  );
}
export async function acceptProposal(form: FormData) {
  const rawId = field(form, "orderId");
  const locale = localeOf(field(form, "locale"));
  const validId = /^[0-9a-f-]{36}$/i.test(rawId);
  return perform(
    validId
      ? "/" + locale + "/orders/" + rawId
      : locale === "zh"
        ? "/recover?locale=zh"
        : "/recover",
    async () => {
      const id = parseActionUuid(rawId, "Order");
      await acceptOrderChange({
        orderId: id,
        proposalId: parseActionUuid(field(form, "proposalId"), "Proposal"),
        sessionToken: await orderToken(id),
      });
    },
  );
}
