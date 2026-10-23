"use server";
import {
  parseActionBoolean,
  parseActionEnum,
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";
import { bootstrapOwner } from "@/application/use-cases/bootstrap-owner";
import { savePaymentAccount } from "@/application/use-cases/payments/save-payment-account";
import { configureShipping } from "@/application/use-cases/store/configure-shipping";
import { updateStoreSettings } from "@/application/use-cases/store/update-store-settings";
import { staffIdentity } from "@/infrastructure/web";
import { revalidatePath, revalidateTag } from "next/cache";
import { adminReturnPath, field, perform } from "./common";
import { validateDeliverySchedule } from "@/domain/delivery";
import { DomainError } from "@/application/common/errors";
export async function setupOwner(form: FormData) {
  return perform("/admin/setup", async () => {
    const userId = await staffIdentity();
    const { staffAuth } = await import("@/infrastructure/auth");
    const { headers } = await import("next/headers");
    const session = await staffAuth.api.getSession({
      headers: await headers(),
    });
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
    if (field(form, "weeklySchedule").length > 12000)
      throw new DomainError("Weekly schedule is too large.");
    const schedule = form.has("weeklySchedule")
      ? validateDeliverySchedule(
          JSON.parse(field(form, "weeklySchedule") || "{}"),
        )
      : (Object.fromEntries(
          form
            .getAll("days")
            .map((day) => [
              String(day),
              [[field(form, "startTime"), field(form, "endTime")]],
            ]),
        ) as Record<string, [string, string][]>);
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
    await savePaymentAccount({
      staffUserId: await staffIdentity(),
      id: field(form, "id"),
      mode: field(form, "mode"),
      name: field(form, "name"),
      instructions: field(form, "instructions"),
      accountType: field(form, "accountType"),
      active: field(form, "active"),
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

export async function saveStorefrontHero(form: FormData) {
  return perform("/admin/setup", async () => {
    const en = {
      heading: field(form, "hero-en-heading"),
      body: field(form, "hero-en-body"),
      imageAlt: field(form, "hero-en-imageAlt"),
    };
    const zh = {
      heading: field(form, "hero-zh-heading"),
      body: field(form, "hero-zh-body"),
      imageAlt: field(form, "hero-zh-imageAlt"),
    };
    const imageKey = field(form, "heroImageKey") || null;
    const featuredProductIds = form
      .getAll("featuredProductId")
      .map(String)
      .filter(Boolean);
    const featuredCollectionIds = form
      .getAll("featuredCollectionId")
      .map(String)
      .filter(Boolean);
    await updateStoreSettings({
      staffUserId: await staffIdentity(),
      storefrontHero:
        imageKey ||
        featuredProductIds.length ||
        featuredCollectionIds.length ||
        Object.values(en).some(Boolean) ||
        Object.values(zh).some(Boolean)
          ? {
              imageKey,
              en,
              zh,
              imagePosition: parseActionEnum(
                field(form, "heroImagePosition") || "center",
                "Photograph crop",
                ["top", "center", "bottom"] as const,
              ),
              featuredProductIds,
              featuredCollectionIds,
            }
          : null,
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
  });
}
