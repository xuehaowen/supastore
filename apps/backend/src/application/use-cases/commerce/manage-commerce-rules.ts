import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  auditRecords,
  pickupLocation,
  productVariants,
  promotions,
  storeSettings,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  ConflictError,
  InvariantViolationError,
  NotFoundError,
} from "@/application/common/errors";
import { commerceRules } from "@/domain/commerce-evaluation";
import {
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";
type Actor = { staffUserId: string; expectedVersion: number };
async function change(input: Actor, replacement: unknown, removeId?: string) {
  parseActionInteger(input.expectedVersion, "Settings revision", 1, 2147483647);
  const rule = replacement === null ? null : commerceRules([replacement])[0]!;
  return db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, input.staffUserId, "owner");
    const [store] = await tx
      .select()
      .from(storeSettings)
      .for("update")
      .limit(1);
    if (!store) throw new NotFoundError("Store setup is incomplete.");
    if (store.quoteVersion !== input.expectedVersion)
      throw new ConflictError(
        "Settings changed. Refresh before saving this rule.",
      );
    const current = commerceRules(store.commerceRules);
    if (removeId && !current.some((rule) => rule.id === removeId))
      throw new NotFoundError("Rule not found.");
    const next = commerceRules([
      ...current.filter((existing) => existing.id !== (removeId ?? rule!.id)),
      ...(rule ? [rule] : []),
    ]);
    if (rule?.variantIds.length) {
      const variants = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(inArray(productVariants.id, rule.variantIds));
      if (variants.length !== new Set(rule.variantIds).size)
        throw new InvariantViolationError("Choose existing variants.");
    }
    if (rule?.conditions.pickupLocationIds.length) {
      const locations = await tx
        .select({ id: pickupLocation.id })
        .from(pickupLocation)
        .where(inArray(pickupLocation.id, rule.conditions.pickupLocationIds));
      if (locations.length !== new Set(rule.conditions.pickupLocationIds).size)
        throw new InvariantViolationError("Choose existing pickup locations.");
    }
    if (rule?.promotionCode) {
      const [promotion] = await tx
        .select({ id: promotions.id })
        .from(promotions)
        .where(eq(promotions.code, rule.promotionCode));
      if (!promotion)
        throw new InvariantViolationError(
          "Create the promotion code before restricting its eligibility.",
        );
    }
    await tx
      .update(storeSettings)
      .set({
        commerceRules: next,
        quoteVersion: sql`${storeSettings.quoteVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(storeSettings.id, store.id));
    await tx
      .insert(auditRecords)
      .values({
        actorId: input.staffUserId,
        entityType: "store",
        entityId: store.id,
        action: removeId ? "commerce.rule_deleted" : "commerce.rule_saved",
        details: { ruleId: removeId ?? rule!.id, rule },
      });
    return next;
  });
}
export function saveCommerceRule(input: Actor & { rule: unknown }) {
  return change(input, input.rule);
}
export function deleteCommerceRule(input: Actor & { id: string }) {
  return change(input, null, parseActionUuid(input.id, "Rule"));
}
