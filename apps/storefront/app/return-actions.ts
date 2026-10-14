"use server";
import { redirect } from "next/navigation";
import { serverRequest } from "../lib/server-request";
import { BackendApiError } from "../lib/api";
import { localeOf } from "../lib/web";
export async function requestReturnAction(form: FormData) {
  const id = String(form.get("orderId") || "");
  const locale = localeOf(form.get("locale"));
  let path = `/${locale}/orders/${encodeURIComponent(id)}`;
  try {
    await serverRequest(`orders/${encodeURIComponent(id)}/returns`, {
      requestKey: form.get("requestKey"),
      reason: form.get("reason"),
      items: form
        .getAll("itemIds")
        .map((value) => ({
          orderItemId: String(value),
          quantity: Number(form.get(`quantity.${value}`) || 0),
        }))
        .filter((item) => item.quantity > 0),
    });
    path += "?saved=1";
  } catch (error) {
    path += `?error=${encodeURIComponent(error instanceof BackendApiError ? error.message : "Unable to save return.")}`;
  }
  redirect(path);
}
