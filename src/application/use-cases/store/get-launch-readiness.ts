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
} from "@/infrastructure/db/schema";
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
      isReady: accounts.length > 0,
    },
    {
      key: "fulfillment",
      label: "Shipping or pickup configured",
      isReady:
        zones.length > 0 ||
        locations.some((l) =>
          Object.values(l.weeklySchedule).some((s) => s.length > 0),
        ),
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
