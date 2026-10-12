import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("paid guest checkout defaults to payment and retains fulfillment while editing", async ({
  page,
}) => {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(page.getByLabel("Payment method")).not.toHaveValue("");
  await page.getByLabel("Street address").fill("123 Customer Street");
  await page.getByRole("button", { name: /Review your order/ }).click();
  await page.getByRole("link", { name: "Edit fulfillment" }).click();
  await expect(page.getByLabel("Street address")).toHaveValue(
    "123 Customer Street",
  );
  await expect(page.getByLabel("Payment method")).not.toHaveValue("");
});

test("checkout validation keeps entered details and contact fields", async ({
  page,
}) => {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Street address").fill("456 Customer Street");
  await page.getByLabel("Promotion code").fill("NOT-A-VALID-PROMOTION");
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await expect(page.getByLabel("Street address")).toHaveValue(
    "456 Customer Street",
  );
  await expect(page.getByLabel("Promotion code")).toHaveValue(
    "NOT-A-VALID-PROMOTION",
  );
  await page.getByLabel("Promotion code").fill("");
  await page.getByRole("button", { name: /Review your order/ }).click();
  await page.getByLabel("Your name").fill("Customer Example");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.getByRole("checkbox").evaluate((el: HTMLInputElement) => {
    el.required = false;
  });
  await page
    .getByRole("button", { name: /Accept total & place order/ })
    .click();
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Customer Example");
  await expect(page.getByLabel("Email address")).toHaveValue(
    "customer@example.test",
  );
});

test("pickup review retains date and time after validation and while editing", async ({
  page,
}) => {
  await page.goto("/en/products/studio-cup");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Local pickup", { exact: true }).check();
  await page
    .locator("button.pickup-calendar-day-btn:not([disabled])")
    .first()
    .click();
  await page.getByLabel("Pickup window").selectOption({ index: 1 });
  const date = await page.locator('input[name="pickupDate"]').inputValue();
  const time = await page.getByLabel("Pickup window").inputValue();
  await page.getByLabel("Promotion code").fill("INVALID-PROMOTION");
  await page.getByRole("button", { name: /Review your order/ }).click();
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await expect(page.getByLabel("Pickup window")).toHaveValue(time);
  await expect(page.locator('input[name="pickupDate"]')).toHaveValue(date);
  await page.getByLabel("Promotion code").fill("");
  await page.getByRole("button", { name: /Review your order/ }).click();
  await page.getByRole("link", { name: "Edit fulfillment" }).click();
  await expect(page.getByLabel("Local pickup", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Pickup window")).toHaveValue(time);
  await expect(page.locator('input[name="pickupDate"]')).toHaveValue(date);
});

test("Chinese mobile checkout has translated labels and compact radios", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh/products/studio-cup");
  await page.getByRole("button", { name: "加入购物袋" }).click();
  await page.getByRole("link", { name: "前往结账" }).click();
  await expect(page.getByText("配送方式", { exact: true })).toBeVisible();
  await expect(page.getByLabel("街道地址")).toBeVisible();
  const radio = page.locator('input[name="fulfillmentType"]').first();
  expect((await radio.boundingBox())!.width).toBeLessThanOrEqual(24);
  await page.locator('input[value="pickup"]').check();
  await expect(page.getByText("自提日期", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "月视图" })).toBeVisible();
  await expect(
    page.getByText("请选择日历中的可用日期", { exact: true }),
  ).toBeVisible();
});

test("changing variants clamps quantity to the selected stock", async ({
  page,
  sql,
}) => {
  const handle = "quantity-fix-" + randomUUID();
  const [product] =
    await sql`insert into products(handle,title,is_published) values(${handle},'Stock choices',true) returning id`;
  const variants =
    await sql`insert into product_variants(product_id,sku,title,price_cents,is_available) values(${product!.id},${handle + "-a"},'Plenty',1000,true),(${product!.id},${handle + "-b"},'Limited',1000,true) returning id,title`;
  for (const variant of variants) {
    await sql`insert into variant_stock(variant_id,on_hand,reserved,tracking_enabled) values(${variant.id},${variant.title === "Plenty" ? 10 : 2},0,true)`;
  }
  await page.goto("/en/products/" + handle);
  await page.getByRole("radio", { name: "Plenty", exact: true }).check();
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("radio", { name: "Limited", exact: true }).check();
  await expect(page.locator('input[name="quantity"]')).toHaveValue("2");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Limited", { exact: true })).toBeVisible();
  await expect(page.getByText("$20.00", { exact: true }).first()).toBeVisible();
});
