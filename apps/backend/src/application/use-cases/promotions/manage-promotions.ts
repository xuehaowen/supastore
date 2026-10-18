import { eq, sql } from "drizzle-orm";
import { commerceRules } from "@/domain/commerce-evaluation";
import { giveawayLimitsConfigured } from "@/domain/promotions";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  promotions,
  storeSettings,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from "@/application/common/errors";
import {
  parseActionInteger,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";

type PromotionInput = {
  staffUserId: string;
  id?: string;
  code: string;
  name: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minimumSubtotalCents: number;
  usageLimit?: number | undefined;
  maximumOriginalSubtotalCents?: number | undefined;
  maximumQuantity?: number | undefined;
  isActive: boolean;
  startsAt?: Date;
  endsAt?: Date | undefined;
};

export async function savePromotion(input: PromotionInput) {
  const id = input.id ? parseActionUuid(input.id, "Promotion") : undefined;
  const code = parseActionRequiredText(
    input.code,
    "Promotion code",
    40,
  ).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code))
    throw new DomainError(
      "Promotion codes may use letters, numbers, underscores, and hyphens.",
    );
  const name = parseActionRequiredText(input.name, "Promotion name", 120);
  const discountValue = parseActionInteger(
    input.discountValue,
    "Discount value",
    1,
    input.discountType === "percentage" ? 10000 : 2147483647,
  );
  const minimumSubtotalCents = parseActionInteger(
    input.minimumSubtotalCents,
    "Minimum subtotal",
    0,
    2147483647,
  );
  const usageLimit =
    input.usageLimit === undefined
      ? null
      : parseActionInteger(input.usageLimit, "Usage limit", 1, 2147483647);
  const maximumOriginalSubtotalCents =
    input.maximumOriginalSubtotalCents === undefined
      ? null
      : parseActionInteger(
          input.maximumOriginalSubtotalCents,
          "Maximum qualifying value",
          1,
          2147483647,
        );
  const maximumQuantity =
    input.maximumQuantity === undefined
      ? null
      : parseActionInteger(input.maximumQuantity, "Maximum quantity", 1, 99900);
  if (
    input.isActive &&
    !giveawayLimitsConfigured({
      ...input,
      maximumOriginalSubtotalCents,
      maximumQuantity,
      usageLimit,
    })
  )
    throw new DomainError(
      "Giveaway campaigns require value and quantity limits, an expiry and a total usage limit.",
    );
  if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt)
    throw new DomainError("Promotion end must be after its start.");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [settings] = await tx.select().from(storeSettings).for("update");
    const [previous] = id
      ? await tx.select().from(promotions).where(eq(promotions.id, id))
      : [];
    if (id && !previous) throw new NotFoundError("Promotion not found.");
    const [duplicate] = await tx
      .select()
      .from(promotions)
      .where(eq(promotions.code, code));
    if (duplicate && duplicate.id !== id)
      throw new ConflictError("That promotion code is already in use.");
    const values = {
      code,
      name,
      discountType: input.discountType,
      discountValue,
      minimumSubtotalCents,
      usageLimit,
      maximumOriginalSubtotalCents,
      maximumQuantity,
      isActive: input.isActive,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      updatedAt: new Date(),
    };
    const [saved] = id
      ? await tx
          .update(promotions)
          .set(values)
          .where(eq(promotions.id, id))
          .returning()
      : await tx.insert(promotions).values(values).returning();
    if (!saved) throw new NotFoundError("Promotion not found.");
    if (settings && previous && previous.code !== code) {
      const rules = commerceRules(settings.commerceRules);
      const affected = rules.filter(
        (rule) =>
          rule.kind === "promotion" && rule.promotionCode === previous.code,
      );
      if (affected.length) {
        await tx
          .update(storeSettings)
          .set({
            commerceRules: rules.map((rule) =>
              affected.includes(rule) ? { ...rule, promotionCode: code } : rule,
            ),
            quoteVersion: sql`${storeSettings.quoteVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(storeSettings.id, settings.id));
        await tx.insert(auditRecords).values({
          entityType: "store",
          entityId: settings.id,
          actorId: input.staffUserId,
          action: "commerce.promotion_renamed",
          details: {
            promotionId: saved.id,
            previousCode: previous.code,
            code,
            ruleIds: affected.map((rule) => rule.id),
          },
        });
      }
    }
    await tx.insert(auditRecords).values({
      entityType: "promotion",
      entityId: saved.id,
      actorId: input.staffUserId,
      action: id ? "updated" : "created",
      details: {
        code,
        discountType: input.discountType,
        discountValue,
        minimumSubtotalCents,
        maximumOriginalSubtotalCents,
        maximumQuantity,
        usageLimit,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
      },
    });
    return saved;
  });
}

export async function setPromotionActive(input: {
  staffUserId: string;
  id: string;
  isActive: boolean;
}) {
  const id = parseActionUuid(input.id, "Promotion");
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    await tx.select().from(storeSettings).for("update");
    const [current] = await tx
      .select()
      .from(promotions)
      .where(eq(promotions.id, id));
    if (!current) throw new NotFoundError("Promotion not found.");
    if (input.isActive && !giveawayLimitsConfigured(current))
      throw new DomainError(
        "Giveaway campaigns require value and quantity limits, an expiry and a total usage limit.",
      );
    const [saved] = await tx
      .update(promotions)
      .set({ isActive: input.isActive, updatedAt: new Date() })
      .where(eq(promotions.id, id))
      .returning();
    if (!saved) throw new NotFoundError("Promotion not found.");
    await tx.insert(auditRecords).values({
      entityType: "promotion",
      entityId: id,
      actorId: input.staffUserId,
      action: input.isActive ? "activated" : "deactivated",
    });
    return saved;
  });
}
