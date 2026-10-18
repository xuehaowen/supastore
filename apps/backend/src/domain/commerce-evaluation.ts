import * as v from "valibot";
import { validShippingRegion } from "@supastore/shipping/destination";
import { InvariantViolationError } from "@/domain/errors";

const methods = ["shipping", "pickup", "local_delivery"] as const;
const integer = (max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(max));
const ids = v.optional(
  v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(100)),
  [],
);
const codes = v.optional(
  v.pipe(
    v.array(v.pipe(v.string(), v.regex(/^[A-Z0-9]{1,12}$/))),
    v.maxLength(100),
  ),
  [],
);
const instant = v.optional(
  v.nullable(
    v.pipe(
      v.string(),
      v.isoTimestamp(),
      v.check((s) => Number.isFinite(Date.parse(s))),
    ),
  ),
  null,
);
const conditionsSchema = v.object({
  fulfillmentMethods: v.optional(v.array(v.picklist(methods)), []),
  countries: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.regex(/^[A-Z]{2}$/))),
      v.maxLength(100),
    ),
    [],
  ),
  regions: codes,
  postalPrefixes: codes,
  pickupLocationIds: ids,
  startsAt: instant,
  endsAt: instant,
});
const ruleSchema = v.pipe(
  v.object({
    id: v.pipe(v.string(), v.uuid()),
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
    kind: v.picklist([
      "price",
      "availability",
      "reward",
      "free_shipping",
      "promotion",
    ]),
    priority: integer(10000),
    enabled: v.optional(v.boolean(), true),
    conditions: v.optional(conditionsSchema, {}),
    variantIds: ids,
    promotionCode: v.optional(
      v.pipe(v.string(), v.regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/)),
    ),
    value: integer(2147483647),
  }),
  v.check((rule) => {
    const c = rule.conditions;
    return (
      (rule.kind !== "price" || rule.variantIds.length > 0) &&
      (rule.kind !== "availability" || rule.value <= 1) &&
      (rule.kind !== "reward" || rule.value <= 10000) &&
      (rule.kind !== "promotion" ||
        (Boolean(rule.promotionCode) && rule.value === 0)) &&
      (["price", "availability"].includes(rule.kind) ||
        rule.variantIds.length === 0) &&
      (rule.kind === "promotion" || !rule.promotionCode) &&
      (!c.startsAt ||
        !c.endsAt ||
        Date.parse(c.startsAt) < Date.parse(c.endsAt)) &&
      (!(c.regions.length || c.postalPrefixes.length) ||
        c.countries.length === 1) &&
      c.regions.every((region) =>
        validShippingRegion(c.countries[0] ?? "", region),
      ) &&
      (!c.pickupLocationIds.length ||
        (!c.countries.length &&
          !c.regions.length &&
          !c.postalPrefixes.length &&
          c.fulfillmentMethods.length === 1 &&
          c.fulfillmentMethods[0] === "pickup")) &&
      (!c.countries.length || !c.fulfillmentMethods.includes("pickup"))
    );
  }, "Check rule targets, conditions, dates and value."),
);
export const commerceRulesSchema = v.pipe(
  v.array(ruleSchema),
  v.maxLength(100),
  v.check((rules) => {
    const ids = new Set<string>(),
      priorities = new Set<string>();
    return rules.every((rule) => {
      const key = `${rule.kind}:${rule.priority}`;
      if (ids.has(rule.id) || priorities.has(key)) return false;
      ids.add(rule.id);
      priorities.add(key);
      return true;
    });
  }, "Each rule needs a unique ID and a distinct priority within its kind."),
);
export type CommerceRule = v.InferOutput<typeof ruleSchema>;
export function commerceRules(value: unknown): CommerceRule[] {
  return v.parse(commerceRulesSchema, value ?? []);
}
export type ShoppingContext = {
  fulfillmentType?: (typeof methods)[number] | undefined;
  country?: string | undefined;
  region?: string | undefined;
  postalCode?: string | undefined;
  pickupLocationId?: string | undefined;
};
export function shoppingContext(input: ShoppingContext): ShoppingContext {
  const context = v.parse(
    v.object({
      fulfillmentType: v.optional(v.picklist(methods)),
      country: v.optional(
        v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/)),
      ),
      region: v.optional(
        v.pipe(
          v.string(),
          v.trim(),
          v.toUpperCase(),
          v.regex(/^[A-Z0-9]{1,12}$/),
        ),
      ),
      postalCode: v.optional(
        v.pipe(
          v.string(),
          v.trim(),
          v.maxLength(24),
          v.transform((s) => s.toUpperCase().replace(/[\s-]/g, "")),
          v.regex(/^[A-Z0-9]{1,12}$/),
        ),
      ),
      pickupLocationId: v.optional(v.pipe(v.string(), v.uuid())),
    }),
    Object.fromEntries(
      Object.entries(input).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    ),
  );
  if (
    context.region &&
    context.country &&
    !validShippingRegion(context.country, context.region)
  )
    throw new InvariantViolationError("Enter a valid state or region code.");
  return context;
}
type Match = "match" | "pending" | "miss";
function matches(
  rule: CommerceRule,
  context: ShoppingContext,
  now: Date,
): Match {
  const c = rule.conditions;
  if (
    !rule.enabled ||
    (c.startsAt && now.getTime() < Date.parse(c.startsAt)) ||
    (c.endsAt && now.getTime() >= Date.parse(c.endsAt))
  )
    return "miss";
  const checks: Match[] = [];
  function check(values: readonly string[], actual?: string, prefix = false) {
    if (values.length)
      checks.push(
        !actual
          ? "pending"
          : values.some((value) =>
                prefix ? actual.startsWith(value) : actual === value,
              )
            ? "match"
            : "miss",
      );
  }
  check(c.fulfillmentMethods, context.fulfillmentType);
  // Shipping destinations are not inferred from a pickup customer's address.
  if (
    context.fulfillmentType === "pickup" &&
    (c.countries.length || c.regions.length || c.postalPrefixes.length)
  )
    return "miss";
  if (
    context.fulfillmentType &&
    context.fulfillmentType !== "pickup" &&
    c.pickupLocationIds.length
  )
    return "miss";
  check(c.countries, context.country);
  check(c.regions, context.region);
  check(c.postalPrefixes, context.postalCode, true);
  check(c.pickupLocationIds, context.pickupLocationId);
  return checks.includes("miss")
    ? "miss"
    : checks.includes("pending")
      ? "pending"
      : "match";
}
export type EvaluationItem = {
  variantId: string;
  unitPriceCents: number;
  quantity: number;
  isAvailable: boolean;
  availableQuantity: number | null;
};
export function evaluateCommerce(input: {
  rules: readonly CommerceRule[];
  context: ShoppingContext;
  items: readonly EvaluationItem[];
  rewardRateBasisPoints: number;
  rewardsEnabled: boolean;
  promotionCode?: string | undefined;
  now: Date;
}) {
  if (!Number.isFinite(input.now.getTime()))
    throw new InvariantViolationError("Invalid evaluation time.");
  const context = shoppingContext(input.context);
  const ordered = [...input.rules].sort((a, b) => a.priority - b.priority);
  const selectedIds = new Set<string>();
  function select(kind: CommerceRule["kind"], variantId?: string) {
    for (const rule of ordered) {
      if (
        rule.kind !== kind ||
        (rule.variantIds.length &&
          (!variantId || !rule.variantIds.includes(variantId)))
      )
        continue;
      const match = matches(rule, context, input.now);
      if (match === "pending") return { rule: null, pending: true };
      if (match === "match") {
        selectedIds.add(rule.id);
        return { rule, pending: false };
      }
    }
    return { rule: null, pending: false };
  }
  const items = input.items.map((item) => {
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 999 ||
      !Number.isSafeInteger(item.unitPriceCents) ||
      item.unitPriceCents < 0 ||
      item.unitPriceCents > 2147483647 ||
      (item.availableQuantity !== null &&
        (!Number.isSafeInteger(item.availableQuantity) ||
          item.availableQuantity < 0))
    )
      throw new InvariantViolationError("Invalid evaluation item.");
    const price = select("price", item.variantId),
      availability = select("availability", item.variantId);
    const pending = price.pending || availability.pending;
    const unitPriceCents = pending
      ? null
      : (price.rule?.value ?? item.unitPriceCents);
    const reason =
      !item.isAvailable || availability.rule?.value === 0
        ? ("NOT_OFFERED" as const)
        : item.availableQuantity !== null &&
            item.quantity > item.availableQuantity
          ? ("INSUFFICIENT_STOCK" as const)
          : pending
            ? ("CONTEXT_REQUIRED" as const)
            : null;
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceCents,
      availableQuantity: item.availableQuantity,
      available: reason === null,
      pending,
      reason,
      priceRuleId: price.rule?.id ?? null,
      availabilityRuleId: availability.rule?.id ?? null,
    };
  });
  const merchandiseSubtotalCents = items.some(
    (item) => item.unitPriceCents === null,
  )
    ? null
    : items.reduce(
        (sum, item) => sum + item.unitPriceCents! * item.quantity,
        0,
      );
  if (
    merchandiseSubtotalCents !== null &&
    (!Number.isSafeInteger(merchandiseSubtotalCents) ||
      merchandiseSubtotalCents > 2147483647)
  )
    throw new InvariantViolationError(
      "Basket amount exceeds the supported limit.",
    );
  const reward = input.rewardsEnabled
    ? select("reward")
    : { rule: null, pending: false };
  const shipping = select("free_shipping");
  const code = input.promotionCode?.trim().toUpperCase() ?? "";
  const restrictions = ordered.filter(
    (rule) => rule.kind === "promotion" && rule.promotionCode === code,
  );
  const promotionMatches = restrictions.map((rule) => ({
    rule,
    match: matches(rule, context, input.now),
  }));
  const promotionMatch = promotionMatches.find(
    (entry) => entry.match !== "miss",
  );
  if (promotionMatch?.match === "match")
    selectedIds.add(promotionMatch.rule.id);
  return {
    context,
    items,
    merchandiseSubtotalCents,
    reward: {
      rateBasisPoints: reward.pending
        ? null
        : input.rewardsEnabled
          ? (reward.rule?.value ?? input.rewardRateBasisPoints)
          : 0,
      ruleId: reward.rule?.id ?? null,
      pending: reward.pending,
    },
    shipping: {
      freeThresholdCents: shipping.rule?.value ?? null,
      remainingCents:
        shipping.rule && merchandiseSubtotalCents !== null
          ? Math.max(0, shipping.rule.value - merchandiseSubtotalCents)
          : null,
      ruleId: shipping.rule?.id ?? null,
      pending: shipping.pending,
    },
    promotion: {
      eligible: !restrictions.length || promotionMatch?.match === "match",
      pending: promotionMatch?.match === "pending",
      reason:
        restrictions.length && promotionMatch?.match !== "match"
          ? ("PROMOTION_INELIGIBLE" as const)
          : null,
      ruleId: promotionMatch?.match === "match" ? promotionMatch.rule.id : null,
    },
    matchedRuleIds: [...selectedIds].sort(),
  };
}
