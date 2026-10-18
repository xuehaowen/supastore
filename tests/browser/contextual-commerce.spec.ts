import { randomUUID } from "node:crypto";
import { test, expect, clickAction } from "./fixtures";

test("evaluated free pickup works without payment methods while a paid quote requires funding", async ({
  page,
  sql,
}) => {
  page.setDefaultTimeout(15000);
  const [original] =
    await sql`select commerce_rules,commerce_policy from store_settings limit 1`;
  const accounts = await sql`select id,is_active from payment_accounts`;
  const [variant] =
    await sql`select v.id from product_variants v join products p on p.id=v.product_id where p.handle='studio-cup' order by v.sort_order,v.id limit 1`;
  const [location] =
    await sql`insert into pickup_location(name,address,weekly_schedule,schedule_required) values('ZZZ contextual pickup fixture','Synthetic pickup counter','{}',false) returning id`;
  const priceRule = {
    id: randomUUID(),
    name: "Contextual checkout fixture",
    kind: "price",
    enabled: true,
    value: 1000,
    priority: 10,
    variantIds: [variant!.id],
    conditions: { fulfillmentMethods: ["pickup"] },
  };
  try {
    await sql`update payment_accounts set is_active=false`;
    await sql`update store_settings set commerce_rules=${sql.json([priceRule])},commerce_policy=commerce_policy || '{"shippingEnabled":false,"pickupEnabled":true,"deliveryEnabled":false}'::jsonb,quote_version=quote_version+1`;
    await page.goto("/en/products/studio-cup");
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await page
      .getByRole("link", { name: "Continue to checkout", exact: true })
      .click();
    await page
      .locator(`input[name="pickupLocationId"][value="${location!.id}"]`)
      .check();
    await page.getByRole("button", { name: /Review your order/ }).click();
    await expect(
      page.getByText(/Choose an active payment method/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Accept total & place order/ }),
    ).toHaveCount(0);
    await sql`update store_settings set commerce_rules=${sql.json([{ ...priceRule, value: 0 }])},quote_version=quote_version+1`;
    await page.getByRole("button", { name: /Review your order/ }).click();
    await page.getByLabel("Your name").fill("Free contextual customer");
    await page.getByLabel("Email address").fill("free-context@example.test");
    await page.getByRole("checkbox").check();
    await clickAction(
      page,
      page.getByRole("button", { name: /Accept total & place order/ }),
    );
    await expect(page).toHaveURL(/\/en\/orders\/[0-9a-f-]+$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    expect(
      (
        await sql`select purchase_total_cents,lifecycle_status from orders where id=${id}`
      )[0],
    ).toMatchObject({ purchase_total_cents: 0, lifecycle_status: "confirmed" });
    await expect(
      page.getByText("No payment or payment evidence is required."),
    ).toBeVisible();
  } finally {
    for (const account of accounts)
      await sql`update payment_accounts set is_active=${account.is_active} where id=${account.id}`;
    await sql`update store_settings set commerce_rules=${sql.json(original!.commerce_rules)},commerce_policy=${sql.json(original!.commerce_policy)},quote_version=quote_version+1`;
  }
});

test("owner creates and reopens a bounded giveaway campaign", async ({
  admin,
  sql,
}) => {
  admin.setDefaultTimeout(15000);
  const code = "GIVE_" + randomUUID().slice(0, 8).toUpperCase();
  await admin.goto("/admin/promotions");
  await admin
    .getByRole("button", { name: "Create promotion", exact: true })
    .click();
  const dialog = admin.getByRole("dialog", {
    name: "Create promotion",
    exact: true,
  });
  await dialog
    .getByLabel("Promotion name", { exact: true })
    .fill("Bounded giveaway fixture");
  await dialog.getByLabel("Customer code", { exact: true }).fill(code);
  await dialog.getByLabel("Discount value", { exact: true }).fill("10000");
  await dialog.getByLabel("Minimum subtotal", { exact: true }).fill("0");
  await dialog
    .getByLabel("Maximum base merchandise value (minor units)", { exact: true })
    .fill("10000");
  await dialog
    .getByLabel("Maximum total item quantity", { exact: true })
    .fill("2");
  await dialog.getByLabel("Total usage limit", { exact: true }).fill("2");
  await dialog
    .getByLabel("Ends at", { exact: true })
    .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16));
  await clickAction(
    admin,
    dialog.getByRole("button", { name: "Create promotion", exact: true }),
  );
  const row = admin.getByRole("row").filter({ hasText: code });
  await expect(row).toBeVisible();
  expect(
    (
      await sql`select maximum_original_subtotal_cents,maximum_quantity,usage_limit from promotions where code=${code}`
    )[0],
  ).toMatchObject({
    maximum_original_subtotal_cents: 10000,
    maximum_quantity: 2,
    usage_limit: 2,
  });
  await row
    .getByRole("button", { name: "Edit promotion", exact: true })
    .click();
  const edit = admin.getByRole("dialog", { name: "Edit " + code, exact: true });
  await expect(
    edit.getByLabel("Maximum base merchandise value (minor units)", {
      exact: true,
    }),
  ).toHaveValue("10000");
  await expect(
    edit.getByLabel("Maximum total item quantity", { exact: true }),
  ).toHaveValue("2");
});

