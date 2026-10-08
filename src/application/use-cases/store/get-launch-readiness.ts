import { and, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import type { Transaction } from "@/application/common/transaction";
import {
  storeSettings,
  products,
  productVariants,
  paymentAccounts,
  shippingZones,
  pickupLocation,
  deliveryAreas,
} from "@/infrastructure/db/schema";
import { commercePolicy } from "@/domain/commerce-policy";
import { stripeConfiguredFor } from "@/domain/stripe-currency";
export async function getLaunchReadiness(tx: Transaction | typeof db = db) {
  const [settings] = await tx.select().from(storeSettings).limit(1);
  const available = await tx
    .select({ id: products.id })
    .from(products)
    .innerJoin(productVariants, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(products.isPublished, true),
        eq(productVariants.isAvailable, true),
      ),
    )
    .limit(1);
  const accounts = await tx
    .select()
    .from(paymentAccounts)
    .where(eq(paymentAccounts.isActive, true));
  const zones = await tx.select().from(shippingZones);
  const locations = await tx.select().from(pickupLocation);
  const areas = await tx
    .select()
    .from(deliveryAreas)
    .where(eq(deliveryAreas.isActive, true));
  const policy = commercePolicy(settings?.commercePolicy);
  const checklist = [
    {
      key: "settings",
      label: "Store profile complete",
      isReady: !!settings?.setupCompleted,
    },
    {
      key: "products",
      label: "Published, available product",
      isReady: available.length > 0,
    },
    {
      key: "payment",
      label: "Active payment method",
      isReady:
        accounts.some((account) => account.accountType !== "stripe") ||
        stripeConfiguredFor(settings),
    },
    {
      key: "fulfillment",
      label: "Enabled fulfillment method configured",
      isReady:
        (policy.shippingEnabled && zones.length > 0) ||
        (policy.pickupEnabled &&
          locations.some(
            (l) =>
              !l.scheduleRequired ||
              Object.values(l.weeklySchedule).some((s) => s.length > 0),
          )) ||
        (policy.deliveryEnabled &&
          areas.some(
            (a) =>
              !a.scheduleRequired ||
              Object.values(a.weeklySchedule).some((s) => s.length > 0),
          )),
    },
    {
      key: "email",
      label: "Email delivery verified",
      isReady: !!settings?.emailVerifiedAt,
    },
  ];
  return {
    isLaunchReady: checklist.every((c) => c.isReady),
    checklist,
    launchReadyAt: settings?.launchReadyAt ?? null,
  };
}
