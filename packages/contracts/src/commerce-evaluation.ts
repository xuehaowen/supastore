import * as v from "valibot";
import { MAX_CART_LINES, CART_LINE_LIMIT_MESSAGE } from "./checkout";
const amount = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(2147483647),
);
const id = v.pipe(v.string(), v.uuid());
const method = v.picklist(["shipping", "pickup", "local_delivery"]);
export const shoppingContextSchema = v.object({
  fulfillmentType: v.optional(method),
  country: v.optional(v.pipe(v.string(), v.maxLength(2))),
  region: v.optional(v.pipe(v.string(), v.maxLength(12))),
  postalCode: v.optional(v.pipe(v.string(), v.maxLength(24))),
  pickupLocationId: v.optional(v.union([id, v.literal("")])),
});
const requestSchema = v.object({
  items: v.pipe(
    v.array(
      v.object({
        variantId: id,
        quantity: v.pipe(
          v.number(),
          v.integer(),
          v.minValue(1),
          v.maxValue(999),
        ),
      }),
    ),
    v.minLength(1),
    v.maxLength(MAX_CART_LINES, CART_LINE_LIMIT_MESSAGE),
    v.check(
      (items) =>
        new Set(items.map((item) => item.variantId)).size === items.length,
      "Choose each variant once.",
    ),
  ),
  context: v.optional(shoppingContextSchema, {}),
  promotionCode: v.optional(v.pipe(v.string(), v.maxLength(40))),
});
export type CommercePreviewRequest = v.InferOutput<typeof requestSchema>;
export function parseCommercePreviewRequest(value: unknown) {
  return v.parse(requestSchema, value);
}
const responseSchema = v.object({
  currency: v.pipe(v.string(), v.regex(/^[A-Z]{3}$/)),
  precision: v.pipe(amount, v.maxValue(4)),
  revision: amount,
  hasContextualRules: v.boolean(),
  methods: v.array(method),
  locations: v.array(v.object({ id, name: v.string() })),
  evaluation: v.object({
    context: shoppingContextSchema,
    items: v.array(
      v.object({
        variantId: id,
        quantity: amount,
        unitPriceCents: v.nullable(amount),
        availableQuantity: v.nullable(amount),
        available: v.boolean(),
        pending: v.boolean(),
        reason: v.nullable(
          v.picklist(["NOT_OFFERED", "INSUFFICIENT_STOCK", "CONTEXT_REQUIRED"]),
        ),
        priceRuleId: v.nullable(id),
        availabilityRuleId: v.nullable(id),
      }),
    ),
    merchandiseSubtotalCents: v.nullable(amount),
    reward: v.object({
      rateBasisPoints: v.nullable(v.pipe(amount, v.maxValue(10000))),
      ruleId: v.nullable(id),
      pending: v.boolean(),
    }),
    shipping: v.object({
      freeThresholdCents: v.nullable(amount),
      remainingCents: v.nullable(amount),
      ruleId: v.nullable(id),
      pending: v.boolean(),
    }),
    promotion: v.object({
      eligible: v.boolean(),
      pending: v.boolean(),
      reason: v.nullable(v.literal("PROMOTION_INELIGIBLE")),
      ruleId: v.nullable(id),
    }),
    matchedRuleIds: v.array(id),
  }),
});
export type CommercePreview = v.InferOutput<typeof responseSchema>;
export function parseCommercePreview(value: unknown): CommercePreview {
  return v.parse(responseSchema, value);
}
