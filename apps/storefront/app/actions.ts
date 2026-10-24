"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverRequest, actionFailure } from "../lib/server-request";
import { localeOf } from "../lib/web";
import { customerError } from "@supastore/i18n/customer";
import type { CheckoutActionState } from "./checkout-state";
import { checkoutFieldErrors } from "../lib/checkout-field-errors";

const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const locale = (form: FormData) => localeOf(form.get("locale"));
function resultId(result: unknown, key = "id") {
  if (
    !result ||
    typeof result !== "object" ||
    !(key in result) ||
    typeof (result as Record<string, unknown>)[key] !== "string"
  )
    throw new Error("Invalid backend response.");
  return (result as Record<string, string>)[key]!;
}
async function perform(
  destination: string,
  work: () => Promise<string | void>,
) {
  let next = destination;
  try {
    next = (await work()) || destination;
    revalidatePath(next.split("?", 1)[0]!);
  } catch (error) {
    const failure = actionFailure(error, "storefront.action");
    next = `${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(failure.message)}${failure.requestId ? `&requestId=${failure.requestId}` : ""}`;
  }
  redirect(next);
}
export async function addItem(
  _previous: { error?: string; saved?: boolean; requestId?: string },
  form: FormData,
): Promise<{ error?: string; saved?: boolean; requestId?: string }> {
  try {
    await serverRequest("cart", {
      locale: locale(form),
      variantId: text(form, "variantId"),
      quantity: Number(text(form, "quantity")),
    });
    revalidatePath("/[locale]", "layout");
    return { saved: true };
  } catch (error) {
    const failure = actionFailure(error, "storefront.add-item");
    return {
      error: customerError(failure.message, locale(form)),
      ...(failure.requestId ? { requestId: failure.requestId } : {}),
    };
  }
}
export async function changeItem(form: FormData) {
  return perform(`/${locale(form)}/cart`, async () => {
    await serverRequest(
      "cart",
      {
        locale: locale(form),
        itemId: text(form, "itemId"),
        quantity: Number(text(form, "quantity")),
      },
      "PATCH",
    );
  });
}
export async function updateCartItem(
  form: FormData,
): Promise<{ saved?: boolean; error?: string; requestId?: string }> {
  try {
    await serverRequest(
      "cart",
      {
        locale: locale(form),
        itemId: text(form, "itemId"),
        quantity: Number(text(form, "quantity")),
      },
      "PATCH",
    );
    revalidatePath("/[locale]", "layout");
    return { saved: true };
  } catch (error) {
    const failure = actionFailure(error, "storefront.update-cart-item");
    return {
      error: customerError(failure.message, locale(form)),
      ...(failure.requestId ? { requestId: failure.requestId } : {}),
    };
  }
}
export async function quoteCheckout(
  _previous: CheckoutActionState,
  form: FormData,
): Promise<CheckoutActionState> {
  let id: string;
  try {
    id = resultId(await serverRequest("quotes", Object.fromEntries(form)));
  } catch (error) {
    const failure = actionFailure(error, "checkout.quote");
    const fieldErrors = checkoutFieldErrors(failure.message, locale(form));
    return {
      error: customerError(failure.message, locale(form)),
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(failure.requestId ? { requestId: failure.requestId } : {}),
    };
  }
  redirect(`/${locale(form)}/checkout?quote=${encodeURIComponent(id)}`);
}
export async function placeCheckout(
  _previous: CheckoutActionState,
  form: FormData,
): Promise<CheckoutActionState> {
  let id: string;
  const draftToken = text(form, "draftToken");
  form.delete("draftToken");
  try {
    id = resultId(
      await serverRequest("orders", {
        ...Object.fromEntries(form),
        accepted: text(form, "accepted") === "yes",
        creditAppliedCents: Number(text(form, "creditAppliedCents") || 0),
      }),
    );
  } catch (error) {
    const failure = actionFailure(error, "checkout.place");
    const fieldErrors = checkoutFieldErrors(failure.message, locale(form));
    return {
      error: customerError(failure.message, locale(form)),
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(failure.requestId ? { requestId: failure.requestId } : {}),
    };
  }
  const marker = /^[a-f0-9-]{36}$/.test(draftToken)
    ? `?placed=${draftToken}`
    : "";
  redirect(`/${locale(form)}/orders/${encodeURIComponent(id)}${marker}`);
}
export async function recoverOrder(form: FormData) {
  return perform(`/recover?locale=${locale(form)}`, async () => {
    await serverRequest("recovery", Object.fromEntries(form));
    return `/recover?locale=${locale(form)}&sent=1`;
  });
}
export async function exchangeLink(form: FormData) {
  return perform(`/recover?locale=${locale(form)}`, async () => {
    const id = resultId(
      await serverRequest("recovery", Object.fromEntries(form), "PUT"),
      "orderId",
    );
    return `/${locale(form)}/orders/${encodeURIComponent(id)}`;
  });
}
export async function acceptProposal(form: FormData) {
  return perform(
    `/${locale(form)}/orders/${encodeURIComponent(text(form, "orderId"))}`,
    async () => {
      await serverRequest(
        `orders/${encodeURIComponent(text(form, "orderId"))}/proposals`,
        { proposalId: text(form, "proposalId") },
      );
    },
  );
}
