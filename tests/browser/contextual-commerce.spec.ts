import { randomUUID } from "node:crypto";
import { test, expect, clickAction } from "./fixtures";

test("owner configures a regional price and customers preview it before accepting checkout", async ({
  page,
  admin,
  sql,
}) => {
  const [original] =
    await sql`select commerce_rules from store_settings limit 1`;
  const [variant] =
    await sql`select v.id from product_variants v join products p on p.id=v.product_id where p.handle='studio-cup' order by v.sort_order,v.id limit 1`;
  const name = "Regional price " + randomUUID();
  try {
    await admin.goto("/admin/settings/rules");
    await admin.getByLabel("Rule name", { exact: true }).fill(name);
    await admin.getByLabel("Rule kind", { exact: true }).selectOption("price");
    await admin
      .getByLabel("Target variant", { exact: true })
      .selectOption(variant!.id);
    await admin.getByLabel("Value", { exact: true }).fill("1250");
    await admin
      .getByLabel("Fulfillment method", { exact: true })
      .selectOption("shipping");
    await admin.getByLabel("Countries", { exact: true }).fill("US");
    await admin.getByLabel("States or regions", { exact: true }).fill("CA");
    await clickAction(
      admin,
      admin.getByRole("button", { name: "Save rule", exact: true }),
    );
    await expect(admin.getByText(name, { exact: true })).toBeVisible();
    await page.goto("/en/products/studio-cup");
    const preview = page.getByRole("region", {
      name: "Shopping options",
      exact: true,
    });
    await expect(preview).toBeVisible();
    await preview.getByLabel("Fulfillment method").selectOption("shipping");
    await preview.getByLabel("Country code").fill("US");
    await preview.getByLabel("State or region code").fill("CA");
    await preview
      .getByRole("button", { name: "Check options", exact: true })
      .click();
    await expect(preview.getByText(/\$12\.50/).first()).toBeVisible();
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await page
      .getByRole("link", { name: "Continue to checkout", exact: true })
      .click();
    await page.getByLabel("Street address").fill("1 Synthetic street");
    await page
      .getByLabel("State or region", { exact: true })
      .selectOption("CA");
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
