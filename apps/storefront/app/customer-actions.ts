"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverRequest } from "../lib/server-request";
import { BackendApiError } from "../lib/api";
import { localeOf } from "../lib/web";
const text = (form: FormData, key: string) =>
  String(form.get(key) || "").trim();
async function perform(
  form: FormData,
  path: string,
  body: Record<string, unknown>,
  method = "POST",
  open = false,
) {
  const locale = localeOf(form.get("locale"));
  let destination = `/${locale}/account`;
  try {
    await serverRequest(path, body, method);
    revalidatePath("/", "layout");
    if (open)
      destination = `/${locale}/orders/${encodeURIComponent(text(form, "orderId"))}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof BackendApiError ? error.message : "Unable to save. Please retry.")}`;
  }
  redirect(destination);
}
export async function saveProfileAction(form: FormData) {
  await serverRequest(
    "account",
    { name: text(form, "name"), phone: text(form, "phone") },
    "PATCH",
  );
  revalidatePath("/", "layout");
}
export async function saveAddressAction(form: FormData) {
  return perform(form, "account/addresses", {
    ...Object.fromEntries(form),
    remove: form.has("remove"),
  });
}
export async function claimOrderAction(form: FormData) {
  return perform(
    form,
    "account/orders",
    { orderId: text(form, "orderId") },
    "PUT",
  );
}
export async function openOwnedOrderAction(form: FormData) {
  return perform(
    form,
    "account/orders",
    { orderId: text(form, "orderId") },
    "POST",
    true,
  );
}
