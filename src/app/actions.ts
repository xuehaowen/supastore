"use server";
import { dispatchOrder } from "@/application/use-cases/fulfillment/dispatch-order";
import { allowRequest } from "@/application/common/rate-limit";
import { redirect } from "next/navigation";
import { revalidateTag, revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  guestIdentity,
  customerIdentity,
  staffIdentity,
  orderToken,
  setOrderToken,
  localeOf,
} from "@/infrastructure/web";
import { addToCart } from "@/application/use-cases/cart/add-to-cart";
import { updateCartItem } from "@/application/use-cases/cart/update-cart-item";
import { getQuote } from "@/application/use-cases/get-quote";
import { createOrder } from "@/application/use-cases/create-order";
import { createManualOrder } from "@/application/use-cases/create-manual-order";
import { requestTrackingLink } from "@/application/use-cases/guest/request-tracking-link";
import { verifyTrackingLink } from "@/application/use-cases/guest/verify-tracking-link";
import {
  acceptOrderChange,
  proposeOrderChange,
} from "@/application/use-cases/order-proposals";
import { createProduct } from "@/application/use-cases/catalog/create-product";
import { updateProduct } from "@/application/use-cases/catalog/update-product";
import {
  addProductImage,
  addProductVariant,
  removeCategory,
  removeProductImage,
  removeProductVariant,
  saveCatalogTranslation as saveCatalogTranslationUseCase,
  updateCategory,
} from "@/application/use-cases/catalog/manage-catalog";
import { updateProductAvailability } from "@/application/use-cases/catalog/update-product-availability";
import {
  savePromotion,
  setPromotionActive,
} from "@/application/use-cases/promotions/manage-promotions";
import { updateStoreSettings } from "@/application/use-cases/store/update-store-settings";
import { configureShipping } from "@/application/use-cases/store/configure-shipping";
import { bootstrapOwner } from "@/application/use-cases/bootstrap-owner";
import { recordReceipt } from "@/application/use-cases/record-receipt";
import { confirmOrder } from "@/application/use-cases/confirm-order";
import { fulfillOrder } from "@/application/use-cases/fulfill-order";
import {
  completePickupHandoff,
  markReadyForPickup,
} from "@/application/use-cases/fulfillment/fulfillment-operations";
import { cancelOrder } from "@/application/use-cases/orders/cancel-order";
import {
  authorizeRefund,
  claimPayout,
  reconcilePayout,
  resolvePayoutDiscrepancy,
  closePayoutAttempt,
} from "@/application/use-cases/refund-payout";
import { authorizeSurplusReturn } from "@/application/use-cases/orders/surplus-return";
import { recordCashReceipt } from "@/application/use-cases/payments/record-cash-receipt";
import { correctReceipt } from "@/application/use-cases/payments/correct-receipt";
import { correctFulfillment } from "@/application/use-cases/fulfillment/fulfillment-operations";
import {
  updateStaffMembership,
  removeStaffMembership,
} from "@/application/use-cases/staff/manage-staff";
import { db } from "@/infrastructure/db";
import {
  paymentAccounts,
  storeSettings,
  categories,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { DomainError } from "@/application/common/errors";
import { ValiError } from "valibot";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import type { CheckoutActionState } from "@/app/checkout-state";
import {
  parseActionBoolean,
  parseActionEnum,
  parseActionDestination,
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";
const field = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
function adminReturnPath(form: FormData) {
  const requested = field(form, "returnTo");
  if (
    /^\/admin\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requested,
    )
  )
    return requested;
  return ["/admin/orders", "/admin/payments", "/admin/fulfillment"].includes(
    requested,
  )
    ? requested
    : "/admin";
}
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
  return getQuote({
    cartId: parseActionUuid(field(form, "cartId"), "Cart"),
    guestSessionId: await guestIdentity(),
    fulfillmentType: parseActionEnum(
      field(form, "fulfillmentType"),
      "Fulfillment",
      ["shipping", "pickup", "local_delivery"] as const,
    ),
    shippingAddress: {
      country: field(form, "country").toUpperCase(),
      address: field(form, "address"),
      region: field(form, "region").trim().toUpperCase(),
      postalCode: field(form, "postalCode"),
    },
    pickupDate: field(form, "pickupDate"),
    ...(field(form, "pickupLocationId")
      ? {
          pickupLocationId: parseActionUuid(
            field(form, "pickupLocationId"),
            "Pickup location",
          ),
        }
      : {}),
    pickupTime: field(form, "pickupTime"),
    ...(field(form, "deliveryAreaId")
      ? {
          deliveryAreaId: parseActionUuid(
            field(form, "deliveryAreaId"),
            "Delivery area",
          ),
        }
      : {}),
    promotionCode: field(form, "promotionCode"),
    ...(field(form, "paymentAccountId")
      ? {
          paymentAccountId: parseActionUuid(
            field(form, "paymentAccountId"),
            "Payment account",
          ),
        }
      : {}),
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
  if (locale !== "zh") return { error: message };
  const translations: Record<string, string> = {
    "Accept the final total before placing an order.":
      "请接受最终总价后再下单。",
    "Please wait a minute before retrying.": "请稍等一分钟后再试。",
    "Enter your shipping address and country.": "请填写配送地址和国家。",
    "Enter your state or region.": "请填写州或省。",
    "Enter your ZIP or postal code.": "请填写邮政编码。",
    "Enter a valid state or region code.": "请填写有效的州或省代码。",
    "Enter a valid ZIP or postal code.": "请填写有效的邮政编码。",
    "This promotion code is not active.": "此优惠码不可用。",
    "Your checkout changed or expired. Review the final total again before ordering.":
      "结账信息已变更或过期，请重新核对总价后下单。",
    "The store is currently paused. Please check back soon.":
      "商店暂时停止接单，请稍后再试。",
    "Choose a payment method for the amount remaining after store credit. Edit checkout and review again.":
      "请选择用于支付余额抵扣后剩余金额的付款方式，并重新核对订单。",
    "Choose an active payment method.": "请选择可用的付款方式。",
  };
  return {
    error:
      translations[message] ??
      "无法完成操作，请检查填写的信息后重试，或联系商店。",
  };
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
      staffUserId: await staffIdentity(),
      customerName: field(form, "customerName"),
      customerEmail: field(form, "customerEmail"),
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
  const rawId = field(form, "orderId");
  const locale = localeOf(field(form, "locale"));
  const validId = /^[0-9a-f-]{36}$/i.test(rawId);
  return perform(
    validId ? "/" + locale + "/orders/" + rawId : "/recover",
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
      precision: parseActionInteger(
        field(form, "precision"),
        "Decimal places",
        0,
        4,
      ),
      defaultLocale: parseActionEnum(
        field(form, "defaultLocale"),
        "Default language",
        ["en", "zh"] as const,
      ),
      timezone: field(form, "timezone"),
      taxRateBasisPoints: parseActionInteger(
        field(form, "taxRate"),
        "Tax rate",
        0,
        10000,
      ),
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
          ...(field(form, "zoneId")
            ? { id: parseActionUuid(field(form, "zoneId"), "Shipping zone") }
            : {}),
          name: field(form, "zoneName"),
          sortOrder: field(form, "sortOrder")
            ? parseActionInteger(
                field(form, "sortOrder"),
                "Shipping priority",
                0,
                2147483647,
              )
            : 0,
          regionCodes: field(form, "regions")
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          postalPrefixes: field(form, "postalPrefixes")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          countryCodes: field(form, "countries")
            ? field(form, "countries")
                .split(",")
                .map((s) => s.trim().toUpperCase())
            : null,
          rateCents: parseActionInteger(
            field(form, "rate"),
            "Shipping rate",
            0,
            2147483647,
          ),
          freeThresholdCents: field(form, "freeThreshold")
            ? parseActionInteger(
                field(form, "freeThreshold"),
                "Free shipping threshold",
                0,
                2147483647,
              )
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
        ...(field(form, "pickupLocationId")
          ? {
              id: parseActionUuid(
                field(form, "pickupLocationId"),
                "Pickup location",
              ),
            }
          : {}),
        name: field(form, "name"),
        address: field(form, "address"),
        weeklySchedule: schedule,
        slotCapacity: field(form, "slotCapacity")
          ? parseActionInteger(
              field(form, "slotCapacity"),
              "Slot capacity",
              0,
              2147483647,
            )
          : null,
        scheduleRequired: form.has("scheduleRequired"),
        prepMinutes: parseActionInteger(
          field(form, "prepMinutes"),
          "Preparation notice",
          0,
          2147483647,
        ),
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
      const id = field(form, "id")
        ? parseActionUuid(field(form, "id"), "Payment account")
        : "";
      if (id && field(form, "mode") === "edit")
        await tx
          .update(paymentAccounts)
          .set({
            accountName: parseActionRequiredText(
              field(form, "name"),
              "Payment method name",
              120,
            ),
            accountIdentifier: parseActionRequiredText(
              field(form, "instructions"),
              "Payment instructions",
              2000,
            ),
            accountType: parseActionEnum(
              field(form, "accountType"),
              "Payment method type",
              ["cash", "zelle", "venmo", "other"] as const,
            ),
            updatedAt: new Date(),
          })
          .where(eq(paymentAccounts.id, id));
      else if (id)
        await tx
          .update(paymentAccounts)
          .set({
            isActive: parseActionBoolean(field(form, "active"), "Active"),
          })
          .where(eq(paymentAccounts.id, id));
      else
        await tx.insert(paymentAccounts).values({
          accountName: parseActionRequiredText(
            field(form, "name"),
            "Payment method name",
            120,
          ),
          accountIdentifier: parseActionRequiredText(
            field(form, "instructions"),
            "Payment instructions",
            2000,
          ),
          accountType: parseActionEnum(
            field(form, "accountType") || "other",
            "Payment method type",
            ["cash", "zelle", "venmo", "other"] as const,
          ),
        });
    });
  });
}
export async function togglePause(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await updateStoreSettings({
      staffUserId: await staffIdentity(),
      isPaused: parseActionBoolean(field(form, "paused"), "Paused"),
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
        {
          length: parseActionInteger(
            field(form, "variantCount"),
            "Variant count",
            1,
            50,
          ),
        },
        (_, i) => ({
          sku: field(form, "sku-" + i),
          title: field(form, "variantTitle-" + i),
          priceCents: parseActionInteger(
            field(form, "price-" + i),
            "Variant price",
            0,
            2_147_483_647,
          ),
          attributes: {
            color: field(form, "color-" + i),
            size: field(form, "size-" + i),
          },
        }),
      ),
      translations: [],
      images: field(form, "imageKey")
        ? [{ s3Key: field(form, "imageKey"), altText: field(form, "title") }]
        : [],
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function editProduct(form: FormData) {
  const rawId = field(form, "productId");
  const path = /^[0-9a-f-]{36}$/i.test(rawId)
    ? `/admin/products/${rawId}/edit`
    : "/admin/products";
  return perform(path, async () => {
    const productId = await updateProduct({
      staffUserId: await staffIdentity(),
      productId: parseActionUuid(rawId, "Product"),
      quoteVersion: parseActionInteger(
        field(form, "quoteVersion"),
        "Product version",
        1,
        2147483647,
      ),
      taxable: form.has("taxable"),
      rewardEligible: form.has("rewardEligible"),
      title: field(form, "title"),
      handle: field(form, "handle"),
      description: field(form, "description"),
      categoryIds: form.getAll("categoryIds").map(String),
      variants: Array.from(
        {
          length: parseActionInteger(
            field(form, "variantCount"),
            "Variant count",
            1,
            50,
          ),
        },
        (_, i) => ({
          id: parseActionUuid(field(form, `variantId-${i}`), "Variant"),
          title: field(form, `variantTitle-${i}`),
          sku: field(form, `sku-${i}`),
          priceCents: parseActionInteger(
            field(form, `price-${i}`),
            "Variant price",
            0,
            2147483647,
          ),
        }),
      ),
      images: Array.from(
        {
          length: parseActionInteger(
            field(form, "imageCount"),
            "Image count",
            0,
            100,
          ),
        },
        (_, i) => ({
          id: parseActionUuid(field(form, `imageId-${i}`), "Image"),
          s3Key: field(form, `imageKey-${i}`),
          altText: field(form, `imageAlt-${i}`),
          ...(field(form, `imageSortOrder-${i}`)
            ? {
                sortOrder: parseActionInteger(
                  field(form, `imageSortOrder-${i}`),
                  "Image position",
                  0,
                  1000000,
                ),
              }
            : {}),
        }),
      ),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    revalidatePath("/admin/products", "layout");
    revalidatePath("/admin/translations");
    return `/admin/products/${productId}/edit?saved=true`;
  });
}
export async function createProductVariant(form: FormData) {
  const productId = parseActionUuid(field(form, "productId"), "Product");
  return perform(`/admin/products/${productId}/edit`, async () => {
    await addProductVariant({
      staffUserId: await staffIdentity(),
      productId,
      title: field(form, "title"),
      sku: field(form, "sku"),
      priceCents: parseActionInteger(
        field(form, "price"),
        "Variant price",
        0,
        2147483647,
      ),
      color: field(form, "color"),
      size: field(form, "size"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/products/${productId}/edit?added=variant`;
  });
}
export async function deleteProductVariant(form: FormData) {
  const productId = parseActionUuid(field(form, "productId"), "Product");
  return perform(`/admin/products/${productId}/edit`, async () => {
    const result = await removeProductVariant({
      staffUserId: await staffIdentity(),
      productId,
      variantId: parseActionUuid(field(form, "variantId"), "Variant"),
      reason: field(form, "reason"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/products/${productId}/edit?removed=${result}`;
  });
}
export async function createProductImage(form: FormData) {
  const productId = parseActionUuid(field(form, "productId"), "Product");
  return perform(`/admin/products/${productId}/edit`, async () => {
    await addProductImage({
      staffUserId: await staffIdentity(),
      productId,
      s3Key: field(form, "s3Key"),
      altText: field(form, "altText"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/products/${productId}/edit?added=image`;
  });
}
export async function deleteProductImage(form: FormData) {
  const productId = parseActionUuid(field(form, "productId"), "Product");
  return perform(`/admin/products/${productId}/edit`, async () => {
    await removeProductImage({
      staffUserId: await staffIdentity(),
      productId,
      imageId: parseActionUuid(field(form, "imageId"), "Image"),
      reason: field(form, "reason"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/products/${productId}/edit?removed=image`;
  });
}
export async function editCategory(form: FormData) {
  return perform("/admin/categories", async () => {
    const parentId = field(form, "parentId");
    await updateCategory({
      staffUserId: await staffIdentity(),
      categoryId: parseActionUuid(field(form, "categoryId"), "Category"),
      name: field(form, "name"),
      slug: field(form, "slug"),
      ...(parentId ? { parentId } : {}),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function deleteCategory(form: FormData) {
  return perform("/admin/categories", async () => {
    await removeCategory({
      staffUserId: await staffIdentity(),
      categoryId: parseActionUuid(field(form, "categoryId"), "Category"),
      reason: field(form, "reason"),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function saveCatalogTranslation(form: FormData) {
  return perform("/admin/translations", async () => {
    const staff = await staffIdentity();
    const entityType = parseActionEnum(
      field(form, "entityType"),
      "Translation entity",
      ["product", "category", "variant"] as const,
    );
    const entityId = parseActionUuid(
      field(form, "entityId"),
      "Translation entity",
    );
    const locale = parseActionEnum(field(form, "translationLocale"), "Locale", [
      "en",
      "zh",
    ] as const);
    const title = parseActionRequiredText(
      field(form, "title"),
      "Translated text",
      200,
    );
    const description = field(form, "description");
    await saveCatalogTranslationUseCase({
      staffUserId: staff,
      entityType,
      entityId,
      locale,
      title,
      ...(description ? { description } : {}),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return `/admin/translations?locale=${locale}`;
  });
}
export async function upsertPromotion(form: FormData) {
  return perform("/admin/promotions", async () => {
    const startsAt = field(form, "startsAt");
    const endsAt = field(form, "endsAt");
    const parseDate = (value: string, label: string) => {
      if (!value) return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime()))
        throw new DomainError(`${label} is invalid.`);
      return date;
    };
    const usageLimit = field(form, "usageLimit");
    const id = field(form, "id");
    await savePromotion({
      staffUserId: await staffIdentity(),
      ...(id ? { id: parseActionUuid(id, "Promotion") } : {}),
      code: field(form, "code"),
      name: field(form, "name"),
      discountType: parseActionEnum(
        field(form, "discountType"),
        "Discount type",
        ["percentage", "fixed"] as const,
      ),
      discountValue: parseActionInteger(
        field(form, "discountValue"),
        "Discount value",
        1,
        2147483647,
      ),
      minimumSubtotalCents: parseActionInteger(
        field(form, "minimumSubtotal"),
        "Minimum subtotal",
        0,
        2147483647,
      ),
      ...(usageLimit
        ? {
            usageLimit: parseActionInteger(
              usageLimit,
              "Usage limit",
              1,
              2147483647,
            ),
          }
        : {}),
      isActive: form.has("active"),
      ...(startsAt ? { startsAt: parseDate(startsAt, "Start date")! } : {}),
      ...(endsAt ? { endsAt: parseDate(endsAt, "End date")! } : {}),
    });
  });
}
export async function togglePromotion(form: FormData) {
  return perform("/admin/promotions", async () => {
    await setPromotionActive({
      staffUserId: await staffIdentity(),
      id: parseActionUuid(field(form, "promotionId"), "Promotion"),
      isActive: parseActionBoolean(field(form, "active"), "Active"),
    });
  });
}
export async function toggleAvailability(form: FormData) {
  return perform("/admin/products", async () => {
    await updateProductAvailability({
      staffUserId: await staffIdentity(),
      ...(field(form, "productId")
        ? {
            productId: parseActionUuid(field(form, "productId"), "Product"),
            isPublished: parseActionBoolean(
              field(form, "published"),
              "Published",
            ),
          }
        : {
            variantId: parseActionUuid(field(form, "variantId"), "Variant"),
            isAvailable: parseActionBoolean(
              field(form, "available"),
              "Available",
            ),
          }),
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
export async function proposeChange(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await proposeOrderChange({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      totalCents: parseActionInteger(
        field(form, "total"),
        "Proposed total",
        0,
        2147483647,
      ),
      reason: field(form, "reason"),
    });
  });
}
export async function receivePayment(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    if (!form.has("verified"))
      throw new DomainError(
        "Verify the receiving account against the actual payment.",
      );
    await recordReceipt({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      paymentAccountId: parseActionUuid(
        field(form, "accountId"),
        "Payment account",
      ),
      amountCents: parseActionInteger(
        field(form, "amount"),
        "Received amount",
        1,
        2147483647,
      ),
      rawReference: field(form, "reference"),
    });
  });
}
export async function confirmPayment(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await confirmOrder({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
    });
  });
}

export async function fulfillConfirmedOrder(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await fulfillOrder({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      ...(field(form, "carrier") ? { carrier: field(form, "carrier") } : {}),
      ...(field(form, "trackingNumber")
        ? { trackingNumber: field(form, "trackingNumber") }
        : {}),
    });
  });
}
export async function dispatchConfirmedOrder(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await dispatchOrder({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      carrier: field(form, "carrier"),
      ...(field(form, "trackingNumber")
        ? { trackingNumber: field(form, "trackingNumber") }
        : {}),
    });
  });
}
export async function markOrderReady(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await markReadyForPickup({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
    });
  });
}

export async function completeOrderPickup(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    const verificationMethod = parseActionEnum(
      field(form, "verificationMethod"),
      "Verification method",
      ["scoped_order_page", "owner_assisted"] as const,
    );
    await completePickupHandoff({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      handoffActor: field(form, "handoffActor"),
      verificationMethod,
    });
  });
}

export async function cancelAdminOrder(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await cancelOrder({
      actorUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      reason: field(form, "reason"),
      isCustomerRequest: form.has("customerRequest"),
    });
  });
}

export async function authorizeOrderRefund(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await authorizeRefund({
      ownerUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      receiptId: parseActionUuid(field(form, "receiptId"), "Receipt"),
      amountCents: parseActionInteger(
        field(form, "amount"),
        "Refund amount",
        1,
        2_147_483_647,
      ),
      reason: field(form, "reason"),
    });
  });
}

export async function authorizeOrderSurplusReturn(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await authorizeSurplusReturn({
      ownerUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      receiptId: parseActionUuid(field(form, "receiptId"), "Receipt"),
      amountCents: parseActionInteger(
        field(form, "amount"),
        "Return amount",
        1,
        2_147_483_647,
      ),
      ...(field(form, "reason") ? { reason: field(form, "reason") } : {}),
    });
  });
}

export async function receiveCashPayment(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await recordCashReceipt({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      paymentAccountId: parseActionUuid(
        field(form, "accountId"),
        "Payment account",
      ),
      amountCents: parseActionInteger(
        field(form, "amount"),
        "Cash amount",
        1,
        2_147_483_647,
      ),
      tenderedAmountCents: parseActionInteger(
        field(form, "tenderedAmount"),
        "Tendered amount",
        1,
        2_147_483_647,
      ),
      ...(field(form, "payerName")
        ? { payerName: field(form, "payerName") }
        : {}),
    });
  });
}

export async function correctRecordedReceipt(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await correctReceipt({
      ownerUserId: await staffIdentity(),
      receiptId: parseActionUuid(field(form, "receiptId"), "Receipt"),
      deltaAmountCents: parseActionInteger(
        field(form, "delta"),
        "Correction delta",
        -2_147_483_648,
        2_147_483_647,
      ),
      reason: field(form, "reason"),
      ...(field(form, "notes")
        ? { investigationNotes: field(form, "notes") }
        : {}),
    });
  });
}

export async function correctOrderFulfillment(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await correctFulfillment({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      ...(field(form, "carrier") ? { carrier: field(form, "carrier") } : {}),
      ...(field(form, "trackingNumber")
        ? { trackingNumber: field(form, "trackingNumber") }
        : {}),
      reason: field(form, "reason"),
    });
  });
}

