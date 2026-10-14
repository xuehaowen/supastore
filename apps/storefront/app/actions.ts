"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverRequest } from "../lib/server-request";
import { BackendApiError } from "../lib/api";
import { localeOf } from "../lib/web";
import { customerError } from "@supastore/i18n/customer";
import type { CheckoutActionState } from "./checkout-state";

const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const locale = (form: FormData) => localeOf(form.get("locale"));
function errorMessage(error: unknown) {
  return error instanceof BackendApiError
    ? error.message
    : "Unable to save. Please retry.";
}
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
    revalidatePath("/", "layout");
  } catch (error) {
    next = `${destination}${destination.includes("?") ? "&" : "?"}error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(next);
}
export async function addItem(form: FormData) {
  return perform(`/${locale(form)}/cart`, async () => {
    await serverRequest("cart", {
      locale: locale(form),
      variantId: text(form, "variantId"),
      quantity: Number(text(form, "quantity")),
    });
  });
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
export async function quoteCheckout(
  _previous: CheckoutActionState,
  form: FormData,
): Promise<CheckoutActionState> {
  let id: string;
  try {
    id = resultId(await serverRequest("quotes", Object.fromEntries(form)));
  } catch (error) {
    return { error: customerError(errorMessage(error), locale(form)) };
  }
  redirect(`/${locale(form)}/checkout?quote=${encodeURIComponent(id)}`);
}
export async function placeCheckout(
  _previous: CheckoutActionState,
  form: FormData,
): Promise<CheckoutActionState> {
  let id: string;
  try {
    id = resultId(
      await serverRequest("orders", {
        ...Object.fromEntries(form),
        accepted: text(form, "accepted") === "yes",
        creditAppliedCents: Number(text(form, "creditAppliedCents") || 0),
      }),
    );
  } catch (error) {
    return { error: customerError(errorMessage(error), locale(form)) };
  }
  redirect(`/${locale(form)}/orders/${encodeURIComponent(id)}`);
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
