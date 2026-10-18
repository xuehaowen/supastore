import { randomUUID } from "node:crypto";
import { test, expect, clickAction } from "./fixtures";

test("owner configures a regional price and customers preview it before accepting checkout", async ({
  page,
  admin,
  sql,
}) => {
  page.setDefaultTimeout(15000);
  admin.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 375, height: 900 });
  const [original] =
    await sql`select commerce_rules from store_settings limit 1`;
  const [variant] =
    await sql`select v.id from product_variants v join products p on p.id=v.product_id where p.handle='studio-cup' order by v.sort_order,v.id limit 1`;
  const name = "Regional price " + randomUUID();
  try {
    await admin.goto("/admin/settings/rules");
    await admin.getByLabel("Rule name", { exact: true }).fill(name);
    await admin
      .getByRole("combobox", { name: "Rule kind", exact: true })
      .selectOption("price");
    await admin
      .getByLabel("Target variant", { exact: true })
      .selectOption(variant!.id);
    await admin.getByLabel("Value", { exact: true }).fill("1250");
    await admin
      .getByRole("checkbox", { name: "Shipping", exact: true })
      .check();
    await admin.getByLabel("Countries", { exact: true }).fill("US");
    await admin.getByLabel("States or regions", { exact: true }).fill("CA");
    await clickAction(
      admin,
      admin.getByRole("button", { name: "Save rule", exact: true }),
    );
    await expect(admin.getByText(name, { exact: true })).toBeVisible();
    const addRule = admin.locator("section").filter({
      has: admin.getByRole("heading", { name: "Add rule", exact: true }),
    });
    await addRule
      .getByLabel("Rule name", { exact: true })
      .fill("Preserve this draft");
    await addRule
      .getByLabel("Target variant", { exact: true })
      .selectOption(variant!.id);
    await addRule.getByLabel("Value", { exact: true }).fill("1400");
    await addRule.getByLabel("Countries", { exact: true }).fill("US");
    await clickAction(
      admin,
      addRule.getByRole("button", { name: "Save rule", exact: true }),
    );
    await expect(addRule.getByRole("alert")).toBeVisible();
    await expect(addRule.getByLabel("Rule name", { exact: true })).toHaveValue(
      "Preserve this draft",
    );
    await expect(addRule.getByLabel("Value", { exact: true })).toHaveValue(
      "1400",
    );
    await expect(addRule.getByLabel("Countries", { exact: true })).toHaveValue(
      "US",
    );
    await page.goto("/en/products/studio-cup");
    const preview = page.getByRole("region", {
      name: "Shopping options",
      exact: true,
    });
    await expect(preview).toBeVisible();
    await preview.getByLabel("Fulfillment method").selectOption("shipping");
    await preview
      .getByRole("combobox", { name: "Country", exact: true })
      .selectOption("US");
    await preview
      .getByRole("combobox", { name: "State / region", exact: true })
      .selectOption("CA");
    await preview
      .getByRole("button", { name: "Check options", exact: true })
      .click();
    await expect(preview.getByText(/\$12\.50/).first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("commerce-product-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await page
      .getByRole("link", { name: "Continue to checkout", exact: true })
      .click();
    await page.getByLabel("Street address").fill("1 Synthetic street");
    await page.getByLabel("State / region", { exact: true }).selectOption("CA");
    await page
      .getByLabel("Payment method")
      .selectOption({ label: "Demo bank transfer" });
    await page.getByRole("button", { name: /Review your order/ }).click();
    await expect(
      page.getByText("$12.50", { exact: true }).first(),
    ).toBeVisible();
    const q = new URL(page.url()).searchParams.get("quote");
    expect(q).toBeTruthy();
    const [quote] = await sql`select items_snapshot from quotes where id=${q!}`;
    expect(quote!.items_snapshot[0].unitPriceCents).toBe(1250);
  } finally {
    await sql`update store_settings set commerce_rules=${sql.json(original!.commerce_rules)},quote_version=quote_version+1`;
  }
});

test("disabled rules preserve the base storefront price and structured offers", async ({
  page,
  sql,
}) => {
  const [original] =
    await sql`select commerce_rules from store_settings limit 1`;
  const rule = {
    id: randomUUID(),
    name: "Disabled fixture",
    kind: "reward",
    enabled: false,
    value: 0,
    priority: 10,
    conditions: {},
  };
  try {
    await sql`update store_settings set commerce_rules=${sql.json([rule])},quote_version=quote_version+1`;
    await page.goto("/en/products/studio-cup");
    await expect(
      page.getByRole("region", { name: "Shopping options", exact: true }),
    ).toHaveCount(0);
    const structured = JSON.parse(
      await page.locator('script[type="application/ld+json"]').innerText(),
    );
    expect(structured.offers.length).toBeGreaterThan(0);
  } finally {
    await sql`update store_settings set commerce_rules=${sql.json(original!.commerce_rules)},quote_version=quote_version+1`;
  }
});

test("owner can rename a global availability rule without narrowing its targets", async ({
  admin,
  sql,
}) => {
  admin.setDefaultTimeout(15000);
  const [original] =
    await sql`select commerce_rules from store_settings limit 1`;
  const rule = {
    id: randomUUID(),
    name: "Global availability fixture",
    kind: "availability",
    enabled: true,
    value: 1,
    priority: 10,
    variantIds: [],
    conditions: {},
  };
  try {
    await sql`update store_settings set commerce_rules=${sql.json([rule])},quote_version=quote_version+1`;
    await admin.goto("/admin/settings/rules");
    await admin.getByText(rule.name, { exact: true }).click();
    const editor = admin.locator("details").filter({ hasText: rule.name });
    await editor
      .getByLabel("Rule name", { exact: true })
      .fill("Updated global availability");
    await clickAction(
      admin,
      editor.getByRole("button", { name: "Save rule", exact: true }),
    );
    const [saved] =
      await sql`select commerce_rules from store_settings limit 1`;
    expect(saved!.commerce_rules[0].variantIds).toEqual([]);
    expect(saved!.commerce_rules[0].name).toBe("Updated global availability");
  } finally {
    await sql`update store_settings set commerce_rules=${sql.json(original!.commerce_rules)},quote_version=quote_version+1`;
  }
});
