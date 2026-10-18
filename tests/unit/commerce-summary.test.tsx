import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommerceSummary } from "../../apps/storefront/app/commerce-summary";
import { parseCommercePreview } from "@supastore/contracts";
const id = "10000000-0000-4000-8000-000000000001";
function preview(pending = false) {
  return parseCommercePreview({ currency: "USD", precision: 2, revision: 1, hasContextualRules: true, methods: ["shipping"], locations: [], evaluation: {
    context: {}, items: [{ variantId: id, quantity: 1, unitPriceCents: pending ? null : 1200, availableQuantity: 2, available: !pending, pending, reason: pending ? "CONTEXT_REQUIRED" : null, priceRuleId: null, availabilityRuleId: null }], merchandiseSubtotalCents: pending ? null : 1200,
    reward: { rateBasisPoints: 500, ruleId: null, pending: false }, shipping: { freeThresholdCents: 15000, remainingCents: pending ? null : 13800, ruleId: null, pending }, promotion: { eligible: true, pending: false, reason: null, ruleId: null }, matchedRuleIds: [],
  } });
}
it("shows shopping estimates without promising reserved stock or earned credit", () => {
  const html = renderToStaticMarkup(<CommerceSummary preview={preview()} locale="en" />);
  expect(html).toContain("$12.00");
  expect(html).toContain("5%");
  expect(html).toContain("$138.00");
  expect(html).toContain("not reserved");
  expect(html).toContain("verified account");
});
it("asks for missing context without displaying a fabricated price and supports Chinese", () => {
  const html = renderToStaticMarkup(<CommerceSummary preview={preview(true)} locale="en" />);
  expect(html).toContain("Choose fulfillment");
  expect(html).not.toContain("$12.00");
  expect(renderToStaticMarkup(<CommerceSummary preview={preview()} locale="zh" />)).toContain("积分");
});
