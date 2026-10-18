import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../../apps/backend/src/app/admin/settings/rules/actions", () => ({
  submitCommerceRule: vi.fn(),
}));
import { RuleForm } from "../../apps/backend/src/app/admin/settings/rules/rule-form";
import { commerceRules } from "@/domain/commerce-evaluation";
it("round-trips every selected variant and fulfillment method in the owner editor", () => {
  const ids = [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
  ];
  const rule = commerceRules([
    {
      id: crypto.randomUUID(),
      name: "Two targets",
      kind: "price",
      value: 1000,
      priority: 10,
      variantIds: ids,
      conditions: { fulfillmentMethods: ["shipping", "local_delivery"] },
    },
  ])[0]!;
  const html = renderToStaticMarkup(
    <RuleForm
      id={rule.id}
      rule={rule}
      version={1}
      variants={ids.map((id, index) => ({ id, label: `Variant ${index}` }))}
      locations={[]}
    />,
  );
  const selected = [...html.matchAll(/<option\b([^>]*)>/g)]
    .filter((match) => match[1]!.includes('selected=""'))
    .map((match) => match[1]!);
  for (const id of ids)
    expect(selected.some((option) => option.includes(`value="${id}"`))).toBe(
      true,
    );
  expect(html).toContain('name="methods"');
  expect(html).toContain('value="shipping"');
  expect(html).toContain('value="local_delivery"');
});