test("customers can complete a pending promotion destination without seeing a rejection", async ({
  page,
  sql,
}) => {
  page.setDefaultTimeout(15000);
  const [original] =
    await sql`select commerce_rules from store_settings limit 1`;
  const code = "REGION_" + randomUUID().slice(0, 8).toUpperCase();
  const rule = {
    id: randomUUID(),
    name: "Regional promotion fixture",
    kind: "promotion",
    enabled: true,
    value: 0,
    priority: 10,
    promotionCode: code,
    conditions: { countries: ["US"], regions: ["WA"] },
  };
  try {
    await sql`insert into promotions(code,name,discount_type,discount_value) values(${code},'Regional preview','fixed',100)`;
    await sql`update store_settings set commerce_rules=${sql.json([rule])},quote_version=quote_version+1`;
    await page.goto("/en/products/studio-cup");
    const preview = page.getByRole("region", {
      name: "Shopping options",
      exact: true,
    });
    await preview.getByLabel("Fulfillment method").selectOption("shipping");
    await preview
      .getByRole("combobox", { name: "Country", exact: true })
      .selectOption("US");
    await preview.getByLabel("Promotion code (optional)").fill(code);
    await preview
      .getByRole("button", { name: "Check options", exact: true })
      .click();
    await expect(
      preview.getByText(
        "Complete your destination or pickup location to check this promotion.",
      ),
    ).toBeVisible();
    await expect(
      preview.getByText(
        "This promotion is not eligible for the selected options.",
      ),
    ).toHaveCount(0);
    await expect(
      preview.getByText(
        /qualify for free shipping|Free-shipping minimum reached/,
      ),
    ).toHaveCount(0);
    await preview
      .getByRole("combobox", { name: "State / region", exact: true })
      .selectOption("WA");
    await preview
      .getByRole("button", { name: "Check options", exact: true })
      .click();
    await expect(preview.getByText("Merchandise estimate:")).toBeVisible();
    await expect(
      preview.getByText(
        "Complete your destination or pickup location to check this promotion.",
      ),
    ).toHaveCount(0);
    await expect(
      preview.getByText(
        "This promotion is not eligible for the selected options.",
      ),
    ).toHaveCount(0);
  } finally {
    await sql`update store_settings set commerce_rules=${sql.json(original!.commerce_rules)},quote_version=quote_version+1`;
    await sql`delete from promotions where code=${code}`;
  }
});

test("owner cannot accidentally broaden an exclusion whose target is missing", async ({
  admin,
  sql,
}) => {
  admin.setDefaultTimeout(15000);
  const [original] =
    await sql`select commerce_rules from store_settings limit 1`;
  const rule = {
    id: randomUUID(),
    name: "Missing target fixture",
    kind: "availability",
    enabled: true,
    value: 0,
    priority: 10,
    variantIds: [randomUUID()],
    conditions: {},
  };
  try {
    await sql`update store_settings set commerce_rules=${sql.json([rule])},quote_version=quote_version+1`;
    await admin.goto("/admin/settings/rules");
    await admin.getByText(rule.name, { exact: true }).click();
    const editor = admin.locator("details").filter({ hasText: rule.name });
    await expect(
      editor.getByText(/Some targeted variants no longer exist/),
    ).toBeVisible();
    await editor
      .getByLabel("Rule name", { exact: true })
      .fill("Rename missing target");
    await clickAction(
      admin,
      editor.getByRole("button", { name: "Save rule", exact: true }),
    );
    await expect(
      editor
        .getByRole("alert")
        .filter({ hasText: "Choose existing variants." }),
    ).toBeVisible();
    expect(
      (await sql`select commerce_rules from store_settings`)[0]!
        .commerce_rules[0].variantIds,
    ).toEqual(rule.variantIds);
    await clickAction(
      admin,
      editor.getByRole("button", { name: "Delete rule", exact: true }),
    );
    expect(
      (await sql`select commerce_rules from store_settings`)[0]!.commerce_rules,
    ).toEqual([]);
  } finally {
    await sql`update store_settings set commerce_rules=${sql.json(original!.commerce_rules)},quote_version=quote_version+1`;
  }
});

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
