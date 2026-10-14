import * as v from "valibot";
const rewardInstant = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/),
  v.check(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 19) === value.slice(0, 19),
    "Use a valid UTC timestamp.",
  ),
);
export const commercePolicySchema = v.pipe(
  v.object({
    guestCheckout: v.optional(v.boolean(), true),
    rewardsEnabled: v.optional(v.boolean(), false),
    rewardRateBasisPoints: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
      500,
    ),
    rewardEligibleCategoryIds: v.optional(
      v.pipe(
        v.array(v.pipe(v.string(), v.uuid())),
        v.maxLength(1000),
        v.check(
          (ids) => new Set(ids).size === ids.length,
          "Choose each category once.",
        ),
      ),
      [],
    ),
    rewardsStartAt: v.optional(v.nullable(rewardInstant), null),
    rewardsEndAt: v.optional(v.nullable(rewardInstant), null),
    shippingEnabled: v.optional(v.boolean(), true),
    pickupEnabled: v.optional(v.boolean(), true),
    deliveryEnabled: v.optional(v.boolean(), false),
    salesThresholdCents: v.optional(
      v.nullable(
        v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2147483647)),
      ),
      null,
    ),
    fiscalYearStartMonth: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(12)),
      1,
    ),
  }),
  v.check(
    (policy) =>
      !policy.rewardsStartAt ||
      !policy.rewardsEndAt ||
      Date.parse(policy.rewardsStartAt) < Date.parse(policy.rewardsEndAt),
    "Reward end must be after reward start.",
  ),
);
export type CommercePolicy = v.InferOutput<typeof commercePolicySchema>;
export function commercePolicy(value: unknown): CommercePolicy {
  return v.parse(commercePolicySchema, value ?? {});
}
export function rewardsActive(policy: CommercePolicy, now: Date) {
  if (!Number.isFinite(now.getTime()))
    throw new Error("Invalid reward evaluation time.");
  return (
    policy.rewardsEnabled &&
    (!policy.rewardsStartAt ||
      now.getTime() >= Date.parse(policy.rewardsStartAt)) &&
    (!policy.rewardsEndAt || now.getTime() < Date.parse(policy.rewardsEndAt))
  );
}
/** Empty allowlist means all categories; product exclusions always win. */
export function rewardMerchandiseEligible(
  policy: CommercePolicy,
  productEligible: boolean,
  categoryIds: readonly string[],
) {
  return (
    productEligible &&
    (!policy.rewardEligibleCategoryIds.length ||
      categoryIds.some((id) => policy.rewardEligibleCategoryIds.includes(id)))
  );
}
