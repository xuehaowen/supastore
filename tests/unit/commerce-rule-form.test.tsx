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
  const checked = [...html.matchAll(/<input\b([^>]*)>/g)]
    .map((match) => match[1]!)
    .filter(
      (attributes) =>
        attributes.includes('name="methods"') &&
        attributes.includes('checked=""'),
    );
  expect(checked).toHaveLength(2);
  expect(
    checked.some((attributes) => attributes.includes('value="shipping"')),
  ).toBe(true);
  expect(
    checked.some((attributes) => attributes.includes('value="local_delivery"')),
  ).toBe(true);
});
it("keeps global availability editable without forcing variant selection", () => {
  const rule = commerceRules([
    {
      id: crypto.randomUUID(),
      name: "Global availability",
      kind: "availability",
      value: 0,
      priority: 10,
      conditions: {},
    },
  ])[0]!;
  const html = renderToStaticMarkup(
    <RuleForm
      id={rule.id}
      rule={rule}
      version={1}
      variants={[]}
      locations={[]}
    />,
  );
  const selector = [...html.matchAll(/<select\b([^>]*)>/g)].find((match) =>
    match[1]!.includes('name="variantIds"'),
  );
  expect(selector).toBeDefined();
  expect(selector![1]).not.toContain("required");
});
it("preserves every selected pickup location", () => {
  const ids = [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
  ];
  const rule = commerceRules([
    {
      id: crypto.randomUUID(),
      name: "Pickup rewards",
      kind: "reward",
      value: 500,
      priority: 10,
      conditions: { fulfillmentMethods: ["pickup"], pickupLocationIds: ids },
    },
  ])[0]!;
  const html = renderToStaticMarkup(
    <RuleForm
      id={rule.id}
      rule={rule}
      version={1}
      variants={[]}
      locations={ids.map((id, index) => ({ id, name: `Location ${index}` }))}
    />,
  );
  const checked = [...html.matchAll(/<input\b([^>]*)>/g)]
    .map((match) => match[1]!)
    .filter(
      (attributes) =>
        attributes.includes('name="pickupLocationIds"') &&
        attributes.includes('checked=""'),
    );
  expect(checked).toHaveLength(2);
});
