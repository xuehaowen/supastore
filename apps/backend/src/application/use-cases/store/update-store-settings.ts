import { and, eq, sql, inArray } from "drizzle-orm";
import * as v from "valibot";
import { commercePolicySchema } from "@/domain/commerce-policy";
import { commerceRulesSchema } from "@/domain/commerce-evaluation";
import { db } from "@/infrastructure/db";
import {
  storeSettings,
  productImages,
  products,
  productCollections,
  catalogMediaUploads,
  orders,
  storeCreditEntries,
  auditRecords,
  outsideSalesAdjustments,
  categories,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  InvariantViolationError,
  NotFoundError,
} from "@/application/common/errors";
import { scheduleAction } from "@/application/scheduling/scheduled-actions";
import { storefrontHeroSchema } from "@supastore/contracts";
const schema = v.object({
  commerceRules: v.optional(commerceRulesSchema),
  commercePolicy: v.optional(commercePolicySchema),
  storeName: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  ),
  logoKey: v.optional(v.string()),
  storefrontHero: v.optional(storefrontHeroSchema),
  supportEmail: v.optional(v.pipe(v.string(), v.email())),
  currency: v.optional(v.pipe(v.string(), v.regex(/^[A-Z]{3}$/))),
  precision: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4)),
  ),
  defaultLocale: v.optional(v.picklist(["en", "zh"])),
  timezone: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  ),
  isOrderingEnabled: v.optional(v.boolean()),
  isPaused: v.optional(v.boolean()),
  pauseMessage: v.optional(v.pipe(v.string(), v.maxLength(500))),
  taxRateBasisPoints: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
  ),
  isTaxInclusive: v.optional(v.boolean()),
  setupCompleted: v.optional(v.boolean()),
});
export type UpdateStoreSettingsInput = v.InferInput<typeof schema> & {
  staffUserId: string;
};
export async function updateStoreSettings(input: UpdateStoreSettingsInput) {
  const parsed = v.parse(schema, input);
  if (parsed.timezone)
    new Intl.DateTimeFormat("en", { timeZone: parsed.timezone }).format();
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [settings] = await tx
      .select()
      .from(storeSettings)
      .for("update")
      .limit(1);
    if (!settings) throw new NotFoundError("Complete owner bootstrap first.");
    for (const [ids, table, label] of [
      [parsed.storefrontHero?.featuredProductIds, products, "products"],
      [
        parsed.storefrontHero?.featuredCollectionIds,
        productCollections,
        "collections",
      ],
    ] as const) {
      if (!ids?.length) continue;
      const selected = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(inArray(table.id, ids), eq(table.isPublished, true)));
      if (selected.length !== ids.length)
        throw new InvariantViolationError(
          `Choose published ${label} for the homepage.`,
        );
    }
    if (parsed.storefrontHero?.imageKey) {
      const key = parsed.storefrontHero.imageKey;
      const [image] = await tx
        .select({ id: productImages.id })
        .from(productImages)
        .innerJoin(products, eq(products.id, productImages.productId))
        .where(
          and(eq(productImages.s3Key, key), eq(products.isPublished, true)),
        )
        .limit(1);
      const [collection] = await tx
        .select({ id: productCollections.id })
        .from(productCollections)
        .where(
          and(
            eq(productCollections.imageKey, key),
            eq(productCollections.isPublished, true),
          ),
        )
        .limit(1);
      if (!image && !collection && settings.storefrontHero?.imageKey !== key)
        throw new InvariantViolationError(
          "Choose an image from a published product or collection.",
        );
    }
    if (parsed.commercePolicy?.rewardEligibleCategoryIds.length) {
      const selected = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          inArray(
            categories.id,
            parsed.commercePolicy.rewardEligibleCategoryIds,
          ),
        );
      if (
        selected.length !==
        parsed.commercePolicy.rewardEligibleCategoryIds.length
      )
        throw new InvariantViolationError("Choose existing reward categories.");
    }
    if (
      (parsed.currency && parsed.currency !== settings.currency) ||
      (parsed.precision !== undefined &&
        parsed.precision !== settings.precision)
    ) {
      if (
        (
          await tx
            .select({ id: storeCreditEntries.id })
            .from(storeCreditEntries)
            .limit(1)
        ).length
      )
        throw new InvariantViolationError(
          "Currency and precision cannot change after the first store credit entry.",
        );
      if ((await tx.select({ id: orders.id }).from(orders).limit(1)).length)
        throw new InvariantViolationError(
          "Currency cannot change after the first order.",
        );
      if (
        (
          await tx
            .select({ id: outsideSalesAdjustments.id })
            .from(outsideSalesAdjustments)
            .limit(1)
        ).length
      )
        throw new InvariantViolationError(
          "Currency cannot change after recording outside sales.",
        );
    }
    if (
      "storefrontHero" in parsed &&
      settings.storefrontHero?.imageKey &&
      settings.storefrontHero.imageKey !== parsed.storefrontHero?.imageKey
    ) {
      const retired = await tx
        .update(catalogMediaUploads)
        .set({ status: "pending", expiresAt: new Date() })
        .where(eq(catalogMediaUploads.s3Key, settings.storefrontHero.imageKey))
        .returning();
      for (const upload of retired)
        await scheduleAction(tx, {
          key: `catalog-upload:${upload.id}`,
          kind: "catalog-upload",
          entityId: upload.id,
          scheduledFor: upload.expiresAt,
        });
    }
    const [updated] = await tx
      .update(storeSettings)
      .set({
        ...parsed,
        ...(["storeName", "supportEmail", "defaultLocale"].some(
          (key) =>
            key in parsed &&
            parsed[key as keyof typeof parsed] !==
              settings[key as keyof typeof settings],
        )
          ? { smsPolicy: { enabled: false, reviewed: false } }
          : {}),
        quoteVersion: [
          "currency",
          "precision",
          "taxRateBasisPoints",
          "isTaxInclusive",
          "timezone",
          "commercePolicy",
          "commerceRules",
        ].some((key) => key in parsed)
          ? sql`${storeSettings.quoteVersion} + 1`
          : settings.quoteVersion,
        updatedAt: new Date(),
      })
      .where(eq(storeSettings.id, settings.id))
      .returning();
    await tx.insert(auditRecords).values({
      entityType: "store",
      entityId: settings.id,
      actorId: input.staffUserId,
      action: "store.settings_updated",
      details: parsed,
    });
    return updated!;
  });
}