export async function claimOrderPayout(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await claimPayout({
      ownerUserId: await staffIdentity(),
      allocationId: parseActionUuid(
        field(form, "allocationId"),
        "Payout allocation",
      ),
      claimedAmountCents: parseActionInteger(
        field(form, "amount"),
        "Claim amount",
        1,
        2_147_483_647,
      ),
      destination: parseActionDestination(
        field(form, "destinationType"),
        field(form, "destination"),
      ),
    });
  });
}

export async function reconcileOrderPayout(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await reconcilePayout({
      ownerUserId: await staffIdentity(),
      attemptId: parseActionUuid(field(form, "attemptId"), "Payout attempt"),
      actualAmountCents: parseActionInteger(
        field(form, "actualAmount"),
        "Actual payout amount",
        1,
        2_147_483_647,
      ),
      transferReference: field(form, "transferReference"),
      actualDestination: parseActionDestination(
        field(form, "destinationType"),
        field(form, "destination"),
      ),
    });
  });
}

export async function resolveOrderPayoutDiscrepancy(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await resolvePayoutDiscrepancy({
      ownerUserId: await staffIdentity(),
      discrepancyId: parseActionUuid(
        field(form, "discrepancyId"),
        "Payout discrepancy",
      ),
      writeOffCents: parseActionInteger(
        field(form, "writeOff"),
        "Write-off amount",
        0,
        2_147_483_647,
      ),
      resolutionReason: field(form, "reason"),
    });
  });
}

