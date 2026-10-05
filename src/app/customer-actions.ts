"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  customerIdentity,
  orderToken,
  setOrderToken,
  localeOf,
} from "@/infrastructure/web";
import {
  claimGuestOrder,
  openOwnedOrder,
  saveCustomerAddress,
} from "@/application/use-cases/customers/customer-ownership";
import { DomainError } from "@/application/common/errors";
const text = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
async function perform(path: string, work: () => Promise<void>) {
  let destination = path;
  try {
    await work();
    revalidatePath("/[locale]/account", "page");
  } catch (e) {
    destination = `${path}?error=${encodeURIComponent(e instanceof DomainError ? e.message : "Unable to save. Please retry.")}`;
  }
  redirect(destination);
}
export async function claimOrderAction(form: FormData) {
  const locale = localeOf(form.get("locale"));
  return perform(`/${locale}/account`, async () => {
    const orderId = text(form, "orderId");
    await claimGuestOrder({
      userId: await customerIdentity(),
      orderId,
      token: await orderToken(orderId),
    });
  });
}
export async function openOwnedOrderAction(form: FormData) {
  const locale = localeOf(form.get("locale"));
  const id = text(form, "orderId");
  let destination = `/${locale}/account`;
  try {
    const proof = await openOwnedOrder(await customerIdentity(), id);
    await setOrderToken(id, proof.rawToken);
    destination = `/${locale}/orders/${id}`;
  } catch (e) {
    destination += `?error=${encodeURIComponent(e instanceof DomainError ? e.message : "Unable to open order.")}`;
  }
  redirect(destination);
}
export async function saveAddressAction(form: FormData) {
  const locale = localeOf(form.get("locale"));
  return perform(`/${locale}/account`, async () => {
    await saveCustomerAddress({
      userId: await customerIdentity(),
      ...(text(form, "id") ? { id: text(form, "id") } : {}),
      label: text(form, "label"),
      remove: form.has("remove"),
      address: Object.fromEntries(
        [
          "name",
          "line1",
          "line2",
          "city",
          "region",
          "postalCode",
          "country",
          "phone",
        ].map((key) => [key, text(form, key)]),
      ),
    });
  });
}
