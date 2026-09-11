"use server";
import { allowRequest } from "@/application/common/rate-limit";
import { redirect } from "next/navigation";
import { revalidateTag, revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  guestIdentity,
  staffIdentity,
  orderToken,
  setOrderToken,
  localeOf,
} from "@/infrastructure/web";
import { addToCart } from "@/application/use-cases/cart/add-to-cart";
import { updateCartItem } from "@/application/use-cases/cart/update-cart-item";
import { getQuote } from "@/application/use-cases/get-quote";
import { createOrder } from "@/application/use-cases/create-order";
import { requestTrackingLink } from "@/application/use-cases/guest/request-tracking-link";
import { verifyTrackingLink } from "@/application/use-cases/guest/verify-tracking-link";
import {
  acceptOrderChange,
  proposeOrderChange,
} from "@/application/use-cases/order-proposals";
import { createProduct } from "@/application/use-cases/catalog/create-product";
import { updateProductAvailability } from "@/application/use-cases/catalog/update-product-availability";
import { updateStoreSettings } from "@/application/use-cases/store/update-store-settings";
import { configureShipping } from "@/application/use-cases/store/configure-shipping";
import { bootstrapOwner } from "@/application/use-cases/bootstrap-owner";
import { recordReceipt } from "@/application/use-cases/record-receipt";
import { confirmOrder } from "@/application/use-cases/confirm-order";
import { fulfillOrder } from "@/application/use-cases/fulfill-order";
import { db } from "@/infrastructure/db";
import {
  paymentAccounts,
  storeSettings,
  categories,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { DomainError } from "@/application/common/errors";
import { ValiError } from "valibot";
const field = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
async function perform(
  path: string,
  work: () => Promise<string | void>,
): Promise<never> {
  let destination = path;
  try {
    destination = (await work()) || path;
  } catch (error) {
    destination =
      path +
      (path.includes("?") ? "&" : "?") +
      "error=" +
      encodeURIComponent(
        error instanceof DomainError || error instanceof ValiError
          ? error.message
          : "Unable to save. Check your entries and try again.",
      );
  }
  redirect(destination);
}
export async function addItem(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform("/" + locale + "/cart", async () => {
    await addToCart({
      guestSessionId: await guestIdentity(true),
      variantId: field(form, "variantId"),
      quantity: Number(field(form, "quantity")),
      locale,
    });
  });
}
export async function changeItem(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform("/" + locale + "/cart", async () => {
    await updateCartItem({
      guestSessionId: await guestIdentity(),
      itemId: field(form, "itemId"),
      quantity: Number(field(form, "quantity")),
      locale,
    });
  });
}
export async function quoteCart(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform("/" + locale + "/checkout", async () => {
    const quote = await getQuote({
      cartId: field(form, "cartId"),
      guestSessionId: await guestIdentity(),
      fulfillmentType:
        field(form, "fulfillmentType") === "pickup" ? "pickup" : "shipping",
      shippingAddress: {
        country: field(form, "country").toUpperCase(),
        address: field(form, "address"),
      },
      pickupDate: field(form, "pickupDate"),
      pickupTime: field(form, "pickupTime"),
      paymentAccountId: field(form, "paymentAccountId"),
    });
    return "/" + locale + "/checkout?quote=" + quote.id;
  });
}
export async function placeOrder(form: FormData) {
  const locale = localeOf(field(form, "locale"));
  return perform("/" + locale + "/checkout", async () => {
    if (field(form, "accepted") !== "yes")
      throw new DomainError("Accept the quoted total before placing an order.");
    if (!allowRequest("checkout:" + (await guestIdentity()), 20))
      throw new DomainError("Please wait a minute before retrying.");
    const order = await createOrder({
      quoteId: field(form, "quoteId"),
      guestSessionId: await guestIdentity(),
      guestName: field(form, "name"),
      guestEmail: field(form, "email"),
    });
    await setOrderToken(order.id, order.sessionToken);
    return "/" + locale + "/orders/" + order.id;
  });
}
export async function recoverOrder(form: FormData) {
  return perform("/recover", async () => {
    await requestTrackingLink({
      email: field(form, "email"),
      referenceCode: field(form, "reference"),
    });
    return "/recover?sent=1";
  });
}
export async function exchangeLink(form: FormData) {
  return perform("/recover", async () => {
    const result = await verifyTrackingLink({
      recoveryToken: field(form, "token"),
    });
    await setOrderToken(result.orderId, result.sessionToken);
    return "/en/orders/" + result.orderId;
  });
}
export async function acceptProposal(form: FormData) {
  const id = field(form, "orderId");
  return perform(
    "/" + localeOf(field(form, "locale")) + "/orders/" + id,
    async () => {
      await acceptOrderChange({
        orderId: id,
        proposalId: field(form, "proposalId"),
        sessionToken: await orderToken(id),
      });
    },
  );
}
export async function setupOwner(form: FormData) {
  return perform("/admin/setup", async () => {
    const userId = await staffIdentity();
    const { auth } = await import("@/infrastructure/auth");
    const { headers } = await import("next/headers");
    const session = await auth.api.getSession({ headers: await headers() });
    await bootstrapOwner({
      adminSetupSecret: field(form, "secret"),
      storeName: field(form, "storeName"),
      ownerUserId: userId,
      ownerEmail: session!.user.email,
    });
  });
}
export async function saveSettings(form: FormData) {
  return perform("/admin/setup", async () => {
    await updateStoreSettings({
      staffUserId: await staffIdentity(),
      storeName: field(form, "storeName"),
      supportEmail: field(form, "supportEmail"),
      currency: field(form, "currency"),
      precision: Number(field(form, "precision")),
      defaultLocale: localeOf(field(form, "defaultLocale")),
      timezone: field(form, "timezone"),
      taxRateBasisPoints: Number(field(form, "taxRate")),
      isTaxInclusive: form.has("taxInclusive"),
      logoKey: field(form, "logoKey"),
      setupCompleted: true,
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function saveShipping(form: FormData) {
  return perform("/admin/setup", async () => {
    await configureShipping({
      staffUserId: await staffIdentity(),
      zones: [
        {
          name: field(form, "zoneName"),
          countryCodes: field(form, "countries")
            ? field(form, "countries")
                .split(",")
                .map((s) => s.trim().toUpperCase())
            : null,
          rateCents: Number(field(form, "rate")),
          freeThresholdCents: field(form, "freeThreshold")
            ? Number(field(form, "freeThreshold"))
            : null,
        },
      ],
    });
  });
}
export async function savePickup(form: FormData) {
  return perform("/admin/setup", async () => {
    const schedule = Object.fromEntries(
      form
        .getAll("days")
        .map((day) => [
          String(day),
          [[field(form, "startTime"), field(form, "endTime")]],
        ]),
    ) as Record<string, [string, string][]>;
    await configureShipping({
      staffUserId: await staffIdentity(),
      pickup: {
        name: field(form, "name"),
        address: field(form, "address"),
        weeklySchedule: schedule,
        prepMinutes: Number(field(form, "prepMinutes")),
      },
    });
  });
}
export async function savePayment(form: FormData) {
  return perform("/admin/setup", async () => {
    const staff = await staffIdentity();
    await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff, "owner");
      await tx.select().from(storeSettings).for("update");
      const id = field(form, "id");
      if (id)
        await tx
          .update(paymentAccounts)
          .set({ isActive: field(form, "active") === "true" })
          .where(eq(paymentAccounts.id, id));
      else if (field(form, "name") && field(form, "instructions"))
        await tx
          .insert(paymentAccounts)
          .values({
            accountName: field(form, "name"),
            accountIdentifier: field(form, "instructions"),
          });
    });
  });
}
export async function togglePause(form: FormData) {
  return perform("/admin", async () => {
    await updateStoreSettings({
      staffUserId: await staffIdentity(),
      isPaused: field(form, "paused") === "true",
      pauseMessage: field(form, "message") || "Store is currently paused.",
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function saveProduct(form: FormData) {
  return perform("/admin/products", async () => {
    await createProduct({
      staffUserId: await staffIdentity(),
      handle: field(form, "handle"),
      title: field(form, "title"),
      description: field(form, "description"),
      categoryIds: form.getAll("categoryIds").map(String),
      variants: Array.from(
        { length: Math.min(50, Number(field(form, "variantCount")) || 1) },
        (_, i) => ({
          sku: field(form, "sku-" + i),
          title: field(form, "variantTitle-" + i),
          priceCents: Number(field(form, "price-" + i)),
          attributes: {
            color: field(form, "color-" + i),
            size: field(form, "size-" + i),
          },
        }),
      ),
      translations: field(form, "zhTitle")
        ? [
            {
              locale: "zh",
              title: field(form, "zhTitle"),
              description: field(form, "zhDescription"),
            },
          ]
        : [],
      images: field(form, "imageKey")
        ? [{ s3Key: field(form, "imageKey"), altText: field(form, "title") }]
        : [],
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function toggleAvailability(form: FormData) {
  return perform("/admin/products", async () => {
    await updateProductAvailability({
      staffUserId: await staffIdentity(),
      ...(field(form, "productId")
        ? {
            productId: field(form, "productId"),
            isPublished: field(form, "published") === "true",
          }
        : {
            variantId: field(form, "variantId"),
            isAvailable: field(form, "available") === "true",
          }),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function proposeChange(form: FormData) {
  return perform("/admin", async () => {
    await proposeOrderChange({
      staffUserId: await staffIdentity(),
      orderId: field(form, "orderId"),
      totalCents: Number(field(form, "total")),
      reason: field(form, "reason"),
    });
  });
}
export async function receivePayment(form: FormData) {
  return perform("/admin", async () => {
    if (!form.has("verified"))
      throw new DomainError(
        "Verify the receiving account against the actual payment.",
      );
    await recordReceipt({
      staffUserId: await staffIdentity(),
      orderId: field(form, "orderId"),
      paymentAccountId: field(form, "accountId"),
      amountCents: Number(field(form, "amount")),
      rawReference: field(form, "reference"),
    });
  });
}
export async function confirmPayment(form: FormData) {
  return perform("/admin", async () => {
    await confirmOrder({
      staffUserId: await staffIdentity(),
      orderId: field(form, "orderId"),
    });
  });
}

export async function sendVerification() {
  return perform("/admin/setup", async () => {
    const { requestEmailVerification } =
      await import("@/application/use-cases/store/verify-email");
    await requestEmailVerification(await staffIdentity());
    return "/admin/setup?sent=1";
  });
}
export async function verifyEmail(form: FormData) {
  return perform("/admin/setup", async () => {
    const { verifyEmailDelivery } =
      await import("@/application/use-cases/store/verify-email");
    await verifyEmailDelivery(await staffIdentity(), field(form, "token"));
  });
}

export async function saveCategory(form: FormData) {
  return perform("/admin/products", async () => {
    const staff = await staffIdentity();
    const slug = field(form, "slug");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !field(form, "name"))
      throw new DomainError("Enter a category name and valid URL handle.");
    await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff, "owner");
      await tx
        .insert(categories)
        .values({
          name: field(form, "name"),
          slug,
          parentId: field(form, "parentId") || null,
        });
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