export async function closeOrderPayoutAttempt(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await closePayoutAttempt({
      ownerUserId: await staffIdentity(),
      attemptId: parseActionUuid(field(form, "attemptId"), "Payout attempt"),
      reason: field(form, "reason"),
    });
  });
}

export async function updateStaffMember(form: FormData) {
  return perform("/admin/setup", async () => {
    await updateStaffMembership({
      actorUserId: await staffIdentity(),
      targetUserId: parseActionRequiredText(
        field(form, "targetUserId"),
        "Staff user",
        200,
      ),
      role: parseActionEnum(field(form, "role"), "Staff role", [
        "owner",
        "staff",
      ] as const),
      isActive: parseActionBoolean(field(form, "active"), "Active"),
    });
  });
}

export async function removeStaffMember(form: FormData) {
  return perform("/admin/setup", async () => {
    await removeStaffMembership({
      actorUserId: await staffIdentity(),
      targetUserId: parseActionRequiredText(
        field(form, "targetUserId"),
        "Staff user",
        200,
      ),
    });
  });
}

export async function sendVerification() {
  return perform("/admin/setup", async () => {
    const { requestEmailVerification } =
      await import("@/application/use-cases/store/verify-email");
    const { getNotificationProviders } =
      await import("@/infrastructure/bootstrap/notification-providers");
    const { trackInFlight } = await import("@/infrastructure/runtime/shutdown");
    const identity = await staffIdentity();
    await trackInFlight(() =>
      requestEmailVerification(identity, getNotificationProviders().email),
    );
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
  return perform("/admin/categories", async () => {
    const staff = await staffIdentity();
    const slug = field(form, "slug");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !field(form, "name"))
      throw new DomainError("Enter a category name and valid URL handle.");
    await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff, "owner");
      await tx.insert(categories).values({
        name: field(form, "name"),
        slug,
        parentId: field(form, "parentId")
          ? parseActionUuid(field(form, "parentId"), "Parent category")
          : null,
      });
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
